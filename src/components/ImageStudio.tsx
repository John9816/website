import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { App as AntApp } from 'antd'
import {
  Copy,
  Download,
  LoaderCircle,
  RefreshCw,
  SendHorizontal,
  Share2,
  Sparkles,
  StopCircle,
  Trash2,
} from 'lucide-react'
import {
  adminDeleteImageHistory,
  adminGenerateImage,
  adminGetImageTask,
  adminListImageHistory,
  adminToggleImageHistoryShare,
} from '../api/admin'
import ImagePreviewOverlay from '../components/ImagePreviewOverlay'
import { DEFAULT_PAGE_SIZE } from '../constants/pagination'
import type {
  GeneratedImageView,
  ImageGenerateDataItem,
  ImageGenerateResult,
  ImageTaskStatus,
  ImageTaskView,
} from '../types'
import '../styles/admin-image.css'

const MAX_PROMPT = 2000
const TASK_POLL_INTERVAL_MS = 2000
const SIZE_OPTIONS = [
  { value: '', label: '上游默认' },
  { value: '1024x1024', label: '1024 x 1024' },
  { value: '1792x1024', label: '1792 x 1024' },
  { value: '1024x1792', label: '1024 x 1792' },
]
const CUSTOM_SIZE_VALUE = '__custom__'

interface ImageStudioProps {
  layout?: 'admin' | 'standalone'
}

export default function ImageStudio({ layout = 'admin' }: ImageStudioProps) {
  const { message } = AntApp.useApp()
  const [prompt, setPrompt] = useState('')
  const [selectedSize, setSelectedSize] = useState('')
  const [customSize, setCustomSize] = useState('')
  const [imageCount, setImageCount] = useState(1)
  const [loading, setLoading] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<ImageGenerateResult | null>(null)
  const [task, setTask] = useState<ImageTaskView | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const pollAbortRef = useRef<AbortController | null>(null)
  const pollTimerRef = useRef<number | null>(null)
  const activeRef = useRef(true)

  const [items, setItems] = useState<GeneratedImageView[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [shareUpdatingId, setShareUpdatingId] = useState<number | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const sizeValue = selectedSize === CUSTOM_SIZE_VALUE ? customSize.trim() : selectedSize
  const normalizedSize = sizeValue.trim()
  const resultItems = (result?.data ?? []).filter((item) => resolveImageSrc(item))
  const usageNumbers = result?.usage ?? null

  const loadHistory = async (nextPage = page) => {
    setHistoryLoading(true)
    try {
      const data = await adminListImageHistory(nextPage - 1, DEFAULT_PAGE_SIZE)
      if (!activeRef.current) return
      setItems(data.items)
      setTotal(data.total)
      setPage(nextPage)
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      if (activeRef.current) {
        setHistoryLoading(false)
      }
    }
  }

  useEffect(() => {
    void loadHistory(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!loading) return
    setElapsed(0)
    const started = Date.now()
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000))
    }, 500)
    return () => window.clearInterval(id)
  }, [loading])

  useEffect(() => {
    activeRef.current = true
    return () => {
      activeRef.current = false
      abortRef.current?.abort()
      clearTaskPolling()
    }
  }, [])

  const clearTaskPolling = () => {
    pollAbortRef.current?.abort()
    pollAbortRef.current = null
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }

  const finishTask = (nextTask: ImageTaskView) => {
    if (!activeRef.current) return

    clearTaskPolling()
    setTask(nextTask)

    if (nextTask.status === 'COMPLETED') {
      const nextResult = nextTask.result ?? null
      setResult(nextResult)
      setLoading(false)
      if (nextResult?.data?.length) {
        message.success(`生成完成，共返回 ${nextResult.data.length} 张`)
      } else {
        message.success('任务已完成，可在历史记录中查看结果')
      }
      void loadHistory(1)
      return
    }

    setResult(null)
    setLoading(false)
    message.error(nextTask.errorMessage || '生成失败')
  }

  const pollTaskStatus = async (taskId: number) => {
    const ctrl = new AbortController()
    pollAbortRef.current = ctrl

    try {
      const nextTask = await adminGetImageTask(taskId, ctrl.signal)
      if (!activeRef.current) return

      setTask(nextTask)

      if (isTerminalTask(nextTask.status)) {
        finishTask(nextTask)
        return
      }

      pollAbortRef.current = null
      pollTimerRef.current = window.setTimeout(() => {
        void pollTaskStatus(taskId)
      }, TASK_POLL_INTERVAL_MS)
    } catch (e) {
      const err = e as Error & { code?: number }
      if (ctrl.signal.aborted || err.code === -2) return
      clearTaskPolling()
      setLoading(false)
      message.error(err.message || '查询任务状态失败')
    }
  }

  const handleGenerate = async () => {
    const text = prompt.trim()
    if (!text) {
      message.warning('请输入提示词')
      return
    }
    if (normalizedSize && !/^\d+x\d+$/.test(normalizedSize)) {
      message.warning('尺寸格式需为 WIDTHxHEIGHT，例如 1024x1024')
      return
    }

    clearTaskPolling()
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)
    setResult(null)
    setTask(null)

    try {
      const nextTask = await adminGenerateImage(
        {
          prompt: text,
          size: normalizedSize || undefined,
          n: imageCount,
        },
        ctrl.signal,
      )
      if (!activeRef.current) return

      setTask(nextTask)
      abortRef.current = null

      if (isTerminalTask(nextTask.status)) {
        finishTask(nextTask)
        return
      }

      message.success(`生成任务已提交，任务 ID #${nextTask.id}`)
      void pollTaskStatus(nextTask.id)
    } catch (e) {
      const err = e as Error & { code?: number }
      if (err.code === -2) {
        message.info('已取消提交')
      } else {
        message.error(err.message)
      }
    } finally {
      if (abortRef.current === ctrl) {
        abortRef.current = null
        setLoading(false)
      }
    }
  }

  const handleCancel = () => {
    if (task && !isTerminalTask(task.status)) {
      clearTaskPolling()
      setLoading(false)
      message.info('已停止当前页面等待，后台任务仍会继续执行')
      return
    }
    abortRef.current?.abort()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      void handleGenerate()
    }
  }

  const handleReuse = (nextPrompt: string) => {
    setPrompt(nextPrompt)
  }

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      message.success('已复制提示词')
    } catch {
      message.error('复制失败')
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await adminDeleteImageHistory(id)
      message.success('已删除')
      const nextTotal = Math.max(0, total - 1)
      const shouldBackPage = items.length === 1 && page > 1
      if (shouldBackPage) {
        void loadHistory(page - 1)
      } else {
        setItems((prev) => prev.filter((item) => item.id !== id))
        setTotal(nextTotal)
      }
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const handleToggleShare = async (item: GeneratedImageView) => {
    setShareUpdatingId(item.id)
    try {
      const updated = await adminToggleImageHistoryShare(item.id, !item.isShared)
      setItems((prev) => prev.map((entry) => (entry.id === item.id ? updated : entry)))
      message.success(updated.isShared ? '已公开到分享广场' : '已取消公开分享')
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setShareUpdatingId(null)
    }
  }

  const usageValue = (key: string) => {
    const value = usageNumbers?.[key]
    return typeof value === 'number' ? value : null
  }

  const rootClassName =
    layout === 'standalone'
      ? 'admin-image admin-image--standalone'
      : 'admin-image admin-image--admin'

  return (
    <div className={rootClassName}>
      <div className="admin-image__left">
        <div>
          <h1 className="admin-image__title">
            <Sparkles size={20} />
            图片生成
          </h1>
          <p className="admin-image__subtitle">
            输入描述性提示词，AI 将为你生成图像。现在会以异步任务方式提交，页面会自动等待结果。
          </p>
        </div>

        <div className="admin-image__form">
          <label className="admin-image__label">提示词 (Prompt)</label>
          <textarea
            className="admin-image__textarea"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="例如：a beautiful sunset over the ocean, cinematic lighting, 8k resolution..."
            maxLength={MAX_PROMPT}
            disabled={loading}
          />
          <div className="admin-image__char-count">
            {prompt.length} / {MAX_PROMPT}
          </div>
        </div>

        <div className="admin-image__options">
          <label className="admin-image__option">
            <span className="admin-image__label">图片尺寸</span>
            <select
              className="admin-image__select"
              value={selectedSize}
              onChange={(e) => setSelectedSize(e.target.value)}
              disabled={loading}
            >
              {SIZE_OPTIONS.map((option) => (
                <option key={option.value || 'default'} value={option.value}>
                  {option.label}
                </option>
              ))}
              <option value={CUSTOM_SIZE_VALUE}>自定义尺寸</option>
            </select>
            {selectedSize === CUSTOM_SIZE_VALUE && (
              <input
                className="admin-image__input"
                value={customSize}
                onChange={(e) => setCustomSize(e.target.value)}
                placeholder="例如 1344x768"
                disabled={loading}
              />
            )}
          </label>

          <label className="admin-image__option">
            <span className="admin-image__label">生成数量</span>
            <select
              className="admin-image__select"
              value={String(imageCount)}
              onChange={(e) => setImageCount(Number(e.target.value))}
              disabled={loading}
            >
              {Array.from({ length: 10 }).map((_, index) => (
                <option key={index + 1} value={index + 1}>
                  {index + 1} 张
                </option>
              ))}
            </select>
            <span className="admin-image__helper">后端支持一次生成 1 到 10 张图片。</span>
          </label>
        </div>

        <div className="admin-image__actions">
          {loading ? (
            <>
              <button
                type="button"
                className="admin-image__btn admin-image__btn--primary"
                disabled
              >
                <LoaderCircle size={16} className="admin-image__spinner" />
                {task ? `任务进行中 ${elapsed}s...` : `提交中 ${elapsed}s...`}
              </button>
              <button
                type="button"
                className="admin-image__btn admin-image__btn--danger"
                onClick={handleCancel}
              >
                <StopCircle size={16} />
                {task ? '停止等待' : '取消'}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="admin-image__btn admin-image__btn--primary"
              onClick={() => void handleGenerate()}
              disabled={!prompt.trim()}
            >
              <SendHorizontal size={16} />
              开始生成
            </button>
          )}
        </div>

        {task && !result && (
          <div className="admin-image__task">
            <div className="admin-image__task-head">
              <span>当前任务 #{task.id}</span>
              <span
                className={`admin-image__task-status admin-image__task-status--${taskStatusTone(
                  task.status,
                )}`}
              >
                {taskStatusLabel(task.status)}
              </span>
            </div>
            <div className="admin-image__task-meta">
              <span>{task.model || 'unknown model'}</span>
              {task.size && <span>{task.size}</span>}
              <span>{task.n} 张</span>
            </div>
            <div className="admin-image__task-prompt" title={task.prompt}>
              {task.prompt}
            </div>
            <div className="admin-image__task-note">
              {task.status === 'FAILED'
                ? task.errorMessage || '任务执行失败'
                : '任务已提交，页面会自动轮询状态；完成后结果会出现在下方，并同步进入历史记录。'}
            </div>
          </div>
        )}

        {result && (
          <div className="admin-image__result">
            <div className="admin-image__result-head">
              <span>生成结果 {resultItems.length > 0 ? `(${resultItems.length})` : ''}</span>
              <span className="admin-image__result-model">{result.model}</span>
            </div>
            {resultItems.length ? (
              <>
                <div className="admin-image__result-grid">
                  {resultItems.map((item, index) => {
                    const src = resolveImageSrc(item)
                    if (!src) return null
                    return (
                      <button
                        key={`${src}-${index}`}
                        type="button"
                        className="admin-image__result-card"
                        onClick={() => setPreviewUrl(src)}
                      >
                        <img
                          src={src}
                          alt={`generated-${index + 1}`}
                          className="admin-image__result-img"
                          loading="lazy"
                        />
                        {item.revisedPrompt && (
                          <span className="admin-image__result-note">{item.revisedPrompt}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
                {(usageValue('input_tokens') !== null ||
                  usageValue('output_tokens') !== null ||
                  usageValue('total_tokens') !== null) && (
                  <div className="admin-image__usage">
                    {usageValue('input_tokens') !== null && (
                      <span className="admin-image__usage-pill">
                        输入 {usageValue('input_tokens')}
                      </span>
                    )}
                    {usageValue('output_tokens') !== null && (
                      <span className="admin-image__usage-pill">
                        输出 {usageValue('output_tokens')}
                      </span>
                    )}
                    {usageValue('total_tokens') !== null && (
                      <span className="admin-image__usage-pill">
                        总计 {usageValue('total_tokens')}
                      </span>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="admin-image__result-empty">任务已完成，但未返回可展示的图片地址。</div>
            )}
          </div>
        )}
      </div>

      <div className="admin-image__right">
        <div className="admin-image__gallery-head">
          <h3>生成历史 {total > 0 && `(${total})`}</h3>
          <button
            type="button"
            className="admin-image__refresh-btn"
            onClick={() => void loadHistory(page)}
            disabled={historyLoading}
          >
            <RefreshCw size={14} />
            刷新
          </button>
        </div>

        <div className="admin-image__gallery">
          {historyLoading && !items.length ? (
            <div className="admin-image__grid">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="admin-image__skeleton-card">
                  <div className="admin-image__skeleton-img" />
                  <div className="admin-image__skeleton-text" style={{ width: '70%' }} />
                  <div
                    className="admin-image__skeleton-text"
                    style={{ width: '40%', marginBottom: 12 }}
                  />
                </div>
              ))}
            </div>
          ) : !items.length ? (
            <div className="admin-image__empty">
              <Sparkles size={32} />
              <p>还没有生成记录</p>
            </div>
          ) : (
            <>
              <div className="admin-image__grid">
                {items.map((item) => (
                  <div key={item.id} className="admin-image__card">
                    <div
                      className="admin-image__card-img-wrap"
                      onClick={() => item.imageUrl && setPreviewUrl(item.imageUrl)}
                    >
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.prompt}
                          className="admin-image__card-img"
                          loading="lazy"
                        />
                      ) : (
                        <div
                          className="admin-image__result-empty"
                          style={{
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          无图片
                        </div>
                      )}
                    </div>
                    <div className="admin-image__card-body">
                      <div className="admin-image__card-prompt" title={item.prompt}>
                        {item.prompt}
                      </div>
                      <div className="admin-image__card-meta">
                        <span className="admin-image__card-model">{item.model}</span>
                        {item.size && (
                          <span className="admin-image__card-chip">{item.size}</span>
                        )}
                        <span
                          className={`admin-image__card-chip ${
                            item.isShared
                              ? 'admin-image__card-chip--shared'
                              : 'admin-image__card-chip--muted'
                          }`}
                        >
                          {item.isShared ? '公开中' : '未公开'}
                        </span>
                      </div>
                      <div className="admin-image__card-footer">
                        <span className="admin-image__card-time">
                          {formatTime(item.createdAt)}
                        </span>
                        <div className="admin-image__card-actions">
                          <button
                            type="button"
                            className="admin-image__card-btn"
                            title="复用提示词"
                            onClick={() => handleReuse(item.prompt)}
                          >
                            <RefreshCw size={13} />
                          </button>
                          <button
                            type="button"
                            className="admin-image__card-btn"
                            title="复制提示词"
                            onClick={() => void handleCopy(item.prompt)}
                          >
                            <Copy size={13} />
                          </button>
                          <button
                            type="button"
                            className="admin-image__card-btn"
                            title={item.isShared ? '取消公开分享' : '公开到分享广场'}
                            onClick={() => void handleToggleShare(item)}
                            disabled={shareUpdatingId === item.id}
                          >
                            {shareUpdatingId === item.id ? (
                              <LoaderCircle size={13} className="admin-image__spinner" />
                            ) : (
                              <Share2 size={13} />
                            )}
                          </button>
                          <button
                            type="button"
                            className="admin-image__card-btn"
                            title="下载图片"
                            onClick={() => {
                              const link = document.createElement('a')
                              link.href = item.imageUrl
                              link.download = `image-${item.id}.png`
                              link.click()
                            }}
                          >
                            <Download size={13} />
                          </button>
                          <button
                            type="button"
                            className="admin-image__card-btn admin-image__card-btn--danger"
                            title="删除"
                            onClick={() => void handleDelete(item.id)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {total > DEFAULT_PAGE_SIZE && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    padding: '20px 0',
                    gap: 8,
                  }}
                >
                  {Array.from({ length: Math.ceil(total / DEFAULT_PAGE_SIZE) }).map(
                    (_, index) => (
                      <button
                        key={index}
                        type="button"
                        className="admin-image__refresh-btn"
                        style={{
                          background: page === index + 1 ? 'var(--text)' : undefined,
                          color: page === index + 1 ? 'var(--bg)' : undefined,
                          borderColor: page === index + 1 ? 'var(--text)' : undefined,
                        }}
                        onClick={() => void loadHistory(index + 1)}
                      >
                        {index + 1}
                      </button>
                    ),
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {previewUrl && (
        <ImagePreviewOverlay src={previewUrl} onClose={() => setPreviewUrl(null)} />
      )}
    </div>
  )
}

function isTerminalTask(status: ImageTaskStatus) {
  return status === 'COMPLETED' || status === 'FAILED'
}

function taskStatusLabel(status: ImageTaskStatus) {
  switch (status) {
    case 'PENDING':
      return '排队中'
    case 'PROCESSING':
      return '生成中'
    case 'COMPLETED':
      return '已完成'
    case 'FAILED':
      return '失败'
    default:
      return status
  }
}

function taskStatusTone(status: ImageTaskStatus) {
  switch (status) {
    case 'COMPLETED':
      return 'success'
    case 'FAILED':
      return 'danger'
    case 'PROCESSING':
      return 'info'
    default:
      return 'pending'
  }
}

function formatTime(value: string) {
  if (!value) return ''
  const date = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return value
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const time = date.getTime()
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  if (time >= today) return `${hh}:${mm}`
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}-${day} ${hh}:${mm}`
}

function resolveImageSrc(item: ImageGenerateDataItem | { imageUrl: string | null | undefined }) {
  if ('imageUrl' in item) {
    return item.imageUrl ?? null
  }
  if (item.url) return item.url
  if (item.b64Json) return `data:image/png;base64,${item.b64Json}`
  return null
}
