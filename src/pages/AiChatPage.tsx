import { useEffect, useMemo, useRef, useState } from 'react'
import { App as AntApp } from 'antd'
import {
  Bot,
  LoaderCircle,
  LogIn,
  MessagesSquare,
  Play,
  Plus,
  RefreshCw,
  SendHorizontal,
  Settings,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react'
import { Link as RouterLink, NavLink as RouterNavLink } from 'react-router-dom'
import {
  createAiConversation,
  fetchAiMessageAudio,
  listAiConversations,
  listAiMessages,
  listAiModels,
  sendAiMessage,
} from '../api/ai'
import { ApiError } from '../api/client'
import ThemeToggle from '../components/ThemeToggle'
import { useAuth } from '../context/AuthContext'
import type {
  AiChatMessageView,
  AiConversationView,
  AiModelView,
} from '../types'
import '../styles/topbar.css'
import '../styles/ai-chat.css'

const CONVERSATION_PAGE_SIZE = 100
const MESSAGE_PAGE_SIZE = 100

function getDefaultModel(models: AiModelView[]) {
  return models.find((item) => item.defaultModel)?.model ?? models[0]?.model ?? ''
}

function modelHasCapability(
  models: Map<string, AiModelView>,
  modelId: string | null | undefined,
  capability: AiModelView['capabilities'][number],
) {
  if (!modelId) return false
  const info = models.get(modelId)
  if (!info) return false
  return info.capabilities.includes(capability)
}

function getDefaultTtsModel(models: AiModelView[]) {
  return models.find((item) => item.capabilities.includes('audio_output'))?.model ?? ''
}

interface MessageAudioProps {
  message: AiChatMessageView
  onError: (text: string) => void
}

function MessageAudio({ message, onError }: MessageAudioProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [errored, setErrored] = useState(false)
  const objectUrlRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    setObjectUrl(null)
    setErrored(false)
    setLoading(false)
  }, [message.id])

  const handleLoad = async () => {
    if (loading || objectUrl) return
    setLoading(true)
    setErrored(false)
    try {
      const blob = await fetchAiMessageAudio(message.id)
      const next = URL.createObjectURL(blob)
      objectUrlRef.current = next
      setObjectUrl(next)
    } catch (error) {
      setErrored(true)
      onError((error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (objectUrl) {
    return (
      <div className="ai-chat__audio">
        <audio
          controls
          autoPlay
          src={objectUrl}
          aria-label={`消息 ${message.id} 的语音回放`}
        />
      </div>
    )
  }

  return (
    <button
      type="button"
      className="ai-chat__audio-trigger"
      onClick={() => void handleLoad()}
      disabled={loading}
    >
      {loading ? (
        <LoaderCircle size={14} className="ai-chat__spinner" />
      ) : (
        <Play size={14} />
      )}
      <span>{errored ? '重试播放语音' : loading ? '加载中…' : '播放语音回放'}</span>
    </button>
  )
}

function upsertConversation(
  conversations: AiConversationView[],
  nextConversation: AiConversationView,
) {
  return [nextConversation, ...conversations.filter((item) => item.id !== nextConversation.id)].sort(
    (a, b) => {
      const left = new Date(a.lastMessageAt || a.updatedAt).getTime()
      const right = new Date(b.lastMessageAt || b.updatedAt).getTime()
      if (right !== left) return right - left
      return b.id - a.id
    },
  )
}

function formatTimeLabel(value?: string | null) {
  if (!value) return '刚刚'
  return value.slice(5, 16)
}

function formatRoleLabel(role: AiChatMessageView['role']) {
  if (role === 'assistant') return 'AI'
  if (role === 'system') return '系统'
  return '我'
}

function formatTokenLabel(message: AiChatMessageView) {
  if (message.totalTokens == null) return null
  return `tokens ${message.totalTokens}`
}

export default function AiChatPage() {
  const auth = useAuth()
  const { message } = AntApp.useApp()

  const [models, setModels] = useState<AiModelView[]>([])
  const [conversations, setConversations] = useState<AiConversationView[]>([])
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null)
  const [messages, setMessages] = useState<AiChatMessageView[]>([])
  const [draft, setDraft] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [responseAudio, setResponseAudio] = useState(false)
  const [ttsModel, setTtsModel] = useState('')
  const [bootstrapping, setBootstrapping] = useState(false)
  const [conversationsLoading, setConversationsLoading] = useState(false)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [creatingConversation, setCreatingConversation] = useState(false)
  const [sending, setSending] = useState(false)
  const [pendingContent, setPendingContent] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)

  const abortRef = useRef<AbortController | null>(null)
  const messageLoadSeqRef = useRef(0)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const modelRegistry = useMemo(
    () => new Map(models.map((item) => [item.model, item] as const)),
    [models],
  )
  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeConversationId) ?? null,
    [activeConversationId, conversations],
  )
  const defaultModel = useMemo(() => getDefaultModel(models), [models])
  const selectedModelInfo = useMemo(
    () => (selectedModel ? modelRegistry.get(selectedModel) ?? null : null),
    [modelRegistry, selectedModel],
  )
  const activeConversationModelInfo = useMemo(
    () =>
      activeConversation?.model ? modelRegistry.get(activeConversation.model) ?? null : null,
    [activeConversation?.model, modelRegistry],
  )
  const selectedCapabilities = selectedModelInfo?.capabilities ?? []
  const activeConversationModelRemoved =
    !!activeConversation && !!activeConversation.model && !activeConversationModelInfo
  const supportsTextConversation =
    selectedCapabilities.length > 0 ? selectedCapabilities.includes('text_chat') : true
  const audioOutputModels = useMemo(
    () => models.filter((item) => item.capabilities.includes('audio_output')),
    [models],
  )
  const defaultTtsModel = useMemo(
    () => getDefaultTtsModel(audioOutputModels),
    [audioOutputModels],
  )
  const ttsModelInvalid =
    responseAudio &&
    !!ttsModel &&
    !modelHasCapability(modelRegistry, ttsModel, 'audio_output')
  const noModelsConfigured = !bootstrapping && models.length === 0
  const nextSendModel = useMemo(() => {
    if (selectedModel && modelRegistry.has(selectedModel)) return selectedModel
    if (activeConversation?.model && modelRegistry.has(activeConversation.model)) {
      return activeConversation.model
    }
    if (defaultModel && modelRegistry.has(defaultModel)) return defaultModel
    return models[0]?.model ?? null
  }, [activeConversation?.model, defaultModel, modelRegistry, models, selectedModel])
  const composerBlockedReason = noModelsConfigured
    ? '管理员尚未配置可用模型'
    : !supportsTextConversation
      ? '当前模型未声明 text_chat 能力，无法用作主对话模型'
      : null

  const mainClassName = `ai-chat__main${auth.token ? ' ai-chat__main--authenticated' : ''}`

  useEffect(() => {
    if (!auth.token) {
      abortRef.current?.abort()
      setModels([])
      setConversations([])
      setActiveConversationId(null)
      setMessages([])
      setSelectedModel('')
      setResponseAudio(false)
      setTtsModel('')
      setPendingContent(null)
      setSending(false)
      return
    }

    let cancelled = false
    setBootstrapping(true)
    setConversationsLoading(true)

    Promise.all([
      listAiModels(),
      listAiConversations(0, CONVERSATION_PAGE_SIZE),
    ])
      .then(([modelList, conversationPage]) => {
        if (cancelled) return
        setModels(modelList)
        setSelectedModel((current) =>
          modelList.some((item) => item.model === current)
            ? current
            : getDefaultModel(modelList),
        )
        setConversations(conversationPage.items)
        setActiveConversationId((current) => {
          if (current && conversationPage.items.some((item) => item.id === current)) {
            return current
          }
          return conversationPage.items[0]?.id ?? null
        })
      })
      .catch((error) => {
        if (!cancelled) {
          message.error((error as Error).message)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBootstrapping(false)
          setConversationsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [auth.token, message])

  useEffect(() => {
    if (activeConversation?.model && modelRegistry.has(activeConversation.model)) {
      setSelectedModel(activeConversation.model)
      return
    }

    if (defaultModel) {
      setSelectedModel(defaultModel)
      return
    }

    setSelectedModel(models[0]?.model ?? '')
  }, [activeConversation?.id, activeConversation?.model, defaultModel, modelRegistry, models])

  useEffect(() => {
    if (!responseAudio) return
    if (!ttsModel || !modelHasCapability(modelRegistry, ttsModel, 'audio_output')) {
      setTtsModel(defaultTtsModel)
    }
  }, [responseAudio, defaultTtsModel, modelRegistry, ttsModel])

  useEffect(() => {
    if (responseAudio && audioOutputModels.length === 0) {
      setResponseAudio(false)
    }
  }, [responseAudio, audioOutputModels.length])

  const loadActiveConversationMessages = async (conversationId: number) => {
    const seq = ++messageLoadSeqRef.current
    setMessagesLoading(true)
    try {
      const data = await listAiMessages(conversationId, 0, MESSAGE_PAGE_SIZE)
      if (seq !== messageLoadSeqRef.current) return
      setMessages(data.items)
    } catch (error) {
      if (seq !== messageLoadSeqRef.current) return
      setMessages([])
      message.error((error as Error).message)
    } finally {
      if (seq === messageLoadSeqRef.current) {
        setMessagesLoading(false)
      }
    }
  }

  useEffect(() => {
    if (!auth.token || !activeConversationId) {
      setMessages([])
      setMessagesLoading(false)
      return
    }

    void loadActiveConversationMessages(activeConversationId)
  }, [activeConversationId, auth.token])

  useEffect(() => {
    if (!sending) return

    setElapsed(0)
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 500)

    return () => window.clearInterval(timer)
  }, [sending])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [activeConversationId, messages, pendingContent, sending])

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const refreshConversations = async () => {
    if (!auth.token) return

    setConversationsLoading(true)
    try {
      const data = await listAiConversations(0, CONVERSATION_PAGE_SIZE)
      setConversations(data.items)
      setActiveConversationId((current) => {
        if (current && data.items.some((item) => item.id === current)) {
          return current
        }
        return data.items[0]?.id ?? null
      })
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setConversationsLoading(false)
    }
  }

  const handleCreateConversation = async () => {
    if (!auth.token || creatingConversation || sending) return
    if (noModelsConfigured) {
      message.error('管理员尚未配置可用模型，当前无法创建对话')
      return
    }

    setCreatingConversation(true)
    try {
      const conversation = await createAiConversation(
        nextSendModel ? { model: nextSendModel } : {},
      )
      setConversations((current) => upsertConversation(current, conversation))
      setActiveConversationId(conversation.id)
      setMessages([])
      message.success('已新建对话')
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setCreatingConversation(false)
    }
  }

  const handleSend = async () => {
    if (!auth.token || sending || creatingConversation) return
    if (composerBlockedReason) {
      message.warning(composerBlockedReason)
      return
    }

    const content = draft.trim()
    if (!content) {
      message.warning('请输入消息内容')
      return
    }

    const modelToUse = nextSendModel ?? undefined
    let conversationId = activeConversationId

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setSending(true)
    setPendingContent(content)
    setDraft('')

    try {
      if (!conversationId) {
        const conversation = await createAiConversation(modelToUse ? { model: modelToUse } : {})
        setConversations((current) => upsertConversation(current, conversation))
        setActiveConversationId(conversation.id)
        setMessages([])
        conversationId = conversation.id
      }

      const sendBody: import('../types').AiConversationSendRequest = { content }
      if (modelToUse) sendBody.model = modelToUse
      if (responseAudio) {
        sendBody.responseAudio = true
        if (ttsModel && modelHasCapability(modelRegistry, ttsModel, 'audio_output')) {
          sendBody.ttsModel = ttsModel
        }
      }

      const reply = await sendAiMessage(conversationId, sendBody, controller.signal)

      messageLoadSeqRef.current += 1
      setConversations((current) => upsertConversation(current, reply.conversation))
      setActiveConversationId(reply.conversation.id)
      setSelectedModel(reply.conversation.model || modelToUse || '')
      setMessages((current) => [...current, reply.userMessage, reply.assistantMessage])
    } catch (error) {
      setDraft((current) => current || content)
      if (error instanceof ApiError && error.code === -2) {
        message.info('已取消本次请求')
      } else {
        message.error((error as Error).message)
      }
    } finally {
      setPendingContent(null)
      setSending(false)
      setElapsed(0)
      abortRef.current = null
    }
  }

  const handleCancel = () => {
    abortRef.current?.abort()
  }

  const handleDraftKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSend()
    }
  }

  return (
    <div className="ai-chat">
      <header className="topbar">
        <RouterLink to="/" className="topbar-brand" aria-label="返回首页">
          <span className="brand-dot" />
          <span>我的导航</span>
        </RouterLink>

        <nav className="topbar-nav" aria-label="主导航">
          <RouterNavLink
            to="/"
            end
            className={({ isActive }) => `topbar-nav__link${isActive ? ' is-active' : ''}`}
          >
            导航
          </RouterNavLink>
          <RouterNavLink
            to="/music"
            className={({ isActive }) => `topbar-nav__link${isActive ? ' is-active' : ''}`}
          >
            音乐
          </RouterNavLink>
          <RouterNavLink
            to="/ai-chat"
            className={({ isActive }) => `topbar-nav__link${isActive ? ' is-active' : ''}`}
          >
            AI对话
          </RouterNavLink>
        </nav>

        <div className="topbar-actions" aria-label="站点操作">
          {auth.token ? (
            <RouterLink to="/admin" className="topbar-action">
              <Settings size={16} />
              <span>管理</span>
            </RouterLink>
          ) : (
            <RouterLink to="/login" className="topbar-action" state={{ from: '/ai-chat' }}>
              <LogIn size={16} />
              <span>登录</span>
            </RouterLink>
          )}
          <ThemeToggle />
        </div>
      </header>

      <main className={mainClassName}>
        {!auth.token ? (
          <section className="ai-chat__guest">
            <article className="ai-chat__welcome-card">
              <div className="ai-chat__eyebrow">
                <Sparkles size={14} />
                <span>AI workspace</span>
              </div>
              <h1>真实会话接口已接入</h1>
              <p>
            当前页面已对接后端 `/api/user/ai/*`：模型列表、会话创建、会话历史、消息历史和发送消息都可直接使用。
          </p>
              <div className="ai-chat__guest-points">
                <span>登录后自动加载你的会话历史</span>
                <span>发送期间支持取消，不做自动重试</span>
                <span>会话和消息按当前用户隔离存储</span>
                <span>模型能力会显示文本、语音输入、语音输出、音色定制标签</span>
              </div>
            </article>

            <article className="ai-chat__login-card">
              <div className="ai-chat__icon-badge">
                <Bot size={18} />
              </div>
              <h2>登录后开始对话</h2>
              <p>Token 过期后页面会回到登录态。建议直接使用站内账号登录后再进入该页面。</p>
              <div className="ai-chat__guest-actions">
                <RouterLink
                  to="/login"
                  state={{ from: '/ai-chat' }}
                  className="ai-chat__button ai-chat__button--primary"
                >
                  <LogIn size={16} />
                  <span>去登录</span>
                </RouterLink>
                <RouterLink
                  to="/register"
                  className="ai-chat__button ai-chat__button--secondary"
                >
                  注册账号
                </RouterLink>
              </div>
            </article>
          </section>
        ) : (
          <section className="ai-chat__shell">
            <aside className="ai-chat__sidebar">
              <div className="ai-chat__sidebar-head">
                <div>
                  <div className="ai-chat__eyebrow">
                    <MessagesSquare size={14} />
                    <span>Conversations</span>
                  </div>
                  <h1 className="ai-chat__sidebar-title">AI 对话</h1>
                  <p className="ai-chat__sidebar-copy">
                    当前账号：{auth.username ?? '已登录用户'}
                  </p>
                </div>
                <div className="ai-chat__icon-badge">
                  <Bot size={18} />
                </div>
              </div>

              <div className="ai-chat__toolbar">
                <button
                  type="button"
                  className="ai-chat__button ai-chat__button--primary"
                  onClick={handleCreateConversation}
                  disabled={creatingConversation || sending || bootstrapping}
                >
                  {creatingConversation ? (
                    <LoaderCircle size={16} className="ai-chat__spinner" />
                  ) : (
                    <Plus size={16} />
                  )}
                  <span>新建对话</span>
                </button>
                <button
                  type="button"
                  className="ai-chat__button ai-chat__button--secondary"
                  onClick={() => void refreshConversations()}
                  disabled={conversationsLoading || sending || bootstrapping}
                  aria-label="刷新会话"
                >
                  <RefreshCw
                    size={16}
                    className={conversationsLoading ? 'ai-chat__spinner' : undefined}
                  />
                </button>
              </div>

              <div className="ai-chat__conversation-list" aria-label="会话历史">
                {!conversations.length && !conversationsLoading && !bootstrapping ? (
                  <div className="ai-chat__empty-panel">
                    <span>还没有任何会话</span>
                    <small>先创建一个空会话，或直接输入内容后发送。</small>
                  </div>
                ) : (
                  conversations.map((item) => {
                    const isActive = item.id === activeConversationId
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`ai-chat__conversation${isActive ? ' is-active' : ''}`}
                        onClick={() => setActiveConversationId(item.id)}
                        disabled={sending}
                      >
                        <div className="ai-chat__conversation-top">
                          <span className="ai-chat__conversation-title">{item.title}</span>
                          <time
                            className="ai-chat__conversation-time"
                            dateTime={item.lastMessageAt}
                            title={item.lastMessageAt}
                          >
                            {formatTimeLabel(item.lastMessageAt)}
                          </time>
                        </div>
                        <div
                          className="ai-chat__conversation-preview"
                          title={item.lastMessagePreview ?? '等待首条消息'}
                        >
                          {item.lastMessagePreview ?? '等待首条消息'}
                        </div>
                        <div className="ai-chat__conversation-footer">
                          <span className="ai-chat__tag">{item.model}</span>
                          {!modelRegistry.has(item.model) && (
                            <span className="ai-chat__tag ai-chat__tag--warn">已移出模型池</span>
                          )}
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </aside>

            <section className="ai-chat__stage">
              {activeConversationModelRemoved && (
                <div className="ai-chat__stage-alert">
                  <div className="ai-chat__warning-card">
                    <strong>当前会话模型已移出模型池</strong>
                    <span>
                      历史会话仍保留模型 `{activeConversation?.model}`，下一次发送会回退到
                      `{nextSendModel ?? '管理员默认模型'}`。
                    </span>
                  </div>
                </div>
              )}

              <div className="ai-chat__messages">
                {bootstrapping ? (
                  <div className="ai-chat__loader">
                    <LoaderCircle size={18} className="ai-chat__spinner" />
                    <span>正在加载模型与会话历史...</span>
                  </div>
                ) : !activeConversation ? (
                  <div className="ai-chat__empty-stage">
                    <Bot size={22} />
                    <h3>尚未选中会话</h3>
                    <p>左侧可创建空会话，也可以在输入框里直接写下你的第一条消息。</p>
                  </div>
                ) : messagesLoading ? (
                  <div className="ai-chat__loader">
                    <LoaderCircle size={18} className="ai-chat__spinner" />
                    <span>正在拉取会话消息...</span>
                  </div>
                ) : (
                  <>
                    {!messages.length && !pendingContent && (
                      <div className="ai-chat__empty-stage">
                        <MessagesSquare size={22} />
                        <h3>会话已创建</h3>
                        <p>当前还没有消息。发送第一条内容后，后端会自动补全摘要和标题。</p>
                      </div>
                    )}

                    {messages.map((item) => (
                      <article
                        key={item.id}
                        className={`ai-chat__message ai-chat__message--${item.role === 'assistant' ? 'assistant' : 'user'}`}
                      >
                        <div className="ai-chat__message-avatar">
                          {item.role === 'assistant' ? 'AI' : '我'}
                        </div>
                        <div className="ai-chat__bubble">
                          <div className="ai-chat__message-meta">
                            <span className="ai-chat__message-role">
                              {formatRoleLabel(item.role)}
                            </span>
                            <span>{item.model ?? '未记录模型'}</span>
                            <time dateTime={item.createdAt} title={item.createdAt}>
                              {item.createdAt}
                            </time>
                            {item.finishReason && <span>{item.finishReason}</span>}
                            {formatTokenLabel(item) && (
                              <span className="ai-chat__message-tokens">
                                {formatTokenLabel(item)}
                              </span>
                            )}
                            {item.audioAvailable && item.audioModel && (
                              <span className="ai-chat__message-tokens">
                                <Volume2 size={11} />
                                {item.audioModel}
                              </span>
                            )}
                          </div>
                          <div className="ai-chat__message-content">{item.content}</div>
                          {item.role === 'assistant' && item.audioAvailable && item.audioUrl && (
                            <MessageAudio message={item} onError={message.error} />
                          )}
                        </div>
                      </article>
                    ))}

                    {pendingContent && (
                      <article className="ai-chat__message ai-chat__message--user">
                        <div className="ai-chat__message-avatar">我</div>
                        <div className="ai-chat__bubble">
                          <div className="ai-chat__message-meta">
                            <span className="ai-chat__message-role">我</span>
                            <span>{nextSendModel || activeConversation?.model || '默认模型'}</span>
                            <span>等待写入</span>
                          </div>
                          <div className="ai-chat__message-content">{pendingContent}</div>
                          <div className="ai-chat__pending-note">消息已发出，等待后端完成回复并落库。</div>
                        </div>
                      </article>
                    )}

                    {sending && (
                      <article className="ai-chat__message ai-chat__message--assistant">
                        <div className="ai-chat__message-avatar">AI</div>
                        <div className="ai-chat__bubble">
                          <div className="ai-chat__typing">
                            <LoaderCircle size={16} className="ai-chat__spinner" />
                            <span>模型正在回复，已等待 {elapsed}s</span>
                          </div>
                          <div className="ai-chat__pending-note">
                            预计 30 秒到 2 分钟，可点击取消。不要自动重试，避免重复扣费。
                          </div>
                        </div>
                      </article>
                    )}

                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              <div className="ai-chat__composer">
                <div className="ai-chat__composer-shell">
                  <textarea
                    className="ai-chat__textarea"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={handleDraftKeyDown}
                    placeholder={
                      composerBlockedReason ??
                      '输入你的问题。按 Enter 发送，Shift + Enter 换行。'
                    }
                    maxLength={8000}
                    disabled={
                      bootstrapping ||
                      sending ||
                      creatingConversation ||
                      !!composerBlockedReason
                    }
                  />
                  <div className="ai-chat__composer-footer">
                  <div className="ai-chat__composer-meta">
                    <div className="ai-chat__field ai-chat__field--compact">
                      <label htmlFor="ai-model-select">当前请求模型</label>
                      <select
                        id="ai-model-select"
                        className="ai-chat__select ai-chat__select--composer"
                        value={selectedModel}
                        onChange={(event) => setSelectedModel(event.target.value)}
                        disabled={
                          bootstrapping || sending || creatingConversation || noModelsConfigured
                        }
                      >
                        {!selectedModel && <option value="">使用后端默认模型</option>}
                        {models.map((item) => (
                          <option key={item.model} value={item.model}>
                            {item.model}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="ai-chat__tts-controls">
                      <label className="ai-chat__tts-toggle">
                        <input
                          type="checkbox"
                          checked={responseAudio}
                          onChange={(event) => setResponseAudio(event.target.checked)}
                          disabled={
                            bootstrapping ||
                            sending ||
                            creatingConversation ||
                            audioOutputModels.length === 0
                          }
                        />
                        <Volume2 size={13} />
                        <span>请求语音回放</span>
                      </label>
                      {responseAudio && audioOutputModels.length > 0 && (
                        <select
                          aria-label="语音回放模型"
                          className="ai-chat__select ai-chat__select--composer"
                          value={ttsModel}
                          onChange={(event) => setTtsModel(event.target.value)}
                          disabled={bootstrapping || sending || creatingConversation}
                        >
                          <option value="">使用后端默认语音模型</option>
                          {audioOutputModels.map((item) => (
                            <option key={item.model} value={item.model}>
                              {item.model}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="ai-chat__composer-hint">
                      <div>
                        <strong>Enter</strong> 发送，<strong>Shift + Enter</strong> 换行。
                      </div>
                      {composerBlockedReason && <div>{composerBlockedReason}</div>}
                      {ttsModelInvalid && <div>所选语音模型已被移出模型池，将回退到默认值。</div>}
                      {audioOutputModels.length === 0 && responseAudio && (
                        <div>当前模型池中没有 `audio_output` 模型，无法请求语音回放。</div>
                      )}
                    </div>
                  </div>
                    <div className="ai-chat__composer-actions">
                      {sending && (
                        <button
                          type="button"
                          className="ai-chat__button ai-chat__button--danger"
                          onClick={handleCancel}
                        >
                          <X size={16} />
                          <span>取消</span>
                        </button>
                      )}
                      <button
                        type="button"
                        className="ai-chat__button ai-chat__button--primary"
                        onClick={() => void handleSend()}
                        disabled={
                          !draft.trim() ||
                          bootstrapping ||
                          sending ||
                          creatingConversation ||
                          !!composerBlockedReason
                        }
                      >
                        <SendHorizontal size={16} />
                        <span>{sending ? `发送中 ${elapsed}s` : '发送'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </section>
        )}
      </main>
    </div>
  )
}
