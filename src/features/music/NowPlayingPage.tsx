import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type TouchEvent,
} from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Popover } from 'antd'
import {
  AudioLines,
  ChevronDown,
  Heart,
  ListMusic,
  Loader2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { sourceLabel } from './sources'
import type { MusicQuality, SongSearchItem } from '../../types'
import { useMusicPlayer, type PlayMode } from '../../context/MusicPlayerContext'
import { useMusicAppearance } from '../../utils/musicAppearance'
import {
  extractAurora,
  lowPowerDevice,
  readGlowLevel,
  writeGlowLevel,
  GLOW_INTENSITY,
  GLOW_OPTIONS,
  type AuroraPalette,
  type GlowLevel,
} from './auroraVisual'
import MusicCover from '../../components/MusicCover'
import MusicLyricText from '../../components/MusicLyricText'
import MusicLyricsSettings from '../../components/MusicLyricsSettings'
import { useMusicFavorites } from '../../hooks/useMusicFavorites'
import { coverUrlForSize, formatDuration } from '../../utils/musicPlayer'
import '../../styles/now-playing.css'
import '../../styles/aurora-now.css'

const QUALITY_OPTIONS: Array<{ value: MusicQuality; label: string }> = [
  { value: '128k', label: '128K' },
  { value: '320k', label: '320K' },
  { value: 'flac', label: 'FLAC' },
  { value: 'flac24bit', label: 'Hi-Res' },
]

function getPlayModeMeta(mode: PlayMode) {
  switch (mode) {
    case 'repeat-one':
      return { label: '单曲循环', icon: Repeat1 }
    case 'shuffle':
      return { label: '随机播放', icon: Shuffle }
    default:
      return { label: '顺序播放', icon: Repeat }
  }
}

/** 单层极光光晕：把该歌曲自己的调色板钉在图层上，切歌交叉淡化时互不串色。 */
function auroraLayerStyle(p: AuroraPalette): CSSProperties {
  return {
    '--aurora-a': p.a,
    '--aurora-b': p.b,
    '--aurora-c': p.c,
  } as CSSProperties
}

export default function NowPlayingPage() {
  const navigate = useNavigate()
  const location = useLocation()

  // 极光视觉设置（环境光强度持久化；动效复用音乐页的全局 appearance 设置）
  const appearance = useMusicAppearance()
  const lowPower = useMemo(() => lowPowerDevice(), [])
  const [glowLevel, setGlowLevel] = useState<GlowLevel>(() => readGlowLevel(lowPower))
  const [auroraOpen, setAuroraOpen] = useState(false)
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === 'undefined' || !document.hidden,
  )
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window !== 'undefined' &&
      !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  )

  // 封面取色 + 交叉淡化（替代旧的 blurred cover backdrop）
  const [dominantColor, setDominantColor] = useState<string | null>(null)
  const [auroraCurrent, setAuroraCurrent] = useState<AuroraPalette | null>(null)
  const [auroraPrevious, setAuroraPrevious] = useState<AuroraPalette | null>(null)
  const [auroraSeq, setAuroraSeq] = useState(0)
  const auroraCurrentRef = useRef<AuroraPalette | null>(null)
  const crossfadeTimerRef = useRef<number | null>(null)

  const [qualityOpen, setQualityOpen] = useState(false)
  const [queueOpen, setQueueOpen] = useState(false)
  const [mobileTab, setMobileTab] = useState<'cover' | 'lyrics'>('lyrics')
  const [progressHover, setProgressHover] = useState<{ ratio: number; time: number } | null>(null)
  const touchStartXRef = useRef<number | null>(null)
  const lyricScrollRef = useRef<HTMLDivElement | null>(null)
  const currentTimeRef = useRef(0)

  const {
    current,
    playlist,
    currentIndex,
    isPlaying,
    currentTime,
    duration,
    volume,
    muted,
    playLoading,
    preferredQuality,
    unsupportedFormat,
    playMode,
    canPrev,
    canNext,
    openArtist,
    lyricLines: lrcLines,
    lyricPlainText,
    lyricLoading,
    lyricError,
    retryLyrics,
    activeLyricIndex: activeLrcIndex,
    playSong,
    playFromQueue,
    togglePlay,
    playPrev,
    playNext,
    seekToTime,
    setPreferredQuality,
    setVolume,
    cyclePlayMode,
    toggleMuted,
  } = useMusicPlayer()

  currentTimeRef.current = currentTime

  const close = useCallback(() => {
    if (location.key && location.key !== 'default') navigate(-1)
    else navigate('/music', { replace: true })
  }, [location.key, navigate])

  const coverSampleUrl = useMemo(
    () => coverUrlForSize(current?.coverUrl, 48),
    [current?.coverUrl],
  )

  const currentRow = useMemo<SongSearchItem | null>(() => {
    if (!current) return null
    if (currentIndex >= 0 && playlist[currentIndex]) return playlist[currentIndex]
    return {
      id: current.id,
      source: current.source,
      name: current.name || '',
      artist: current.artist || '',
      album: current.album,
      coverUrl: current.coverUrl,
      durationSec: current.durationSec,
      availableQualities: QUALITY_OPTIONS.map((item) => item.value),
    }
  }, [current, currentIndex, playlist])

  const availableQualities = currentRow?.availableQualities?.length
    ? QUALITY_OPTIONS.filter((item) => currentRow.availableQualities!.includes(item.value))
    : QUALITY_OPTIONS

  const queueItems = useMemo(() => {
    if (playlist.length) return playlist
    return currentRow ? [currentRow] : []
  }, [currentRow, playlist])

  const activeQueueIndex = playlist.length ? currentIndex : queueItems.length ? 0 : -1
  const favoriteSongs = useMemo(() => (currentRow ? [currentRow] : []), [currentRow])
  const favoriteState = useMusicFavorites(favoriteSongs)
  const isCurrentFavorite = currentRow ? favoriteState.isFavorite(currentRow) : false
  const isFavoriteLoading = currentRow ? favoriteState.isFavoriteLoading(currentRow) : false

  // H5 封面视图的「两行歌词入口」：当前行 + 相邻行，点击进入歌词视图。
  const lyricTeaser = useMemo<string[]>(() => {
    if (lrcLines.length) {
      const idx = activeLrcIndex >= 0 ? activeLrcIndex : 0
      const first = lrcLines[idx]?.text || ''
      const second = lrcLines[idx + 1]?.text || lrcLines[idx - 1]?.text || ''
      return [first, second].filter(Boolean)
    }
    return (lyricPlainText || '').split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 2)
  }, [lrcLines, activeLrcIndex, lyricPlainText])

  const switchQuality = useCallback(
    (quality: MusicQuality) => {
      setPreferredQuality(quality)
      if (currentRow) void playSong(currentRow, quality)
    },
    [currentRow, playSong, setPreferredQuality],
  )

  const toggleCurrentFavorite = useCallback(() => {
    if (!currentRow || isFavoriteLoading) return
    void favoriteState.toggleFavorite(currentRow)
  }, [currentRow, favoriteState, isFavoriteLoading])

  const changeGlow = useCallback((level: GlowLevel) => {
    setGlowLevel(level)
    writeGlowLevel(level)
  }, [])

  // Lock the page behind the player and wire global shortcuts. The bar itself is
  // unmounted on this route, so these handlers are the only ones active here.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false
      if (target.isContentEditable) return true
      const tag = target.tagName
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        !!target.closest('button,a,[role=button],[role=slider],[role=switch]')
      )
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        // antd Popover 在 Esc 时会先更新受控 state、再进入退场动画，
        // 此时读 React state 已不可靠；关闭后它还会保留带
        // .ant-popover-hidden 的隐藏节点。因此只认「当前可见」的浮层，
        // 既避免误退出播放页，也保证浮层关掉后 Esc 能正常返回。
        const hasVisibleOverlay = Array.from(
          document.querySelectorAll(
            '.now-queue-drawer, .ant-popover, .ant-modal, .ant-drawer',
          ),
        ).some((el) => {
          if (el.classList.contains('ant-popover-hidden')) return false
          const style = window.getComputedStyle(el)
          return style.display !== 'none' && style.visibility !== 'hidden'
        })
        if (hasVisibleOverlay) {
          setQueueOpen(false)
          setQualityOpen(false)
          setAuroraOpen(false)
          return
        }
        close()
        return
      }
      if (event.defaultPrevented) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isEditableTarget(event.target)) return

      switch (event.key) {
        case ' ':
        case 'Spacebar':
          event.preventDefault()
          togglePlay()
          break
        case 'ArrowLeft':
          if (!duration) return
          event.preventDefault()
          seekToTime(currentTimeRef.current - 5)
          break
        case 'ArrowRight':
          if (!duration) return
          event.preventDefault()
          seekToTime(currentTimeRef.current + 5)
          break
        case 'ArrowUp':
          event.preventDefault()
          setVolume(Math.min(1, (muted ? 0 : volume) + 0.05))
          break
        case 'ArrowDown':
          event.preventDefault()
          setVolume(Math.max(0, (muted ? 0 : volume) - 0.05))
          break
        case 'm':
        case 'M':
          event.preventDefault()
          toggleMuted()
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [
    close,
    duration,
    muted,
    seekToTime,
    setVolume,
    togglePlay,
    toggleMuted,
    volume,
  ])

  // 封面取色 + 切歌交叉淡化：沿用 --now-cover-opacity / now-cover-fade 机制，
  // 只是把「模糊大图」换成低分辨率 CSS 渐光晕。取色来自小缩略图（共用浏览器
  // 缓存，不重复请求大图），失败时平滑降级为空光晕，绝不影响播放。
  useEffect(() => {
    let mounted = true

    const apply = (palette: AuroraPalette | null) => {
      if (!mounted) return
      const previous = auroraCurrentRef.current
      setAuroraPrevious(previous === palette ? null : previous)
      auroraCurrentRef.current = palette
      setDominantColor(palette ? palette.dominant : null)
      setAuroraCurrent(palette)
      // 递增 key 让 is-current/is-previous 图层重新挂载，重放淡入/淡出动画。
      setAuroraSeq((seq) => seq + 1)
      if (crossfadeTimerRef.current !== null) {
        window.clearTimeout(crossfadeTimerRef.current)
        crossfadeTimerRef.current = null
      }
      if (previous) {
        crossfadeTimerRef.current = window.setTimeout(() => {
          if (mounted) setAuroraPrevious(null)
          crossfadeTimerRef.current = null
        }, 540)
      }
    }

    if (!coverSampleUrl) {
      apply(null)
      return () => {
        mounted = false
      }
    }
    extractAurora(coverSampleUrl).then(apply).catch(() => apply(null))
    return () => {
      mounted = false
    }
  }, [coverSampleUrl])

  useEffect(() => {
    return () => {
      if (crossfadeTimerRef.current !== null) {
        window.clearTimeout(crossfadeTimerRef.current)
      }
    }
  }, [])

  // 页面切后台时停止装饰动画；回到前台恢复。
  useEffect(() => {
    const onVisibility = () => setPageVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // 系统「减少动态效果」偏好，完全降级装饰动画。
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return
    const onChange = () => setReducedMotion(query.matches)
    query.addEventListener?.('change', onChange)
    return () => query.removeEventListener?.('change', onChange)
  }, [])

  // Keep the active lyric line centred without restarting the smooth scroll on
  // every timeupdate. Only the intro falls back to the first line.
  useEffect(() => {
    const container = lyricScrollRef.current
    if (!container || mobileTab === 'cover') return

    const centerLine = (line: HTMLElement) => {
      const containerRect = container.getBoundingClientRect()
      const lineRect = line.getBoundingClientRect()
      const delta =
        lineRect.top + lineRect.height / 2 -
        (containerRect.top + containerRect.height / 2)
      if (Math.abs(delta) < 8) return
      container.scrollTo({ top: container.scrollTop + delta, behavior: 'smooth' })
    }

    const isIntro = currentTimeRef.current < (lrcLines[0]?.time ?? 0)
    if (activeLrcIndex < 0) {
      if (!isIntro) return
      const firstLine = container.querySelector<HTMLElement>('[data-lrc-idx="0"]')
      if (firstLine) centerLine(firstLine)
      else container.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    const activeLine = container.querySelector<HTMLElement>(
      `[data-lrc-idx="${activeLrcIndex}"]`,
    )
    if (activeLine) centerLine(activeLine)
  }, [activeLrcIndex, lrcLines, mobileTab])

  if (!current) return <Navigate to="/music" replace />

  const progressPct = duration ? Math.min(100, (currentTime / duration) * 100) : 0
  const volumePct = muted ? 0 : volume * 100
  const playModeMeta = getPlayModeMeta(playMode)
  const PlayModeIcon = playModeMeta.icon
  const progressValueText = `${formatDuration(
    Math.min(currentTime, duration || currentTime),
  )} / ${formatDuration(duration)}`
  // 装饰动效主开关：用户关闭动效 / 系统减少动效 / 页面切后台时全部停止。
  const animated = appearance.motion && !reducedMotion && pageVisible
  const glowStyle = {
    ...(dominantColor ? { '--now-glow': dominantColor } : {}),
    ...(auroraCurrent
      ? {
          '--aurora-a': auroraCurrent.a,
          '--aurora-b': auroraCurrent.b,
          '--aurora-c': auroraCurrent.c,
        }
      : {}),
    '--aurora-intensity': GLOW_INTENSITY[glowLevel],
  } as CSSProperties

  const updateProgressHover = (clientX: number, target: HTMLDivElement) => {
    if (!duration) return
    const rect = target.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    setProgressHover({ ratio, time: ratio * duration })
  }

  const qualityMenu = (
    <div className="now-quality-menu">
      {availableQualities.map((item) => (
        <button
          key={item.value}
          type="button"
          className={`now-quality-menu__item${preferredQuality === item.value ? ' is-active' : ''}`}
          disabled={playLoading}
          onClick={() => {
            if (preferredQuality !== item.value) switchQuality(item.value)
            setQualityOpen(false)
          }}
        >
          <span>{item.label}</span>
          {preferredQuality === item.value && <span>当前</span>}
        </button>
      ))}
    </div>
  )

  const auroraSettings = (
    <div className="now-aurora-settings">
      <div className="now-aurora-settings__head">
        <Sparkles size={15} />
        <span>Aurora Live · 极光现场</span>
      </div>
      <div className="now-aurora-settings__group">
        <span className="now-aurora-settings__label">环境光强度</span>
        <div className="now-aurora-settings__seg" role="group" aria-label="环境光强度">
          {GLOW_OPTIONS.map((opt) => (
            <button
              key={opt.level}
              type="button"
              className={glowLevel === opt.level ? 'is-active' : ''}
              aria-pressed={glowLevel === opt.level}
              onClick={() => changeGlow(opt.level)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={!appearance.motion}
        className="now-aurora-settings__toggle"
        onClick={() => appearance.setMotion(!appearance.motion)}
      >
        <span className="now-aurora-settings__toggle-copy">
          关闭动效
          <small>封面呼吸 / 极光漂移 / 切歌转场</small>
        </span>
        <span
          className={`now-aurora-settings__switch${appearance.motion ? '' : ' is-on'}`}
          aria-hidden="true"
        >
          <span className="now-aurora-settings__switch-thumb" />
        </span>
      </button>
      {lowPower && (
        <p className="now-aurora-settings__note">
          已按设备性能自动降低装饰动效，播放不受影响。
        </p>
      )}
    </div>
  )

  const renderProgress = (className = '') => (
    <div className={`now-progress ${className}`}>
      <span className="now-progress__time">{formatDuration(currentTime)}</span>
      <div
        className="now-progress__track"
        onPointerMove={(event) => updateProgressHover(event.clientX, event.currentTarget)}
        onPointerDown={(event) => updateProgressHover(event.clientX, event.currentTarget)}
        onPointerLeave={() => setProgressHover(null)}
        onPointerCancel={() => setProgressHover(null)}
      >
        <input
          className="now-range now-range--progress"
          type="range"
          min={0}
          max={Math.max(duration, 0.01)}
          step={0.1}
          value={Math.min(currentTime, duration || currentTime)}
          onChange={(event) => seekToTime(Number(event.target.value))}
          style={{ '--progress': `${progressPct}%` } as CSSProperties}
          aria-label="播放进度"
          aria-valuetext={progressValueText}
        />
        {progressHover && (
          <span
            className="now-progress__bubble"
            style={{ left: `${progressHover.ratio * 100}%` }}
            aria-hidden="true"
          >
            {formatDuration(progressHover.time)}
          </span>
        )}
      </div>
      <span className="now-progress__time now-progress__time--right">
        {formatDuration(duration)}
      </span>
    </div>
  )

  const renderControls = () => (
    <div className="now-controls">
      <button
        type="button"
        className={`now-ctrl${playMode !== 'sequence' ? ' is-active' : ''}`}
        onClick={cyclePlayMode}
        aria-label={`播放模式：${playModeMeta.label}，点击切换`}
        title={`播放模式：${playModeMeta.label}`}
      >
        <PlayModeIcon size={18} />
      </button>
      <button
        type="button"
        className="now-ctrl"
        disabled={!canPrev}
        onClick={playPrev}
        aria-label="上一首"
        title="上一首"
      >
        <SkipBack size={21} />
      </button>
      <button
        type="button"
        className="now-ctrl now-ctrl--primary"
        disabled={!!unsupportedFormat || playLoading}
        onClick={togglePlay}
        aria-label={isPlaying ? '暂停' : '播放'}
        title={isPlaying ? '暂停' : '播放'}
      >
        {playLoading ? (
          <Loader2 size={23} className="now-ctrl__spinner" />
        ) : isPlaying ? (
          <Pause size={23} />
        ) : (
          <Play size={23} style={{ marginLeft: 2 }} />
        )}
      </button>
      <button
        type="button"
        className="now-ctrl"
        disabled={!canNext}
        onClick={playNext}
        aria-label="下一首"
        title="下一首"
      >
        <SkipForward size={21} />
      </button>
      <button
        type="button"
        className={`now-ctrl now-ctrl--queue${queueOpen ? ' is-active' : ''}`}
        onClick={() => setQueueOpen(true)}
        aria-label={`待播队列，共 ${queueItems.length} 首`}
        title="待播队列"
      >
        <ListMusic size={18} />
      </button>
    </div>
  )

  const renderLyrics = () => (
    <div className="now-lyrics" ref={lyricScrollRef}>
      {lrcLines.length === 0 ? (
        lyricPlainText ? (
          <pre className="now-lyrics__plain">{lyricPlainText}</pre>
        ) : (
          <div className="now-lyrics__empty">
            {lyricLoading ? '正在加载歌词…' : lyricError || '暂无歌词'}
            {!lyricLoading && (
              <button type="button" className="music-inline-link" onClick={retryLyrics}>
                重新加载
              </button>
            )}
          </div>
        )
      ) : (
        <>
          <div className="now-lyrics__spacer" aria-hidden="true" />
          {lrcLines.map((line, index) => {
            const noActive = activeLrcIndex < 0
            const isIntro = noActive && currentTime < (lrcLines[0]?.time ?? 0)
            const distance = noActive ? 0 : Math.abs(index - activeLrcIndex)
            const lineClass = [
              'now-lyrics__line',
              index === activeLrcIndex ? 'is-active' : '',
              isIntro && index === 0 ? 'is-upcoming' : '',
              distance === 1 ? 'is-near' : '',
              distance >= 2 && distance <= 3 ? 'is-mid' : '',
              distance >= 4 ? 'is-far' : '',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <div
                key={index}
                data-lrc-idx={index}
                className={lineClass}
                onClick={() => seekToTime(line.time)}
                role="button"
                tabIndex={0}
                aria-label={`跳转到 ${formatDuration(line.time)} ${line.text || '歌词位置'}`}
                title={`跳转到 ${formatDuration(line.time)}`}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    seekToTime(line.time)
                    event.preventDefault()
                  }
                }}
              >
                <span className="now-lyrics__text">
                  <MusicLyricText
                    line={line}
                    time={currentTime}
                    active={index === activeLrcIndex}
                  />
                </span>
                <span className="now-lyrics__jump" aria-hidden="true">
                  <Play size={12} />
                </span>
              </div>
            )
          })}
          <div className="now-lyrics__spacer" aria-hidden="true" />
        </>
      )}
    </div>
  )

  const renderQueueList = () => (
    <div className="now-queue-list">
      {queueItems.length === 0 ? (
        <div className="now-lyrics__empty">暂无播放列表</div>
      ) : (
        queueItems.map((item, index) => (
          <button
            key={`${item.source}:${item.id}:${index}`}
            type="button"
            className={`now-queue-item${index === activeQueueIndex ? ' is-active' : ''}`}
            onClick={() => {
              if (playlist.length) void playFromQueue(index)
              else void playSong(item, preferredQuality)
            }}
            aria-label={`播放 ${item.name || '未知歌曲'}`}
          >
            <span className="now-queue-item__index">
              {String(index + 1).padStart(2, '0')}
            </span>
            <MusicCover src={item.coverUrl} size={36} rounded={6} loading="lazy" />
            <span className="now-queue-item__copy">
              <strong>{item.name || '未知歌曲'}</strong>
              <small>{item.artist || '未知歌手'}{item.album ? ` · ${item.album}` : ''}</small>
            </span>
            {index === activeQueueIndex && (
              <span className="now-queue-item__pill">{isPlaying ? '播放中' : '已暂停'}</span>
            )}
          </button>
        ))
      )}
    </div>
  )

  const onStageTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    touchStartXRef.current = event.touches[0]?.clientX ?? null
  }
  const onStageTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStartXRef.current
    touchStartXRef.current = null
    if (start === null) return
    const delta = (event.changedTouches[0]?.clientX ?? start) - start
    if (Math.abs(delta) < 50) return
    setMobileTab(delta > 0 ? 'cover' : 'lyrics')
  }

  return (
    <div
      className="now-page"
      style={glowStyle}
      data-aurora-anim={animated ? 'on' : 'off'}
      data-aurora-low={lowPower ? 'true' : 'false'}
      data-aurora-glow={glowLevel}
      role="dialog"
      aria-modal="true"
      aria-label="正在播放"
    >
      <div className="now-page__ambient" aria-hidden="true">
        <div className="now-aurora__field">
          {auroraPrevious && (
            <div
              key={`prev-${auroraSeq}`}
              className="now-aurora__layer is-previous"
              style={auroraLayerStyle(auroraPrevious)}
            />
          )}
          {auroraCurrent && (
            <div
              key={`cur-${auroraSeq}`}
              className="now-aurora__layer is-current"
              style={auroraLayerStyle(auroraCurrent)}
            />
          )}
        </div>
      </div>

      <div className="now-page__shell">
        <header className="now-topbar">
          <div className="now-topbar__grabber" aria-hidden="true" />
          <button
            type="button"
            className="now-topbar__btn now-topbar__btn--back"
            onClick={close}
            aria-label="收起播放器"
            title="收起播放器"
          >
            <ChevronDown size={19} />
            <span>收起</span>
          </button>
          <div className="now-topbar__center">
            <span className="now-topbar__eyebrow">正在播放</span>
            <span className="now-topbar__source">
              {sourceLabel(current.actualSource || current.source)} · {current.actualQuality || current.requestedQuality}
            </span>
          </div>
          <div className="now-topbar__right">
            <Popover
              trigger="click"
              placement="bottomRight"
              overlayClassName="now-popover"
              content={qualityMenu}
              open={qualityOpen}
              onOpenChange={setQualityOpen}
            >
              <button
                type="button"
                className={`now-topbar__btn${qualityOpen ? ' is-active' : ''}`}
                aria-label={`音质切换，当前 ${current.actualQuality || preferredQuality}`}
                title="音质切换"
              >
                <AudioLines size={16} />
                <span>{current.actualQuality || preferredQuality}</span>
              </button>
            </Popover>
            <Popover
              trigger="click"
              placement="bottomRight"
              overlayClassName="now-aurora-popover"
              content={auroraSettings}
              open={auroraOpen}
              onOpenChange={setAuroraOpen}
            >
              <button
                type="button"
                className={`now-topbar__btn now-topbar__btn--icon${auroraOpen ? ' is-active' : ''}`}
                aria-label="极光视觉设置"
                title="极光视觉设置"
              >
                <SlidersHorizontal size={16} />
              </button>
            </Popover>
            <button
              type="button"
              className="now-topbar__btn now-topbar__btn--icon"
              onClick={close}
              aria-label="关闭播放器"
              title="关闭"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="now-mobile-tabs" role="tablist" aria-label="播放页视图">
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === 'cover'}
            className={mobileTab === 'cover' ? 'is-active' : ''}
            onClick={() => setMobileTab('cover')}
          >
            封面
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === 'lyrics'}
            className={mobileTab === 'lyrics' ? 'is-active' : ''}
            onClick={() => setMobileTab('lyrics')}
          >
            歌词
          </button>
        </div>

        <div
          className={`now-main is-${mobileTab}`}
          onTouchStart={onStageTouchStart}
          onTouchEnd={onStageTouchEnd}
        >
          <section className="now-cover-panel" aria-label="歌曲信息">
            <div className="now-cover-panel__inner">
              <div className="now-stage">
                <div className={`now-cover${isPlaying ? ' is-playing' : ''}`}>
                  <MusicCover src={current.coverUrl} size={480} rounded={18} loading="eager" />
                </div>
              </div>
              <h1 className="now-cover-panel__title" title={current.name}>
                {current.name || '未知歌曲'}
              </h1>
              <div className="now-cover-panel__artist" title={current.artist}>
                <button
                  type="button"
                  className="music-inline-link"
                  onClick={() => openArtist(current.source, current.artistId, current.artist || '')}
                >
                  {current.artist || '未知歌手'}
                </button>
                {current.album ? ` · ${current.album}` : ''}
              </div>
              {lyricTeaser.length > 0 && (
                <button
                  type="button"
                  className="now-lyric-teaser"
                  onClick={() => setMobileTab('lyrics')}
                  aria-label="查看完整歌词"
                >
                  {lyricTeaser.map((line, index) => (
                    <span key={index} className={index === 0 ? 'is-current' : ''}>
                      {line}
                    </span>
                  ))}
                </button>
              )}
              <div className="now-cover-panel__badges">
                <span>{current.actualQuality || current.requestedQuality}</span>
                <span>{sourceLabel(current.actualSource || current.source)}</span>
                {current.fromCache && <span>缓存</span>}
                {unsupportedFormat && <span>{unsupportedFormat}</span>}
              </div>
              <div className="now-cover-panel__actions">
                <button
                  type="button"
                  className={`now-chip${isCurrentFavorite ? ' is-active' : ''}`}
                  disabled={!currentRow || isFavoriteLoading}
                  onClick={toggleCurrentFavorite}
                  aria-label={isCurrentFavorite ? '取消喜欢当前歌曲' : '喜欢当前歌曲'}
                >
                  <Heart size={16} fill={isCurrentFavorite ? 'currentColor' : 'none'} />
                  {isCurrentFavorite ? '已喜欢' : '喜欢'}
                </button>
                <button
                  type="button"
                  className="now-chip"
                  onClick={() => setQueueOpen(true)}
                  aria-label="查看待播队列"
                >
                  <ListMusic size={16} />
                  待播 {Math.max(queueItems.length - 1, 0)}
                </button>
              </div>
            </div>
          </section>

          <section className="now-lyrics-panel" aria-label="歌词">
            <div className="now-lyrics-panel__head">
              <span className="now-lyrics-panel__tab is-active">歌词</span>
              <div className="now-lyrics-panel__tools">
                <MusicLyricsSettings />
              </div>
            </div>
            {renderLyrics()}
          </section>

          <aside className="now-upnext" aria-label="接下来播放">
            <div className="now-upnext__head">
              <h2>接下来播放</h2>
              <span>共 {queueItems.length} 首</span>
            </div>
            {renderQueueList()}
            <p className="now-upnext__hint">点击歌曲即可切换 · 队列管理在音乐页</p>
          </aside>
        </div>

        <footer className="now-footer">
          <div className="now-footer__meta">
            <MusicCover src={current.coverUrl} size={46} rounded={9} loading="eager" />
            <div className="now-footer__copy">
              <strong title={current.name}>{current.name || '未知歌曲'}</strong>
              <span title={current.artist}>{current.artist || '未知歌手'}</span>
            </div>
          </div>

          <div className="now-footer__center">
            {renderControls()}
            {renderProgress('now-progress--desktop')}
          </div>

          <div className="now-footer__tools">
            <button
              type="button"
              className={`now-ctrl${isCurrentFavorite ? ' is-active' : ''}`}
              disabled={!currentRow || isFavoriteLoading}
              onClick={toggleCurrentFavorite}
              aria-label={isCurrentFavorite ? '取消喜欢当前歌曲' : '喜欢当前歌曲'}
              title="喜欢"
            >
              <Heart size={17} fill={isCurrentFavorite ? 'currentColor' : 'none'} />
            </button>
            <button
              type="button"
              className="now-ctrl"
              onClick={toggleMuted}
              aria-label={muted ? '取消静音' : '静音'}
              title={muted ? '取消静音' : '静音'}
            >
              {muted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
            </button>
            <input
              className="now-range now-range--volume"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              onChange={(event) => setVolume(Number(event.target.value))}
              style={{ '--progress': `${volumePct}%` } as CSSProperties}
              aria-label="音量"
            />
          </div>
        </footer>

      </div>

      {queueOpen && (
        <div className="now-queue-drawer" role="dialog" aria-modal="true" aria-label="待播队列">
          <div className="now-queue-drawer__backdrop" onClick={() => setQueueOpen(false)} />
          <div className="now-queue-drawer__sheet">
            <div className="now-queue-drawer__grabber" aria-hidden="true" />
            <div className="now-queue-drawer__head">
              <div>
                <h2>待播队列</h2>
                <span>共 {queueItems.length} 首 · 点击切换歌曲</span>
              </div>
              <button
                type="button"
                className="now-topbar__btn now-topbar__btn--icon"
                onClick={() => setQueueOpen(false)}
                aria-label="关闭待播队列"
              >
                <X size={18} />
              </button>
            </div>
            <div className="now-queue-drawer__body">{renderQueueList()}</div>
          </div>
        </div>
      )}
    </div>
  )
}
