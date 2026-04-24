import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import {
  ChevronDown,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react'
import MusicCover from './MusicCover'
import { useMusicPlayer } from '../context/MusicPlayerContext'
import {
  formatDuration,
  normalizeCoverUrl,
  parseLrc,
} from '../utils/musicPlayer'

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
  const [dragging, setDragging] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const lyricScrollRef = useRef<HTMLDivElement | null>(null)

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
    seekToTime,
    setVolume,
    toggleMuted,
  } = useMusicPlayer()

  const seekTo = useCallback(
    (clientX: number, element: HTMLDivElement) => {
      if (!duration) return
      const rect = element.getBoundingClientRect()
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      seekToTime(ratio * duration)
    },
    [duration, seekToTime],
  )

  const lrcLines = useMemo(
    () => parseLrc(current?.lyric?.lineLyrics),
    [current?.lyric?.lineLyrics],
  )

  const activeLrcIndex = useMemo(() => {
    if (!lrcLines.length) return -1

    let index = -1
    for (let i = 0; i < lrcLines.length; i += 1) {
      if (lrcLines[i].time <= currentTime) {
        index = i
      } else {
        break
      }
    }

    return index
  }, [currentTime, lrcLines])

  useEffect(() => {
    if (!dragging) return
    const onUp = () => setDragging(false)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging])

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

  if (!current) return null

  const progressPct = duration ? Math.min(100, (currentTime / duration) * 100) : 0
  const volumePct = muted ? 0 : volume * 100
  const coverUrl = normalizeCoverUrl(current.coverUrl)

  const renderProgressTrack = (extraClass?: string) => (
    <div
      className={`progress-track ${dragging ? 'dragging' : ''}${extraClass ? ` ${extraClass}` : ''}`}
      onMouseDown={(event) => {
        setDragging(true)
        seekTo(event.clientX, event.currentTarget)
      }}
      onMouseMove={(event) => {
        if (!dragging) return
        seekTo(event.clientX, event.currentTarget)
      }}
      style={{ '--progress': `${progressPct}%` } as CSSProperties}
    >
      <div className="rail">
        <div className="fill" />
      </div>
      <div className="thumb" />
    </div>
  )

  return (
    <>
      <div className="music-player-bar-wrap">
        <div className="music-player-bar">
          <div className="music-player-bar__meta">
            <button
              type="button"
              className="music-player-bar__cover-button"
              onClick={() => setExpanded(true)}
              aria-label="打开全屏播放器"
              title="打开全屏播放器"
            >
              <MusicCover src={current.coverUrl} size={64} rounded={18} />
            </button>
            <div className="music-player-bar__text">
              <div className="music-player-bar__title" title={current.name}>
                {current.name || '未知歌曲'}
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
                disabled={!!unsupportedFormat}
                onClick={togglePlay}
                aria-label={isPlaying ? '暂停' : '播放'}
                title={isPlaying ? '暂停' : '播放'}
              >
                {isPlaying ? (
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

            <div className="music-player-bar__progress">
              <span className="time">{formatDuration(currentTime)}</span>
              {renderProgressTrack()}
              <span className="time time-right">{formatDuration(duration)}</span>
            </div>
          </div>

          <div className="music-player-bar__aside">
            <button
              type="button"
              className="ctrl-btn"
              onClick={toggleMuted}
              aria-label={muted ? '取消静音' : '静音'}
              title={muted ? '取消静音' : '静音'}
            >
              {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
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

      {expanded && (
        <div className="music-player-fullscreen" role="dialog" aria-modal="true">
          <div
            className="music-player-fullscreen__backdrop"
            onClick={() => setExpanded(false)}
          />
          <div
            className="music-player-fullscreen__shell"
            style={
              coverUrl
                ? ({ '--player-cover': `url("${coverUrl}")` } as CSSProperties)
                : undefined
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
              <section className="music-player-fullscreen__art-panel">
                <div className={`music-player-fullscreen__cover ${isPlaying ? 'is-playing' : ''}`}>
                  <MusicCover src={current.coverUrl} size={320} rounded={36} />
                </div>
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

                <div className="music-player-fullscreen__progress">
                  <span className="time">{formatDuration(currentTime)}</span>
                  {renderProgressTrack('music-player-fullscreen__progress-track')}
                  <span className="time time-right">{formatDuration(duration)}</span>
                </div>

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
                    disabled={!!unsupportedFormat}
                    onClick={togglePlay}
                    aria-label={isPlaying ? '暂停' : '播放'}
                    title={isPlaying ? '暂停' : '播放'}
                  >
                    {isPlaying ? (
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
              </section>

              <section className="music-player-fullscreen__lyrics-panel">
                <div className="music-player-fullscreen__lyrics-head">
                  <span className="player-kicker">Lyrics</span>
                </div>
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
                    lrcLines.map((line, index) => (
                      <div
                        key={index}
                        data-lrc-idx={index}
                        className={`music-player-fullscreen__lyrics-line ${
                          index === activeLrcIndex ? 'is-active' : ''
                        }`}
                      >
                        {line.text || '\u00A0'}
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
