import { useEffect, useMemo, useRef, useState } from 'react'
import { App as AntApp } from 'antd'
import {
  deleteMusicFavorite,
  getMusicFavoriteStatus,
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

  useEffect(() => {
    if (!auth.token || !songs.length) {
      setFavoriteMap({})
      return
    }

    const requestId = ++requestIdRef.current
    Promise.all(
      songs.map(async (song) => {
        const status = await getMusicFavoriteStatus(song.source, song.id)
        return [favoriteKey(song), status.liked] as const
      }),
    )
      .then((entries) => {
        if (requestId !== requestIdRef.current) return
        setFavoriteMap(Object.fromEntries(entries))
      })
      .catch(() => {
        if (requestId !== requestIdRef.current) return
        setFavoriteMap({})
      })
  }, [auth.token, songs])

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
