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
