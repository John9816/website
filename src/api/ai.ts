import { ApiError, BASE, getToken, getTokenType, request } from './client'
import type {
  AiChatMessageView,
  AiConversationCreateRequest,
  AiConversationReplyView,
  AiConversationSendRequest,
  AiConversationView,
  AiModelView,
  PageView,
} from '../types'

export const listAiModels = () =>
  request<AiModelView[]>('/api/user/ai/models', { auth: true })

export const createAiConversation = (body: AiConversationCreateRequest = {}) =>
  request<AiConversationView>('/api/user/ai/conversations', {
    method: 'POST',
    auth: true,
    body,
  })

export const listAiConversations = (page = 0, size = 20) =>
  request<PageView<AiConversationView>>('/api/user/ai/conversations', {
    auth: true,
    query: { page, size },
  })

export const getAiConversation = (id: number) =>
  request<AiConversationView>(`/api/user/ai/conversations/${id}`, {
    auth: true,
  })

export const listAiMessages = (conversationId: number, page = 0, size = 50) =>
  request<PageView<AiChatMessageView>>(
    `/api/user/ai/conversations/${conversationId}/messages`,
    {
      auth: true,
      query: { page, size },
    },
  )

export const sendAiMessage = (
  conversationId: number,
  body: AiConversationSendRequest,
  signal?: AbortSignal,
) =>
  request<AiConversationReplyView>(`/api/user/ai/conversations/${conversationId}/messages`, {
    method: 'POST',
    auth: true,
    body,
    signal,
  })

export async function fetchAiMessageAudio(
  messageId: number,
  signal?: AbortSignal,
): Promise<Blob> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers['Authorization'] = `${getTokenType()} ${token}`

  let res: Response
  try {
    res = await fetch(`${BASE}/api/user/ai/messages/${messageId}/audio`, {
      headers,
      signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      throw new ApiError(-2, '请求已取消')
    }
    throw new ApiError(-1, `网络错误: ${(e as Error).message}`)
  }

  if (res.status === 401) {
    throw new ApiError(401, '登录已过期，请重新登录')
  }

  if (!res.ok) {
    const fallback = `读取语音失败 (HTTP ${res.status})`
    try {
      const json = (await res.json()) as { code?: number; message?: string }
      throw new ApiError(json.code ?? res.status, json.message || fallback)
    } catch (error) {
      if (error instanceof ApiError) throw error
      throw new ApiError(res.status, fallback)
    }
  }

  return res.blob()
}

export interface AiStreamCallbacks {
  onMeta?: (meta: { conversationId: number; model: string }) => void
  onDelta: (chunk: string) => void
  onDone: (reply: AiConversationReplyView) => void
}

export async function sendAiMessageStream(
  conversationId: number,
  body: AiConversationSendRequest,
  callbacks: AiStreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  }
  const token = getToken()
  if (token) headers['Authorization'] = `${getTokenType()} ${token}`

  let res: Response
  try {
    res = await fetch(
      `${BASE}/api/user/ai/conversations/${conversationId}/messages?stream=true`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      },
    )
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      throw new ApiError(-2, '请求已取消')
    }
    throw new ApiError(-1, `网络错误: ${(e as Error).message}`)
  }

  if (res.status === 401) {
    throw new ApiError(401, '登录已过期，请重新登录')
  }

  // 鉴权 / 模型池 / TTS 不兼容这类前置错误：后端返回普通 JSON，不进 SSE
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('text/event-stream')) {
    let parsed: { code?: number; message?: string } | null = null
    try {
      parsed = (await res.json()) as { code?: number; message?: string }
    } catch {
      parsed = null
    }
    const code = parsed?.code ?? (res.ok ? -1 : res.status)
    const msg = parsed?.message || (res.ok ? '响应不是 SSE 流' : `HTTP ${res.status}`)
    throw new ApiError(code, msg)
  }

  if (!res.body) {
    throw new ApiError(-1, '响应没有可读流')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let doneFired = false

  const handleFrame = (frame: string) => {
    if (!frame) return
    let event = 'message'
    const dataLines: string[] = []
    for (const raw of frame.split('\n')) {
      if (!raw || raw.startsWith(':')) continue
      const colon = raw.indexOf(':')
      const field = colon === -1 ? raw : raw.slice(0, colon)
      const value = colon === -1 ? '' : raw.slice(colon + 1).replace(/^ /, '')
      if (field === 'event') event = value
      else if (field === 'data') dataLines.push(value)
    }
    if (!dataLines.length) return
    const dataStr = dataLines.join('\n')

    if (event === 'meta') {
      try {
        const meta = JSON.parse(dataStr) as { conversationId: number; model: string }
        callbacks.onMeta?.(meta)
      } catch {
        // ignore malformed meta
      }
    } else if (event === 'delta') {
      try {
        const data = JSON.parse(dataStr) as { content?: string }
        if (typeof data.content === 'string' && data.content.length) {
          callbacks.onDelta(data.content)
        }
      } catch {
        // ignore malformed delta
      }
    } else if (event === 'done') {
      try {
        const reply = JSON.parse(dataStr) as AiConversationReplyView
        doneFired = true
        callbacks.onDone(reply)
      } catch (err) {
        throw new ApiError(-1, `解析 done 事件失败: ${(err as Error).message}`)
      }
    } else if (event === 'error') {
      try {
        const err = JSON.parse(dataStr) as { code?: number; message?: string }
        throw new ApiError(err.code ?? 502, err.message || '上游错误')
      } catch (parseErr) {
        if (parseErr instanceof ApiError) throw parseErr
        throw new ApiError(502, '上游错误')
      }
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        handleFrame(frame)
      }
    }
    buffer += decoder.decode()
    if (buffer.trim()) handleFrame(buffer)
  } catch (e) {
    if (e instanceof ApiError) throw e
    if ((e as Error).name === 'AbortError') {
      throw new ApiError(-2, '请求已取消')
    }
    throw new ApiError(-1, `流式读取失败: ${(e as Error).message}`)
  } finally {
    try {
      reader.releaseLock()
    } catch {
      // already released
    }
  }

  if (!doneFired) {
    throw new ApiError(-1, '流提前结束，未收到 done 事件')
  }
}
