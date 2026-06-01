import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import { App as AntApp } from 'antd'
import {
  ArrowLeft,
  CheckSquare,
  Clipboard,
  Download,
  ImagePlus,
  LoaderCircle,
  Menu,
  Plus,
  RefreshCw,
  SendHorizontal,
  Share2,
  Sparkles,
  StopCircle,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { Link as RouterLink } from 'react-router-dom'
import {
  adminDeleteImageHistory,
  adminEditImage,
  adminGenerateImage,
  adminGetImageTask,
  adminListImageHistory,
  adminRetryImageHistory,
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
import { buildImageProxyUrl } from '../utils/remoteImage'
import '../styles/admin-image.css'

const MAX_PROMPT = 2000
const TASK_POLL_INTERVAL_MS = 2000
const ACCEPTED_EDIT_IMAGE_TYPES = 'image/png,image/jpeg,image/webp'
const RESIZE_BREAKPOINT = 1120
const IMAGE_LAYOUT_STORAGE_KEY = 'nav.aiImage.layoutWidths'
const HISTORY_WIDTH_MIN = 240
const HISTORY_WIDTH_MAX = 420
const CONTROLS_WIDTH_MIN = 320
const CONTROLS_WIDTH_MAX = 540
const WORKSPACE_WIDTH_MIN = 360
const GRID_PADDING_X = 16
const RESIZE_HANDLE_TOTAL = 16

const MODEL_OPTIONS = ['gpt-image-2', 'gpt-image-1']
const QUALITY_OPTIONS = [
  { value: 'auto', label: '自动' },
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
]

const ASPECT_OPTIONS = [
  { label: '1:1', width: '1024', height: '1024', shape: 'square' },
  { label: '3:2', width: '1536', height: '1024', shape: 'landscape' },
  { label: '2:3', width: '1024', height: '1536', shape: 'portrait' },
  { label: '4:3', width: '1344', height: '1024', shape: 'landscape' },
  { label: '3:4', width: '1024', height: '1344', shape: 'portrait' },
  { label: '9:16', width: '1024', height: '1792', shape: 'phone' },
  { label: '1:1(2k)', width: '2048', height: '2048', shape: 'square' },
  { label: '16:9(2k)', width: '1920', height: '1080', shape: 'wide' },
  { label: '9:16(2k)', width: '1080', height: '1920', shape: 'phone' },
  { label: '16:9(4k)', width: '3840', height: '2160', shape: 'wide' },
  { label: '9:16(4k)', width: '2160', height: '3840', shape: 'phone' },
  { label: 'auto', width: '', height: '', shape: 'auto' },
]

interface EditFileState {
  file: File
  previewUrl: string
}

interface HistoryGroup {
  id: string
  prompt: string
  model: string
  size?: string | null
  status?: ImageTaskStatus | null
  images: GeneratedImageView[]
  fallbackItem?: GeneratedImageView
  createdAt: string
  errorMessage?: string | null
}

interface DisplayImage {
  key: string
  src: string
  prompt: string
  model?: string | null
  size?: string | null
  createdAt?: string | null
  revisedPrompt?: string | null
  historyItem?: GeneratedImageView
}

interface ImageStudioProps {
  layout?: 'admin' | 'standalone'
}

interface LayoutWidths {
  history: number
  controls: number
}

type ResizeTarget = 'history' | 'controls'

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function loadLayoutWidths(): LayoutWidths {
  if (typeof window === 'undefined') {
    return { history: 280, controls: 380 }
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(IMAGE_LAYOUT_STORAGE_KEY) || '{}') as Partial<LayoutWidths>
    return {
      history: clampNumber(Number(parsed.history) || 280, HISTORY_WIDTH_MIN, HISTORY_WIDTH_MAX),
      controls: clampNumber(Number(parsed.controls) || 380, CONTROLS_WIDTH_MIN, CONTROLS_WIDTH_MAX),
    }
  } catch {
    return { history: 280, controls: 380 }
  }
}

export default function ImageStudio({ layout = 'admin' }: ImageStudioProps) {
  const { message } = AntApp.useApp()
  const [prompt, setPrompt] = useState('')
  const [selectedModel, setSelectedModel] = useState(MODEL_OPTIONS[0])
  const [quality, setQuality] = useState('auto')
  const [width, setWidth] = useState('1024')
  const [height, setHeight] = useState('1024')
  const [selectedAspect, setSelectedAspect] = useState('1:1')
  const [imageCount, setImageCount] = useState(1)
  const [loading, setLoading] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<ImageGenerateResult | null>(null)
  const [task, setTask] = useState<ImageTaskView | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const pollAbortRef = useRef<AbortController | null>(null)
  const pollTimerRef = useRef<number | null>(null)
  const activeRef = useRef(true)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const resizeStateRef = useRef<{
    target: ResizeTarget
    startX: number
    startHistory: number
    startControls: number
    containerWidth: number
  } | null>(null)

  const [items, setItems] = useState<GeneratedImageView[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null)
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(() => new Set())
  const [historyCollapsed, setHistoryCollapsed] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(`(max-width: ${RESIZE_BREAKPOINT}px)`).matches : false,
  )
  const [layoutWidths, setLayoutWidths] = useState<LayoutWidths>(() => loadLayoutWidths())
  const [resizingTarget, setResizingTarget] = useState<ResizeTarget | null>(null)
  const [shareUpdatingId, setShareUpdatingId] = useState<number | null>(null)
  const [retryingId, setRetryingId] = useState<number | null>(null)
  const [referenceImage, setReferenceImage] = useState<EditFileState | null>(null)
  const [historyReferenceLoadingId, setHistoryReferenceLoadingId] = useState<number | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const normalizedSize = width.trim() && height.trim() ? `${width.trim()}x${height.trim()}` : ''
  const layoutStyle = {
    '--image-history-width': `${layoutWidths.history}px`,
    '--image-controls-width': `${layoutWidths.controls}px`,
  } as CSSProperties
  const groups = useMemo(() => buildHistoryGroups(items), [items])
  const selectedGroup = groups.find((group) => group.id === selectedHistoryId) ?? null
  const selectedGroupList = groups.filter((group) => selectedGroupIds.has(group.id))
  const displayImages = useMemo(
    () => buildDisplayImages(result, selectedGroup),
    [result, selectedGroup],
  )
  const visibleImageCount = displayImages.length
  const workspaceTitle = result
    ? '本次生成'
    : selectedGroup
      ? selectedGroup.prompt
      : task
        ? `任务 #${task.id}`
        : '生成结果'

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
    if (!selectedHistoryId && !result && groups[0]) {
      setSelectedHistoryId(groups[0].id)
    }
    if (selectedHistoryId && !groups.some((group) => group.id === selectedHistoryId)) {
      setSelectedHistoryId(groups[0]?.id ?? null)
    }
  }, [groups, result, selectedHistoryId])

  useEffect(() => {
    const id = window.setInterval(() => {
      if (hasActiveHistoryTask(items)) {
        void loadHistory(page)
      }
    }, TASK_POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, page])

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

  useEffect(() => {
    return () => {
      if (referenceImage) URL.revokeObjectURL(referenceImage.previewUrl)
    }
  }, [referenceImage])

  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${RESIZE_BREAKPOINT}px)`)
    const syncHistoryMode = () => setHistoryCollapsed(media.matches)
    syncHistoryMode()
    media.addEventListener('change', syncHistoryMode)
    return () => media.removeEventListener('change', syncHistoryMode)
  }, [])

  useEffect(() => {
    window.localStorage.setItem(IMAGE_LAYOUT_STORAGE_KEY, JSON.stringify(layoutWidths))
  }, [layoutWidths])

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
      setSelectedHistoryId(null)
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

  const setReferenceFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      message.warning('请选择图片文件')
      return
    }
    setReferenceImage((previous) => {
      if (previous) URL.revokeObjectURL(previous.previewUrl)
      return {
        file,
        previewUrl: URL.createObjectURL(file),
      }
    })
  }

  const clearReferenceFile = (inputRef: RefObject<HTMLInputElement>) => {
    setReferenceImage((previous) => {
      if (previous) URL.revokeObjectURL(previous.previewUrl)
      return null
    })
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleReferenceFileChange = (file: File | undefined) => {
    if (file) setReferenceFile(file)
  }

  const handlePasteReferenceImage = async () => {
    const readClipboard = (navigator.clipboard as Clipboard & {
      read?: () => Promise<ClipboardItem[]>
    }).read
    if (!readClipboard) {
      message.warning('当前浏览器不支持读取剪切板图片')
      return
    }

    try {
      const clipboardItems = await readClipboard.call(navigator.clipboard)
      for (const clipboardItem of clipboardItems) {
        const imageType = clipboardItem.types.find((type) => type.startsWith('image/'))
        if (!imageType) continue
        const blob = await clipboardItem.getType(imageType)
        setReferenceFile(new File([blob], `clipboard.${imageType.split('/')[1] || 'png'}`, { type: imageType }))
        message.success('已从剪切板加入参考图')
        return
      }
      message.warning('剪切板里没有图片')
    } catch (e) {
      message.error(`读取剪切板失败：${(e as Error).message}`)
    }
  }

  const handleUseImageAsReference = async (image: DisplayImage) => {
    setHistoryReferenceLoadingId(image.historyItem?.id ?? null)
    try {
      const blob = await fetchImageBlobForDownload(image.src)
      if (!blob.type.startsWith('image/')) {
        throw new Error('返回内容不是图片')
      }
      const extension = blob.type.split('/')[1] || 'png'
      setReferenceFile(new File([blob], `reference-${Date.now()}.${extension}`, { type: blob.type }))
      message.success('已加入参考图')
    } catch (e) {
      message.error(`加入参考图失败：${(e as Error).message}`)
    } finally {
      setHistoryReferenceLoadingId(null)
    }
  }

  const handleSubmit = async () => {
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
      const payload = {
        prompt: text,
        model: selectedModel,
        size: normalizedSize || undefined,
        quality: quality === 'auto' ? undefined : quality,
        n: imageCount,
      }
      const nextTask = referenceImage
        ? await adminEditImage(
            {
              ...payload,
              image: referenceImage.file,
            },
            ctrl.signal,
          )
        : await adminGenerateImage(payload, ctrl.signal)

      if (!activeRef.current) return

      setTask(nextTask)
      abortRef.current = null

      if (isTerminalTask(nextTask.status)) {
        finishTask(nextTask)
        return
      }

      message.success(`生成任务已提交，任务 ID #${nextTask.id}`)
      setLoading(false)
      void loadHistory(1)
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
      void handleSubmit()
    }
  }

  const handleNew = () => {
    setPrompt('')
    setResult(null)
    setTask(null)
    setSelectedHistoryId(null)
    setSelectedGroupIds(new Set())
    clearReferenceFile(imageInputRef)
  }

  const handleDeleteGroups = async (targetGroups: HistoryGroup[]) => {
    const ids = targetGroups.flatMap((group) =>
      group.images.length
        ? group.images.map((item) => item.id)
        : group.fallbackItem
          ? [group.fallbackItem.id]
          : [],
    )
    if (!ids.length) return
    try {
      await Promise.all(ids.map((id) => adminDeleteImageHistory(id)))
      message.success('已删除')
      setSelectedHistoryId(null)
      setSelectedGroupIds(new Set())
      void loadHistory(page)
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const handleToggleGroupSelection = (groupId: string) => {
    setSelectedGroupIds((previous) => {
      const next = new Set(previous)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      return next
    })
  }

  const handleToggleAllGroups = () => {
    setSelectedGroupIds((previous) => {
      if (previous.size === groups.length) return new Set()
      return new Set(groups.map((group) => group.id))
    })
  }

  const handleRetry = async (item: GeneratedImageView) => {
    setRetryingId(item.id)
    try {
      await adminRetryImageHistory(item.id)
      message.success('已重新提交任务')
      void loadHistory(page)
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setRetryingId(null)
    }
  }

  const handleToggleShare = async (item: GeneratedImageView) => {
    setShareUpdatingId(item.id)
    try {
      const updated = await adminToggleImageHistoryShare(item.id, !item.isShared)
      setItems((prev) => prev.map((entry) => (entry.id === item.id ? updated : entry)))
      message.success(updated.isShared ? '已添加到素材/分享区' : '已取消公开分享')
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setShareUpdatingId(null)
    }
  }

  const handleAddToMaterial = async (image: DisplayImage) => {
    if (!image.historyItem) {
      message.info('生成结果同步进历史后即可添加到素材')
      return
    }
    await handleToggleShare(image.historyItem)
  }

  const handleDownloadImage = async (image: DisplayImage) => {
    try {
      const blob = await fetchImageBlobForDownload(image.src)
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = image.historyItem
        ? buildImageDownloadName(image.historyItem, blob.type)
        : `image-${Date.now()}.${getImageExtension(image.src, blob.type)}`
      link.rel = 'noopener'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch (e) {
      message.error(`下载失败：${(e as Error).message}`)
    }
  }

  const handleAspectSelect = (option: (typeof ASPECT_OPTIONS)[number]) => {
    setSelectedAspect(option.label)
    setWidth(option.width)
    setHeight(option.height)
  }

  const applyResize = (state: NonNullable<typeof resizeStateRef.current>, clientX: number) => {
    const delta = clientX - state.startX
    const available = state.containerWidth - GRID_PADDING_X - RESIZE_HANDLE_TOTAL

    setLayoutWidths(() => {
      if (state.target === 'history') {
        const controlsMaxByWorkspace = Math.max(
          CONTROLS_WIDTH_MIN,
          available - HISTORY_WIDTH_MIN - WORKSPACE_WIDTH_MIN,
        )
        const nextHistory = clampNumber(
          state.startHistory + delta,
          HISTORY_WIDTH_MIN,
          Math.min(HISTORY_WIDTH_MAX, available - state.startControls - WORKSPACE_WIDTH_MIN),
        )
        const nextControls = clampNumber(state.startControls, CONTROLS_WIDTH_MIN, Math.min(CONTROLS_WIDTH_MAX, controlsMaxByWorkspace))
        return {
          history: nextHistory,
          controls: nextControls,
        }
      }

      return {
        history: state.startHistory,
        controls: clampNumber(
          state.startControls + delta,
          CONTROLS_WIDTH_MIN,
          Math.min(CONTROLS_WIDTH_MAX, available - state.startHistory - WORKSPACE_WIDTH_MIN),
        ),
      }
    })
  }

  const startResize = (target: ResizeTarget, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (window.innerWidth <= RESIZE_BREAKPOINT) return
    const root = event.currentTarget.closest('.admin-image')
    if (!root) return

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeStateRef.current = {
      target,
      startX: event.clientX,
      startHistory: layoutWidths.history,
      startControls: layoutWidths.controls,
      containerWidth: root.clientWidth,
    }
    setResizingTarget(target)
  }

  const handleResizeMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = resizeStateRef.current
    if (!state) return
    event.preventDefault()
    applyResize(state, event.clientX)
  }

  const finishResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!resizeStateRef.current) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    resizeStateRef.current = null
    setResizingTarget(null)
  }

  const rootClassName =
    layout === 'standalone'
      ? 'admin-image admin-image--standalone'
      : 'admin-image admin-image--admin'

  return (
    <div
      className={`${rootClassName}${historyCollapsed ? ' admin-image--history-collapsed' : ''}${resizingTarget ? ' admin-image--resizing' : ''}`}
      style={layoutStyle}
    >
      <aside className="admin-image__history" aria-label="生成记录">
        <div className="admin-image__history-head">
          <h2>生成记录</h2>
          <button
            type="button"
            className="admin-image__icon-btn"
            onClick={() => setHistoryCollapsed(true)}
            aria-label="收起生成记录"
          >
            <Menu size={15} />
          </button>
        </div>
        <div className="admin-image__history-actions">
          <button type="button" className="admin-image__small-btn" onClick={handleNew}>
            <Plus size={14} />
            新建
          </button>
          <button type="button" className="admin-image__small-btn" onClick={handleToggleAllGroups} disabled={!groups.length}>
            <CheckSquare size={14} />
            {selectedGroupIds.size === groups.length && groups.length ? '取消' : '全选'}
          </button>
          <button
            type="button"
            className="admin-image__small-btn"
            onClick={() => void handleDeleteGroups(selectedGroupList.length ? selectedGroupList : selectedGroup ? [selectedGroup] : [])}
            disabled={!selectedGroup && !selectedGroupList.length}
          >
            <Trash2 size={14} />
            {selectedGroupList.length ? `删除 ${selectedGroupList.length}` : '删除'}
          </button>
        </div>
        <div className="admin-image__history-list">
          {historyLoading && !groups.length ? (
            Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="admin-image__history-skeleton" />
            ))
          ) : !groups.length ? (
            <div className="admin-image__empty">
              <Sparkles size={28} />
              <p>还没有生成记录</p>
            </div>
          ) : (
            groups.map((group) => (
              <button
                key={group.id}
                type="button"
                className={`admin-image__history-card ${
                  selectedHistoryId === group.id ? 'admin-image__history-card--active' : ''
                } ${selectedGroupIds.has(group.id) ? 'admin-image__history-card--selected' : ''}`}
                onClick={() => {
                  setResult(null)
                  setSelectedHistoryId(group.id)
                }}
              >
                <span
                  className="admin-image__history-check"
                  role="checkbox"
                  aria-checked={selectedGroupIds.has(group.id)}
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation()
                    handleToggleGroupSelection(group.id)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    event.stopPropagation()
                    handleToggleGroupSelection(group.id)
                  }}
                />
                <span className="admin-image__history-prompt">{compactPrompt(group.prompt)}</span>
                <span className="admin-image__history-row">
                  <span className="admin-image__history-thumbs">
                    {group.images.slice(0, 4).map((item) => (
                      <img key={item.id} src={item.imageUrl || undefined} alt="" loading="lazy" />
                    ))}
                    {!group.images.length && (
                      <span className="admin-image__history-placeholder">
                        {group.status ? taskStatusLabel(group.status) : '无图'}
                      </span>
                    )}
                  </span>
                  <span className="admin-image__history-meta">
                    <span>{Math.max(group.images.length, group.fallbackItem?.status ? 1 : 0)} 张</span>
                    <span className={`admin-image__task-status admin-image__task-status--${taskStatusTone(group.status || 'COMPLETED')}`}>
                      {taskStatusLabel(group.status || 'COMPLETED')}
                    </span>
                  </span>
                </span>
                <span className="admin-image__history-time">{formatTime(group.createdAt)}</span>
              </button>
            ))
          )}
        </div>
        {total > DEFAULT_PAGE_SIZE && (
          <div className="admin-image__pager">
            {Array.from({ length: Math.ceil(total / DEFAULT_PAGE_SIZE) }).map((_, index) => (
              <button
                key={index}
                type="button"
                className={`admin-image__pager-btn ${page === index + 1 ? 'is-active' : ''}`}
                onClick={() => void loadHistory(index + 1)}
              >
                {index + 1}
              </button>
            ))}
          </div>
        )}
      </aside>

      <button
        type="button"
        className="admin-image__history-scrim"
        onClick={() => setHistoryCollapsed(true)}
        aria-label="鏀惰捣鐢熸垚璁板綍"
      />

      <button
        type="button"
        className="admin-image__history-rail"
        onClick={() => setHistoryCollapsed(false)}
        aria-expanded={!historyCollapsed}
        aria-label="展开生成记录"
      >
        <Menu size={16} />
        <span className="admin-image__history-rail-label">生成记录</span>
        <span className="admin-image__history-rail-count">{groups.length || total} 条</span>
      </button>

      <button
        type="button"
        className={`admin-image__resize-handle admin-image__resize-handle--history${resizingTarget === 'history' ? ' is-active' : ''}`}
        onPointerDown={(event) => startResize('history', event)}
        onPointerMove={handleResizeMove}
        onPointerUp={finishResize}
        onPointerCancel={finishResize}
        aria-label="调整生成记录宽度"
      />

      <section className="admin-image__controls" aria-label="生图参数">
        <div className="admin-image__controls-body">
        <div className="admin-image__topline">
          <RouterLink to="/" className="admin-image__back-link">
            <ArrowLeft size={15} />
            首页
          </RouterLink>
          <span>{selectedModel}</span>
        </div>
        <label className="admin-image__prompt-field">
          <span>提示词：</span>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="描述画面主体、风格、光线、构图和细节"
            maxLength={MAX_PROMPT}
            disabled={loading}
          />
        </label>

        <section className="admin-image__section">
          <div className="admin-image__section-head">
            <h3>参考图</h3>
            <div className="admin-image__section-actions">
              <button type="button" className="admin-image__small-btn" onClick={() => void handlePasteReferenceImage()}>
                <Clipboard size={14} />
                剪切板
              </button>
              <button type="button" className="admin-image__small-btn" onClick={() => imageInputRef.current?.click()} disabled={loading}>
                <Upload size={14} />
                上传
              </button>
            </div>
          </div>
          <div className="admin-image__reference-strip">
            {referenceImage ? (
              <div className="admin-image__reference-item">
                <img src={referenceImage.previewUrl} alt="参考图" />
                <button
                  type="button"
                  title="移除参考图"
                  onClick={() => clearReferenceFile(imageInputRef)}
                  disabled={loading}
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="admin-image__reference-empty"
                onClick={() => imageInputRef.current?.click()}
                disabled={loading}
              >
                <Upload size={18} />
                加入参考图
              </button>
            )}
          </div>
          <input
            ref={imageInputRef}
            className="admin-image__file-input"
            type="file"
            accept={ACCEPTED_EDIT_IMAGE_TYPES}
            onChange={(event) => handleReferenceFileChange(event.target.files?.[0])}
            disabled={loading}
          />
        </section>

        <section className="admin-image__section">
          <h3>模型</h3>
          <select
            className="admin-image__select"
            value={selectedModel}
            onChange={(event) => setSelectedModel(event.target.value)}
            disabled={loading}
          >
            {MODEL_OPTIONS.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </section>

        <section className="admin-image__section">
          <h3>质量</h3>
          <div className="admin-image__segmented">
            {QUALITY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={quality === option.value ? 'is-active' : ''}
                onClick={() => setQuality(option.value)}
                disabled={loading}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        <section className="admin-image__section">
          <h3>尺寸</h3>
          <div className="admin-image__size-row">
            <label>
              <span>W</span>
              <input value={width} onChange={(event) => setWidth(event.target.value)} disabled={loading} />
            </label>
            <button
              type="button"
              onClick={() => {
                setWidth(height)
                setHeight(width)
              }}
              disabled={loading}
              aria-label="交换宽高"
            >
              ↔
            </button>
            <label>
              <span>H</span>
              <input value={height} onChange={(event) => setHeight(event.target.value)} disabled={loading} />
            </label>
          </div>
        </section>

        <section className="admin-image__section">
          <h3>宽高比</h3>
          <div className="admin-image__aspect-grid">
            {ASPECT_OPTIONS.map((option) => (
              <button
                key={option.label}
                type="button"
                className={selectedAspect === option.label ? 'is-active' : ''}
                onClick={() => handleAspectSelect(option)}
                disabled={loading}
              >
                <span className={`admin-image__aspect-icon admin-image__aspect-icon--${option.shape}`} />
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="admin-image__section">
          <h3>生成张数</h3>
          <div className="admin-image__count-grid">
            {Array.from({ length: 10 }).map((_, index) => (
              <button
                key={index + 1}
                type="button"
                className={imageCount === index + 1 ? 'is-active' : ''}
                onClick={() => setImageCount(index + 1)}
                disabled={loading}
              >
                {index + 1} 张
              </button>
            ))}
          </div>
        </section>

        </div>

        <div className="admin-image__submit-row">
          {loading ? (
            <>
              <button type="button" className="admin-image__generate-btn" disabled>
                <LoaderCircle size={16} className="admin-image__spinner" />
                {task ? `生成中 ${elapsed}s` : `提交中 ${elapsed}s`}
              </button>
              <button type="button" className="admin-image__cancel-btn" onClick={handleCancel}>
                <StopCircle size={16} />
              </button>
            </>
          ) : (
            <button
              type="button"
              className="admin-image__generate-btn"
              onClick={() => void handleSubmit()}
              disabled={!prompt.trim()}
            >
              <SendHorizontal size={16} />
              开始生成
            </button>
          )}
        </div>
      </section>

      <button
        type="button"
        className={`admin-image__resize-handle admin-image__resize-handle--controls${resizingTarget === 'controls' ? ' is-active' : ''}`}
        onPointerDown={(event) => startResize('controls', event)}
        onPointerMove={handleResizeMove}
        onPointerUp={finishResize}
        onPointerCancel={finishResize}
        aria-label="调整操作台宽度"
      />

      <main className="admin-image__workspace" aria-label="生成结果">
        <div className="admin-image__workspace-head">
          <div>
            <h1>{workspaceTitle}</h1>
            <p>
              {visibleImageCount
                ? `${visibleImageCount} 张图片`
                : task
                  ? taskStatusLabel(task.status)
                  : '等待生成'}
            </p>
          </div>
          <div className="admin-image__workspace-tools">
            <button type="button" onClick={() => void loadHistory(page)} disabled={historyLoading}>
              {historyLoading ? <LoaderCircle size={14} className="admin-image__spinner" /> : <RefreshCw size={14} />}
              刷新
            </button>
          </div>
        </div>
        {task && !result && (
          <div className="admin-image__task-banner">
            <span className={`admin-image__task-status admin-image__task-status--${taskStatusTone(task.status)}`}>
              {taskStatusLabel(task.status)}
            </span>
            <span>任务 #{task.id}</span>
            <span>{task.model}</span>
            {task.size && <span>{task.size}</span>}
            {task.status === 'FAILED' && <strong>{task.errorMessage || '任务执行失败'}</strong>}
          </div>
        )}

        {displayImages.length ? (
          <div className="admin-image__result-grid">
            {displayImages.map((image) => (
              <article key={image.key} className="admin-image__result-card">
                <button
                  type="button"
                  className="admin-image__result-image"
                  onClick={() => setPreviewUrl(image.src)}
                >
                  <img src={image.src} alt={image.prompt} loading="lazy" />
                </button>
                <div className="admin-image__result-meta">
                  <span>{image.size || normalizedSize || 'auto'}</span>
                  <span>{image.model || selectedModel}</span>
                  <span>{image.createdAt ? formatTime(image.createdAt) : task ? `${elapsed}s` : ''}</span>
                </div>
                <div className="admin-image__result-actions">
                  <button
                    type="button"
                    onClick={() => void handleAddToMaterial(image)}
                    disabled={shareUpdatingId === image.historyItem?.id}
                  >
                    <ImagePlus size={14} />
                    添加到素材
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleUseImageAsReference(image)}
                    disabled={historyReferenceLoadingId === image.historyItem?.id}
                  >
                    {historyReferenceLoadingId === image.historyItem?.id ? (
                      <LoaderCircle size={14} className="admin-image__spinner" />
                    ) : (
                      <Share2 size={14} />
                    )}
                    加入参考图
                  </button>
                  <button type="button" onClick={() => void handleDownloadImage(image)}>
                    <Download size={14} />
                    下载
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : selectedGroup?.fallbackItem?.status === 'FAILED' ? (
          <div className="admin-image__empty admin-image__empty--wide">
            <Sparkles size={34} />
            <p>{selectedGroup.errorMessage || '任务执行失败'}</p>
            {selectedGroup.fallbackItem.type !== 'edit' && (
              <button
                type="button"
                className="admin-image__small-btn"
                onClick={() => void handleRetry(selectedGroup.fallbackItem!)}
                disabled={retryingId === selectedGroup.fallbackItem.id}
              >
                <RefreshCw size={14} />
                重新生成
              </button>
            )}
          </div>
        ) : (
          <div className="admin-image__empty admin-image__empty--wide">
            <Sparkles size={34} />
            <p>输入提示词并开始生成，结果会显示在这里。</p>
          </div>
        )}
      </main>

      {previewUrl && (
        <ImagePreviewOverlay src={previewUrl} onClose={() => setPreviewUrl(null)} />
      )}
    </div>
  )
}

function buildHistoryGroups(items: GeneratedImageView[]): HistoryGroup[] {
  const groups: HistoryGroup[] = []
  const map = new Map<string, HistoryGroup>()

  for (const item of items) {
    if (!item.imageUrl || item.status === 'FAILED' || isActiveHistoryItem(item)) {
      groups.push({
        id: `task-${item.taskId ?? Math.abs(item.id)}`,
        prompt: item.prompt,
        model: item.model,
        size: item.size,
        status: item.status,
        images: [],
        fallbackItem: item,
        createdAt: item.createdAt,
        errorMessage: item.errorMessage,
      })
      continue
    }

    const key = `${item.prompt}|${item.model}|${item.size || ''}|${item.createdAt}`
    let group = map.get(key)
    if (!group) {
      group = {
        id: `image-${item.id}`,
        prompt: item.prompt,
        model: item.model,
        size: item.size,
        status: item.status || 'COMPLETED',
        images: [],
        createdAt: item.createdAt,
      }
      map.set(key, group)
      groups.push(group)
    }
    group.images.push(item)
  }

  return groups
}

function buildDisplayImages(result: ImageGenerateResult | null, group: HistoryGroup | null): DisplayImage[] {
  if (result) {
    return result.data
      .map((item, index) => {
        const src = resolveImageSrc(item)
        if (!src) return null
        return {
          key: `${src}-${index}`,
          src,
          prompt: item.revisedPrompt || '',
          model: result.model,
          revisedPrompt: item.revisedPrompt,
        }
      })
      .filter(Boolean) as DisplayImage[]
  }

  return (group?.images ?? [])
    .map((item) => ({
      key: String(item.id),
      src: item.imageUrl || '',
      prompt: item.prompt,
      model: item.model,
      size: item.size,
      createdAt: item.createdAt,
      historyItem: item,
    }))
    .filter((item) => item.src)
}

function isTerminalTask(status: ImageTaskStatus) {
  return status === 'COMPLETED' || status === 'FAILED'
}

function isActiveHistoryItem(item: GeneratedImageView) {
  return item.status === 'PENDING' || item.status === 'PROCESSING'
}

function hasActiveHistoryTask(items: GeneratedImageView[]) {
  return items.some(isActiveHistoryItem)
}

function taskStatusLabel(status: ImageTaskStatus) {
  switch (status) {
    case 'PENDING':
      return '排队中'
    case 'PROCESSING':
      return '生成中'
    case 'COMPLETED':
      return '成功'
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

function compactPrompt(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 12 ? `${trimmed.slice(0, 12)}…` : trimmed
}

function formatTime(value: string) {
  if (!value) return ''
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return value
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const time = date.getTime()
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  if (time >= today) return `${hh}:${mm}:${ss}`
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}/${month}/${day} ${hh}:${mm}:${ss}`
}

function buildImageDownloadName(item: GeneratedImageView, mimeType: string) {
  return `image-${item.id}.${getImageExtension(item.imageUrl || '', mimeType)}`
}

async function fetchImageBlobForDownload(url: string) {
  try {
    return await fetchImageBlob(url)
  } catch (directError) {
    if (!/^https?:\/\//i.test(url)) {
      throw directError
    }

    try {
      return await fetchImageBlob(buildImageProxyUrl(url))
    } catch {
      throw directError
    }
  }
}

async function fetchImageBlob(url: string) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return response.blob()
}

function getImageExtension(url: string, mimeType: string) {
  const fromMimeType = mimeType.toLowerCase().split(';')[0].trim()
  switch (fromMimeType) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    case 'image/gif':
      return 'gif'
    default:
      break
  }

  try {
    const pathname = new URL(url, window.location.origin).pathname
    const match = pathname.match(/\.([a-z0-9]+)$/i)
    if (match?.[1]) return match[1].toLowerCase()
  } catch {
    // Fall through to the default extension.
  }

  return 'png'
}

function resolveImageSrc(item: ImageGenerateDataItem | { imageUrl: string | null | undefined }) {
  if ('imageUrl' in item) {
    return item.imageUrl ?? null
  }
  if (item.url) return item.url
  if (item.b64Json) return `data:image/png;base64,${item.b64Json}`
  return null
}
