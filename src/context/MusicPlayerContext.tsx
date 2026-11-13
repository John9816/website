import { useQishuiRoaming } from '../hooks/useQishuiRoaming'
import { usePlayerLyrics } from '../hooks/usePlayerLyrics'
import { useMusicMediaSession } from '../hooks/useMusicMediaSession'
import { useListenTimeReporter } from '../hooks/useListenTimeReporter'
import { musicPlaybackError } from '../features/music/sources'
import {
  clearQueueKeepingCurrent,
  insertIntoQueue,
  moveQueueItemToNext,
  removeQueueIndex,
  type QueueInsertPosition,
} from '../features/music/queue'
import {
  hasQishuiDirectPlayback,
  ensureRichPlayback,
  getCachedRichPlayback,
  setActiveRichPlaybackKey,
  clearRichPlaybackCache,
  richPlaybackKey,
} from '../features/music/qishuiRichClient'
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
import { musicLyric, musicPlay, qishuiSongInfo } from '../api/music'
import { getAuthSessionId } from '../api/client'
import { useAuth } from './AuthContext'
import type { MusicSourceId, MusicQuality, PlayInfo, SongSearchItem } from '../types'
import {
  describeMediaError,
  hasQishuiInlineLyrics,
  detectUnsupportedFormat,
  normalizeMediaUrl,
  resolveCoverUrl,
  warmupLocalStream,
} from '../utils/musicPlayer'

type AutoNextHandler = () => void | Promise<void>
export type PlayMode = 'sequence' | 'repeat-one' | 'shuffle'

const PLAY_MODE_KEY = 'music-player-play-mode'
const PREFERRED_QUALITY_KEY = 'music-player-preferred-quality'
const PLAY_MODE_ORDER: PlayMode[] = ['sequence', 'repeat-one', 'shuffle']
const PLAY_INFO_CACHE_FALLBACK_TTL_MS = 60_000
const PLAY_INFO_CACHE_MAX_TTL_MS = 5 * 60_000
const CACHED_PLAY_INFO_MAX_TTL_MS = 60_000
const PLAY_INFO_CACHE_MAX_ENTRIES = 50

type PlayInfoCacheEntry = {
  info: PlayInfo
  expiresAt: number
}

type PlayInfoInFlight = {
  controller: AbortController
  prefetch: boolean
  promise: Promise<PlayInfo>
}

type PlayInfoResolution = {
  controller: AbortController | null
  needsPlayRecord: boolean
  promise: Promise<PlayInfo>
}

function playInfoKey(row: Pick<SongSearchItem, 'source' | 'id'>, quality: MusicQuality) {
  return `${row.source}:${row.id}:${quality}`
}

function playInfoToQueueSong(info: PlayInfo): SongSearchItem {
  return {
    id: info.id,
    source: info.source,
    name: info.name || '未知歌曲',
    artist: info.artist || '未知歌手',
    artistId: info.artistId,
    artistIds: info.artistIds,
    album: info.album,
    albumId: info.albumId,
    coverUrl: info.coverUrl,
    durationSec: info.durationSec,
    availableQualities: [info.requestedQuality],
  }
}

function isMusicQuality(value: string | null): value is MusicQuality {
  return value === '128k' || value === '320k' || value === 'flac' || value === 'flac24bit'
}

function getInitialPreferredQuality(): MusicQuality {
  if (typeof window === 'undefined') return '320k'
  const stored = window.localStorage.getItem(PREFERRED_QUALITY_KEY)
  return isMusicQuality(stored) ? stored : '320k'
}

function getPlayInfoExpiry(info: PlayInfo, now = Date.now()) {
  const rawTtlMs =
    typeof info.expireSec === 'number' && Number.isFinite(info.expireSec) && info.expireSec > 0
      ? info.expireSec * 1000
      : PLAY_INFO_CACHE_FALLBACK_TTL_MS
  const reportedTtlMs = Math.min(
    rawTtlMs,
    info.fromCache ? CACHED_PLAY_INFO_MAX_TTL_MS : PLAY_INFO_CACHE_MAX_TTL_MS,
  )
  const safetyMarginMs = Math.min(30_000, Math.max(5_000, reportedTtlMs * 0.1))
  return now + Math.max(0, reportedTtlMs - safetyMarginMs)
}

function isCanceledRequest(error: unknown) {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (typeof error === 'object' && error !== null && 'code' in error && error.code === -2)
  )
}

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

type MusicPlayerContextValue = ReturnType<typeof usePlayerLyrics> & ReturnType<typeof useQishuiRoaming> & {
  artistTarget: {source:MusicSourceId; id?:string; name:string} | null
  openArtist: (source:MusicSourceId, id:string|undefined, name:string)=>void
  closeArtist: ()=>void
  mediaSessionSupported: boolean
  current: PlayInfo | null
  playlist: SongSearchItem[]
  currentIndex: number
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  muted: boolean
  playLoading: boolean
  pendingTrackKey: string | null
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
  addToQueue: (row: SongSearchItem, position?: QueueInsertPosition) => void
  removeFromQueue: (index: number) => void
  clearQueue: () => void
  moveQueueToNext: (index: number) => void
  setPreferredQuality: (quality: MusicQuality) => void
  playSong: (row: SongSearchItem, quality?: MusicQuality) => Promise<void>
  playResolvedSong: (
    row: SongSearchItem,
    info: PlayInfo,
    quality?: MusicQuality,
  ) => Promise<void>
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

type MusicBrowseValue = Pick<MusicPlayerContextValue, 'artistTarget' | 'openArtist' | 'closeArtist' | 'current' | 'playlist' | 'currentIndex' | 'isPlaying' | 'playLoading' | 'pendingTrackKey' | 'unsupportedFormat' | 'preferredQuality' | 'playMode' | 'canPrev' | 'canNext' | 'setPlaylist' | 'playPlaylist' | 'playFromQueue' | 'addToQueue' | 'removeFromQueue' | 'clearQueue' | 'moveQueueToNext' | 'setPreferredQuality' | 'playSong' | 'playResolvedSong' | 'togglePlay' | 'playPrev' | 'playNext' | 'setAutoNextHandler' | 'roamingSession' | 'roamingBusy' | 'roamingError' | 'startRoaming' | 'nextRoaming' | 'stopRoaming'>
const MusicBrowseContext = createContext<MusicBrowseValue | null>(null)

const MusicPlayerContext = createContext<MusicPlayerContextValue | null>(null)

export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const { message } = AntApp.useApp()
  const { token: authToken } = useAuth()
  const authSessionId = authToken ? getAuthSessionId() : null
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const autoNextHandlerRef = useRef<AutoNextHandler | null>(null)
  const playGenerationRef = useRef(0)
  const activePlayRequestRef = useRef<{
    controller: AbortController | null
    key: string
  } | null>(null)
  const playInfoCacheRef = useRef<Map<string, PlayInfoCacheEntry>>(new Map())
  const playInfoInFlightRef = useRef<Map<string, PlayInfoInFlight>>(new Map())
  const playRecordRequestsRef = useRef<Map<string, AbortController>>(new Map())
  const lyricPrefetchRequestsRef = useRef<Map<string, AbortController>>(new Map())
  // Tracks already-warmed stream URLs for the current queue position so the
  // prefetch effect (which re-runs on quality/queue changes) does not re-issue
  // the 1-byte warmup for the same track.
  const streamWarmupRef = useRef<Map<string, AbortController>>(new Map())
  const previousAuthSessionRef = useRef(authSessionId)
  const radioKeys = useRef(new Set<string>())
  const radioNext = useRef<(()=>void)|null>(null)
  const radioStop = useRef<(()=>void)|null>(null)
  // Keys already submitted for next-track rich-client prefetch; avoids re-issuing on every
  // prefetch-effect re-run. The decrypted Blob URLs themselves live in qishuiRichClient's LRU.
  const richPrefetchRef = useRef<Set<string>>(new Set())
  const [radioAvailable, setRadioAvailable] = useState(false)
  const [artistTarget,setArtistTarget] = useState<MusicPlayerContextValue['artistTarget']>(null)
  const openArtist = useCallback((source:MusicSourceId,id:string|undefined,name:string)=>setArtistTarget({source,id,name}),[])
  const closeArtist = useCallback(()=>setArtistTarget(null),[])
  const [hasAutoNextHandler, setHasAutoNextHandler] = useState(false)

  const [current, setCurrent] = useState<PlayInfo | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  // Report real playback seconds for the listening-time leaderboard. Internally
  // clamps the currentTime delta against wall-clock time, so seeking and frozen
  // background tabs cannot inflate the total; no-op for anonymous visitors.
  useListenTimeReporter(isPlaying, currentTime)
  // Smooth playback clock: timeupdate only fires ~4×/sec, which makes word-level
  // lyric highlighting lag the audio by up to 250ms. We read audioRef.currentTime
  // every animation frame while playing so the lyric active index stays in sync.
  const smoothClockLastRef = useRef(0)
  const [volume, setVolumeState] = useState(1)
  const [muted, setMuted] = useState(false)
  const [playLoading, setPlayLoading] = useState(false)
  const [pendingTrackKey, setPendingTrackKey] = useState<string | null>(null)
  // Effective <audio> source: a client-decrypted Blob URL for Qishui rich-client playback,
  // otherwise the (same-origin) local stream URL. Drives the load/play effect below.
  const [audioSrc, setAudioSrc] = useState<string | undefined>(undefined)
  const [playlist, setPlaylistState] = useState<SongSearchItem[]>([])
  const [preferredQuality, setPreferredQualityState] =
    useState<MusicQuality>(getInitialPreferredQuality)
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
      ? playlist.length > 1 || radioAvailable || hasAutoNextHandler
      : hasQueueNext || radioAvailable || hasAutoNextHandler

  const setPlaylist = useCallback((items: SongSearchItem[]) => {
    if (!radioKeys.current.size) setPlaylistState(items)
  }, [])

  const cachePlayInfo = useCallback(
    (row: Pick<SongSearchItem, 'source' | 'id'>, quality: MusicQuality, info: PlayInfo) => {
      const cache = playInfoCacheRef.current
      const now = Date.now()
      for (const [key, entry] of cache) {
        if (entry.expiresAt <= now) cache.delete(key)
      }

      const key = playInfoKey(row, quality)
      const expiresAt = getPlayInfoExpiry(info, now)
      cache.delete(key)
      if (expiresAt > now) cache.set(key, { info, expiresAt })

      while (cache.size > PLAY_INFO_CACHE_MAX_ENTRIES) {
        const oldestKey = cache.keys().next().value
        if (typeof oldestKey !== 'string') break
        cache.delete(oldestKey)
      }
    },
    [],
  )

  const getCachedPlayInfo = useCallback(
    (row: Pick<SongSearchItem, 'source' | 'id'>, quality: MusicQuality) => {
      const key = playInfoKey(row, quality)
      const entry = playInfoCacheRef.current.get(key)
      if (!entry) return null
      if (entry.expiresAt <= Date.now()) {
        playInfoCacheRef.current.delete(key)
        return null
      }
      playInfoCacheRef.current.delete(key)
      playInfoCacheRef.current.set(key, entry)
      return entry.info
    },
    [],
  )

  const invalidatePlayInfo = useCallback(
    (row: Pick<SongSearchItem, 'source' | 'id'>, quality: MusicQuality) => {
      const key = playInfoKey(row, quality)
      playInfoCacheRef.current.delete(key)
      playRecordRequestsRef.current.get(key)?.abort()
      playRecordRequestsRef.current.delete(key)
    },
    [],
  )

  const resolvePlayInfo = useCallback(
    (
      row: Pick<SongSearchItem, 'source' | 'id'>,
      quality: MusicQuality,
      prefetch: boolean,
    ): PlayInfoResolution => {
      const key = playInfoKey(row, quality)
      const cached = getCachedPlayInfo(row, quality)
      if (cached) {
        return {
          controller: null,
          needsPlayRecord: !prefetch,
          promise: Promise.resolve(cached),
        }
      }

      const existing = playInfoInFlightRef.current.get(key)
      if (existing && !existing.controller.signal.aborted) {
        return {
          controller: existing.prefetch ? null : existing.controller,
          needsPlayRecord: !prefetch && existing.prefetch,
          promise: existing.promise,
        }
      }

      const controller = new AbortController()
      const promise = musicPlay(row.source, row.id, quality, {
        prefetch,
        signal: controller.signal,
      })
        .then((info) => {
          if (controller.signal.aborted) throw new DOMException('请求已取消', 'AbortError')
          cachePlayInfo(row, quality, info)
          return info
        })
        .finally(() => {
          const currentRequest = playInfoInFlightRef.current.get(key)
          if (currentRequest?.promise === promise) {
            playInfoInFlightRef.current.delete(key)
          }
        })

      playInfoInFlightRef.current.set(key, { controller, prefetch, promise })
      return {
        controller,
        needsPlayRecord: false,
        promise,
      }
    },
    [cachePlayInfo, getCachedPlayInfo],
  )

  const recordCachedPlayback = useCallback(
    (row: Pick<SongSearchItem, 'source' | 'id'>, quality: MusicQuality) => {
      const key = playInfoKey(row, quality)
      if (playRecordRequestsRef.current.has(key)) return

      const controller = new AbortController()
      playRecordRequestsRef.current.set(key, controller)
      void musicPlay(row.source, row.id, quality, { signal: controller.signal })
        .then((info) => { if (!controller.signal.aborted) cachePlayInfo(row, quality, info) })
        .catch(() => {})
        .finally(() => {
          if (playRecordRequestsRef.current.get(key) === controller) {
            playRecordRequestsRef.current.delete(key)
          }
        })
    },
    [cachePlayInfo],
  )

  const applyPlayInfo = useCallback(
    (row: SongSearchItem, info: PlayInfo, quality: MusicQuality) => {
      setPreferredQualityState(quality)
      setCurrent({
        ...info,
        name: info.name || row.name,
        artist: info.artist || row.artist,
        artistId: row.artistId, artistIds: row.artistIds, albumId: row.albumId,
        album: info.album || row.album,
        durationSec: info.durationSec || row.durationSec,
        requestedQuality: quality,
        coverUrl: resolveCoverUrl(info.coverUrl, row.coverUrl),
      })
      setCurrentTime(0)
      setDuration(info.durationSec ?? 0)
      // Stop the previous track immediately. The new audioSrc isn't set until the
      // new source resolves, so without this the old song would keep playing (and
      // the "loading" spinner would mask a silent track switch) for the whole
      // resolve/decrypt window.
      audioRef.current?.pause()
      smoothClockLastRef.current = 0
      setPlayLoading(true)
    },
    [],
  )

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
      if (radioKeys.current.size && !radioKeys.current.has(`${row.source}:${row.id}`)) radioStop.current?.()
      const key = playInfoKey(row, quality)
      const previousRequest = activePlayRequestRef.current
      if (previousRequest && previousRequest.key !== key) {
        previousRequest.controller?.abort()
      }

      const generation = ++playGenerationRef.current
      setPlayLoading(true)
      setPendingTrackKey(key)
      setPreferredQualityState(quality)
      let applied = false
      try {
        const resolution = resolvePlayInfo(row, quality, false)
        activePlayRequestRef.current = { controller: resolution.controller, key }
        const info = await resolution.promise
        if (generation !== playGenerationRef.current) return
        if (resolution.needsPlayRecord) recordCachedPlayback(row, quality)
        applyPlayInfo(row, info, quality)
        applied = true
      } catch (error) {
        if (generation === playGenerationRef.current && !isCanceledRequest(error)) {
          message.error(musicPlaybackError(row.source, error))
        }
      } finally {
        if (generation === playGenerationRef.current) {
          activePlayRequestRef.current = null
          setPendingTrackKey(null)
          if (!applied) setPlayLoading(false)
        }
      }
    },
    [applyPlayInfo, message, preferredQuality, recordCachedPlayback, resolvePlayInfo],
  )

  const playResolvedSong = useCallback(
    async (row: SongSearchItem, info: PlayInfo, quality = info.requestedQuality) => {
      radioStop.current?.()
      activePlayRequestRef.current?.controller?.abort()
      activePlayRequestRef.current = null
      playGenerationRef.current += 1
      const resolvedQuality = quality || preferredQuality
      const key = playInfoKey(row, resolvedQuality)
      setPendingTrackKey(key)
      setPlayLoading(true)
      setPlaylistState([row])
      cachePlayInfo(row, resolvedQuality, info)
      applyPlayInfo(row, info, resolvedQuality)
      setPendingTrackKey(null)
    },
    [applyPlayInfo, cachePlayInfo, preferredQuality],
  )

  const playQueue = useCallback(
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

  const playPlaylist = useCallback(async (items:SongSearchItem[], startIndex=0, quality=preferredQuality) => {
    radioStop.current?.()
    await playQueue(items,startIndex,quality)
  }, [playQueue,preferredQuality])

  const playFromQueue = useCallback(
    async (index: number, quality = preferredQuality) => {
      if (index < 0 || index >= playlist.length) return
      await playSong(playlist[index], quality)
    },
    [playSong, playlist, preferredQuality],
  )

  const addToQueue = useCallback((row: SongSearchItem, position: QueueInsertPosition = 'last') => {
    if (!current) {
      message.success('已开始播放')
      void playSong(row, preferredQuality)
      return
    }
    setPlaylistState((previous) => {
      const base = previous.length ? previous : [playInfoToQueueSong(current)]
      const activeIndex = base.findIndex((item) => item.id === current.id && item.source === current.source)
      return insertIntoQueue(base, row, activeIndex, position)
    })
    message.success(position === 'next' ? '将在当前歌曲后播放' : '已添加到播放队列')
  }, [current, message, playSong, preferredQuality])

  const removeFromQueue = useCallback((index: number) => {
    if (index === currentIndex) {
      message.info('当前歌曲仍在播放，不能从队列中移除')
      return
    }
    setPlaylistState((previous) => removeQueueIndex(previous, index, currentIndex))
  }, [currentIndex, message])

  const clearQueue = useCallback(() => {
    setPlaylistState((previous) => {
      const activeIndex = previous.findIndex((item) => current && item.id === current.id && item.source === current.source)
      const remaining = clearQueueKeepingCurrent(previous, activeIndex)
      return remaining.length || !current ? remaining : [playInfoToQueueSong(current)]
    })
    message.success('已清空待播，当前歌曲继续播放')
  }, [current, message])

  const moveQueueToNext = useCallback((index: number) => {
    setPlaylistState((previous) => moveQueueItemToNext(previous, index, currentIndex))
  }, [currentIndex])

  const restartCurrentTrack = useCallback(() => {
    const el = audioRef.current
    if (!el || !current || unsupportedFormat) return false
    el.currentTime = 0
    setCurrentTime(0)
    setPlayLoading(true)
    void el.play().catch(() => setPlayLoading(false))
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
      if (radioNext.current) { radioNext.current(); return }
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
      setPlayLoading(true)
      void el.play().catch(() => {
        setPlayLoading(false)
        invalidatePlayInfo(current, current.requestedQuality)
        message.warning('播放失败，请重新点一次这首歌。')
      })
      return
    }

    el.pause()
    setPlayLoading(false)
  }, [current, invalidatePlayInfo, message, unsupportedFormat])

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

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(PREFERRED_QUALITY_KEY, preferredQuality)
  }, [preferredQuality])

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
    if (radioNext.current) { radioNext.current(); return true }
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
    setPlayLoading(false)
    message.error(
      `当前返回的是 ${unsupportedFormat} 格式，浏览器无法直接播放。请切换音质或音源后重试。`,
    )
  }, [current?.id, current?.source, current?.playUrl, message, unsupportedFormat])

  // Resolve the effective <audio> source. For a Qishui track carrying directUrl + playAuth we
  // fetch the encrypted bytes from the upstream CDN and decrypt them in the browser, then serve
  // the plaintext via a Blob URL — the audio never crosses our ECS. Decrypted Blob URLs are kept
  // in an LRU cache (see qishuiRichClient), so a prefetched / recently played track starts with
  // no fetch or decrypt at all. On any failure we fall back to the local stream URL.
  useEffect(() => {
    if (!current) {
      setActiveRichPlaybackKey(null)
      setAudioSrc(undefined)
      return
    }
    if (!hasQishuiDirectPlayback(current)) {
      setActiveRichPlaybackKey(null)
      setAudioSrc(normalizeMediaUrl(current.playUrl))
      return
    }
    const key = richPlaybackKey(current.source, current.id, preferredQuality)
    setActiveRichPlaybackKey(key)
    const cached = getCachedRichPlayback(key)
    if (cached) {
      setAudioSrc(cached)
      return
    }
    // The decrypted Blob isn't ready yet (cold track / fast skip / shuffle).
    // Start the stream URL immediately so audio begins within ~100–300ms instead
    // of blocking on a full fetch + decrypt, then upgrade to the private Blob once
    // it lands. The upgrade only happens near the start of playback (currentTime
    // < 0.4s) so it is seamless; otherwise we keep the stream for the rest of the
    // song. Prefetched tracks still hit the cache above and never touch the stream.
    setAudioSrc(normalizeMediaUrl(current.playUrl))
    const controller = new AbortController()
    setPlayLoading(true)
    void ensureRichPlayback(key, current.directUrl!, current.playAuth!)
      .then((url) => {
        if (controller.signal.aborted) return
        const el = audioRef.current
        if (!el || el.currentTime < 0.4) setAudioSrc(url)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        console.warn('Qishui rich-client decrypt pending, keeping stream URL', err)
      })
    return () => {
      controller.abort()
    }
  }, [current?.id, current?.source, current?.playUrl, current?.directUrl, current?.playAuth, preferredQuality])

  useEffect(() => {
    if (unsupportedFormat) return

    const el = audioRef.current
    if (!el || !current || !audioSrc) return

    el.load()
    void el.play().catch((error: DOMException) => {
      setPlayLoading(false)
      if (error?.name === 'NotAllowedError') {
        message.warning('浏览器阻止了自动播放，请手动点一下播放按钮。')
      }
    })
  }, [audioSrc, message, unsupportedFormat])

  // High-frequency playback clock. The native `timeupdate` event throttles to
  // ~250ms, so the lyric active line and progress bar would visibly trail the
  // audio. While playing, poll the element clock each frame and commit to state
  // only when it has moved past a small threshold (~40ms) — enough for smooth
  // word-level lyrics without re-rendering 60×/sec.
  useEffect(() => {
    if (typeof window === 'undefined' || !current || !isPlaying) return
    smoothClockLastRef.current = currentTime
    let raf = 0
    const tick = () => {
      const el = audioRef.current
      if (el && !el.paused && Number.isFinite(el.currentTime)) {
        const t = el.currentTime
        if (Math.abs(t - smoothClockLastRef.current) >= 0.04) {
          smoothClockLastRef.current = t
          setCurrentTime(t)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      if (raf) cancelAnimationFrame(raf)
    }
  }, [current, isPlaying])

  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
    const canPrefetch = authSessionId && !connection?.saveData && !['slow-2g', '2g'].includes(connection?.effectiveType || '')
      && playMode === 'sequence' && current && currentIndex >= 0
    const nextSong = canPrefetch ? playlist[currentIndex + 1] : undefined
    const currentKey = current ? `${current.source}:${current.id}` : null
    const nextKey = nextSong ? `${nextSong.source}:${nextSong.id}` : null
    // A prefetched lyric read becomes a playback read when its song is selected.
    // Keep that subscriber alive across effect cleanup/setup; cancel only songs
    // that are neither playing nor next in the queue.
    for (const [key, controller] of lyricPrefetchRequestsRef.current) {
      if (key !== currentKey && key !== nextKey) {
        controller.abort()
        lyricPrefetchRequestsRef.current.delete(key)
      }
    }
    // Same lifecycle for the 1-byte stream warmup: drop requests for songs that
    // are no longer playing or next up. Keys carry the quality so switching
    // quality re-warms the new variant.
    const currentWarmupPrefix = currentKey ? `${currentKey}|` : null
    const nextWarmupPrefix = nextKey ? `${nextKey}|` : null
    for (const [key, controller] of streamWarmupRef.current) {
      if (!(currentWarmupPrefix && key.startsWith(currentWarmupPrefix))
        && !(nextWarmupPrefix && key.startsWith(nextWarmupPrefix))) {
        controller.abort()
        streamWarmupRef.current.delete(key)
      }
    }
    if (!nextSong) return

    const resolution = resolvePlayInfo(nextSong, preferredQuality, true)

    // Warm the next track's backend stream cache as soon as its play URL is
    // known. The audio bytes never reach the browser here; when the user later
    // hits "next", the first Range lands on a warm cache (~0.12s vs ~2-4s cold).
    // Non-Qishui/remote URLs are rejected inside warmupLocalStream.
    const warmupKey = nextKey ? `${nextKey}|${preferredQuality}` : null
    if (warmupKey && !streamWarmupRef.current.has(warmupKey)) {
      const warmupController = new AbortController()
      streamWarmupRef.current.set(warmupKey, warmupController)
      void resolution.promise
        .then(info => {
          // Skip the local-stream warmup when the rich-client path will be used: it would
          // otherwise pull even a 1-byte Range through our ECS. The browser fetches the
          // encrypted bytes straight from the upstream CDN at play time instead.
          if (!warmupController.signal.aborted && !info.directUrl) {
            warmupLocalStream(info.playUrl, warmupController.signal)
          }
        })
        .catch(() => {})
    }

    // Rich-client prefetch: fetch + decrypt the next track's audio into the Blob LRU up front,
    // so pressing "next" starts with no network/decrypt work. Keys are source:id:quality and
    // match the ones the playback effect uses; an in-flight prefetch is shared, never repeated.
    const currentRichKey = currentKey ? richPlaybackKey(current!.source, current!.id, preferredQuality) : null
    const nextRichKey = nextKey ? richPlaybackKey(nextSong.source, nextSong.id, preferredQuality) : null
    for (const key of richPrefetchRef.current) {
      if (key !== currentRichKey && key !== nextRichKey) richPrefetchRef.current.delete(key)
    }
    if (nextRichKey && !richPrefetchRef.current.has(nextRichKey)) {
      richPrefetchRef.current.add(nextRichKey)
      void resolution.promise
        .then(info => {
          if (info.directUrl && info.playAuth && hasQishuiDirectPlayback(info)) {
            return ensureRichPlayback(nextRichKey, info.directUrl, info.playAuth)
          }
          // No direct URL this time (upstream resolution failed) — allow a later retry.
          richPrefetchRef.current.delete(nextRichKey)
        })
        .catch(() => {
          richPrefetchRef.current.delete(nextRichKey)
        })
    }

    if (nextSong.source !== 'qishui' || !nextKey || lyricPrefetchRequestsRef.current.has(nextKey)) {
      void resolution.promise.catch(() => {})
      return
    }
    const lyricsController = new AbortController()
    lyricPrefetchRequestsRef.current.set(nextKey, lyricsController)
    void resolution.promise.then(info => {
      if (lyricsController.signal.aborted || hasQishuiInlineLyrics(info)) return
      return musicLyric('qishui', nextSong.id, lyricsController.signal)
    }).catch(() => {}).finally(() => {
      if (lyricPrefetchRequestsRef.current.get(nextKey) === lyricsController) lyricPrefetchRequestsRef.current.delete(nextKey)
    })
  }, [authSessionId, current?.id, current?.source, currentIndex, playMode, playlist, preferredQuality, resolvePlayInfo])

  useEffect(() => {
    if (previousAuthSessionRef.current === authSessionId) return
    previousAuthSessionRef.current = authSessionId
    playGenerationRef.current += 1
    activePlayRequestRef.current?.controller?.abort()
    activePlayRequestRef.current = null
    for (const request of playInfoInFlightRef.current.values()) request.controller.abort()
    for (const controller of playRecordRequestsRef.current.values()) controller.abort()
    for (const controller of lyricPrefetchRequestsRef.current.values()) controller.abort()
    for (const controller of streamWarmupRef.current.values()) controller.abort()
    playInfoInFlightRef.current.clear()
    playRecordRequestsRef.current.clear()
    lyricPrefetchRequestsRef.current.clear()
    streamWarmupRef.current.clear()
    richPrefetchRef.current.clear()
    setActiveRichPlaybackKey(null)
    clearRichPlaybackCache()
    playInfoCacheRef.current.clear()
    setPendingTrackKey(null)
    setPlayLoading(false)
    setCurrent(null); setPlaylistState([]); setCurrentTime(0); setArtistTarget(null); audioRef.current?.pause()
  }, [authSessionId])

  useEffect(
    () => () => {
      playGenerationRef.current += 1
      activePlayRequestRef.current?.controller?.abort()
      for (const request of playInfoInFlightRef.current.values()) request.controller.abort()
      for (const controller of playRecordRequestsRef.current.values()) controller.abort()
      for (const controller of lyricPrefetchRequestsRef.current.values()) controller.abort()
      clearRichPlaybackCache()
    },
    [],
  )

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    el.volume = volume
    el.muted = muted
  }, [muted, volume])

  useEffect(() => {
    if (current?.source !== 'qishui' || !authSessionId) return
    // Search, collections and feed cards already supply these fields. Only enrich
    // incomplete entries (for example old favorites or a shared playback ticket).
    if (current.name && current.artist && current.artistId && current.albumId && current.coverUrl && current.durationSec) return
    const id = current.id, controller = new AbortController()
    void qishuiSongInfo(id, controller.signal).then(meta => {
      // 上游异常时可能返回空 data；不要让一次元数据补全拖垮整个播放器。
      if (controller.signal.aborted || !meta) return
      setCurrent(previous => previous?.source === 'qishui' && previous.id === id ? {
        ...previous, name:meta.name || previous.name, artist:meta.artist || previous.artist,
        artistId:meta.artistId, artistIds:meta.artistIds, albumId:meta.albumId,
        album:meta.album || previous.album, coverUrl:resolveCoverUrl(meta.coverUrl,previous.coverUrl), durationSec:meta.durationSec || previous.durationSec,
      } : previous)
    }).catch(()=>{})
    return () => controller.abort()
  }, [current?.id, current?.source, authSessionId])
  const radio = useQishuiRoaming(authSessionId, playQueue, radioKeys, radioNext, setRadioAvailable)
  radioStop.current = radio.stopRoaming
  const lyrics = usePlayerLyrics(current, currentTime, authSessionId)
  const mediaPlay = useCallback(() => { if (audioRef.current?.paused) togglePlay() }, [togglePlay])
  const mediaPause = useCallback(() => audioRef.current?.pause(), [])
  const mediaSessionSupported = useMusicMediaSession(current, lyrics.lyricLines[lyrics.activeLyricIndex]?.text,
    lyrics.bluetoothLyrics, isPlaying, currentTime, duration, mediaPlay, mediaPause,
    canPrev ? playPrev : null, canNext ? playNext : null, seekToTime)

  const value = useMemo<MusicPlayerContextValue>(
    () => ({
      ...lyrics,
      ...radio,
      artistTarget, openArtist, closeArtist,
      mediaSessionSupported,
      current,
      playlist,
      currentIndex,
      isPlaying,
      currentTime,
      duration,
      volume,
      muted,
      playLoading,
      pendingTrackKey,
      unsupportedFormat,
      preferredQuality,
      playMode,
      canPrev,
      canNext,
      setPlaylist,
      playPlaylist,
      playFromQueue,
      addToQueue,
      removeFromQueue,
      clearQueue,
      moveQueueToNext,
      setPreferredQuality,
      playSong,
      playResolvedSong,
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
      lyrics,
      radio, artistTarget, openArtist, closeArtist,
      mediaSessionSupported,
      canNext,
      canPrev,
      cyclePlayMode,
      current,
      currentIndex,
      currentTime,
      duration,
      isPlaying,
      muted,
      pendingTrackKey,
      playMode,
      playLoading,
      playNext,
      playFromQueue,
      addToQueue,
      removeFromQueue,
      clearQueue,
      moveQueueToNext,
      playPrev,
      playPlaylist,
      playSong,
      playResolvedSong,
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

  const browse = useMemo<MusicBrowseValue>(() => ({
    artistTarget, openArtist, closeArtist, current, playlist, currentIndex, isPlaying, playLoading, pendingTrackKey, unsupportedFormat, preferredQuality, playMode, canPrev, canNext, setPlaylist, playPlaylist, playFromQueue, addToQueue, removeFromQueue, clearQueue, moveQueueToNext, setPreferredQuality, playSong, playResolvedSong, togglePlay, playPrev, playNext, setAutoNextHandler,
    roamingSession: radio.roamingSession, roamingBusy: radio.roamingBusy, roamingError: radio.roamingError, startRoaming: radio.startRoaming, nextRoaming: radio.nextRoaming, stopRoaming: radio.stopRoaming
  }), [artistTarget, openArtist, closeArtist, current, playlist, currentIndex, isPlaying, playLoading, pendingTrackKey, unsupportedFormat, preferredQuality, playMode, canPrev, canNext, setPlaylist, playPlaylist, playFromQueue, addToQueue, removeFromQueue, clearQueue, moveQueueToNext, setPreferredQuality, playSong, playResolvedSong, togglePlay, playPrev, playNext, setAutoNextHandler, radio.roamingSession, radio.roamingBusy, radio.roamingError, radio.startRoaming, radio.nextRoaming, radio.stopRoaming])

  return (
    <MusicPlayerContext.Provider value={value}>
      <MusicBrowseContext.Provider value={browse}>{children}</MusicBrowseContext.Provider>
      <audio
        ref={audioRef}
        src={audioSrc}
        preload="metadata"
        style={{ display: 'none' }}
        onLoadStart={() => setPlayLoading(true)}
        onWaiting={() => setPlayLoading(true)}
        onStalled={() => setPlayLoading(true)}
        onCanPlay={() => setPlayLoading(false)}
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
        onPlaying={() => {
          setIsPlaying(true)
          setPlayLoading(false)
        }}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false)
          advanceQueue()
        }}
        onError={(event) => {
          const el = event.currentTarget as HTMLAudioElement
          setIsPlaying(false)
          setPlayLoading(false)
          if (current) invalidatePlayInfo(current, current.requestedQuality)
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

/** Lists and navigation do not subscribe to the audio clock. */
export function useMusicBrowse() {
  const value = useContext(MusicBrowseContext)
  if (!value) throw new Error('useMusicBrowse must be used within MusicPlayerProvider')
  return value
}
