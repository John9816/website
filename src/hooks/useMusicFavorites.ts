import { useEffect, useMemo, useRef, useState } from 'react'
import { App as AntApp } from 'antd'
import {
  deleteMusicFavorite,
  getMusicFavoriteStatuses,
  saveMusicFavorite,
} from '../api/music'
import { useAuth } from '../context/AuthContext'
import type { SongSearchItem } from '../types'

function favoriteKey(song: Pick<SongSearchItem, 'source' | 'id'>) {
  return `${song.source}:${song.id}`
}

export function useMusicFavorites(songs: SongSearchItem[]) {
  const { message } = AntApp.useApp()
  const auth = useAuth()
  const [favoriteMap, setFavoriteMap] = useState<Record<string, boolean>>({})
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const songKeys = useMemo(() => songs.map((song) => favoriteKey(song)), [songs])
  const songKeysJoined = songKeys.join(',')

  useEffect(() => {
    if (!auth.token || !songs.length) {
      setFavoriteMap({})
      return
    }

    const requestId = ++requestIdRef.current
    const songsBySource = songs.reduce<Record<string, SongSearchItem[]>>((groups, song) => {
      if (!groups[song.source]) groups[song.source] = []
      groups[song.source].push(song)
      return groups
    }, {})

    Promise.all(
      Object.entries(songsBySource).map(async ([source, sourceSongs]) => {
        const uniqueSongIds = Array.from(new Set(sourceSongs.map((song) => song.id)))
        try {
          return await getMusicFavoriteStatuses(sourceSongs[0].source, uniqueSongIds)
        } catch (e) {
          return uniqueSongIds.map((songId) => ({
            source,
            songId,
            liked: false,
            favoriteId: null,
          }))
        }
      }),
    )
      .then((groups) => {
        if (requestId !== requestIdRef.current) return
        const nextEntries = groups
          .flat()
          .map((status) => [`${status.source}:${status.songId}`, status.liked] as const)
        setFavoriteMap(Object.fromEntries(nextEntries))
      })
      .catch(() => {
        if (requestId !== requestIdRef.current) return
        setFavoriteMap({})
      })
  }, [auth.token, songKeysJoined]) // 使用拼接后的字符串作为依赖，避免引用变化导致的重复请求

  useEffect(() => {
    setFavoriteMap((previous) => {
      const next: Record<string, boolean> = {}
      songKeys.forEach((key) => {
        if (previous[key] !== undefined) next[key] = previous[key]
      })
      return next
    })
  }, [songKeys])

  const toggleFavorite = async (song: SongSearchItem) => {
    if (!auth.token) {
      message.info('登录后可使用收藏功能')
      return false
    }

    const key = favoriteKey(song)
    const liked = !!favoriteMap[key]
    setLoadingKey(key)
    try {
      if (liked) {
        await deleteMusicFavorite(song.source, song.id)
        setFavoriteMap((previous) => ({ ...previous, [key]: false }))
        return false
      }

      await saveMusicFavorite({
        source: song.source,
        songId: song.id,
        name: song.name,
        artist: song.artist,
        album: song.album,
        coverUrl: song.coverUrl,
        durationSec: song.durationSec,
      })
      setFavoriteMap((previous) => ({ ...previous, [key]: true }))
      return true
    } catch (error) {
      message.error((error as Error).message)
      return liked
    } finally {
      setLoadingKey(null)
    }
  }

  return {
    canFavorite: !!auth.token,
    favoriteMap,
    favoriteLoadingKey: loadingKey,
    isFavorite(song: Pick<SongSearchItem, 'source' | 'id'>) {
      return !!favoriteMap[favoriteKey(song)]
    },
    isFavoriteLoading(song: Pick<SongSearchItem, 'source' | 'id'>) {
      return loadingKey === favoriteKey(song)
    },
    toggleFavorite,
  }
}
