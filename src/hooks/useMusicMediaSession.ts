import { useEffect } from 'react'
import type { PlayInfo } from '../types'
import { lyricMediaTitle } from '../utils/musicLyrics'
import { coverUrlForSize } from '../utils/musicPlayer'
export function useMusicMediaSession(current: PlayInfo | null, line: string | undefined, bluetoothLyrics: boolean,
  isPlaying: boolean, position: number, duration: number, play: () => void, pause: () => void,
  previous: (() => void) | null, next: (() => void) | null, seek: (time: number) => void) {
  const supported = typeof navigator !== 'undefined' && 'mediaSession' in navigator && typeof MediaMetadata !== 'undefined'
  const title = current ? lyricMediaTitle(current.name || '未知歌曲', line, bluetoothLyrics) : ''
  useEffect(() => {
    if (!supported) return
    try {
      const cover = coverUrlForSize(current?.coverUrl, 150)
      navigator.mediaSession.metadata = current ? new MediaMetadata({ title, artist: current.artist || '', album: current.album || '', artwork: cover ? [{ src: cover }] : [] }) : null
    } catch { /* Some browsers reject artwork; lyrics must not interrupt playback. */ }
  }, [supported, title, current?.id, current?.source, current?.artist, current?.album, current?.coverUrl])
  useEffect(() => {
    if (!supported) return
    navigator.mediaSession.playbackState = current ? isPlaying ? 'playing' : 'paused' : 'none'
    try { if (current && Number.isFinite(duration) && duration > 0) navigator.mediaSession.setPositionState?.({duration, position:Math.min(duration, Math.max(0, position)), playbackRate:1}); else navigator.mediaSession.setPositionState?.() } catch {}
  }, [supported, !!current, isPlaying, position, duration])
  useEffect(() => {
    if (!supported) return
    const handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler | null>> = {
      play: current ? play : null, pause: current ? pause : null, previoustrack: current ? previous : null, nexttrack: current ? next : null,
      seekto: current ? d => { if (d.seekTime != null) seek(d.seekTime) } : null,
      seekbackward: current ? d => seek(position - (d.seekOffset ?? 10)) : null,
      seekforward: current ? d => seek(position + (d.seekOffset ?? 10)) : null,
    }
    for (const [action, handler] of Object.entries(handlers)) { try { navigator.mediaSession.setActionHandler(action as MediaSessionAction, handler ?? null) } catch {} }
    return () => { for (const action of Object.keys(handlers)) { try { navigator.mediaSession.setActionHandler(action as MediaSessionAction, null) } catch {} } }
  }, [supported, !!current, play, pause, previous, next, seek, position])
  useEffect(() => () => { if (supported) { navigator.mediaSession.metadata = null; navigator.mediaSession.playbackState = 'none' } }, [supported])
  return supported
}
