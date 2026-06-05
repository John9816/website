import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { App as AntApp } from 'antd'
import { musicPlay } from '../api/music'
import type { MusicQuality, PlayInfo, SongSearchItem } from '../types'
import {
  describeMediaError,
  detectUnsupportedFormat,
  normalizeMediaUrl,
  resolveCoverUrl,
} from '../utils/musicPlayer'

type AutoNextHandler = () => void | Promise<void>
export type PlayMode = 'sequence' | 'repeat-one' | 'shuffle'

const PLAY_MODE_KEY = 'music-player-play-mode'
const PLAY_MODE_ORDER: PlayMode[] = ['sequence', 'repeat-one', 'shuffle']

function getInitialPlayMode(): PlayMode {
  if (typeof window === 'undefined') return 'sequence'

  const stored = window.localStorage.getItem(PLAY_MODE_KEY)
  if (
    stored === 'sequence' ||
    stored === 'repeat-one' ||
    stored === 'shuffle'
  ) {
    return stored
  }

  return 'sequence'
}

function getRandomQueueIndex(length: number, currentIndex: number) {
  if (length <= 1) return currentIndex
  let nextIndex = Math.floor(Math.random() * length)
  if (nextIndex === currentIndex) {
    nextIndex = (nextIndex + 1 + Math.floor(Math.random() * (length - 1))) % length
  }
  return nextIndex
}

type MusicPlayerContextValue = {
  current: PlayInfo | null
  playlist: SongSearchItem[]
  currentIndex: number
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  muted: boolean
  playLoading: boolean
  unsupportedFormat: string | null
  preferredQuality: MusicQuality
  playMode: PlayMode
  canPrev: boolean
  canNext: boolean
  setPlaylist: (items: SongSearchItem[]) => void
  playPlaylist: (
    items: SongSearchItem[],
    startIndex?: number,
    quality?: MusicQuality,
  ) => Promise<void>
  playFromQueue: (index: number, quality?: MusicQuality) => Promise<void>
  setPreferredQuality: (quality: MusicQuality) => void
  playSong: (row: SongSearchItem, quality?: MusicQuality) => Promise<void>
  togglePlay: () => void
  playPrev: () => void
  playNext: () => void
  seekToTime: (time: number) => void
  setVolume: (value: number) => void
  setPlayMode: (mode: PlayMode) => void
  cyclePlayMode: () => void
  toggleMuted: () => void
  setAutoNextHandler: (handler: AutoNextHandler | null) => void
}

const MusicPlayerContext = createContext<MusicPlayerContextValue | null>(null)

export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const { message } = AntApp.useApp()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const autoNextHandlerRef = useRef<AutoNextHandler | null>(null)
  const [hasAutoNextHandler, setHasAutoNextHandler] = useState(false)

  const [current, setCurrent] = useState<PlayInfo | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(1)
  const [muted, setMuted] = useState(false)
  const [playLoading, setPlayLoading] = useState(false)
  const [playlist, setPlaylistState] = useState<SongSearchItem[]>([])
  const [preferredQuality, setPreferredQualityState] =
    useState<MusicQuality>('flac')
  const [playMode, setPlayModeState] = useState<PlayMode>(getInitialPlayMode)

  const unsupportedFormat = useMemo(
    () => (current ? detectUnsupportedFormat(current.playUrl) : null),
    [current],
  )

  const currentIndex = useMemo(() => {
    if (!current) return -1
    return playlist.findIndex(
      (item) => item.id === current.id && item.source === current.source,
    )
  }, [current, playlist])

  const canPrev = currentIndex > 0
  const hasQueueNext = currentIndex >= 0 && currentIndex < playlist.length - 1
  const canNext =
    playMode === 'shuffle'
      ? playlist.length > 1 || hasAutoNextHandler
      : hasQueueNext || hasAutoNextHandler

  const setPlaylist = useCallback((items: SongSearchItem[]) => {
    setPlaylistState(items)
  }, [])

  const setPreferredQuality = useCallback((quality: MusicQuality) => {
    setPreferredQualityState(quality)
  }, [])

  const setPlayMode = useCallback((mode: PlayMode) => {
    setPlayModeState(mode)
  }, [])

  const cyclePlayMode = useCallback(() => {
    setPlayModeState((currentMode) => {
      const currentIndex = PLAY_MODE_ORDER.indexOf(currentMode)
      return PLAY_MODE_ORDER[(currentIndex + 1) % PLAY_MODE_ORDER.length]
    })
  }, [])

  const playSong = useCallback(
    async (row: SongSearchItem, quality = preferredQuality) => {
      setPlayLoading(true)
      setPreferredQualityState(quality)
      try {
        const info = await musicPlay(row.source, row.id, quality)
        setCurrent({
          ...info,
          coverUrl: resolveCoverUrl(info.coverUrl, row.coverUrl),
        })
        setCurrentTime(0)
        setDuration(info.durationSec ?? 0)
      } catch (error) {
        message.error((error as Error).message)
      } finally {
        setPlayLoading(false)
      }
    },
    [message, preferredQuality],
  )

  const playPlaylist = useCallback(
    async (
      items: SongSearchItem[],
      startIndex = 0,
      quality = preferredQuality,
    ) => {
      if (!items.length) return
      const nextIndex = Math.min(items.length - 1, Math.max(0, startIndex))
      setPlaylistState(items)
      await playSong(items[nextIndex], quality)
    },
    [playSong, preferredQuality],
  )

  const playFromQueue = useCallback(
    async (index: number, quality = preferredQuality) => {
      if (index < 0 || index >= playlist.length) return
      await playSong(playlist[index], quality)
    },
    [playSong, playlist, preferredQuality],
  )

  const restartCurrentTrack = useCallback(() => {
    const el = audioRef.current
    if (!el || !current || unsupportedFormat) return false
    el.currentTime = 0
    setCurrentTime(0)
    void el.play().catch(() => {})
    return true
  }, [current, unsupportedFormat])

  const playPrev = useCallback(() => {
    if (!canPrev) return
    void playSong(playlist[currentIndex - 1], preferredQuality)
  }, [canPrev, currentIndex, playSong, playlist, preferredQuality])

  const playNext = useCallback(() => {
    if (playMode === 'shuffle' && playlist.length > 1) {
      const nextIndex = getRandomQueueIndex(playlist.length, currentIndex)
      void playSong(playlist[nextIndex], preferredQuality)
      return
    }
    if (!hasQueueNext) {
      if (autoNextHandlerRef.current) {
        void autoNextHandlerRef.current()
      }
      return
    }
    void playSong(playlist[currentIndex + 1], preferredQuality)
  }, [currentIndex, hasQueueNext, playMode, playSong, playlist, preferredQuality])

  const togglePlay = useCallback(() => {
    const el = audioRef.current
    if (!el || !current || unsupportedFormat) return

    if (el.paused) {
      void el.play().catch(() => {
        message.warning('播放失败，链接可能已经过期，请重新点一次这首歌。')
      })
      return
    }

    el.pause()
  }, [current, message, unsupportedFormat])

  const seekToTime = useCallback(
    (time: number) => {
      const el = audioRef.current
      if (!el || !duration) return
      const nextTime = Math.min(duration, Math.max(0, time))
      el.currentTime = nextTime
      setCurrentTime(nextTime)
    },
    [duration],
  )

  const setVolume = useCallback((value: number) => {
    const nextVolume = Math.min(1, Math.max(0, value))
    setVolumeState(nextVolume)
    if (nextVolume > 0) setMuted(false)
  }, [])

  const toggleMuted = useCallback(() => {
    setMuted((value) => !value)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(PLAY_MODE_KEY, playMode)
  }, [playMode])

  const setAutoNextHandler = useCallback(
    (handler: AutoNextHandler | null) => {
      autoNextHandlerRef.current = handler
      setHasAutoNextHandler(!!handler)
    },
    [],
  )

  const advanceQueue = useCallback(() => {
    if (playMode === 'repeat-one' && restartCurrentTrack()) {
      return true
    }
    if (playMode === 'shuffle') {
      if (playlist.length > 1) {
        const nextIndex = getRandomQueueIndex(playlist.length, currentIndex)
        void playSong(playlist[nextIndex], preferredQuality)
        return true
      }
      if (restartCurrentTrack()) {
        return true
      }
    }
    if (hasQueueNext) {
      void playSong(playlist[currentIndex + 1], preferredQuality)
      return true
    }
    if (autoNextHandlerRef.current) {
      void autoNextHandlerRef.current()
      return true
    }
    return false
  }, [
    currentIndex,
    hasQueueNext,
    playMode,
    playSong,
    playlist,
    preferredQuality,
    restartCurrentTrack,
  ])

  useEffect(() => {
    if (!current || !unsupportedFormat) return

    setIsPlaying(false)
    message.error(
      `当前返回的是 ${unsupportedFormat} 格式，浏览器无法直接播放。请切换音质或音源后重试。`,
    )
  }, [current, message, unsupportedFormat])

  useEffect(() => {
    if (unsupportedFormat) return

    const el = audioRef.current
    if (!el || !current) return

    el.load()
    void el.play().catch((error: DOMException) => {
      if (error?.name === 'NotAllowedError') {
        message.warning('浏览器阻止了自动播放，请手动点一下播放按钮。')
      }
    })
  }, [current, message, unsupportedFormat])

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    el.volume = volume
    el.muted = muted
  }, [muted, volume])

  const value = useMemo<MusicPlayerContextValue>(
    () => ({
      current,
      playlist,
      currentIndex,
      isPlaying,
      currentTime,
      duration,
      volume,
      muted,
      playLoading,
      unsupportedFormat,
      preferredQuality,
      playMode,
      canPrev,
      canNext,
      setPlaylist,
      playPlaylist,
      playFromQueue,
      setPreferredQuality,
      playSong,
      togglePlay,
      playPrev,
      playNext,
      seekToTime,
      setVolume,
      setPlayMode,
      cyclePlayMode,
      toggleMuted,
      setAutoNextHandler,
    }),
    [
      canNext,
      canPrev,
      cyclePlayMode,
      current,
      currentIndex,
      currentTime,
      duration,
      isPlaying,
      muted,
      playMode,
      playLoading,
      playNext,
      playFromQueue,
      playPrev,
      playPlaylist,
      playSong,
      playlist,
      preferredQuality,
      seekToTime,
      setPlayMode,
      setPlaylist,
      setPreferredQuality,
      setVolume,
      toggleMuted,
      togglePlay,
      unsupportedFormat,
      volume,
      setAutoNextHandler,
    ],
  )

  return (
    <MusicPlayerContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        src={current ? normalizeMediaUrl(current.playUrl) : undefined}
        preload="metadata"
        style={{ display: 'none' }}
        onTimeUpdate={(event) =>
          setCurrentTime((event.target as HTMLAudioElement).currentTime)
        }
        onLoadedMetadata={(event) => {
          const el = event.target as HTMLAudioElement
          if (Number.isFinite(el.duration) && el.duration > 0) {
            setDuration(el.duration)
          }
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false)
          advanceQueue()
        }}
        onError={(event) => {
          const el = event.currentTarget as HTMLAudioElement
          setIsPlaying(false)
          message.error(
            `播放失败：${describeMediaError(el.error)}。`,
          )
        }}
      />
    </MusicPlayerContext.Provider>
  )
}

export function useMusicPlayer() {
  const context = useContext(MusicPlayerContext)
  if (!context) {
    throw new Error('useMusicPlayer must be used within MusicPlayerProvider')
  }
  return context
}
