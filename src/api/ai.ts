import { request } from './client'
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
