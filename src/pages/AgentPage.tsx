import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { App as AntApp } from 'antd'
import {
  ArrowDown,
  Bot,
  LoaderCircle,
  LogIn,
  Plus,
  SendHorizontal,
  Settings,
  Sparkles,
  StopCircle,
  Trash2,
} from 'lucide-react'
import { Link as RouterLink, NavLink as RouterNavLink } from 'react-router-dom'
import {
  createAgentSession,
  deleteAgentSession,
  getAgentQuota,
  interruptAgentSession,
  listAgentMessages,
  listAgentSessions,
  listAgentTeams,
  runAgentSessionStream,
} from '../api/agent'
import { ApiError } from '../api/client'
import MessageMarkdown from '../components/MessageMarkdown'
import TopbarUserMenu from '../components/TopbarUserMenu'
import ThemeToggle from '../components/ThemeToggle'
import { useAuth } from '../context/AuthContext'
import type {
  AgentMessageType,
  AgentMessageView,
  AgentQuotaView,
  AgentSessionView,
  AgentStreamEvent,
  AgentTeamView,
} from '../types'
import '../styles/topbar.css'
import '../styles/ai-chat.css'
import '../styles/agent.css'

const SESSION_PAGE_SIZE = 100
const MESSAGE_PAGE_SIZE = 200
const TEXTAREA_MIN = 56
const TEXTAREA_MAX = 220
const STICK_THRESHOLD = 80

interface AgentDisplayItem {
  key: string
  messageType: AgentMessageType
  content: string
  payload: Record<string, unknown> | null
  createdAt?: string
  costUsd?: number | null
  model?: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function parsePayload(value: string) {
  try {
    const parsed = JSON.parse(value)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function getString(payload: Record<string, unknown> | null, key: string) {
  if (!payload) return null
  const value = payload[key]
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return null
}

function getNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function stringifyValue(value: unknown) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function parseDate(value?: string | null) {
  if (!value) return null
  const parsed = new Date(value.replace(' ', 'T'))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatShortTime(value?: string | null) {
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

function formatDateTime(value?: string | null) {
  const date = parseDate(value)
  if (!date) return '--'
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hh}:${mm}`
}

function formatMoney(value?: number | null) {
  const amount = getNumber(value) ?? 0
  return `$${amount.toFixed(amount >= 1 ? 2 : 3)}`
}

function formatSessionTitle(session: AgentSessionView) {
  const title = session.title?.trim()
  return title || `${session.teamCode} #${session.id}`
}

function formatStatus(status: AgentSessionView['status']) {
  switch (status) {
    case 'running':
      return '运行中'
    case 'done':
      return '已完成'
    case 'failed':
      return '失败'
    default:
      return '待命'
  }
}

function getProgressPercent(used?: number | null, limit?: number | null) {
  const limitValue = getNumber(limit) ?? 0
  if (limitValue <= 0) return 0
  const usedValue = Math.max(0, getNumber(used) ?? 0)
  return Math.min(100, (usedValue / limitValue) * 100)
}

function buildSystemContent(payload: Record<string, unknown> | null, fallback: string) {
  const sessionId = getString(payload, 'session_id')
  if (sessionId) return `已绑定 Claude 会话 ${sessionId}`
  const subtype = getString(payload, 'subtype')
  const data = payload?.data
  if (subtype && data != null) return `${subtype}\n${stringifyValue(data)}`
  if (subtype) return subtype
  return fallback
}

function resolveContent(
  messageType: AgentMessageType,
  payload: Record<string, unknown> | null,
  fallback: string,
) {
  switch (messageType) {
    case 'assistant':
      return getString(payload, 'text') ?? fallback
    case 'tool_use':
      return stringifyValue(payload?.input)
    case 'tool_result':
      return getString(payload, 'content') ?? stringifyValue(payload?.content)
    case 'system':
      return buildSystemContent(payload, fallback)
    case 'result': {
      const resultValue = payload?.result
      const resultText = stringifyValue(resultValue)
      return resultText || '本次运行已完成'
    }
    case 'error':
      return getString(payload, 'message') ?? fallback
    default:
      return fallback
  }
}

function pushDisplayItem(list: AgentDisplayItem[], next: AgentDisplayItem) {
  if (next.messageType === 'assistant') {
    const last = list[list.length - 1]
    if (last?.messageType === 'assistant') {
      last.content += next.content
      last.createdAt = next.createdAt
      if (!last.model && next.model) last.model = next.model
      return
    }
  }
  list.push(next)
}

function buildPersistedDisplayItems(messages: AgentMessageView[]) {
  const items: AgentDisplayItem[] = []
  for (const item of messages) {
    const payload = item.messageType === 'user' ? null : parsePayload(item.content)
    const displayItem: AgentDisplayItem = {
      key: `message-${item.id}`,
      messageType: item.messageType,
      content:
        item.messageType === 'user'
          ? item.content
          : resolveContent(item.messageType, payload, item.content),
      payload,
      createdAt: item.createdAt,
      costUsd: item.costUsd ?? null,
      model: item.messageType === 'assistant' ? getString(payload, 'model') : null,
    }
    pushDisplayItem(items, displayItem)
  }
  return items
}

function buildLiveDisplayItems(
  pendingPrompt: string | null,
  liveEvents: AgentStreamEvent[],
) {
  const items: AgentDisplayItem[] = []
  if (pendingPrompt) {
    items.push({
      key: 'live-prompt',
      messageType: 'user',
      content: pendingPrompt,
      payload: null,
    })
  }

  liveEvents.forEach((event, index) => {
    const messageType = event.event === 'claude_session' ? 'system' : event.event
    const displayItem: AgentDisplayItem = {
      key: `live-${index}`,
      messageType,
      content: resolveContent(messageType, event.data, ''),
      payload: event.data,
      model: messageType === 'assistant' ? getString(event.data, 'model') : null,
    }
    pushDisplayItem(items, displayItem)
  })

  return items
}

function SkeletonBubble({
  side,
  width,
}: {
  side: 'user' | 'assistant'
  width: string
}) {
  return (
    <article className={`agent-page__bubble agent-page__bubble--${side} is-skeleton`}>
      <div className="agent-page__avatar" aria-hidden="true" />
      <div className="agent-page__bubble-card" style={{ width }}>
        <div className="agent-page__skeleton-line" style={{ width: '52%' }} />
        <div className="agent-page__skeleton-line" style={{ width: '88%' }} />
        <div className="agent-page__skeleton-line" style={{ width: '66%' }} />
      </div>
    </article>
  )
}

function SessionSkeleton() {
  return (
    <div className="agent-page__session is-skeleton" aria-hidden="true">
      <div className="agent-page__skeleton-line" style={{ width: '58%' }} />
      <div className="agent-page__skeleton-line" style={{ width: '86%' }} />
      <div className="agent-page__skeleton-line" style={{ width: '32%' }} />
    </div>
  )
}

function AgentTimelineItem({ item }: { item: AgentDisplayItem }) {
  if (item.messageType === 'user' || item.messageType === 'assistant') {
    const isAssistant = item.messageType === 'assistant'
    return (
      <article className={`agent-page__bubble agent-page__bubble--${item.messageType}`}>
        <div className="agent-page__avatar" aria-hidden="true">
          {isAssistant ? <Bot size={16} /> : '你'}
        </div>
        <div className="agent-page__bubble-card">
          <div className="agent-page__bubble-meta">
            <span>{isAssistant ? item.model || 'Agent' : '你'}</span>
            {item.createdAt && <time dateTime={item.createdAt}>{formatShortTime(item.createdAt)}</time>}
          </div>
          <div className="agent-page__bubble-content">
            {isAssistant ? (
              <MessageMarkdown content={item.content} />
            ) : (
              <div className="agent-page__plain">{item.content}</div>
            )}
          </div>
        </div>
      </article>
    )
  }

  if (item.messageType === 'tool_use') {
    return (
      <article className="agent-page__event-card">
        <div className="agent-page__event-head">
          <strong>工具调用</strong>
          <span>{getString(item.payload, 'tool') || '未知工具'}</span>
        </div>
        {item.content && <pre className="agent-page__code">{item.content}</pre>}
      </article>
    )
  }

  if (item.messageType === 'tool_result') {
    return (
      <article className="agent-page__event-card">
        <div className="agent-page__event-head">
          <strong>工具结果</strong>
          <span>{item.payload?.is_error ? '失败' : '完成'}</span>
        </div>
        {item.content && <pre className="agent-page__code">{item.content}</pre>}
      </article>
    )
  }

  if (item.messageType === 'result') {
    const turns = getNumber(item.payload?.num_turns)
    const totalCost = getNumber(item.payload?.total_cost_usd) ?? item.costUsd ?? 0
    const durationMs = getNumber(item.payload?.duration_ms)
    return (
      <article className="agent-page__event-card agent-page__event-card--result">
        <div className="agent-page__event-head">
          <strong>运行完成</strong>
          <span>{formatMoney(totalCost)}</span>
        </div>
        <div className="agent-page__result-metrics">
          <span>轮次 {turns ?? '--'}</span>
          <span>耗时 {durationMs != null ? `${Math.round(durationMs / 1000)}s` : '--'}</span>
        </div>
        {item.content && <div className="agent-page__result-text">{item.content}</div>}
      </article>
    )
  }

  if (item.messageType === 'error') {
    return (
      <article className="agent-page__event-card agent-page__event-card--error">
        <div className="agent-page__event-head">
          <strong>运行失败</strong>
          {item.createdAt && <span>{formatShortTime(item.createdAt)}</span>}
        </div>
        <div className="agent-page__result-text">{item.content || '未知错误'}</div>
      </article>
    )
  }

  return (
    <article className="agent-page__system-note">
      <span>{item.content || '系统事件'}</span>
      {item.createdAt && <time dateTime={item.createdAt}>{formatShortTime(item.createdAt)}</time>}
    </article>
  )
}

function QuotaCard({ quota }: { quota: AgentQuotaView | null }) {
  const dailyUsed = getNumber(quota?.dailyCostUsd) ?? 0
  const dailyLimit = getNumber(quota?.dailyLimitUsd) ?? 0
  const monthlyUsed = getNumber(quota?.monthlyCostUsd) ?? 0
  const monthlyLimit = getNumber(quota?.monthlyLimitUsd) ?? 0

  return (
    <section className="agent-page__quota-card">
      <div className="agent-page__quota-head">
        <strong>额度概览</strong>
        <span>按后端配额实时展示</span>
      </div>
      <div className="agent-page__quota-item">
        <div className="agent-page__quota-row">
          <span>当日</span>
          <b>
            {formatMoney(dailyUsed)} / {formatMoney(dailyLimit)}
          </b>
        </div>
        <div className="agent-page__quota-bar">
          <span style={{ width: `${getProgressPercent(dailyUsed, dailyLimit)}%` }} />
        </div>
        <small>重置时间 {formatDateTime(quota?.resetDailyAt)}</small>
      </div>
      <div className="agent-page__quota-item">
        <div className="agent-page__quota-row">
          <span>当月</span>
          <b>
            {formatMoney(monthlyUsed)} / {formatMoney(monthlyLimit)}
          </b>
        </div>
        <div className="agent-page__quota-bar">
          <span style={{ width: `${getProgressPercent(monthlyUsed, monthlyLimit)}%` }} />
        </div>
        <small>重置时间 {formatDateTime(quota?.resetMonthlyAt)}</small>
      </div>
    </section>
  )
}

export default function AgentPage() {
  const auth = useAuth()
  const { message } = AntApp.useApp()
  const [teams, setTeams] = useState<AgentTeamView[]>([])
  const [sessions, setSessions] = useState<AgentSessionView[]>([])
  const [messages, setMessages] = useState<AgentMessageView[]>([])
  const [quota, setQuota] = useState<AgentQuotaView | null>(null)
  const [selectedTeamCode, setSelectedTeamCode] = useState('')
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [bootstrapping, setBootstrapping] = useState(false)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [creatingSession, setCreatingSession] = useState(false)
  const [running, setRunning] = useState(false)
  const [interrupting, setInterrupting] = useState(false)
  const [deletingSessionId, setDeletingSessionId] = useState<number | null>(null)
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null)
  const [liveEvents, setLiveEvents] = useState<AgentStreamEvent[]>([])
  const [activeRunSessionId, setActiveRunSessionId] = useState<number | null>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)

  const abortRef = useRef<AbortController | null>(null)
  const loadSeqRef = useRef(0)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const activeSession = useMemo(
    () => sessions.find((item) => item.id === activeSessionId) ?? null,
    [activeSessionId, sessions],
  )
  const activeTeam = useMemo(
    () => teams.find((item) => item.code === selectedTeamCode) ?? null,
    [selectedTeamCode, teams],
  )
  const filteredSessions = useMemo(() => {
    if (!selectedTeamCode) return sessions
    return sessions.filter((item) => item.teamCode === selectedTeamCode)
  }, [selectedTeamCode, sessions])
  const persistedItems = useMemo(() => buildPersistedDisplayItems(messages), [messages])
  const liveItems = useMemo(
    () => buildLiveDisplayItems(pendingPrompt, liveEvents),
    [liveEvents, pendingPrompt],
  )
  const timelineItems = useMemo(
    () => [...persistedItems, ...liveItems],
    [liveItems, persistedItems],
  )
  const sendDisabled =
    !auth.token ||
    bootstrapping ||
    creatingSession ||
    running ||
    !teams.length ||
    !draft.trim()

  const loadSessionMessages = useCallback(
    async (sessionId: number | null) => {
      loadSeqRef.current += 1
      const loadId = loadSeqRef.current
      if (!sessionId) {
        setMessages([])
        setMessagesLoading(false)
        return
      }

      setMessagesLoading(true)
      try {
        const data = await listAgentMessages(sessionId, 0, MESSAGE_PAGE_SIZE)
        if (loadId !== loadSeqRef.current) return
        setMessages(data.items)
      } catch (error) {
        if (loadId !== loadSeqRef.current) return
        setMessages([])
        message.error((error as Error).message)
      } finally {
        if (loadId === loadSeqRef.current) setMessagesLoading(false)
      }
    },
    [message],
  )

  const reloadWorkspace = useCallback(
    async (preferredSessionId: number | null, fallbackTeamCode?: string | null) => {
      const sessionData = await listAgentSessions(0, SESSION_PAGE_SIZE)
      const quotaData = await getAgentQuota()
      setSessions(sessionData.items)
      setQuota(quotaData)

      const preserved =
        preferredSessionId != null
          ? sessionData.items.find((item) => item.id === preferredSessionId) ?? null
          : null

      if (preserved) {
        setSelectedTeamCode(preserved.teamCode)
        setActiveSessionId(preserved.id)
        const messageData = await listAgentMessages(preserved.id, 0, MESSAGE_PAGE_SIZE)
        setMessages(messageData.items)
        return preserved
      }

      const targetTeamCode = fallbackTeamCode || selectedTeamCode || teams[0]?.code || ''
      const fallbackSession =
        sessionData.items.find((item) => item.teamCode === targetTeamCode) ??
        sessionData.items[0] ??
        null

      setSelectedTeamCode(fallbackSession?.teamCode ?? targetTeamCode)
      setActiveSessionId(fallbackSession?.id ?? null)

      if (fallbackSession) {
        const messageData = await listAgentMessages(fallbackSession.id, 0, MESSAGE_PAGE_SIZE)
        setMessages(messageData.items)
      } else {
        setMessages([])
      }

      return fallbackSession
    },
    [selectedTeamCode, teams],
  )

  useEffect(() => {
    if (!textareaRef.current) return
    textareaRef.current.style.height = '0px'
    const nextHeight = Math.max(
      TEXTAREA_MIN,
      Math.min(TEXTAREA_MAX, textareaRef.current.scrollHeight),
    )
    textareaRef.current.style.height = `${nextHeight}px`
  }, [draft])

  useEffect(() => {
    if (!auth.token) {
      abortRef.current?.abort()
      setTeams([])
      setSessions([])
      setMessages([])
      setQuota(null)
      setSelectedTeamCode('')
      setActiveSessionId(null)
      setDraft('')
      setPendingPrompt(null)
      setLiveEvents([])
      setRunning(false)
      return
    }

    let cancelled = false
    setBootstrapping(true)

    Promise.all([
      listAgentTeams(),
      listAgentSessions(0, SESSION_PAGE_SIZE),
      getAgentQuota(),
    ])
      .then(([teamData, sessionData, quotaData]) => {
        if (cancelled) return
        setTeams(teamData)
        setSessions(sessionData.items)
        setQuota(quotaData)

        const initialSession = sessionData.items[0] ?? null
        if (initialSession) {
          setSelectedTeamCode(initialSession.teamCode)
          setActiveSessionId(initialSession.id)
        } else {
          setSelectedTeamCode(teamData[0]?.code ?? '')
          setActiveSessionId(null)
          setMessages([])
        }
      })
      .catch((error) => {
        if (!cancelled) message.error((error as Error).message)
      })
      .finally(() => {
        if (!cancelled) setBootstrapping(false)
      })

    return () => {
      cancelled = true
    }
  }, [auth.token, message])

  useEffect(() => {
    if (!auth.token) return
    void loadSessionMessages(activeSessionId)
  }, [activeSessionId, auth.token, loadSessionMessages])

  useEffect(() => {
    if (!teams.length) {
      if (selectedTeamCode) setSelectedTeamCode('')
      return
    }
    if (!selectedTeamCode || !teams.some((team) => team.code === selectedTeamCode)) {
      setSelectedTeamCode(teams[0].code)
    }
  }, [selectedTeamCode, teams])

  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return
    const onScroll = () => {
      const offset =
        container.scrollHeight - container.scrollTop - container.clientHeight
      setIsAtBottom(offset < STICK_THRESHOLD)
    }
    onScroll()
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (isAtBottom || running) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [isAtBottom, running, timelineItems])

  const handleSelectTeam = (teamCode: string) => {
    if (running) return
    setSelectedTeamCode(teamCode)
    const nextActive =
      (activeSession?.teamCode === teamCode ? activeSession : null) ??
      sessions.find((item) => item.teamCode === teamCode) ??
      null
    setActiveSessionId(nextActive?.id ?? null)
    if (!nextActive) setMessages([])
  }

  const handleCreateSession = useCallback(
    async (teamCode: string, title?: string) => {
      setCreatingSession(true)
      try {
        const created = await createAgentSession({ teamCode, title })
        setSessions((current) => [created, ...current.filter((item) => item.id !== created.id)])
        setSelectedTeamCode(created.teamCode)
        setActiveSessionId(created.id)
        setMessages([])
        return created
      } catch (error) {
        message.error((error as Error).message)
        return null
      } finally {
        setCreatingSession(false)
      }
    },
    [message],
  )

  const handleDeleteSession = async () => {
    if (!activeSession || running) return
    if (!window.confirm(`确认删除会话「${formatSessionTitle(activeSession)}」吗？`)) return

    setDeletingSessionId(activeSession.id)
    try {
      await deleteAgentSession(activeSession.id)
      const remaining = sessions.filter((item) => item.id !== activeSession.id)
      setSessions(remaining)
      const nextSession =
        remaining.find((item) => item.teamCode === selectedTeamCode) ??
        remaining[0] ??
        null
      setActiveSessionId(nextSession?.id ?? null)
      setSelectedTeamCode(nextSession?.teamCode ?? selectedTeamCode)
      if (!nextSession) setMessages([])
      message.success('会话已删除')
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setDeletingSessionId(null)
    }
  }

  const handleInterrupt = async () => {
    const sessionId = activeRunSessionId ?? activeSessionId
    if (!sessionId || !running || interrupting) return

    setInterrupting(true)
    abortRef.current?.abort()
    try {
      await interruptAgentSession(sessionId)
      message.info('已发送中断请求')
    } catch (error) {
      const apiError = error as ApiError
      if (apiError.code !== -2) {
        message.error(apiError.message)
      }
    } finally {
      setInterrupting(false)
    }
  }

  const handleRun = async () => {
    const prompt = draft.trim()
    const teamCode = selectedTeamCode || teams[0]?.code
    if (!prompt || !teamCode || running) return

    let session = activeSession
    if (!session || session.teamCode !== teamCode) {
      session = await handleCreateSession(teamCode, prompt.slice(0, 32))
    }
    if (!session) return

    setDraft('')
    setPendingPrompt(prompt)
    setLiveEvents([])
    setRunning(true)
    setActiveRunSessionId(session.id)
    const controller = new AbortController()
    abortRef.current = controller

    try {
      await runAgentSessionStream(
        session.id,
        { prompt },
        {
          onEvent: (event) => {
            setLiveEvents((current) => [...current, event])
          },
        },
        controller.signal,
      )
    } catch (error) {
      const apiError = error as ApiError
      if (apiError.code === -2) {
        await new Promise((resolve) => window.setTimeout(resolve, 180))
      } else {
        message.error(apiError.message || 'Agent 运行失败')
      }
    } finally {
      try {
        await reloadWorkspace(session.id, session.teamCode)
      } catch (error) {
        message.error((error as Error).message)
      }
      setPendingPrompt(null)
      setLiveEvents([])
      setRunning(false)
      setInterrupting(false)
      setActiveRunSessionId(null)
      abortRef.current = null
    }
  }

  const handleDraftKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    if (!sendDisabled) {
      void handleRun()
    }
  }

  const handleJumpToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }

  const sidebarBody = (() => {
    if (bootstrapping) {
      return (
        <>
          <SessionSkeleton />
          <SessionSkeleton />
          <SessionSkeleton />
        </>
      )
    }

    if (!filteredSessions.length) {
      return (
        <div className="agent-page__empty agent-page__empty--soft">
          <p>这个团队还没有会话。</p>
          <small>发送第一条消息时会自动创建新会话。</small>
        </div>
      )
    }

    return filteredSessions.map((session) => (
      <button
        key={session.id}
        type="button"
        className={`agent-page__session${activeSessionId === session.id ? ' is-active' : ''}`}
        onClick={() => {
          if (running) return
          setSelectedTeamCode(session.teamCode)
          setActiveSessionId(session.id)
        }}
        disabled={running}
      >
        <div className="agent-page__session-top">
          <strong>{formatSessionTitle(session)}</strong>
          <span>{formatShortTime(session.lastRunAt || session.updatedAt)}</span>
        </div>
        <div className="agent-page__session-meta">
          <span>{formatStatus(session.status)}</span>
          <span>{session.turnCount} 轮</span>
          <span>{formatMoney(session.costUsd)}</span>
        </div>
        {session.lastError && <div className="agent-page__session-error">{session.lastError}</div>}
      </button>
    ))
  })()

  const messageArea = (() => {
    if (bootstrapping || auth.profileLoading) {
      return (
        <div className="agent-page__skeleton-stack">
          <SkeletonBubble side="user" width="60%" />
          <SkeletonBubble side="assistant" width="78%" />
          <SkeletonBubble side="assistant" width="55%" />
        </div>
      )
    }

    if (messagesLoading && !timelineItems.length) {
      return (
        <div className="agent-page__skeleton-stack">
          <SkeletonBubble side="user" width="52%" />
          <SkeletonBubble side="assistant" width="72%" />
        </div>
      )
    }

    if (!timelineItems.length) {
      return (
        <div className="agent-page__empty">
          <Bot size={28} />
          <h3>{activeTeam ? `${activeTeam.name} 已就绪` : '选择一个团队开始'}</h3>
          <p>输入任务后会自动创建会话，并通过后端 SSE 流式返回 Agent 执行过程。</p>
        </div>
      )
    }

    return (
      <>
        {timelineItems.map((item) => (
          <AgentTimelineItem key={item.key} item={item} />
        ))}
        <div ref={messagesEndRef} />
      </>
    )
  })()

  return (
    <div className="agent-page">
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
            <RouterLink to="/login" className="topbar-action" state={{ from: '/agent' }}>
              <LogIn size={16} />
              <span>登录</span>
            </RouterLink>
          )}
          <ThemeToggle />
          {auth.token && <TopbarUserMenu />}
        </div>
      </header>

      <main className="agent-page__main">
        {!auth.token ? (
          <section className="agent-page__guest">
            <article className="agent-page__hero-card">
              <div className="agent-page__eyebrow">
                <Sparkles size={14} />
                <span>Workspace Agent</span>
              </div>
              <h1>把后端多团队 Agent 工作台接到前端</h1>
              <p>
                支持团队切换、会话历史、执行过程流式展示、工具调用结果回看，以及每日和每月额度感知。
              </p>
              <div className="agent-page__hero-points">
                <span>POST SSE 事件流</span>
                <span>会话隔离工作目录</span>
                <span>后端配额同步</span>
              </div>
            </article>

            <article className="agent-page__login-card">
              <div className="agent-page__icon-badge">
                <Bot size={18} />
              </div>
              <h2>登录后开始调用 Agent</h2>
              <p>该页面依赖 `/api/user/agent/*` 鉴权接口，登录后即可直接创建会话并运行。</p>
              <div className="agent-page__guest-actions">
                <RouterLink
                  to="/login"
                  state={{ from: '/agent' }}
                  className="agent-page__button agent-page__button--primary"
                >
                  <LogIn size={16} />
                  <span>去登录</span>
                </RouterLink>
                <RouterLink
                  to="/register"
                  className="agent-page__button agent-page__button--secondary"
                >
                  注册账号
                </RouterLink>
              </div>
            </article>
          </section>
        ) : (
          <section className="agent-page__shell">
            <aside className="agent-page__sidebar">
              <section className="agent-page__panel">
                <div className="agent-page__panel-head">
                  <div>
                    <strong>团队</strong>
                    <small>选择要运行的 Agent Team</small>
                  </div>
                </div>
                <div className="agent-page__team-list">
                  {teams.map((team) => (
                    <button
                      key={team.code}
                      type="button"
                      className={`agent-page__team-chip${
                        selectedTeamCode === team.code ? ' is-active' : ''
                      }`}
                      onClick={() => handleSelectTeam(team.code)}
                      disabled={running}
                    >
                      <span>{team.name}</span>
                      <small>{team.code}</small>
                    </button>
                  ))}
                  {!teams.length && !bootstrapping && (
                    <div className="agent-page__empty agent-page__empty--soft">
                      <p>后端暂时没有启用团队。</p>
                    </div>
                  )}
                </div>
                {activeTeam?.description && (
                  <p className="agent-page__team-description">{activeTeam.description}</p>
                )}
              </section>

              <section className="agent-page__panel">
                <div className="agent-page__panel-head">
                  <div>
                    <strong>会话</strong>
                    <small>{filteredSessions.length} 条历史</small>
                  </div>
                  <button
                    type="button"
                    className="agent-page__ghost-button"
                    onClick={() => {
                      const code = selectedTeamCode || teams[0]?.code
                      if (code) void handleCreateSession(code)
                    }}
                    disabled={!teams.length || creatingSession || running}
                  >
                    {creatingSession ? (
                      <LoaderCircle size={14} className="agent-page__spinner" />
                    ) : (
                      <Plus size={14} />
                    )}
                    <span>新建</span>
                  </button>
                </div>
                <div className="agent-page__session-list">{sidebarBody}</div>
              </section>

              <QuotaCard quota={quota} />
            </aside>

            <section className="agent-page__stage">
              <div className="agent-page__stage-head">
                <div className="agent-page__stage-summary">
                  <div className="agent-page__eyebrow">
                    <Sparkles size={14} />
                    <span>{activeTeam?.name || 'Agent Team'}</span>
                  </div>
                  <h2>{activeSession ? formatSessionTitle(activeSession) : '准备开始新任务'}</h2>
                  <div className="agent-page__stage-meta">
                    <span>{activeSession ? formatStatus(activeSession.status) : '未创建会话'}</span>
                    {activeSession && <span>{activeSession.turnCount} 轮对话</span>}
                    {activeSession && <span>花费 {formatMoney(activeSession.costUsd)}</span>}
                    {activeSession?.lastRunAt && (
                      <span>上次运行 {formatDateTime(activeSession.lastRunAt)}</span>
                    )}
                  </div>
                  {activeSession?.lastError && (
                    <div className="agent-page__stage-alert">{activeSession.lastError}</div>
                  )}
                </div>

                <div className="agent-page__stage-actions">
                  <button
                    type="button"
                    className="agent-page__toolbar-btn"
                    onClick={() => {
                      const code = selectedTeamCode || teams[0]?.code
                      if (code) void handleCreateSession(code)
                    }}
                    disabled={!teams.length || creatingSession || running}
                  >
                    <Plus size={16} />
                    <span>新会话</span>
                  </button>
                  <button
                    type="button"
                    className="agent-page__toolbar-btn agent-page__toolbar-btn--danger"
                    onClick={() => void handleDeleteSession()}
                    disabled={!activeSession || deletingSessionId === activeSession.id || running}
                  >
                    {deletingSessionId === activeSession?.id ? (
                      <LoaderCircle size={16} className="agent-page__spinner" />
                    ) : (
                      <Trash2 size={16} />
                    )}
                    <span>删除</span>
                  </button>
                </div>
              </div>

              <div className="agent-page__messages-wrap">
                <div ref={messagesContainerRef} className="agent-page__messages">
                  {messageArea}
                </div>
                {!isAtBottom && timelineItems.length > 0 && (
                  <button
                    type="button"
                    className="agent-page__jump-bottom"
                    onClick={handleJumpToBottom}
                    aria-label="跳到底部"
                  >
                    <ArrowDown size={14} />
                  </button>
                )}
              </div>

              <div className="agent-page__composer">
                <div className="agent-page__composer-shell">
                  <textarea
                    ref={textareaRef}
                    className="agent-page__textarea"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={handleDraftKeyDown}
                    placeholder={
                      activeTeam
                        ? `给 ${activeTeam.name} 一个明确任务，例如：梳理当前前端路由并给出重构建议`
                        : '先选择团队，再输入任务'
                    }
                    disabled={!teams.length || bootstrapping || creatingSession || running}
                    rows={1}
                  />
                  <div className="agent-page__composer-bottom">
                    <div className="agent-page__composer-hint">
                      <span>Enter 发送，Shift + Enter 换行</span>
                    </div>
                    <div className="agent-page__composer-actions">
                      {running ? (
                        <button
                          type="button"
                          className="agent-page__send-button agent-page__send-button--stop"
                          onClick={() => void handleInterrupt()}
                          disabled={interrupting}
                        >
                          {interrupting ? (
                            <LoaderCircle size={18} className="agent-page__spinner" />
                          ) : (
                            <StopCircle size={18} />
                          )}
                          <span>{interrupting ? '中断中' : '停止'}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="agent-page__send-button agent-page__send-button--run"
                          onClick={() => void handleRun()}
                          disabled={sendDisabled}
                        >
                          <SendHorizontal size={18} />
                          <span>运行</span>
                        </button>
                      )}
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
