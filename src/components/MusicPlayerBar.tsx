import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import {
  AudioLines,
  ChevronDown,
  ListMusic,
  Loader2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { Popover } from 'antd'
import { FastAverageColor } from 'fast-average-color'
import type { MusicQuality, SongSearchItem } from '../types'
import MusicCover from './MusicCover'
import { useMusicPlayer } from '../context/MusicPlayerContext'
import { useActiveLyric } from '../hooks/useActiveLyric'
import { formatDuration, normalizeCoverUrl } from '../utils/musicPlayer'

const fac = new FastAverageColor()

const QUALITY_OPTIONS: Array<{ value: MusicQuality; label: string }> = [
  { value: '128k', label: '128K' },
  { value: '320k', label: '320K' },
  { value: 'flac', label: 'FLAC' },
  { value: 'flac24bit', label: 'Hi-Res' },
]

type FullscreenTab = 'lyrics' | 'queue'

function sourceLabel(source: 'qq' | 'netease' | 'kuwo') {
  switch (source) {
    case 'qq':
      return 'QQ 音乐'
    case 'netease':
      return '网易云'
    case 'kuwo':
      return '酷我'
  }
}

export default function MusicPlayerBar() {
  const [seeking, setSeeking] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [fullscreenTab, setFullscreenTab] = useState<FullscreenTab>('lyrics')
  const [queuePopoverOpen, setQueuePopoverOpen] = useState(false)
  const [qualityPopoverOpen, setQualityPopoverOpen] = useState(false)
  const [progressPreview, setProgressPreview] = useState<{
    track: 'bar' | 'fullscreen'
    pct: number
    sec: number
  } | null>(null)
  const barWrapRef = useRef<HTMLDivElement | null>(null)
  const lyricScrollRef = useRef<HTMLDivElement | null>(null)
  const queueScrollRef = useRef<HTMLDivElement | null>(null)
  const [dominantColor, setDominantColor] = useState<string | null>(null)

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
    canPrev,
    canNext,
    playSong,
    togglePlay,
    playPrev,
    playNext,
    seekToTime,
    setPreferredQuality,
    setVolume,
    toggleMuted,
    playFromQueue,
  } = useMusicPlayer()

  const getSeekPreview = useCallback(
    (clientX: number, element: HTMLDivElement) => {
      if (!duration) return null
      const rect = element.getBoundingClientRect()
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      return {
        pct: ratio * 100,
        sec: ratio * duration,
      }
    },
    [duration],
  )

  const seekTo = useCallback(
    (clientX: number, element: HTMLDivElement) => {
      const preview = getSeekPreview(clientX, element)
      if (!preview) return
      seekToTime(preview.sec)
    },
    [getSeekPreview, seekToTime],
  )

  const getVolumeRatio = useCallback((clientX: number, element: HTMLDivElement) => {
    const rect = element.getBoundingClientRect()
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }, [])

  const applyVolumeFromPointer = useCallback(
    (clientX: number, element: HTMLDivElement) => {
      setVolume(getVolumeRatio(clientX, element))
    },
    [getVolumeRatio, setVolume],
  )

  const { lines: lrcLines, activeIndex: activeLrcIndex } = useActiveLyric(
    current?.lyric?.lineLyrics,
    currentTime,
  )

  const activeLyricText = useMemo(() => {
    if (activeLrcIndex >= 0) {
      return lrcLines[activeLrcIndex]?.text || ''
    }
    return ''
  }, [activeLrcIndex, lrcLines])

  const currentRow = useMemo<SongSearchItem | null>(() => {
    if (!current) return null
    if (currentIndex >= 0 && playlist[currentIndex]) {
      return playlist[currentIndex]
    }

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
    ? QUALITY_OPTIONS.filter((item) => currentRow.availableQualities.includes(item.value))
    : QUALITY_OPTIONS

  const queueItems = useMemo(() => {
    if (playlist.length) return playlist
    return currentRow ? [currentRow] : []
  }, [currentRow, playlist])

  const activeQueueIndex = playlist.length ? currentIndex : queueItems.length ? 0 : -1

  const switchQuality = useCallback(
    (quality: MusicQuality) => {
      setPreferredQuality(quality)
      if (!currentRow) return
      void playSong(currentRow, quality)
    },
    [currentRow, playSong, setPreferredQuality],
  )

  useEffect(() => {
    if (!seeking) return
    const previousUserSelect = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    return () => {
      document.body.style.userSelect = previousUserSelect
    }
  }, [seeking])

  useEffect(() => {
    if (!current) return

    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false
      if (target.isContentEditable) return true
      const tag = target.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
    }

    const onKeyDown = (event: KeyboardEvent) => {
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
          seekToTime(currentTime - 5)
          break
        case 'ArrowRight':
          if (!duration) return
          event.preventDefault()
          seekToTime(currentTime + 5)
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
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    current,
    currentTime,
    duration,
    muted,
    seekToTime,
    setVolume,
    togglePlay,
    toggleMuted,
    volume,
  ])

  useEffect(() => {
    if (!expanded) return

    const previousOverflow = document.body.style.overflow
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false)
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [expanded])

  useEffect(() => {
    if (expanded) return
    setQueuePopoverOpen(false)
    setQualityPopoverOpen(false)
  }, [expanded])

  useEffect(() => {
    const root = document.documentElement
    if (!current) {
      root.style.removeProperty('--music-player-safe-space-runtime')
      return
    }

    const node = barWrapRef.current
    if (!node) {
      root.style.removeProperty('--music-player-safe-space-runtime')
      return
    }

    const updateSafeSpace = () => {
      const height = node.offsetHeight + 24
      root.style.setProperty('--music-player-safe-space-runtime', `${height}px`)
    }

    updateSafeSpace()

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateSafeSpace)
      observer.observe(node)
      return () => {
        observer.disconnect()
        root.style.removeProperty('--music-player-safe-space-runtime')
      }
    }

    window.addEventListener('resize', updateSafeSpace)
    return () => {
      window.removeEventListener('resize', updateSafeSpace)
      root.style.removeProperty('--music-player-safe-space-runtime')
    }
  }, [current])

  useEffect(() => {
    if (!expanded) return
    const container = lyricScrollRef.current
    if (!container || activeLrcIndex < 0) return

    const activeLine = container.querySelector<HTMLElement>(
      `[data-lrc-idx="${activeLrcIndex}"]`,
    )
    if (!activeLine) return

    const top =
      activeLine.offsetTop - container.clientHeight / 2 + activeLine.clientHeight / 2
    container.scrollTo({ top, behavior: 'smooth' })
  }, [activeLrcIndex, expanded])

  useEffect(() => {
    if (!expanded || !queuePopoverOpen) return
    const container = queueScrollRef.current
    if (!container || activeQueueIndex < 0) return

    const activeItem = container.querySelector<HTMLElement>(
      `[data-player-queue-idx="${activeQueueIndex}"]`,
    )
    if (!activeItem) return

    const top =
      activeItem.offsetTop - container.clientHeight / 2 + activeItem.clientHeight / 2
    container.scrollTo({ top, behavior: 'smooth' })
  }, [activeQueueIndex, expanded, queuePopoverOpen])

  useEffect(() => {
    const url = normalizeCoverUrl(current?.coverUrl)
    if (!url) {
      setDominantColor(null)
      return
    }

    let isMounted = true
    fac
      .getColorAsync(url, { algorithm: 'dominant', crossOrigin: 'anonymous' })
      .then((color) => {
        if (isMounted) {
          setDominantColor(color.value.slice(0, 3).join(', '))
        }
      })
      .catch(() => {
        if (isMounted) setDominantColor(null)
      })

    return () => {
      isMounted = false
    }
  }, [current?.coverUrl])

  if (!current) return null

  const progressPct = duration ? Math.min(100, (currentTime / duration) * 100) : 0
  const volumePct = muted ? 0 : volume * 100
  const coverUrl = normalizeCoverUrl(current.coverUrl)
  const openFullscreen = (target: 'lyrics' | 'queue' = 'lyrics') => {
    setFullscreenTab('lyrics')
    setQualityPopoverOpen(false)
    setQueuePopoverOpen(target === 'queue')
    setExpanded(true)
  }

  const qualityPopoverContent = (
    <div className="music-player-fullscreen__popover-menu music-player-fullscreen__popover-menu--quality">
      {availableQualities.map((item) => (
        <button
          key={item.value}
          type="button"
          className={`music-player-fullscreen__popover-option${
            preferredQuality === item.value ? ' is-active' : ''
          }`}
          disabled={playLoading}
          onClick={() => {
            if (preferredQuality !== item.value) {
              switchQuality(item.value)
            }
            setQualityPopoverOpen(false)
          }}
        >
          <span>{item.label}</span>
          {preferredQuality === item.value && <span>当前</span>}
        </button>
      ))}
    </div>
  )

  const queuePopoverContent = (
    <div className="music-player-fullscreen__popover-menu music-player-fullscreen__popover-menu--queue">
      <div className="music-player-fullscreen__popover-head">
        <span>播放列表</span>
        <span>{queueItems.length} 首</span>
      </div>
      <div
        ref={queueScrollRef}
        className="music-player-fullscreen__queue music-player-fullscreen__queue--popover"
      >
        {queueItems.length === 0 ? (
          <div className="music-player-fullscreen__lyrics-empty">暂无播放列表</div>
        ) : (
          queueItems.map((item, index) => (
            <button
              key={`${item.source}:${item.id}:${index}`}
              type="button"
              data-player-queue-idx={index}
              className={`music-player-fullscreen__queue-item${
                index === activeQueueIndex ? ' is-active' : ''
              }`}
              onClick={() => {
                if (playlist.length) {
                  void playFromQueue(index)
                } else {
                  void playSong(item, preferredQuality)
                }
                setQueuePopoverOpen(false)
              }}
            >
              <span className="music-player-fullscreen__queue-index">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="music-player-fullscreen__queue-copy">
                <span className="music-player-fullscreen__queue-title">
                  {item.name || '未知歌曲'}
                </span>
                <span className="music-player-fullscreen__queue-artist">
                  {item.artist || '未知歌手'}
                  {item.album ? ` 路 ${item.album}` : ''}
                </span>
              </span>
              {index === activeQueueIndex && (
                <span className="music-player-fullscreen__queue-pill">
                  {isPlaying ? 'Playing' : 'Paused'}
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  )

  const renderProgressTrack = (extraClass?: string) => (
    <div
      className={`progress-track ${seeking ? 'dragging' : ''}${
        extraClass ? ` ${extraClass}` : ''
      }`}
      onPointerEnter={(event) => {
        const preview = getSeekPreview(event.clientX, event.currentTarget)
        if (!preview) return
        setProgressPreview({
          track: extraClass === 'music-player-fullscreen__progress-track' ? 'fullscreen' : 'bar',
          ...preview,
        })
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        setSeeking(true)
        event.currentTarget.setPointerCapture(event.pointerId)
        const preview = getSeekPreview(event.clientX, event.currentTarget)
        if (preview) {
          setProgressPreview({
            track: extraClass === 'music-player-fullscreen__progress-track' ? 'fullscreen' : 'bar',
            ...preview,
          })
        }
        seekTo(event.clientX, event.currentTarget)
        event.preventDefault()
      }}
      onPointerMove={(event) => {
        const preview = getSeekPreview(event.clientX, event.currentTarget)
        if (preview) {
          setProgressPreview({
            track: extraClass === 'music-player-fullscreen__progress-track' ? 'fullscreen' : 'bar',
            ...preview,
          })
        }
        if (!seeking) return
        seekTo(event.clientX, event.currentTarget)
      }}
      onPointerUp={(event) => {
        if (!seeking) return
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
        setSeeking(false)
      }}
      onPointerLeave={() => {
        if (!seeking) setProgressPreview(null)
      }}
      onPointerCancel={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
        setSeeking(false)
        setProgressPreview(null)
      }}
      onKeyDown={(event) => {
        if (!duration) return
        if (event.key === 'ArrowLeft') {
          seekToTime(currentTime - 1)
          event.preventDefault()
        } else if (event.key === 'ArrowRight') {
          seekToTime(currentTime + 1)
          event.preventDefault()
        }
      }}
      role="slider"
      tabIndex={0}
      aria-label="播放进度"
      aria-valuemin={0}
      aria-valuemax={Math.max(duration, 0)}
      aria-valuenow={Math.min(currentTime, duration || currentTime)}
      style={{ '--progress': `${progressPct}%` } as CSSProperties}
    >
      {progressPreview &&
      progressPreview.track ===
        (extraClass === 'music-player-fullscreen__progress-track' ? 'fullscreen' : 'bar') ? (
        <div
          className="progress-track__preview"
          style={{ left: `${progressPreview.pct}%` }}
        >
          {formatDuration(progressPreview.sec)}
          <span>.{Math.floor((progressPreview.sec % 1) * 10)}</span>
        </div>
      ) : null}
      <div className="rail">
        <div className="fill" />
      </div>
      <div className="thumb" />
    </div>
  )

  const renderVolumeTrack = (extraClass?: string) => (
    <div
      className={`progress-track progress-track--volume${extraClass ? ` ${extraClass}` : ''}`}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.currentTarget.setPointerCapture(event.pointerId)
        applyVolumeFromPointer(event.clientX, event.currentTarget)
        event.preventDefault()
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
        applyVolumeFromPointer(event.clientX, event.currentTarget)
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
      }}
      onPointerCancel={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
          setVolume((muted ? 0 : volume) - 0.05)
          event.preventDefault()
        } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
          setVolume((muted ? 0 : volume) + 0.05)
          event.preventDefault()
        } else if (event.key === 'Home') {
          setVolume(0)
          event.preventDefault()
        } else if (event.key === 'End') {
          setVolume(1)
          event.preventDefault()
        }
      }}
      role="slider"
      tabIndex={0}
      aria-label="闊抽噺"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(volumePct)}
      aria-valuetext={`${Math.round(volumePct)}%`}
      style={{ '--progress': `${volumePct}%` } as CSSProperties}
    >
      <div className="rail">
        <div className="fill" />
      </div>
      <div className="thumb" />
    </div>
  )

  return (
    <>
      <div ref={barWrapRef} className="music-player-bar-wrap">
        <div
          className={`music-player-bar${isPlaying ? ' is-playing' : ''}${
            playLoading ? ' is-loading' : ''
          }`}
          style={dominantColor ? ({ '--dominant-rgb': dominantColor } as CSSProperties) : undefined}
        >
          <div className="music-player-bar__progress music-player-bar__progress--top">
            {renderProgressTrack('music-player-bar__progress-track')}
          </div>

          <div className="music-player-bar__meta">
            <button
              type="button"
              className={`music-player-bar__cover-button${isPlaying ? ' is-playing' : ''}`}
              onClick={() => openFullscreen('lyrics')}
              aria-label="打开全屏播放器"
              title="打开全屏播放器"
            >
              <MusicCover src={current.coverUrl} size={48} rounded={14} loading="eager" />
            </button>
            <div className="music-player-bar__text">
              <div
                className="music-player-bar__title"
                title={current.name}
              >
                <span className="music-player-bar__title-inner">
                  {current.name || '未知歌曲'}
                </span>
              </div>
              <div className="music-player-bar__artist" title={current.artist}>
                {current.artist || '未知歌手'}
                {current.album ? ` · ${current.album}` : ''}
              </div>
              <div className="music-player-bar__badges">
                <span>{current.actualQuality || current.requestedQuality}</span>
                <span>{sourceLabel(current.actualSource || current.source)}</span>
                {current.fromCache && <span>缓存</span>}
                {unsupportedFormat && <span>{unsupportedFormat}</span>}
              </div>
            </div>
          </div>

          <div className="music-player-bar__center">
            <div className="music-player-bar__controls">
              <button
                type="button"
                className="ctrl-btn"
                disabled={!canPrev}
                onClick={playPrev}
                aria-label="上一首"
                title="上一首"
              >
                <SkipBack size={18} />
              </button>
              <button
                type="button"
                className="ctrl-btn primary"
                disabled={!!unsupportedFormat || playLoading}
                onClick={togglePlay}
                aria-label={isPlaying ? '暂停' : '播放'}
                title={isPlaying ? '暂停' : '播放'}
              >
                {playLoading ? (
                  <Loader2 size={20} className="ctrl-btn__spinner" />
                ) : isPlaying ? (
                  <Pause size={20} />
                ) : (
                  <Play size={20} style={{ marginLeft: 2 }} />
                )}
              </button>
              <button
                type="button"
                className="ctrl-btn"
                disabled={!canNext}
                onClick={playNext}
                aria-label="下一首"
                title="下一首"
              >
                <SkipForward size={18} />
              </button>
            </div>
          </div>

          <div className="music-player-bar__aside">
            <button
              type="button"
              className={`ctrl-btn music-player-bar__icon-btn${
                expanded && queuePopoverOpen ? ' is-active' : ''
              }`}
              onClick={() => openFullscreen('queue')}
              aria-label="打开当前播放列表"
              title={`当前播放列表 (${queueItems.length})`}
            >
              <ListMusic size={16} />
              <span>{queueItems.length}</span>
            </button>
            <button
              type="button"
              className="ctrl-btn"
              onClick={toggleMuted}
              aria-label={muted ? '取消静音' : '静音'}
              title={muted ? '取消静音' : '静音'}
            >
              {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            {renderVolumeTrack('music-player-bar__volume-track')}
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              onChange={(event) => setVolume(Number(event.target.value))}
              style={{ '--vol': `${volumePct}%` } as CSSProperties}
              aria-label="音量"
            />
          </div>
        </div>
      </div>

      {expanded && (
        <div className="music-player-fullscreen" role="dialog" aria-modal="true">
          <div
            className="music-player-fullscreen__backdrop"
            onClick={() => setExpanded(false)}
          />
          <div
            className="music-player-fullscreen__shell"
            style={
              {
                ...(coverUrl ? { '--player-cover': `url("${coverUrl}")` } : {}),
                ...(dominantColor ? { '--dominant-rgb': dominantColor } : {}),
              } as CSSProperties
            }
          >
            <div className="music-player-fullscreen__topbar">
              <span className="player-kicker">Now Playing</span>
              <button
                type="button"
                className="music-player-fullscreen__close"
                onClick={() => setExpanded(false)}
                aria-label="关闭全屏播放器"
                title="关闭"
              >
                <ChevronDown size={18} />
              </button>
            </div>

            <div className="music-player-fullscreen__body">
              <section className="music-player-fullscreen__turntable-panel">
                <div className="music-player-fullscreen__turntable-stage">
                  <div className="music-player-fullscreen__needle-base" />
                  <div
                    className={`music-player-fullscreen__needle ${
                      isPlaying ? 'is-playing' : ''
                    }`}
                  />
                  <div
                    className={`music-player-fullscreen__disc ${
                      isPlaying ? 'is-playing' : ''
                    }`}
                  >
                    <div className="music-player-fullscreen__disc-groove" />
                    <div className="music-player-fullscreen__disc-core">
                      <MusicCover
                        src={current.coverUrl}
                        size={238}
                        rounded={999}
                        loading="eager"
                      />
                    </div>
                  </div>
                </div>

                <div className="music-player-fullscreen__turntable-copy">
                  <span className="player-kicker player-kicker--player">Black Vinyl</span>
                  <div className="music-player-fullscreen__turntable-note">
                    <span>{current.album || '当前播放'}</span>
                    <span>
                      {sourceLabel(current.actualSource || current.source)} ·{' '}
                      {current.actualQuality || current.requestedQuality}
                    </span>
                  </div>
                  {activeLyricText && (
                    <div className="music-player-fullscreen__turntable-lyric">
                      {activeLyricText}
                    </div>
                  )}
                </div>
              </section>

              <section className="music-player-fullscreen__lyrics-panel">
                <div className="music-player-fullscreen__hero">
                  <div className="music-player-fullscreen__hero-copy">
                    <div className="music-player-fullscreen__meta">
                      <div className="music-player-fullscreen__title" title={current.name}>
                        {current.name || '未知歌曲'}
                      </div>
                      <div className="music-player-fullscreen__artist" title={current.artist}>
                        {current.artist || '未知歌手'}
                        {current.album ? ` · ${current.album}` : ''}
                      </div>
                      <div className="music-player-fullscreen__badges">
                        <span>{current.actualQuality || current.requestedQuality}</span>
                        <span>{sourceLabel(current.actualSource || current.source)}</span>
                        {current.fromCache && <span>缓存</span>}
                        {unsupportedFormat && <span>{unsupportedFormat}</span>}
                      </div>
                    </div>
                  </div>

                </div>

                <div className="music-player-fullscreen__lyrics-head">
                  <div className="music-player-fullscreen__panel-tabs" role="tablist">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={fullscreenTab === 'lyrics'}
                      className={`music-player-fullscreen__panel-tab${
                        fullscreenTab === 'lyrics' ? ' is-active' : ''
                      }`}
                      onClick={() => setFullscreenTab('lyrics')}
                    >
                      歌词
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={fullscreenTab === 'queue'}
                      className={`music-player-fullscreen__panel-tab${
                        fullscreenTab === 'queue' ? ' is-active' : ''
                      }`}
                      onClick={() => setFullscreenTab('queue')}
                    >
                      列表 {queueItems.length}
                    </button>
                  </div>
                </div>

                {fullscreenTab === 'lyrics' ? (
                  <div className="music-player-fullscreen__lyrics-shell">
                    <div ref={lyricScrollRef} className="music-player-fullscreen__lyrics">
                      {lrcLines.length === 0 ? (
                        current.lyric?.lineLyrics ? (
                          <pre className="music-player-fullscreen__lyrics-plain">
                            {current.lyric.lineLyrics}
                          </pre>
                        ) : (
                          <div className="music-player-fullscreen__lyrics-empty">
                            暂无歌词
                          </div>
                        )
                      ) : (
                        lrcLines.map((line, index) => {
                          const distance =
                            activeLrcIndex >= 0 ? Math.abs(index - activeLrcIndex) : Infinity

                          return (
                            <div
                              key={index}
                              data-lrc-idx={index}
                              className={`music-player-fullscreen__lyrics-line ${
                                index === activeLrcIndex ? 'is-active' : ''
                              }${distance === 1 ? ' is-near' : ''}${
                                distance >= 2 && distance <= 3 ? ' is-mid' : ''
                              }${distance >= 4 ? ' is-far' : ''}`}
                              onClick={() => {
                                seekToTime(line.time)
                              }}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  seekToTime(line.time)
                                }
                              }}
                            >
                              {line.text || '\u00A0'}
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="music-player-fullscreen__queue-shell">
                    <div ref={queueScrollRef} className="music-player-fullscreen__queue">
                      {queueItems.length === 0 ? (
                        <div className="music-player-fullscreen__lyrics-empty">
                          暂无播放列表
                        </div>
                      ) : (
                        queueItems.map((item, index) => (
                          <button
                            key={`${item.source}:${item.id}:${index}`}
                            type="button"
                            data-player-queue-idx={index}
                            className={`music-player-fullscreen__queue-item${
                              index === activeQueueIndex ? ' is-active' : ''
                            }`}
                            onClick={() => {
                              if (playlist.length) {
                                void playFromQueue(index)
                                return
                              }
                              void playSong(item, preferredQuality)
                            }}
                          >
                            <span className="music-player-fullscreen__queue-index">
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            <span className="music-player-fullscreen__queue-copy">
                              <span className="music-player-fullscreen__queue-title">
                                {item.name || '未知歌曲'}
                              </span>
                              <span className="music-player-fullscreen__queue-artist">
                                {item.artist || '未知歌手'}
                                {item.album ? ` · ${item.album}` : ''}
                              </span>
                            </span>
                            {index === activeQueueIndex && (
                              <span className="music-player-fullscreen__queue-pill">
                                {isPlaying ? 'Playing' : 'Paused'}
                              </span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}

                <div className="music-player-fullscreen__footer">
                  <div className="music-player-fullscreen__progress">
                    <span className="time">{formatDuration(currentTime)}</span>
                    {renderProgressTrack('music-player-fullscreen__progress-track')}
                    <span className="time time-right">{formatDuration(duration)}</span>
                  </div>

                  <div className="music-player-fullscreen__actions-row">
                    <div className="music-player-fullscreen__controls">
                      <button
                        type="button"
                        className="ctrl-btn"
                        disabled={!canPrev}
                        onClick={playPrev}
                        aria-label="上一首"
                        title="上一首"
                      >
                        <SkipBack size={20} />
                      </button>
                      <button
                        type="button"
                        className="ctrl-btn primary"
                        disabled={!!unsupportedFormat || playLoading}
                        onClick={togglePlay}
                        aria-label={isPlaying ? '暂停' : '播放'}
                        title={isPlaying ? '暂停' : '播放'}
                      >
                        {playLoading ? (
                          <Loader2 size={22} className="ctrl-btn__spinner" />
                        ) : isPlaying ? (
                          <Pause size={22} />
                        ) : (
                          <Play size={22} style={{ marginLeft: 2 }} />
                        )}
                      </button>
                      <button
                        type="button"
                        className="ctrl-btn"
                        disabled={!canNext}
                        onClick={playNext}
                        aria-label="下一首"
                        title="下一首"
                      >
                        <SkipForward size={20} />
                      </button>
                    </div>

                    <div className="music-player-fullscreen__volume">
                      <Popover
                        trigger="click"
                        placement="top"
                        overlayClassName="music-player-fullscreen__popover"
                        content={qualityPopoverContent}
                        open={qualityPopoverOpen}
                        onOpenChange={(open) => {
                          setQualityPopoverOpen(open)
                          if (open) setQueuePopoverOpen(false)
                        }}
                      >
                        <button
                          type="button"
                          className={`ctrl-btn music-player-fullscreen__tool-trigger${
                            qualityPopoverOpen ? ' is-active' : ''
                          }`}
                          aria-label="音质切换"
                          title="音质切换"
                        >
                          <AudioLines size={16} />
                        </button>
                      </Popover>
                      <Popover
                        trigger="click"
                        placement="topRight"
                        overlayClassName="music-player-fullscreen__popover"
                        content={queuePopoverContent}
                        open={queuePopoverOpen}
                        onOpenChange={(open) => {
                          setQueuePopoverOpen(open)
                          if (open) setQualityPopoverOpen(false)
                        }}
                      >
                        <button
                          type="button"
                          className={`ctrl-btn music-player-fullscreen__tool-trigger music-player-fullscreen__tool-trigger--queue${
                            queuePopoverOpen ? ' is-active' : ''
                          }`}
                          aria-label={`播放列表，共 ${queueItems.length} 首`}
                          title={`播放列表 (${queueItems.length})`}
                        >
                          <ListMusic size={16} />
                          <span className="music-player-fullscreen__tool-badge">
                            {queueItems.length}
                          </span>
                        </button>
                      </Popover>
                      <button
                        type="button"
                        className="ctrl-btn"
                        onClick={toggleMuted}
                        aria-label={muted ? '取消静音' : '静音'}
                        title={muted ? '取消静音' : '静音'}
                      >
                        {muted || volume === 0 ? (
                          <VolumeX size={16} />
                        ) : (
                          <Volume2 size={16} />
                        )}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={muted ? 0 : volume}
                        onChange={(event) => setVolume(Number(event.target.value))}
                        style={{ '--vol': `${volumePct}%` } as CSSProperties}
                        aria-label="音量"
                      />
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
