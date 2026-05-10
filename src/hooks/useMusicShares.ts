import { useEffect, useMemo, useRef, useState } from 'react'
import { getMusicShareStatus } from '../api/music'
import { useAuth } from '../context/AuthContext'
import type { MusicShareView, SongSearchItem } from '../types'

function shareKey(song: Pick<SongSearchItem, 'source' | 'id'>) {
  return `${song.source}:${song.id}`
}

export function useMusicShares(songs: SongSearchItem[]) {
  const auth = useAuth()
  const [shareMap, setShareMap] = useState<Record<string, MusicShareView | null>>({})
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const songKeys = useMemo(() => songs.map((song) => shareKey(song)), [songs])

  useEffect(() => {
    if (!auth.token || !songs.length) {
      setShareMap({})
      return
    }

    const requestId = ++requestIdRef.current
    Promise.all(
      songs.map(async (song) => {
        const status = await getMusicShareStatus(song.source, song.id)
        return [shareKey(song), status] as const
      }),
    )
      .then((entries) => {
        if (requestId !== requestIdRef.current) return
        setShareMap(Object.fromEntries(entries))
      })
      .catch(() => {
        if (requestId !== requestIdRef.current) return
        setShareMap({})
      })
  }, [auth.token, songs])

  useEffect(() => {
    setShareMap((previous) => {
      const next: Record<string, MusicShareView | null> = {}
      songKeys.forEach((key) => {
        if (key in previous) next[key] = previous[key]
      })
      return next
    })
  }, [songKeys])

  return {
    canShare: !!auth.token,
    shareMap,
    shareLoadingKey: loadingKey,
    isShared(song: Pick<SongSearchItem, 'source' | 'id'>) {
      return !!shareMap[shareKey(song)]?.token
    },
    isShareLoading(song: Pick<SongSearchItem, 'source' | 'id'>) {
      return loadingKey === shareKey(song)
    },
    getShare(song: Pick<SongSearchItem, 'source' | 'id'>) {
      return shareMap[shareKey(song)] ?? null
    },
    setShare(song: Pick<SongSearchItem, 'source' | 'id'>, share: MusicShareView | null) {
      const key = shareKey(song)
      setShareMap((previous) => ({ ...previous, [key]: share }))
      setLoadingKey(null)
    },
  }
}
