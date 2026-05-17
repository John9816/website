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
  LoaderCircle,
  LogIn,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Plus,
  RefreshCw,
  Search,
  SendHorizontal,
  Settings,
  Sparkles,
  StopCircle,
  Upload,
} from 'lucide-react'
import { Link as RouterLink, NavLink as RouterNavLink } from 'react-router-dom'
import {
  createAiConversation,
  fetchAiMessageAudio,
  listAiConversations,
  listAiMessages,
  listAiModels,
  regenerateAiMessageAudio,
  sendAiMessage,
  sendAiMessageStream,
} from '../api/ai'
import { ApiError } from '../api/client'
import MessageMarkdown from '../components/MessageMarkdown'
import TopbarUserMenu from '../components/TopbarUserMenu'
import ThemeToggle from '../components/ThemeToggle'
import { useAuth } from '../context/AuthContext'
import type {
  AiChatMessageView,
  AiConversationReplyView,
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

type AudioInputMode = 'none' | 'upload' | 'url'

function getDefaultModel(models: AiModelView[]) {
  return (
    models.find((item) => item.defaultModel && item.capabilities.includes('text_chat'))?.model ??
    models.find((item) => item.capabilities.includes('text_chat'))?.model ??
    ''
  )
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

function isDirectAudioSource(value?: string | null) {
  if (!value) return false
  return /^https?:\/\//i.test(value) || value.startsWith('data:audio/')
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取音频文件失败'))
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('读取音频文件失败'))
    }
    reader.readAsDataURL(file)
  })
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

interface MessageAudioProps {
  message: AiChatMessageView
  onError: (text: string) => void
}

function MessageAudio({ message, onError }: MessageAudioProps) {
  const directSrc = isDirectAudioSource(message.audioUrl) ? message.audioUrl : null
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
    if (loading || objectUrl || directSrc) return
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

  if (directSrc || objectUrl) {
    return (
      <div className="ai-chat__audio">
        <audio
          controls
          autoPlay
          src={directSrc ?? objectUrl ?? undefined}
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
      <span>
        {errored
          ? '重试播放语音'
          : loading
            ? '加载中…'
            : message.role === 'assistant'
              ? '播放语音回放'
              : '播放上传音频'}
      </span>
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
  isRegeneratingAudio: boolean
  onAudioError: (text: string) => void
  onCopySuccess: () => void
  onCopyError: () => void
  onRegenerateAudio: (message: AiChatMessageView) => void
}

function MessageBubble({
  message,
  isStreaming,
  isRegeneratingAudio,
  onAudioError,
  onCopySuccess,
  onCopyError,
  onRegenerateAudio,
}: MessageBubbleProps) {
  const isAssistant = message.role === 'assistant'
  const sideClass = isAssistant ? 'assistant' : 'user'
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
        {isAssistant ? <Bot size={16} /> : '你'}
      </div>
      <div className="ai-chat__bubble">
        <div className="ai-chat__message-content">
          {isAssistant ? (
            <MessageMarkdown content={message.content} />
          ) : (
            <div className="ai-chat__message-plain">{message.content}</div>
          )}
        </div>
        {message.audioAvailable && (
          <MessageAudio message={message} onError={onAudioError} />
        )}
        {isAssistant && message.content && (
          <div className="ai-chat__message-actions">
            <CopyButton
              text={message.content}
              onCopied={onCopySuccess}
              onError={onCopyError}
            />
            <button
              type="button"
              className="ai-chat__msg-action"
              onClick={() => onRegenerateAudio(message)}
              disabled={isRegeneratingAudio}
              aria-label={message.audioAvailable ? '重生成语音' : '生成语音'}
            >
              {isRegeneratingAudio ? (
                <LoaderCircle size={12} className="ai-chat__spinner" />
              ) : (
                <RefreshCw size={12} />
              )}
            </button>
          </div>
        )}
      </div>
    </article>
  )
}

interface ConversationButtonProps {
  conversation: AiConversationView
  isActive: boolean
  disabled: boolean
  onSelect: (id: number) => void
}

function ConversationButton({
  conversation,
  isActive,
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
  const [streamMode, setStreamMode] = useState(false)
  const [responseAudio, setResponseAudio] = useState(false)
  const [ttsModel, setTtsModel] = useState('')
  const [ttsFormat, setTtsFormat] = useState('wav')
  const [ttsVoice, setTtsVoice] = useState('')
  const [ttsPrompt, setTtsPrompt] = useState('')
  const [_showTtsOptions, setShowTtsOptions] = useState(false)
  const [audioInputMode, setAudioInputMode] = useState<AudioInputMode>('none')
  const [audioInputUrl, setAudioInputUrl] = useState('')
  const [audioInputFileData, setAudioInputFileData] = useState('')
  const [audioInputFileName, setAudioInputFileName] = useState('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false)
  const [bootstrapping, setBootstrapping] = useState(false)
  const [_conversationsLoading, setConversationsLoading] = useState(false)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [creatingConversation, setCreatingConversation] = useState(false)
  const [sending, setSending] = useState(false)
  const [pendingRequest, setPendingRequest] = useState<{
    content: string
    hasAudioInput: boolean
  } | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [streamingMessageId, setStreamingMessageId] = useState<number | null>(null)
  const [streamingDraft, setStreamingDraft] = useState('')
  const [_streamingModel, setStreamingModel] = useState('')
  const [_ttsPreviewLoading, setTtsPreviewLoading] = useState(false)
  const [_ttsPreviewUrl, setTtsPreviewUrl] = useState<string | null>(null)
  const [regeneratingAudioId, setRegeneratingAudioId] = useState<number | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const ttsPreviewAbortRef = useRef<AbortController | null>(null)
  const messageLoadSeqRef = useRef(0)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const streamingTimerRef = useRef<number | null>(null)
  const audioInputRef = useRef<HTMLInputElement | null>(null)
  const ttsPreviewUrlRef = useRef<string | null>(null)

  const modelRegistry = useMemo(
    () => new Map(models.map((item) => [item.model, item] as const)),
    [models],
  )
  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeConversationId) ?? null,
    [activeConversationId, conversations],
  )
  const textChatModels = useMemo(
    () => models.filter((item) => item.capabilities.includes('text_chat')),
    [models],
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
  const audioOutputModels = useMemo(
    () => models.filter((item) => item.capabilities.includes('audio_output')),
    [models],
  )
  const defaultTtsModel = useMemo(
    () => getDefaultTtsModel(audioOutputModels),
    [audioOutputModels],
  )
  const noModelsConfigured = !bootstrapping && textChatModels.length === 0
  const nextSendModel = useMemo(() => {
    if (selectedModel && modelHasCapability(modelRegistry, selectedModel, 'text_chat')) {
      return selectedModel
    }
    if (
      activeConversation?.model &&
      modelHasCapability(modelRegistry, activeConversation.model, 'text_chat')
    ) {
      return activeConversation.model
    }
    if (defaultModel && modelRegistry.has(defaultModel)) return defaultModel
    return textChatModels[0]?.model ?? null
  }, [activeConversation?.model, defaultModel, modelRegistry, selectedModel, textChatModels])
  const nextSendModelInfo = useMemo(
    () => (nextSendModel ? modelRegistry.get(nextSendModel) ?? null : null),
    [modelRegistry, nextSendModel],
  )
  const supportsTextConversation =
    nextSendModelInfo?.capabilities.includes('text_chat') ?? selectedCapabilities.length === 0
  const supportsAudioInput = nextSendModelInfo?.capabilities.includes('audio_input') ?? false
  const activeAudioInputValue =
    audioInputMode === 'upload'
      ? audioInputFileData
      : audioInputMode === 'url'
        ? audioInputUrl.trim()
        : ''
  const hasAudioInput = activeAudioInputValue.length > 0
  const composerBlockedReason = noModelsConfigured
    ? '管理员尚未配置可用文本模型'
    : !supportsTextConversation
      ? '当前模型不支持文本对话，请切换到具备 text_chat 能力的模型'
      : hasAudioInput && !supportsAudioInput
        ? '当前模型不支持语音输入，请切换到具备 audio_input 能力的模型'
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

  const charCount = draft.length
  const charDanger = charCount >= CHAR_LIMIT

  const mainClassName = `ai-chat__main${auth.token ? ' ai-chat__main--authenticated' : ''}${!isSidebarOpen ? ' ai-chat__main--sidebar-closed' : ''}`

  const clearAudioInput = useCallback(
    (nextMode: AudioInputMode = 'none') => {
      setAudioInputMode(nextMode)
      setAudioInputUrl('')
      setAudioInputFileData('')
      setAudioInputFileName('')
      if (audioInputRef.current) {
        audioInputRef.current.value = ''
      }
    },
    [],
  )

  const clearTtsPreview = useCallback(() => {
    if (ttsPreviewUrlRef.current) {
      URL.revokeObjectURL(ttsPreviewUrlRef.current)
      ttsPreviewUrlRef.current = null
    }
    setTtsPreviewUrl(null)
  }, [])

  const buildTtsPayload = useCallback(() => {
    const payload: {
      ttsModel?: string
      ttsVoice?: string
      ttsFormat?: string
      ttsPrompt?: string
    } = {}

    if (ttsModel && modelHasCapability(modelRegistry, ttsModel, 'audio_output')) {
      payload.ttsModel = ttsModel
    }
    if (ttsFormat.trim()) payload.ttsFormat = ttsFormat.trim()
    if (ttsVoice.trim()) payload.ttsVoice = ttsVoice.trim()
    if (ttsPrompt.trim()) payload.ttsPrompt = ttsPrompt.trim()
    return payload
  }, [modelRegistry, ttsFormat, ttsModel, ttsPrompt, ttsVoice])

  const handleRegenerateMessageAudio = useCallback(
    async (target: AiChatMessageView) => {
      if (regeneratingAudioId === target.id) return
      setRegeneratingAudioId(target.id)
      try {
        const updated = await regenerateAiMessageAudio(target.id, buildTtsPayload())
        setMessages((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        )
        message.success(target.audioAvailable ? '已重生成消息语音' : '已生成消息语音')
      } catch (error) {
        message.error((error as Error).message)
      } finally {
        setRegeneratingAudioId(null)
      }
    },
    [buildTtsPayload, message, regeneratingAudioId],
  )

  useEffect(() => {
    if (!auth.token) {
      abortRef.current?.abort()
      ttsPreviewAbortRef.current?.abort()
      setModels([])
      setConversations([])
      setActiveConversationId(null)
      setMessages([])
      setSelectedModel('')
      setStreamMode(false)
      setResponseAudio(false)
      setTtsModel('')
      setTtsFormat('wav')
      setTtsVoice('')
      setTtsPrompt('')
      setShowTtsOptions(false)
      clearAudioInput()
      clearTtsPreview()
      setTtsPreviewLoading(false)
      setRegeneratingAudioId(null)
      setPendingRequest(null)
      setSending(false)
      setSearchQuery('')
      setStreamingMessageId(null)
      setStreamingDraft('')
      setStreamingModel('')
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
          modelList.some(
            (item) => item.model === current && item.capabilities.includes('text_chat'),
          )
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
  }, [auth.token, clearAudioInput, clearTtsPreview, message])

  useEffect(() => {
    if (
      activeConversation?.model &&
      modelHasCapability(modelRegistry, activeConversation.model, 'text_chat')
    ) {
      setSelectedModel(activeConversation.model)
      return
    }

    if (defaultModel) {
      setSelectedModel(defaultModel)
      return
    }

    setSelectedModel(textChatModels[0]?.model ?? '')
  }, [
    activeConversation?.id,
    activeConversation?.model,
    defaultModel,
    modelRegistry,
    textChatModels,
  ])

  useEffect(() => {
    if (!responseAudio) return
    if (!ttsModel || !modelHasCapability(modelRegistry, ttsModel, 'audio_output')) {
      setTtsModel(defaultTtsModel)
    }
  }, [responseAudio, defaultTtsModel, modelRegistry, ttsModel])

  useEffect(() => {
    if (!streamMode || !responseAudio) return
    setResponseAudio(false)
  }, [responseAudio, streamMode])

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
  }, [messages, pendingRequest, sending, streamingDraft, isAtBottom])

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
      ttsPreviewAbortRef.current?.abort()
      clearTtsPreview()
      if (streamingTimerRef.current) window.clearTimeout(streamingTimerRef.current)
    }
  }, [clearTtsPreview])

  const handleStreamModeChange = (checked: boolean) => {
    setStreamMode(checked)
    if (checked && responseAudio) {
      setResponseAudio(false)
      message.info('流式输出暂不支持语音回放，已关闭 TTS')
    }
  }

  const handleAudioInputModeChange = (mode: AudioInputMode) => {
    if (mode === 'none') {
      clearAudioInput()
      return
    }
    setAudioInputMode(mode)
  }

  const handleAudioFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('audio/')) {
      message.error('请选择音频文件')
      event.target.value = ''
      return
    }

    try {
      const dataUrl = await readFileAsDataUrl(file)
      setAudioInputMode('upload')
      setAudioInputFileData(dataUrl)
      setAudioInputFileName(file.name)
      message.success('已附加音频输入')
    } catch (error) {
      message.error((error as Error).message)
      event.target.value = ''
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
    const inputAudioData = activeAudioInputValue
    const hasInputAudio = inputAudioData.length > 0
    if (!content && !hasInputAudio) {
      message.warning('请输入消息内容或附加音频输入')
      return
    }

    const modelToUse = nextSendModel ?? undefined
    let conversationId = activeConversationId

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setSending(true)
    setPendingRequest({
      content,
      hasAudioInput: hasInputAudio,
    })
    setStreamingDraft('')
    setStreamingModel(modelToUse ?? activeConversation?.model ?? defaultModel)
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

      const sendBody: import('../types').AiConversationSendRequest = {}
      if (content) sendBody.content = content
      if (modelToUse) sendBody.model = modelToUse
      if (hasInputAudio) sendBody.inputAudioData = inputAudioData
      if (responseAudio && !streamMode) {
        sendBody.responseAudio = true
        Object.assign(sendBody, buildTtsPayload())
      }

      let reply: AiConversationReplyView
      if (streamMode) {
        let finalReply: AiConversationReplyView | null = null
        await sendAiMessageStream(
          conversationId,
          sendBody,
          {
            onMeta: (meta) => {
              setStreamingModel(meta.model)
            },
            onDelta: (chunk) => {
              setStreamingDraft((current) => current + chunk)
            },
            onAudioError: (error) => {
              message.warning(error.message || '语音生成失败，但文本回复已完成')
            },
            onDone: (doneReply) => {
              finalReply = doneReply
            },
          },
          controller.signal,
        )
        if (!finalReply) {
          throw new ApiError(-1, '流式请求已结束，但没有收到完整回复')
        }
        reply = finalReply
      } else {
        reply = await sendAiMessage(conversationId, sendBody, controller.signal)
      }

      messageLoadSeqRef.current += 1
      setConversations((current) => upsertConversation(current, reply.conversation))
      setActiveConversationId(reply.conversation.id)
      setSelectedModel(
        modelHasCapability(modelRegistry, reply.conversation.model, 'text_chat')
          ? reply.conversation.model
          : modelToUse || defaultModel || '',
      )
      setMessages((current) => [...current, reply.userMessage, reply.assistantMessage])
      clearAudioInput()
      setStreamingDraft('')
      setStreamingModel('')

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
      setPendingRequest(null)
      setSending(false)
      setElapsed(0)
      setStreamingDraft('')
      setStreamingModel('')
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
    items.map((item) => (
      <ConversationButton
        key={item.id}
        conversation={item}
        isActive={item.id === activeConversationId}
        disabled={sending}
        onSelect={setActiveConversationId}
      />
    ))

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
          <Bot size={28} />
          <h3>开始新对话</h3>
          <p>在下方输入消息，或点击左侧新建会话。</p>
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
        {!messages.length && !pendingRequest && (
          <div className="ai-chat__empty-stage">
            <MessagesSquare size={28} />
            <h3>开始对话</h3>
            <p>发送你的第一条消息吧。</p>
          </div>
        )}

        {messages.map((item) => (
          <MessageBubble
            key={item.id}
            message={item}
            isStreaming={streamingMessageId === item.id}
            isRegeneratingAudio={regeneratingAudioId === item.id}
            onAudioError={message.error}
            onCopySuccess={() => message.success('已复制到剪贴板')}
            onCopyError={() => message.error('复制失败，请检查浏览器权限')}
            onRegenerateAudio={(target) => void handleRegenerateMessageAudio(target)}
          />
        ))}

        {pendingRequest && (
          <article className="ai-chat__message ai-chat__message--user">
            <div className="ai-chat__message-avatar" aria-hidden="true">你</div>
            <div className="ai-chat__bubble">
              <div className="ai-chat__message-content">
                {pendingRequest.content ? (
                  <div className="ai-chat__message-plain">{pendingRequest.content}</div>
                ) : (
                  <div className="ai-chat__message-placeholder">发送音频中...</div>
                )}
              </div>
            </div>
          </article>
        )}

        {sending && (
          <article
            className={`ai-chat__message ai-chat__message--assistant${
              streamingDraft ? ' is-streaming' : ''
            }`}
          >
            <div className="ai-chat__message-avatar" aria-hidden="true">
              <Bot size={16} />
            </div>
            <div className="ai-chat__bubble">
              {streamingDraft ? (
                <div className="ai-chat__message-content">
                  <MessageMarkdown content={streamingDraft} />
                </div>
              ) : (
                <div className="ai-chat__typing">
                  <LoaderCircle size={16} className="ai-chat__spinner" />
                  <span>思考中... {elapsed > 0 ? `${elapsed}s` : ''}</span>
                </div>
              )}
            </div>
          </article>
        )}

        <div ref={messagesEndRef} />
      </>
    )
  })()

  const sendDisabled =
    bootstrapping ||
    creatingConversation ||
    !!composerBlockedReason ||
    (!sending && ((!draft.trim() && !hasAudioInput) || charDanger))

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
          <RouterNavLink
            to="/ai-image"
            className={({ isActive }) => `topbar-nav__link${isActive ? ' is-active' : ''}`}
          >
            AI生图
          </RouterNavLink>
          <RouterNavLink
            to="/agent"
            className={({ isActive }) => `topbar-nav__link${isActive ? ' is-active' : ''}`}
          >
            Agent
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
          {auth.token && <TopbarUserMenu />}
        </div>
      </header>

      <main className={mainClassName}>
        {!auth.token ? (
          <section className="ai-chat__guest">
            <article className="ai-chat__welcome-card">
              <div className="ai-chat__eyebrow">
                <Sparkles size={14} />
                <span>AI Chat</span>
              </div>
              <h1>智能对话助手</h1>
              <p>支持多模型切换、流式输出、语音输入与回放。</p>
            </article>

            <article className="ai-chat__login-card">
              <div className="ai-chat__icon-badge">
                <Bot size={18} />
              </div>
              <h2>登录后开始对话</h2>
              <p>使用站内账号登录即可开始。</p>
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
            {isSidebarOpen && (
              <aside className="ai-chat__sidebar">
                <div className="ai-chat__sidebar-head">
                  <div className="ai-chat__sidebar-head-left">
                    <button
                      type="button"
                      className="ai-chat__icon-button ai-chat__sidebar-toggle"
                      onClick={() => setIsSidebarOpen(false)}
                      title="关闭侧边栏"
                    >
                      <PanelLeftClose size={20} />
                    </button>
                    <button
                      type="button"
                      className="ai-chat__button ai-chat__button--primary ai-chat__new-chat"
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
                  </div>
                </div>

                <div className="ai-chat__search">
                  <Search size={14} />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="搜索对话"
                    aria-label="搜索会话"
                  />
                </div>

                <div className="ai-chat__conversation-list" aria-label="会话历史">
                  {sidebarBody}
                </div>
              </aside>
            )}

            <section className="ai-chat__stage">
              {!isSidebarOpen && (
                <button
                  type="button"
                  className="ai-chat__icon-button ai-chat__sidebar-reopen"
                  onClick={() => setIsSidebarOpen(true)}
                  title="打开侧边栏"
                >
                  <PanelLeftOpen size={18} />
                </button>
              )}

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
                  </button>
                )}
              </div>

              <div className="ai-chat__composer">
                <div className="ai-chat__composer-shell">
                  <div className="ai-chat__composer-textarea-wrap">
                    <textarea
                      ref={textareaRef}
                      className="ai-chat__textarea"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={handleDraftKeyDown}
                      placeholder="发送消息..."
                      maxLength={CHAR_LIMIT}
                      disabled={
                        bootstrapping ||
                        sending ||
                        creatingConversation ||
                        !!composerBlockedReason
                      }
                      rows={1}
                    />
                  </div>

                  <div className="ai-chat__composer-bottom">
                    <div className="ai-chat__composer-actions-left">
                      <button
                        type="button"
                        className={`ai-chat__icon-button ${showAdvancedSettings ? 'is-active' : ''}`}
                        onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                        title="设置"
                      >
                        <Settings size={16} />
                      </button>
                    </div>
                    <div className="ai-chat__composer-actions-right">
                      {charCount > CHAR_WARN && (
                        <span
                          className={
                            'ai-chat__char-counter' +
                            (charDanger ? ' ai-chat__char-counter--danger' : ' ai-chat__char-counter--warn')
                          }
                        >
                          {charCount}/{CHAR_LIMIT}
                        </span>
                      )}
                      <button
                        type="button"
                        className={
                          'ai-chat__send-button ' +
                          (sending ? 'ai-chat__send-button--danger' : 'ai-chat__send-button--primary')
                        }
                        onClick={handlePrimaryClick}
                        disabled={sendDisabled}
                      >
                        {sending ? <StopCircle size={18} /> : <SendHorizontal size={18} />}
                      </button>
                    </div>
                  </div>

                  {showAdvancedSettings && (
                    <div className="ai-chat__advanced-settings">
                      <div className="ai-chat__settings-grid">
                        <label className="ai-chat__setting-item">
                          <span>模型</span>
                          <select
                            aria-label="主对话模型"
                            className="ai-chat__model-select"
                            value={selectedModel}
                            onChange={(event) => setSelectedModel(event.target.value)}
                            disabled={
                              bootstrapping || sending || creatingConversation || noModelsConfigured
                            }
                          >
                            {!selectedModel && <option value="">默认</option>}
                            {textChatModels.map((item) => (
                              <option key={item.model} value={item.model}>
                                {item.model}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="ai-chat__setting-item">
                          <input
                            type="checkbox"
                            checked={streamMode}
                            onChange={(event) => handleStreamModeChange(event.target.checked)}
                          />
                          <span>流式输出</span>
                        </label>
                        <label className="ai-chat__setting-item">
                          <input
                            type="checkbox"
                            checked={responseAudio}
                            onChange={(event) => setResponseAudio(event.target.checked)}
                            disabled={audioOutputModels.length === 0 || streamMode}
                          />
                          <span>语音回放</span>
                        </label>
                      </div>

                      {(responseAudio || hasAudioInput) && (
                        <div className="ai-chat__settings-expanded">
                          {responseAudio && (
                            <div className="ai-chat__settings-section">
                              <h4>TTS 设置</h4>
                              <div className="ai-chat__settings-row">
                                <select
                                  value={ttsModel}
                                  onChange={(event) => setTtsModel(event.target.value)}
                                >
                                  <option value="">默认语音模型</option>
                                  {audioOutputModels.map((item) => (
                                    <option key={item.model} value={item.model}>
                                      {item.model}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="text"
                                  value={ttsVoice}
                                  onChange={(event) => setTtsVoice(event.target.value)}
                                  placeholder="音色"
                                  list="ai-chat-voice-list"
                                />
                              </div>
                            </div>
                          )}

                          <div className="ai-chat__settings-section">
                            <h4>语音输入</h4>
                            <div className="ai-chat__audio-mode-row">
                              {(['none', 'upload', 'url'] as AudioInputMode[]).map((mode) => (
                                <button
                                  key={mode}
                                  type="button"
                                  className={`ai-chat__mode-chip ${audioInputMode === mode ? 'is-active' : ''}`}
                                  onClick={() => handleAudioInputModeChange(mode)}
                                >
                                  {mode === 'none' ? '不附加' : mode === 'upload' ? '上传' : 'URL'}
                                </button>
                              ))}
                            </div>
                            {audioInputMode === 'upload' && (
                              <div className="ai-chat__audio-upload">
                                <input
                                  ref={audioInputRef}
                                  type="file"
                                  accept="audio/*"
                                  className="ai-chat__sr-only"
                                  onChange={handleAudioFileChange}
                                />
                                <button
                                  type="button"
                                  className="ai-chat__button ai-chat__button--secondary"
                                  onClick={() => audioInputRef.current?.click()}
                                >
                                  <Upload size={14} />
                                  <span>{audioInputFileName || '选择文件'}</span>
                                </button>
                              </div>
                            )}
                            {audioInputMode === 'url' && (
                              <input
                                type="url"
                                className="ai-chat__input"
                                value={audioInputUrl}
                                onChange={(event) => setAudioInputUrl(event.target.value)}
                                placeholder="音频 URL"
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </section>
        )}
      </main>
    </div>
  )
}
