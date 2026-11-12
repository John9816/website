import { sourceLabel } from '../features/music/sources'
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
  Captions,
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
  Volume2,
  VolumeX,
} from 'lucide-react'
import { Popover } from 'antd'
import { useNavigate } from 'react-router-dom'
import { FastAverageColor } from 'fast-average-color'
import type { MusicQuality, SongSearchItem } from '../types'
import MusicCover from './MusicCover'
import { useMusicPlayer, type PlayMode } from '../context/MusicPlayerContext'
import { useMusicFavorites } from '../hooks/useMusicFavorites'
import { coverUrlForSize, formatDuration } from '../utils/musicPlayer'

const fac = new FastAverageColor()

const QUALITY_OPTIONS: Array<{ value: MusicQuality; label: string }> = [
  { value: '128k', label: '128K' },
  { value: '320k', label: '320K' },
  { value: 'flac', label: 'FLAC' },
  { value: 'flac24bit', label: 'Hi-Res' },
]

function getPlayModeMeta(mode: PlayMode) {
  switch (mode) {
    case 'repeat-one':
      return {
        label: '单曲循环',
        icon: Repeat1,
      }
    case 'shuffle':
      return {
        label: '随机播放',
        icon: Shuffle,
      }
    default:
      return {
        label: '顺序播放',
        icon: Repeat,
      }
  }
}


export default function MusicPlayerBar({
  onToggleQueue,
  queueOpen = false,
}: {
  onToggleQueue?: () => void
  queueOpen?: boolean
}) {
  const [seeking, setSeeking] = useState(false)
  const [qualityPopoverOpen, setQualityPopoverOpen] = useState(false)
  const [progressPreview, setProgressPreview] = useState<{
    track: 'bar' | 'fullscreen'
    pct: number
    sec: number
  } | null>(null)
  const barWrapRef = useRef<HTMLDivElement | null>(null)
  const [dominantColor, setDominantColor] = useState<string | null>(null)
  const navigate = useNavigate()

  const {
    current,
    lyricPreview: activeLyricText,
    openArtist,
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
    playSong,
    togglePlay,
    playPrev,
    playNext,
    seekToTime,
    setPreferredQuality,
    setVolume,
    cyclePlayMode,
    toggleMuted,
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


  // Colour sampling only needs a few pixels; the fullscreen backdrop is blurred
  // 42px at 20% opacity, so a 400px CDN thumbnail is visually identical to the
  // multi-MB original. Both are ~40-100x smaller over the wire.
  const coverSampleUrl = useMemo(
    () => coverUrlForSize(current?.coverUrl, 48),
    [current?.coverUrl],
  )

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

  const favoriteSongs = useMemo(() => (currentRow ? [currentRow] : []), [currentRow])
  const favoriteState = useMusicFavorites(favoriteSongs)
  const isCurrentFavorite = currentRow ? favoriteState.isFavorite(currentRow) : false
  const isFavoriteLoading = currentRow ? favoriteState.isFavoriteLoading(currentRow) : false

  const switchQuality = useCallback(
    (quality: MusicQuality) => {
      setPreferredQuality(quality)
      if (!currentRow) return
      void playSong(currentRow, quality)
    },
    [currentRow, playSong, setPreferredQuality],
  )

  const toggleCurrentFavorite = useCallback(() => {
    if (!currentRow || isFavoriteLoading) return
    void favoriteState.toggleFavorite(currentRow)
  }, [currentRow, favoriteState, isFavoriteLoading])

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
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!target.closest('button,a,[role=button],[role=slider]')
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
    const url = coverSampleUrl
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
  }, [coverSampleUrl])

  if (!current) return null

  const progressPct = duration ? Math.min(100, (currentTime / duration) * 100) : 0
  const volumePct = muted ? 0 : volume * 100
  const playModeMeta = getPlayModeMeta(playMode)
  const PlayModeIcon = playModeMeta.icon
  const progressValueText = `${formatDuration(
    Math.min(currentTime, duration || currentTime),
  )} / ${formatDuration(duration)}`
  const openFullPlayer = () => {
    setQualityPopoverOpen(false)
    navigate('/music/now')
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
        } else if (event.key === 'Home') {
          seekToTime(0)
          event.preventDefault()
        } else if (event.key === 'End') {
          seekToTime(duration)
          event.preventDefault()
        }
      }}
      role="slider"
      tabIndex={0}
      aria-label="播放进度"
      aria-valuemin={0}
      aria-valuemax={Math.max(duration, 0)}
      aria-valuenow={Math.min(currentTime, duration || currentTime)}
      aria-valuetext={progressValueText}
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
      aria-label="音量"
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
            <span className="time music-player-bar__progress-time">
              {formatDuration(currentTime)}
            </span>
            {renderProgressTrack('music-player-bar__progress-track')}
            <span className="time time-right music-player-bar__progress-time">
              {formatDuration(duration)}
            </span>
          </div>

          <div className="music-player-bar__meta">
            <button
              type="button"
              className={`music-player-bar__cover-button${isPlaying ? ' is-playing' : ''}`}
              onClick={openFullPlayer}
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
                <button type="button" className="music-inline-link" onClick={() => openArtist(current.source,current.artistId,current.artist || '')}>{current.artist || '未知歌手'}</button>
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

          <button
            type="button"
            className={`music-player-bar__lyric-chip${
              activeLyricText ? ' has-lyric' : ''
            }`}
            onClick={openFullPlayer}
            title={activeLyricText || '打开动态歌词'}
            aria-label={activeLyricText ? `当前歌词：${activeLyricText}` : '打开动态歌词'}
          >
            <Captions size={15} />
            <span>{activeLyricText || '暂无歌词'}</span>
          </button>

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
            {onToggleQueue && (
              <button
                type="button"
                className={`ctrl-btn music-player-bar__mobile-queue-btn${queueOpen ? ' is-active' : ''}`}
                onClick={onToggleQueue}
                aria-expanded={queueOpen}
                aria-label={`待播队列，共 ${queueItems.length} 首`}
                title="待播队列"
              >
                <ListMusic size={16} />
              </button>
            )}
          </div>

          <div className="music-player-bar__aside">
            <button
              type="button"
              className={`ctrl-btn music-player-bar__icon-btn music-player-bar__like-btn${
                isCurrentFavorite ? ' is-active' : ''
              }`}
              disabled={!currentRow || isFavoriteLoading}
              onClick={toggleCurrentFavorite}
              aria-label={isCurrentFavorite ? '取消喜欢当前歌曲' : '喜欢当前歌曲'}
              title={isCurrentFavorite ? '取消喜欢' : '喜欢'}
            >
              <Heart size={16} fill={isCurrentFavorite ? 'currentColor' : 'none'} />
            </button>
            <Popover
              trigger="click"
              placement="top"
              overlayClassName="music-player-fullscreen__popover"
              content={qualityPopoverContent}
              open={qualityPopoverOpen}
              onOpenChange={setQualityPopoverOpen}
            >
              <button
                type="button"
                className={`ctrl-btn music-player-bar__icon-btn music-player-bar__quality-btn${
                  qualityPopoverOpen ? ' is-active' : ''
                }`}
                aria-label={`音质切换，当前 ${current.actualQuality || preferredQuality}`}
                title={`音质：${current.actualQuality || preferredQuality}`}
              >
                <AudioLines size={16} />
                <span>{current.actualQuality || preferredQuality}</span>
              </button>
            </Popover>
            <button
              type="button"
              className={`ctrl-btn music-player-bar__icon-btn${
                playMode !== 'sequence' ? ' is-active' : ''
              }`}
              onClick={cyclePlayMode}
              aria-label={`播放模式：${playModeMeta.label}，点击切换`}
              title={`播放模式：${playModeMeta.label}，点击切换`}
            >
              <PlayModeIcon size={16} />
            </button>
            <button
              type="button"
              className={`ctrl-btn music-player-bar__icon-btn music-player-bar__queue-btn${
                queueOpen ? ' is-active' : ''
              }`}
              onClick={onToggleQueue}
              aria-expanded={queueOpen}
              aria-label={`待播队列，共 ${queueItems.length} 首`}
              title={`待播队列 (${queueItems.length})`}
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
    </>
  )
}
