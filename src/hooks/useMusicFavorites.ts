import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { App as AntApp } from 'antd'
import {
  deleteMusicFavorite,
  getMusicFavoriteStatuses,
  saveMusicFavorite,
} from '../api/music'
import { AUTH_CHANGE_EVENT, getAuthSessionId } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { MusicFavoriteStore } from '../utils/musicFavoriteStore'
import type { SongSearchItem } from '../types'

const store = new MusicFavoriteStore()
const syncScope = () => store.setScope(getAuthSessionId())
if (typeof window !== 'undefined') {
  syncScope()
  window.addEventListener(AUTH_CHANGE_EVENT, syncScope)
  window.addEventListener('storage', syncScope)
}
function favoriteKey(song: Pick<SongSearchItem, 'source' | 'id'>) {
  return `${song.source}:${song.id}`
}

export function useMusicFavorites(songs: SongSearchItem[]) {
  const { message } = AntApp.useApp()
  const auth = useAuth()
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const keys = useMemo(() => songs.map(favoriteKey).join(','), [songs])
  useEffect(() => {
    syncScope()
    const scope = getAuthSessionId()
    if (!auth.token || !scope || !songs.length) return
    let active = true
    const groups = songs.reduce<Record<string, SongSearchItem[]>>(
      (result, song) => {
        ;(result[song.source] ||= []).push(song)
        return result
      },
      {},
    )
    for (const rows of Object.values(groups)) {
      const ids = [...new Set(rows.map((row) => row.id))].filter(
        (id) => !(`${rows[0].source}:${id}` in store.getSnapshot().liked),
      )
      if (!ids.length) continue
      void getMusicFavoriteStatuses(rows[0].source, ids)
        .then((statuses) => {
          if (active)
            store.hydrate(
              scope,
              statuses.map((status) => ({
                key: `${status.source}:${status.songId}`,
                liked: status.liked,
              })),
            )
        })
        .catch(() => {})
    }
    return () => {
      active = false
    }
  }, [auth.token, keys])

  const toggleFavorite = async (song: SongSearchItem) => {
    const scope = getAuthSessionId()
    if (!auth.token || !scope) {
      message.info('登录后可使用收藏功能')
      return false
    }
    syncScope()
    const key = favoriteKey(song),
      previous = !!store.getSnapshot().liked[key]
    try {
      return await store.toggle(scope, key, (liked) =>
        liked
          ? saveMusicFavorite({
              source: song.source,
              songId: song.id,
              name: song.name,
              artist: song.artist,
              album: song.album,
              coverUrl: song.coverUrl,
              durationSec: song.durationSec,
            })
          : deleteMusicFavorite(song.source, song.id),
      )
    } catch (error) {
      if (getAuthSessionId() === scope) message.error((error as Error).message)
      return previous
    }
  }
  return {
    canFavorite: !!auth.token,
    favoriteMap: state.liked,
    favoriteLoadingKey: Object.keys(state.pending)[0] || null,
    isFavorite: (song: Pick<SongSearchItem, 'source' | 'id'>) =>
      !!state.liked[favoriteKey(song)],
    isFavoriteLoading: (song: Pick<SongSearchItem, 'source' | 'id'>) =>
      !!state.pending[favoriteKey(song)],
    toggleFavorite,
  }
}
