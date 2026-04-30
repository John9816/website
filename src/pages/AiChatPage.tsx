import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { App as AntApp } from 'antd'
import {
  ArrowDown,
  Bot,
  Check,
  Copy,
  Hash,
  LoaderCircle,
  LogIn,
  MessagesSquare,
  Play,
  Plus,
  RefreshCw,
  Search,
  SendHorizontal,
  Settings,
  Sparkles,
  StopCircle,
  Volume2,
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
import MessageMarkdown from '../components/MessageMarkdown'
import ThemeToggle from '../components/ThemeToggle'
import { useAuth } from '../context/AuthContext'
import type {
  AiChatMessageView,
  AiConversationView,
  AiModelCapability,
  AiModelView,
} from '../types'
import { groupConversations } from '../utils/groupConversations'
import '../styles/topbar.css'
import '../styles/ai-chat.css'

const CONVERSATION_PAGE_SIZE = 100
const MESSAGE_PAGE_SIZE = 100
const CHAR_LIMIT = 8000
const CHAR_WARN = 7500
const STREAM_REVEAL_MS = 700
const STREAM_MAX_LEN = 3000
const TEXTAREA_MIN = 56
const TEXTAREA_MAX = 240
const STICK_THRESHOLD = 80

const CAPABILITY_LABELS: Record<AiModelCapability, string> = {
  text_chat: '文本对话',
  audio_input: '语音输入',
  audio_output: '语音输出',
  voice_customization: '音色定制',
}

function getDefaultModel(models: AiModelView[]) {
  return models.find((item) => item.defaultModel)?.model ?? models[0]?.model ?? ''
}

function modelHasCapability(
  models: Map<string, AiModelView>,
  modelId: string | null | undefined,
  capability: AiModelCapability,
) {
  if (!modelId) return false
  const info = models.get(modelId)
  if (!info) return false
  return info.capabilities.includes(capability)
}

function getDefaultTtsModel(models: AiModelView[]) {
  return models.find((item) => item.capabilities.includes('audio_output'))?.model ?? ''
}

function upsertConversation(
  conversations: AiConversationView[],
  nextConversation: AiConversationView,
) {
  return [nextConversation, ...conversations.filter((item) => item.id !== nextConversation.id)].sort(
    (a, b) => {
      const left = new Date((a.lastMessageAt || a.updatedAt).replace(' ', 'T')).getTime()
      const right = new Date((b.lastMessageAt || b.updatedAt).replace(' ', 'T')).getTime()
      if (right !== left) return right - left
      return b.id - a.id
    },
  )
}

function parseDate(value?: string | null) {
  if (!value) return null
  const parsed = new Date(value.replace(' ', 'T'))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatTimeLabel(value?: string | null) {
  const date = parseDate(value)
  if (!date) return '刚刚'
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const ts = date.getTime()
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  if (ts >= todayStart) return `${hh}:${mm}`
  if (ts >= todayStart - 86400000) return `昨天 ${hh}:${mm}`
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}-${day}`
}

function formatMessageTime(value?: string | null) {
  const date = parseDate(value)
  if (!date) return value ?? ''
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const ts = date.getTime()
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  if (ts >= todayStart) return `今天 ${hh}:${mm}`
  if (ts >= todayStart - 86400000) return `昨天 ${hh}:${mm}`
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}-${day} ${hh}:${mm}`
}

function formatRoleLabel(role: AiChatMessageView['role']) {
  if (role === 'assistant') return 'AI'
  if (role === 'system') return '系统'
  return '我'
}

function formatTokenSum(total: number) {
  if (total <= 0) return null
  if (total < 1000) return `${total} tokens`
  return `${(total / 1000).toFixed(total >= 10000 ? 0 : 1)}k tokens`
}

interface CapabilityDotsProps {
  capabilities: AiModelCapability[]
  size?: 'sm' | 'md'
}

function CapabilityDots({ capabilities, size = 'md' }: CapabilityDotsProps) {
  if (!capabilities.length) return null
  return (
    <span className={`ai-chat__capability-dots ai-chat__capability-dots--${size}`}>
      {capabilities.map((cap) => (
        <span
          key={cap}
          className={`ai-chat__capability-dot ai-chat__capability-dot--${cap}`}
          title={CAPABILITY_LABELS[cap] ?? cap}
        />
      ))}
    </span>
  )
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

interface CopyButtonProps {
  text: string
  onCopied: () => void
  onError: () => void
}

function CopyButton({ text, onCopied, onError }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [])

  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      onCopied()
      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => setCopied(false), 1500)
    } catch {
      onError()
    }
  }

  return (
    <button
      type="button"
      className="ai-chat__msg-action"
      onClick={() => void handleClick()}
      aria-label={copied ? '已复制' : '复制内容'}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      <span>{copied ? '已复制' : '复制'}</span>
    </button>
  )
}

interface MessageBubbleProps {
  message: AiChatMessageView
  isStreaming: boolean
  onAudioError: (text: string) => void
  onCopySuccess: () => void
  onCopyError: () => void
}

function MessageBubble({
  message,
  isStreaming,
  onAudioError,
  onCopySuccess,
  onCopyError,
}: MessageBubbleProps) {
  const isAssistant = message.role === 'assistant'
  const sideClass = isAssistant ? 'assistant' : 'user'
  const tokenSum = message.totalTokens ?? 0
  const articleClass = [
    'ai-chat__message',
    `ai-chat__message--${sideClass}`,
    isStreaming ? 'is-streaming' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <article className={articleClass}>
      <div className="ai-chat__message-avatar" aria-hidden="true">
        {isAssistant ? <Bot size={18} /> : '我'}
      </div>
      <div className="ai-chat__bubble">
        <div className="ai-chat__message-meta">
          <span className="ai-chat__message-role">{formatRoleLabel(message.role)}</span>
          {message.model && <span className="ai-chat__message-model">{message.model}</span>}
          <time
            className="ai-chat__message-time"
            dateTime={message.createdAt}
            title={message.createdAt}
          >
            {formatMessageTime(message.createdAt)}
          </time>
          {message.finishReason && (
            <span className="ai-chat__message-pill">{message.finishReason}</span>
          )}
          {tokenSum > 0 && (
            <span className="ai-chat__message-pill">
              <Hash size={11} />
              {tokenSum}
            </span>
          )}
          {message.audioAvailable && message.audioModel && (
            <span className="ai-chat__message-pill">
              <Volume2 size={11} />
              {message.audioModel}
            </span>
          )}
        </div>
        <div className="ai-chat__message-content">
          {isAssistant ? (
            <MessageMarkdown content={message.content} />
          ) : (
            <div className="ai-chat__message-plain">{message.content}</div>
          )}
        </div>
        {isAssistant && message.audioAvailable && message.audioUrl && (
          <MessageAudio message={message} onError={onAudioError} />
        )}
        {isAssistant && message.content && (
          <div className="ai-chat__message-actions">
            <CopyButton
              text={message.content}
              onCopied={onCopySuccess}
              onError={onCopyError}
            />
          </div>
        )}
      </div>
    </article>
  )
}

interface ConversationButtonProps {
  conversation: AiConversationView
  isActive: boolean
  isKnownModel: boolean
  capabilities: AiModelCapability[]
  disabled: boolean
  onSelect: (id: number) => void
}

function ConversationButton({
  conversation,
  isActive,
  isKnownModel,
  capabilities,
  disabled,
  onSelect,
}: ConversationButtonProps) {
  return (
    <button
      type="button"
      className={`ai-chat__conversation${isActive ? ' is-active' : ''}`}
      onClick={() => onSelect(conversation.id)}
      disabled={disabled}
    >
      <div className="ai-chat__conversation-top">
        <span className="ai-chat__conversation-title">{conversation.title}</span>
        <time
          className="ai-chat__conversation-time"
          dateTime={conversation.lastMessageAt}
          title={conversation.lastMessageAt}
        >
          {formatTimeLabel(conversation.lastMessageAt)}
        </time>
      </div>
      <div
        className="ai-chat__conversation-preview"
        title={conversation.lastMessagePreview ?? '等待首条消息'}
      >
        {conversation.lastMessagePreview ?? '等待首条消息'}
      </div>
      <div className="ai-chat__conversation-footer">
        <span className="ai-chat__tag">{conversation.model}</span>
        {isKnownModel ? (
          <CapabilityDots capabilities={capabilities} size="sm" />
        ) : (
          <span className="ai-chat__tag ai-chat__tag--warn">已移出模型池</span>
        )}
      </div>
    </button>
  )
}

function SkeletonBubble({ side, width }: { side: 'user' | 'assistant'; width: string }) {
  return (
    <article className={`ai-chat__message ai-chat__message--${side} is-skeleton`}>
      <div className="ai-chat__message-avatar" aria-hidden="true" />
      <div className="ai-chat__bubble" style={{ width }}>
        <div className="ai-chat__skeleton-line" style={{ width: '60%' }} />
        <div className="ai-chat__skeleton-line" style={{ width: '90%' }} />
        <div className="ai-chat__skeleton-line" style={{ width: '70%' }} />
      </div>
    </article>
  )
}

function SkeletonConversation() {
  return (
    <div className="ai-chat__conversation is-skeleton" aria-hidden="true">
      <div className="ai-chat__conversation-top">
        <div className="ai-chat__skeleton-line" style={{ width: '50%' }} />
        <div className="ai-chat__skeleton-line" style={{ width: '20%' }} />
      </div>
      <div className="ai-chat__skeleton-line" style={{ width: '92%' }} />
      <div className="ai-chat__skeleton-line" style={{ width: '40%' }} />
    </div>
  )
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
  const [searchQuery, setSearchQuery] = useState('')
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [streamingMessageId, setStreamingMessageId] = useState<number | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const messageLoadSeqRef = useRef(0)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const streamingTimerRef = useRef<number | null>(null)

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

  const filteredConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        (item.lastMessagePreview ?? '').toLowerCase().includes(q),
    )
  }, [conversations, searchQuery])

  const conversationGroups = useMemo(
    () => (searchQuery.trim() ? null : groupConversations(filteredConversations)),
    [filteredConversations, searchQuery],
  )

  const cumulativeTokens = useMemo(
    () => messages.reduce((sum, msg) => sum + (msg.totalTokens ?? 0), 0),
    [messages],
  )

  const charCount = draft.length
  const charDanger = charCount >= CHAR_LIMIT
  const charWarn = charCount >= CHAR_WARN

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
      setSearchQuery('')
      setStreamingMessageId(null)
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

  const loadActiveConversationMessages = useCallback(
    async (conversationId: number) => {
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
    },
    [message],
  )

  useEffect(() => {
    if (!auth.token || !activeConversationId) {
      setMessages([])
      setMessagesLoading(false)
      return
    }

    void loadActiveConversationMessages(activeConversationId)
  }, [activeConversationId, auth.token, loadActiveConversationMessages])

  useEffect(() => {
    if (!sending) return

    setElapsed(0)
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 500)

    return () => window.clearInterval(timer)
  }, [sending])

  // Track scroll position so we know whether to auto-stick to the bottom.
  useEffect(() => {
    const el = messagesContainerRef.current
    if (!el) return
    const handler = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight
      setIsAtBottom(distance < STICK_THRESHOLD)
    }
    handler()
    el.addEventListener('scroll', handler, { passive: true })
    return () => el.removeEventListener('scroll', handler)
  }, [auth.token])

  // Force scroll to bottom on conversation switch.
  useLayoutEffect(() => {
    if (!activeConversationId) return
    setIsAtBottom(true)
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ block: 'end' })
    })
  }, [activeConversationId])

  // Auto-stick when at bottom and content grows.
  useEffect(() => {
    if (!isAtBottom) return
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, pendingContent, sending, isAtBottom])

  // Auto-resize textarea.
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const next = Math.min(TEXTAREA_MAX, Math.max(TEXTAREA_MIN, el.scrollHeight))
    el.style.height = `${next}px`
  }, [draft])

  // Esc cancels the in-flight request.
  useEffect(() => {
    if (!sending) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        abortRef.current?.abort()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [sending])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      if (streamingTimerRef.current) window.clearTimeout(streamingTimerRef.current)
    }
  }, [])

  const refreshConversations = useCallback(async () => {
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
  }, [auth.token, message])

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
    setIsAtBottom(true)

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

      if (reply.assistantMessage.content.length <= STREAM_MAX_LEN) {
        setStreamingMessageId(reply.assistantMessage.id)
        if (streamingTimerRef.current) window.clearTimeout(streamingTimerRef.current)
        streamingTimerRef.current = window.setTimeout(() => {
          setStreamingMessageId(null)
          streamingTimerRef.current = null
        }, STREAM_REVEAL_MS)
      }
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

  const handlePrimaryClick = () => {
    if (sending) {
      handleCancel()
    } else {
      void handleSend()
    }
  }

  const handleDraftKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSend()
    }
  }

  const handleJumpToBottom = () => {
    setIsAtBottom(true)
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }

  const renderConversationItems = (items: AiConversationView[]) =>
    items.map((item) => {
      const info = modelRegistry.get(item.model)
      return (
        <ConversationButton
          key={item.id}
          conversation={item}
          isActive={item.id === activeConversationId}
          isKnownModel={!!info}
          capabilities={info?.capabilities ?? []}
          disabled={sending}
          onSelect={setActiveConversationId}
        />
      )
    })

  const sidebarBody = (() => {
    if (bootstrapping && !conversations.length) {
      return (
        <div className="ai-chat__skeleton-list" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, idx) => (
            <SkeletonConversation key={idx} />
          ))}
        </div>
      )
    }

    if (!filteredConversations.length) {
      return (
        <div className="ai-chat__empty-panel">
          {searchQuery.trim() ? (
            <>
              <span>没有匹配的会话</span>
              <small>试试其他关键字，或清空搜索框查看全部历史。</small>
            </>
          ) : (
            <>
              <span>还没有任何会话</span>
              <small>先创建一个空会话，或直接输入内容后发送。</small>
            </>
          )}
        </div>
      )
    }

    if (conversationGroups) {
      return conversationGroups.map((group) => (
        <div key={group.label} className="ai-chat__group">
          <div className="ai-chat__group-head">
            <span>{group.label}</span>
            <small>{group.items.length}</small>
          </div>
          {renderConversationItems(group.items)}
        </div>
      ))
    }

    return renderConversationItems(filteredConversations)
  })()

  const messageArea = (() => {
    if (bootstrapping) {
      return (
        <div className="ai-chat__skeleton-stack">
          <SkeletonBubble side="user" width="62%" />
          <SkeletonBubble side="assistant" width="78%" />
          <SkeletonBubble side="user" width="48%" />
        </div>
      )
    }

    if (!activeConversation) {
      return (
        <div className="ai-chat__empty-stage">
          <Bot size={22} />
          <h3>尚未选中会话</h3>
          <p>左侧可创建空会话，也可以在输入框里直接写下你的第一条消息。</p>
        </div>
      )
    }

    if (messagesLoading) {
      return (
        <div className="ai-chat__skeleton-stack">
          <SkeletonBubble side="user" width="58%" />
          <SkeletonBubble side="assistant" width="82%" />
        </div>
      )
    }

    return (
      <>
        {!messages.length && !pendingContent && (
          <div className="ai-chat__empty-stage">
            <MessagesSquare size={22} />
            <h3>会话已创建</h3>
            <p>当前还没有消息。发送第一条内容后，后端会自动补全摘要和标题。</p>
          </div>
        )}

        {messages.map((item) => (
          <MessageBubble
            key={item.id}
            message={item}
            isStreaming={streamingMessageId === item.id}
            onAudioError={message.error}
            onCopySuccess={() => message.success('已复制到剪贴板')}
            onCopyError={() => message.error('复制失败，请检查浏览器权限')}
          />
        ))}

        {pendingContent && (
          <article className="ai-chat__message ai-chat__message--user">
            <div className="ai-chat__message-avatar" aria-hidden="true">
              我
            </div>
            <div className="ai-chat__bubble">
              <div className="ai-chat__message-meta">
                <span className="ai-chat__message-role">我</span>
                <span className="ai-chat__message-model">
                  {nextSendModel || activeConversation?.model || '默认模型'}
                </span>
                <span className="ai-chat__message-pill">等待写入</span>
              </div>
              <div className="ai-chat__message-content">
                <div className="ai-chat__message-plain">{pendingContent}</div>
              </div>
              <div className="ai-chat__pending-note">消息已发出，等待后端完成回复并落库。</div>
            </div>
          </article>
        )}

        {sending && (
          <article className="ai-chat__message ai-chat__message--assistant">
            <div className="ai-chat__message-avatar" aria-hidden="true">
              <Bot size={18} />
            </div>
            <div className="ai-chat__bubble">
              <div className="ai-chat__typing">
                <LoaderCircle size={16} className="ai-chat__spinner" />
                <span>模型正在回复，已等待 {elapsed}s · 按 Esc 取消</span>
              </div>
              <div className="ai-chat__pending-note">
                预计 30 秒到 2 分钟。不要自动重试，避免重复扣费。
              </div>
            </div>
          </article>
        )}

        <div ref={messagesEndRef} />
      </>
    )
  })()

  const tokenLabel = formatTokenSum(cumulativeTokens)
  const messageCount = messages.length
  const sendDisabled =
    bootstrapping ||
    creatingConversation ||
    !!composerBlockedReason ||
    (!sending && (!draft.trim() || charDanger))

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

              <div className="ai-chat__search">
                <Search size={14} />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="搜索会话标题或预览"
                  aria-label="搜索会话"
                />
              </div>

              <div className="ai-chat__conversation-list" aria-label="会话历史">
                {sidebarBody}
              </div>
            </aside>

            <section className="ai-chat__stage">
              <div className="ai-chat__stage-head">
                <div className="ai-chat__stage-head-main">
                  <div className="ai-chat__stage-eyebrow">
                    <Bot size={14} />
                    <span>当前会话</span>
                  </div>
                  <h2 className="ai-chat__stage-title">
                    {activeConversation?.title ?? '尚未选中会话'}
                  </h2>
                  <div className="ai-chat__stage-meta">
                    {activeConversation ? (
                      <>
                        <span className="ai-chat__stage-chip">
                          <span>{activeConversation.model}</span>
                          <CapabilityDots
                            capabilities={activeConversationModelInfo?.capabilities ?? []}
                            size="sm"
                          />
                        </span>
                        <span className="ai-chat__stage-meta-item">
                          <MessagesSquare size={12} />
                          {messageCount} 条消息
                        </span>
                        {tokenLabel && (
                          <span className="ai-chat__stage-meta-item">
                            <Hash size={12} />
                            {tokenLabel}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="ai-chat__stage-meta-item">
                        新对话会自动以你的第一条消息为标题。
                      </span>
                    )}
                  </div>
                </div>
                <div className="ai-chat__stage-actions">
                  <button
                    type="button"
                    className="ai-chat__button ai-chat__button--secondary"
                    onClick={() => void refreshConversations()}
                    disabled={conversationsLoading || sending}
                    aria-label="刷新当前列表"
                  >
                    <RefreshCw
                      size={14}
                      className={conversationsLoading ? 'ai-chat__spinner' : undefined}
                    />
                    <span>刷新</span>
                  </button>
                </div>
              </div>

              {activeConversationModelRemoved && (
                <div className="ai-chat__stage-alert">
                  <div className="ai-chat__warning-card">
                    <strong>当前会话模型已移出模型池</strong>
                    <span>
                      历史会话仍保留模型 `{activeConversation?.model}`，下一次发送会回退到 `
                      {nextSendModel ?? '管理员默认模型'}`。
                    </span>
                  </div>
                </div>
              )}

              <div className="ai-chat__messages-wrap">
                <div ref={messagesContainerRef} className="ai-chat__messages">
                  {messageArea}
                </div>
                {!isAtBottom && activeConversation && !bootstrapping && (
                  <button
                    type="button"
                    className="ai-chat__jump-bottom"
                    onClick={handleJumpToBottom}
                    aria-label="跳到最新消息"
                  >
                    <ArrowDown size={14} />
                    <span>跳到最新</span>
                  </button>
                )}
              </div>

              <div className="ai-chat__composer">
                {composerBlockedReason && (
                  <div className="ai-chat__composer-banner ai-chat__composer-banner--warn">
                    {composerBlockedReason}
                  </div>
                )}
                {ttsModelInvalid && (
                  <div className="ai-chat__composer-banner">
                    所选语音模型已被移出模型池，将回退到默认值。
                  </div>
                )}
                {audioOutputModels.length === 0 && responseAudio && (
                  <div className="ai-chat__composer-banner">
                    当前模型池中没有 `audio_output` 模型，无法请求语音回放。
                  </div>
                )}

                <div className="ai-chat__composer-shell">
                  <div className="ai-chat__composer-controls">
                    <select
                      aria-label="主对话模型"
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
                      <span>语音回放</span>
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

                  <div className="ai-chat__composer-textarea-wrap">
                    <textarea
                      ref={textareaRef}
                      className="ai-chat__textarea"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={handleDraftKeyDown}
                      placeholder="输入你的问题。Enter 发送，Shift+Enter 换行。"
                      maxLength={CHAR_LIMIT}
                      disabled={
                        bootstrapping ||
                        sending ||
                        creatingConversation ||
                        !!composerBlockedReason
                      }
                      rows={1}
                    />
                    <div
                      className={
                        'ai-chat__char-counter' +
                        (charDanger
                          ? ' ai-chat__char-counter--danger'
                          : charWarn
                            ? ' ai-chat__char-counter--warn'
                            : '')
                      }
                      aria-live="polite"
                    >
                      {charCount} / {CHAR_LIMIT}
                    </div>
                  </div>

                  <div className="ai-chat__composer-bottom">
                    <div className="ai-chat__composer-hint">
                      {sending
                        ? `模型正在回复，已等待 ${elapsed}s · 按 Esc 取消`
                        : 'Enter 发送 · Shift + Enter 换行'}
                    </div>
                    <button
                      type="button"
                      className={
                        'ai-chat__button ' +
                        (sending ? 'ai-chat__button--danger' : 'ai-chat__button--primary')
                      }
                      onClick={handlePrimaryClick}
                      disabled={sendDisabled}
                    >
                      {sending ? <StopCircle size={16} /> : <SendHorizontal size={16} />}
                      <span>{sending ? `取消 ${elapsed}s` : '发送'}</span>
                    </button>
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
