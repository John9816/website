import { ApiError, BASE, getToken, getTokenType, request } from './client'
import type {
  AgentMessageView,
  AgentQuotaView,
  AgentSessionView,
  AgentStreamEvent,
  AgentStreamEventName,
  AgentTeamView,
  PageView,
} from '../types'

const STREAM_EVENTS = new Set<AgentStreamEventName>([
  'assistant',
  'tool_use',
  'tool_result',
  'system',
  'result',
  'error',
  'claude_session',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeChunk(chunk: string) {
  return chunk.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

async function fetchEventStream(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  }
  const token = getToken()
  if (token) headers['Authorization'] = `${getTokenType()} ${token}`

  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new ApiError(-2, '请求已取消')
    }
    throw new ApiError(-1, `网络错误: ${(error as Error).message}`)
  }

  if (response.status === 401) {
    throw new ApiError(401, '登录已过期，请重新登录')
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('text/event-stream')) {
    let parsed: { code?: number; message?: string } | null = null
    try {
      parsed = (await response.json()) as { code?: number; message?: string }
    } catch {
      parsed = null
    }
    const code = parsed?.code ?? (response.ok ? -1 : response.status)
    const msg = parsed?.message || (response.ok ? '响应不是事件流' : `HTTP ${response.status}`)
    throw new ApiError(code, msg)
  }

  if (!response.body) {
    throw new ApiError(-1, '响应没有可读取的数据流')
  }

  return response
}

export const listAgentTeams = () =>
  request<AgentTeamView[]>('/api/user/agent/teams', { auth: true })

export const createAgentSession = (body: { teamCode: string; title?: string }) =>
  request<AgentSessionView>('/api/user/agent/sessions', {
    method: 'POST',
    auth: true,
    body,
  })

export const listAgentSessions = (page = 0, size = 20) =>
  request<PageView<AgentSessionView>>('/api/user/agent/sessions', {
    auth: true,
    query: { page, size },
  })

export const getAgentSession = (id: number) =>
  request<AgentSessionView>(`/api/user/agent/sessions/${id}`, {
    auth: true,
  })

export const listAgentMessages = (sessionId: number, page = 0, size = 100) =>
  request<PageView<AgentMessageView>>(`/api/user/agent/sessions/${sessionId}/messages`, {
    auth: true,
    query: { page, size },
  })

export const interruptAgentSession = (sessionId: number) =>
  request<void>(`/api/user/agent/sessions/${sessionId}/interrupt`, {
    method: 'POST',
    auth: true,
  })

export const deleteAgentSession = (sessionId: number) =>
  request<void>(`/api/user/agent/sessions/${sessionId}`, {
    method: 'DELETE',
    auth: true,
  })

export const getAgentQuota = () =>
  request<AgentQuotaView>('/api/user/agent/quota', { auth: true })

export async function runAgentSessionStream(
  sessionId: number,
  body: { prompt: string },
  callbacks: {
    onEvent: (event: AgentStreamEvent) => void
  },
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetchEventStream(
    `/api/user/agent/sessions/${sessionId}/run`,
    body,
    signal,
  )
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let resultSeen = false

  const handleFrame = (frame: string) => {
    if (!frame) return
    let eventName = 'message'
    const dataLines: string[] = []

    for (const rawLine of frame.split('\n')) {
      if (!rawLine || rawLine.startsWith(':')) continue
      const colon = rawLine.indexOf(':')
      const field = colon === -1 ? rawLine : rawLine.slice(0, colon)
      const value = colon === -1 ? '' : rawLine.slice(colon + 1).replace(/^ /, '')
      if (field === 'event') {
        eventName = value
      } else if (field === 'data') {
        dataLines.push(value)
      }
    }

    if (!STREAM_EVENTS.has(eventName as AgentStreamEventName) || !dataLines.length) {
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(dataLines.join('\n'))
    } catch (error) {
      throw new ApiError(-1, `解析事件失败: ${(error as Error).message}`)
    }

    if (!isRecord(parsed)) {
      throw new ApiError(-1, '事件数据格式不正确')
    }

    const streamEvent: AgentStreamEvent = {
      event: eventName as AgentStreamEventName,
      data: parsed,
    }
    callbacks.onEvent(streamEvent)

    if (streamEvent.event === 'result') {
      resultSeen = true
      return
    }

    if (streamEvent.event === 'error') {
      throw new ApiError(502, String(parsed.message ?? 'Agent 运行失败'))
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += normalizeChunk(decoder.decode(value, { stream: true }))
      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        handleFrame(frame)
        boundary = buffer.indexOf('\n\n')
      }
    }

    buffer += normalizeChunk(decoder.decode())
    if (buffer.trim()) handleFrame(buffer)
  } catch (error) {
    if (error instanceof ApiError) throw error
    if ((error as Error).name === 'AbortError') {
      throw new ApiError(-2, '请求已取消')
    }
    throw new ApiError(-1, `读取事件流失败: ${(error as Error).message}`)
  } finally {
    try {
      reader.releaseLock()
    } catch {
      // ignore
    }
  }

  if (!resultSeen) {
    throw new ApiError(-1, '事件流提前结束，未收到 result 事件')
  }
}
