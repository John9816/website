import { sourceLabel } from '../features/music/sources'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { FastAverageColor } from 'fast-average-color'
import MusicCover from './MusicCover'
import { useMusicPlayer } from '../context/MusicPlayerContext'
import MusicLyricText from './MusicLyricText'
import MusicLyricsSettings from './MusicLyricsSettings'
import { coverUrlForSize, formatDuration } from '../utils/musicPlayer'
import '../styles/music-dock.css'

const fac = new FastAverageColor()

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

type DockPanel = 'lyrics' | 'queue' | null
type ProgressDragState = {
  pointerId: number
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
  const progressDragRef = useRef<ProgressDragState | null>(null)
  const lyricScrollRef = useRef<HTMLDivElement | null>(null)
  const queueScrollRef = useRef<HTMLDivElement | null>(null)

  const [position, setPosition] = useState<DockPosition | null>(null)
  const [dragging, setDragging] = useState(false)
  const [collapsed, setCollapsed] = useState(true)
  const [panel, setPanel] = useState<DockPanel>(null)
  const [seeking, setSeeking] = useState(false)
  const [dominantColor, setDominantColor] = useState<string | null>(null)

  const {
    current,
    lyricLines: lrcLines,
    lyricPreview: currentLrcText,
    lyricPlainText, lyricLoading, lyricError, retryLyrics,
    activeLyricIndex: activeLrcIndex,
    playlist,
    currentIndex,
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
    seekToTime,
    toggleMuted,
    playFromQueue,
  } = useMusicPlayer()


  useEffect(() => {
    if (!dragging && !seeking) return

    const previousUserSelect = document.body.style.userSelect
    document.body.style.userSelect = 'none'

    return () => {
      document.body.style.userSelect = previousUserSelect
    }
  }, [dragging, seeking])

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
  }, [collapsed, panel, position])

  // 同 MusicPlayerBar：用 ref 读最新播放时间，避免 effect 依赖 currentTime
  // 而每次 timeupdate 都重启平滑滚动。
  const currentTimeRef = useRef(currentTime)
  currentTimeRef.current = currentTime

  useEffect(() => {
    if (panel !== 'lyrics') return
    const container = lyricScrollRef.current
    if (!container) return

    if (activeLrcIndex < 0) {
      // 逐字歌词(YRC)每行带 end，行间空隙/间奏/尾奏索引都会变 -1。
      // 只有前奏才回顶部，其余保持当前位置，避免每句间隙跳回第一行。
      const firstTime = lrcLines[0]?.time ?? 0
      if (currentTimeRef.current < firstTime) {
        container.scrollTo({ top: 0, behavior: 'smooth' })
      }
      return
    }

    const activeLine = container.querySelector<HTMLElement>(
      `[data-dock-lrc-idx="${activeLrcIndex}"]`,
    )
    if (!activeLine) return

    const containerRect = container.getBoundingClientRect()
    const lineRect = activeLine.getBoundingClientRect()
    const top =
      container.scrollTop +
      (lineRect.top - containerRect.top) -
      container.clientHeight / 2 +
      activeLine.clientHeight / 2
    container.scrollTo({ top, behavior: 'smooth' })
  }, [activeLrcIndex, panel, lrcLines])

  useEffect(() => {
    if (panel !== 'queue') return
    const container = queueScrollRef.current
    if (!container || currentIndex < 0) return

    const activeItem = container.querySelector<HTMLElement>(
      `[data-dock-queue-idx="${currentIndex}"]`,
    )
    if (!activeItem) return

    const top =
      activeItem.offsetTop - container.clientHeight / 2 + activeItem.clientHeight / 2
    container.scrollTo({ top, behavior: 'smooth' })
  }, [currentIndex, panel])

  useEffect(() => {
    const url = coverUrlForSize(current?.coverUrl, 48)
    if (!url) {
      setDominantColor(null)
      return
    }

    let isMounted = true
    // Because canvas extraction fails on tainted canvas (no cross-origin headers from some CDNs),
    // we use a best-effort approach. If it fails, fallback to default glass styles.
    fac
      .getColorAsync(url, { algorithm: 'dominant', crossOrigin: 'anonymous' })
      .then((color) => {
        if (isMounted) {
          // Store raw rgb values for css variables `r, g, b`
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

  const seekTo = useCallback(
    (clientX: number, element: HTMLDivElement) => {
      if (!duration) return
      const rect = element.getBoundingClientRect()
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      seekToTime(ratio * duration)
    },
    [duration, seekToTime],
  )

  if (!current || location.pathname.startsWith('/music')) return null

  const progressPct = duration
    ? Math.min(100, (currentTime / duration) * 100)
    : 0

  const dockStyle = {
    ...(position
      ? {
          left: `${position.x}px`,
          top: `${position.y}px`,
          right: 'auto',
          bottom: 'auto',
        }
      : {}),
    ...(dominantColor ? { '--dominant-rgb': dominantColor } : {}),
  } as React.CSSProperties

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return

    const target = event.target as HTMLElement
    if (!target.closest('[data-dock-drag-handle="true"]')) return
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

  const togglePanel = (nextPanel: Exclude<DockPanel, null>) => {
    setCollapsed(false)
    setPanel((currentPanel) => (currentPanel === nextPanel ? null : nextPanel))
  }

  const toggleCollapsed = () => {
    setCollapsed((currentValue) => {
      const nextValue = !currentValue
      if (nextValue) setPanel(null)
      return nextValue
    })
  }

  const startSeek = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return

    progressDragRef.current = { pointerId: event.pointerId }
    setSeeking(true)
    event.currentTarget.setPointerCapture(event.pointerId)
    seekTo(event.clientX, event.currentTarget)
    event.preventDefault()
    event.stopPropagation()
  }

  const moveSeek = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!progressDragRef.current) return
    if (event.pointerId !== progressDragRef.current.pointerId) return

    seekTo(event.clientX, event.currentTarget)
    event.stopPropagation()
  }

  const stopSeek = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!progressDragRef.current) return
    if (event.pointerId !== progressDragRef.current.pointerId) return

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    progressDragRef.current = null
    setSeeking(false)
    event.stopPropagation()
  }

  return (
    <div
      ref={dockRef}
      className={`music-dock${dragging ? ' is-dragging' : ''}${panel ? ' is-expanded' : ''}${
        collapsed ? ' is-collapsed' : ''
      }${seeking ? ' is-seeking' : ''}${isPlaying ? ' is-playing' : ''}`}
      style={dockStyle}
      onPointerDown={startDrag}
      onPointerMove={onDragMove}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
    >
      <div className="music-dock__shell">
        <div className="music-dock__header">
          <div className="music-dock__meta">
            <div className="music-dock__cover-wrap">
              <MusicCover src={current.coverUrl} size={collapsed ? 36 : 44} rounded={collapsed ? 18 : 10} loading="eager" className="music-dock__cover-img" />
            </div>
            <div className="music-dock__text">
              <div className="music-dock__title" title={current.name}>
                {current.name || '未知歌曲'}
              </div>
              <div className="music-dock__artist" title={current.artist}>
                {current.artist || '未知歌手'}
              </div>
              <div className="music-dock__badges">
                <span>{current.actualQuality || current.requestedQuality}</span>
                <span>{sourceLabel(current.actualSource || current.source)}</span>
                {unsupportedFormat && <span>{unsupportedFormat}</span>}
              </div>
            </div>
          </div>

          <div className="music-dock__tools">
            {!collapsed && (
              <>
                <button
                  type="button"
                  className={`music-dock__icon-btn${panel === 'lyrics' ? ' is-active' : ''}`}
                  onClick={() => togglePanel('lyrics')}
                  aria-label="切换歌词面板"
                  title="歌词"
                >
                  词
                </button>
                <button
                  type="button"
                  className={`music-dock__icon-btn${panel === 'queue' ? ' is-active' : ''}`}
                  onClick={() => togglePanel('queue')}
                  aria-label="切换播放列表面板"
                  title="列表"
                >
                  单
                </button>
              </>
            )}
            <button
              type="button"
              className={`music-dock__icon-btn music-dock__collapse-btn${
                collapsed ? ' is-collapsed' : ''
              }`}
              onClick={toggleCollapsed}
              aria-label={collapsed ? '展开迷你播放器' : '折叠迷你播放器'}
              title={collapsed ? '展开' : '折叠'}
            >
              <ChevronDown size={14} />
            </button>
            <span
              className="music-dock__grabber"
              data-dock-drag-handle="true"
              title="拖动播放器"
            >
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
          <div
            className={`music-dock__progress-rail${seeking ? ' is-seeking' : ''}`}
            data-dock-no-drag="true"
            onPointerDown={startSeek}
            onPointerMove={moveSeek}
            onPointerUp={stopSeek}
            onPointerCancel={stopSeek}
            onKeyDown={(event) => {
              if (!duration) return
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
              const delta = event.key === 'ArrowRight' ? 5 : -5
              seekToTime(currentTime + delta)
              event.preventDefault()
            }}
            role="slider"
            tabIndex={0}
            aria-label="播放进度"
            aria-valuemin={0}
            aria-valuemax={Math.max(duration, 0)}
            aria-valuenow={Math.min(currentTime, duration || currentTime)}
          >
            <div
              className="music-dock__progress-fill"
              style={{ width: `${progressPct}%` }}
            />
            <div
              className="music-dock__progress-thumb"
              style={{ left: `calc(${progressPct}% - 6px)` }}
            />
          </div>
          <span className="music-dock__time music-dock__time--right">
            {formatDuration(duration)}
          </span>
        </div>

        {!collapsed && (
          <div className="music-dock__lyric-preview" title={currentLrcText}>
            <span key={`${activeLrcIndex}:${currentLrcText}`}>{currentLrcText}</span>
          </div>
        )}

        <div className="music-dock__controls">
          <div className="music-dock__main-controls">
            {!collapsed && (
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
            )}
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
            {!collapsed && (
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
            )}
          </div>

          {!collapsed && (
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
          )}
        </div>
      </div>

      {!collapsed && panel && (
        <div className="music-dock__panel">
          <div className="music-dock__panel-tabs">
            <button
              type="button"
              className={`music-dock__panel-tab${panel === 'lyrics' ? ' is-active' : ''}`}
              onClick={() => setPanel('lyrics')}
            >
              歌词
            </button>
            <button
              type="button"
              className={`music-dock__panel-tab${panel === 'queue' ? ' is-active' : ''}`}
              onClick={() => setPanel('queue')}
            >
              列表
            </button>
          </div>

          {panel === 'lyrics' ? (
            <div ref={lyricScrollRef} className="music-dock__panel-body music-dock__lyrics">
              <MusicLyricsSettings />
              {lrcLines.length === 0 ? (
                lyricPlainText ? (
                  <pre className="music-dock__lyrics-plain">{lyricPlainText}</pre>
                ) : (
                  <div className="music-dock__empty">{lyricLoading ? '正在加载歌词…' : lyricError || '暂无歌词'}{!lyricLoading && <button type="button" onClick={retryLyrics}>重试</button>}</div>
                )
              ) : (
                lrcLines.map((line, index) => (
                  <div
                    key={`${line.time}-${index}`}
                    data-dock-lrc-idx={index}
                    className={`music-dock__lyrics-line${
                      index === activeLrcIndex ? ' is-active' : ''
                    }`}
                    onClick={() => seekToTime(line.time)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        seekToTime(line.time)
                      }
                    }}
                  >
                    <MusicLyricText line={line} time={currentTime} active={index === activeLrcIndex} />
                  </div>
                ))
              )}
            </div>
          ) : (
            <div ref={queueScrollRef} className="music-dock__panel-body music-dock__queue">
              {playlist.length === 0 ? (
                <div className="music-dock__empty">暂无播放列表</div>
              ) : (
                playlist.map((item, index) => (
                  <button
                    key={`${item.source}:${item.id}`}
                    type="button"
                    data-dock-queue-idx={index}
                    className={`music-dock__queue-item${
                      index === currentIndex ? ' is-active' : ''
                    }`}
                    onClick={() => {
                      void playFromQueue(index)
                    }}
                  >
                    <span className="music-dock__queue-index">{index + 1}</span>
                    <span className="music-dock__queue-copy">
                      <span className="music-dock__queue-title">{item.name}</span>
                      <span className="music-dock__queue-artist">{item.artist}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
