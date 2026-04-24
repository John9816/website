import { useEffect, useRef, useState } from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import {
  ChevronRight,
  GripVertical,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react'
import MusicCover from './MusicCover'
import { useMusicPlayer } from '../context/MusicPlayerContext'
import { formatDuration } from '../utils/musicPlayer'
import '../styles/music-dock.css'

type DockPosition = {
  x: number
  y: number
}

type DragState = {
  pointerId: number
  offsetX: number
  offsetY: number
  width: number
  height: number
}

function clampDockPosition(
  x: number,
  y: number,
  width: number,
  height: number,
): DockPosition {
  const padding = 12
  const maxX = Math.max(padding, window.innerWidth - width - padding)
  const maxY = Math.max(padding, window.innerHeight - height - padding)

  return {
    x: Math.min(maxX, Math.max(padding, x)),
    y: Math.min(maxY, Math.max(padding, y)),
  }
}

export default function GlobalMusicDock() {
  const location = useLocation()
  const dockRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const [position, setPosition] = useState<DockPosition | null>(null)
  const [dragging, setDragging] = useState(false)

  const {
    current,
    isPlaying,
    currentTime,
    duration,
    volume,
    muted,
    unsupportedFormat,
    canPrev,
    canNext,
    togglePlay,
    playPrev,
    playNext,
    toggleMuted,
  } = useMusicPlayer()

  useEffect(() => {
    if (!dragging) return

    const previousUserSelect = document.body.style.userSelect
    document.body.style.userSelect = 'none'

    return () => {
      document.body.style.userSelect = previousUserSelect
    }
  }, [dragging])

  useEffect(() => {
    if (!position) return

    const onResize = () => {
      const dock = dockRef.current
      if (!dock) return

      const rect = dock.getBoundingClientRect()
      setPosition((currentPosition) => {
        if (!currentPosition) return currentPosition
        return clampDockPosition(
          currentPosition.x,
          currentPosition.y,
          rect.width,
          rect.height,
        )
      })
    }

    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
    }
  }, [position])

  if (!current || location.pathname.startsWith('/music')) return null

  const progressPct = duration
    ? Math.min(100, (currentTime / duration) * 100)
    : 0

  const dockStyle = position
    ? {
        left: `${position.x}px`,
        top: `${position.y}px`,
        right: 'auto',
        bottom: 'auto',
      }
    : undefined

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return

    const target = event.target as HTMLElement
    if (target.closest('button, a, input, textarea, select, label')) return

    const dock = dockRef.current
    if (!dock) return

    const rect = dock.getBoundingClientRect()
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    }

    setPosition(clampDockPosition(rect.left, rect.top, rect.width, rect.height))
    setDragging(true)
    dock.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const onDragMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !dragRef.current) return
    if (event.pointerId !== dragRef.current.pointerId) return

    const nextPosition = clampDockPosition(
      event.clientX - dragRef.current.offsetX,
      event.clientY - dragRef.current.offsetY,
      dragRef.current.width,
      dragRef.current.height,
    )

    setPosition(nextPosition)
  }

  const stopDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    if (event.pointerId !== dragRef.current.pointerId) return

    const dock = dockRef.current
    if (dock?.hasPointerCapture(event.pointerId)) {
      dock.releasePointerCapture(event.pointerId)
    }

    dragRef.current = null
    setDragging(false)
  }

  return (
    <div
      ref={dockRef}
      className={`music-dock${dragging ? ' is-dragging' : ''}`}
      style={dockStyle}
      onPointerDown={startDrag}
      onPointerMove={onDragMove}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
    >
      <div className="music-dock__header">
        <div className="music-dock__meta">
          <MusicCover src={current.coverUrl} size={44} rounded={10} />
          <div className="music-dock__text">
            <div className="music-dock__title" title={current.name}>
              {current.name || '未知歌曲'}
            </div>
            <div className="music-dock__artist" title={current.artist}>
              {current.artist || '未知歌手'}
            </div>
            <div className="music-dock__badges">
              <span>{current.actualQuality || current.requestedQuality}</span>
              <span>
                {current.source === 'qq'
                  ? 'QQ'
                  : current.source === 'netease'
                  ? '网易云'
                  : '酷我'}
              </span>
              {unsupportedFormat && <span>{unsupportedFormat}</span>}
            </div>
          </div>
        </div>

        <div className="music-dock__tools">
          <span className="music-dock__grabber" title="拖动播放器">
            <GripVertical size={14} />
          </span>
          <RouterLink
            to="/music"
            className="music-dock__icon-link"
            aria-label="打开音乐页"
            title="打开音乐页"
          >
            <ChevronRight size={14} />
          </RouterLink>
        </div>
      </div>

      <div className="music-dock__progress">
        <span className="music-dock__time">{formatDuration(currentTime)}</span>
        <div className="music-dock__progress-rail">
          <div
            className="music-dock__progress-fill"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <span className="music-dock__time music-dock__time--right">
          {formatDuration(duration)}
        </span>
      </div>

      <div className="music-dock__controls">
        <div className="music-dock__main-controls">
          <button
            type="button"
            className="music-dock__btn"
            disabled={!canPrev}
            onClick={playPrev}
            aria-label="上一首"
            title="上一首"
          >
            <SkipBack size={15} />
          </button>
          <button
            type="button"
            className="music-dock__btn music-dock__btn--primary"
            disabled={!!unsupportedFormat}
            onClick={togglePlay}
            aria-label={isPlaying ? '暂停' : '播放'}
            title={isPlaying ? '暂停' : '播放'}
          >
            {isPlaying ? <Pause size={17} /> : <Play size={17} />}
          </button>
          <button
            type="button"
            className="music-dock__btn"
            disabled={!canNext}
            onClick={playNext}
            aria-label="下一首"
            title="下一首"
          >
            <SkipForward size={15} />
          </button>
        </div>

        <button
          type="button"
          className="music-dock__btn"
          onClick={toggleMuted}
          aria-label={muted ? '取消静音' : '静音'}
          title={muted ? '取消静音' : '静音'}
        >
          {muted || volume === 0 ? (
            <VolumeX size={15} />
          ) : (
            <Volume2 size={15} />
          )}
        </button>
      </div>
    </div>
  )
}
