import { useCallback, useEffect, useMemo, useState } from 'react'
import { musicLyric, musicTtml } from '../api/music'
import type { PlayInfo, LyricView } from '../types'
import { parseLrc } from '../utils/musicPlayer'
import { parseTtml, parseYrc, activeLyricIndex, type TimedLyricLine } from '../utils/musicLyrics'
function preference(key: string, fallback: boolean) { try { const v = localStorage.getItem(key); return v == null ? fallback : v === 'true' } catch { return fallback } }
export function usePlayerLyrics(current: PlayInfo | null, currentTime: number, authToken: string | null) {
  const [preferTtml, setPreferTtml] = useState(() => preference('music-prefer-ttml', true))
  const [bluetoothLyrics, setBluetoothLyrics] = useState(() => preference('music-bluetooth-lyrics', false))
  const [online, setOnline] = useState<{ key: string; token: string; lines: TimedLyricLine[] } | null>(null)
  const [local, setLocal] = useState<{ key: string; token: string | null; lines: TimedLyricLine[] } | null>(null)
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const [fetched, setFetched] = useState<{key:string; token:string; data:LyricView} | null>(null)
  const [lyricLoading, setLyricLoading] = useState(false)
  const [lyricError, setLyricError] = useState('')
  const [retry, setRetry] = useState(0)
  const retryLyrics = useCallback(() => setRetry(v => v + 1), [])
  const key = current ? `${current.source}:${current.id}` : ''
  useEffect(() => { try { localStorage.setItem('music-prefer-ttml', String(preferTtml)) } catch {} }, [preferTtml])
  useEffect(() => { try { localStorage.setItem('music-bluetooth-lyrics', String(bluetoothLyrics)) } catch {} }, [bluetoothLyrics])
  useEffect(() => {
    setOnline(null); setLoadingKey(null)
    if (!current || !authToken || !preferTtml || !['qq', 'netease'].includes(current.actualSource || current.source)) return
    const source = current.actualSource || current.source
    const id = current.actualId || (source === current.source ? current.id : null)
    if (!id) return
    const controller = new AbortController()
    setLoadingKey(key)
    void musicTtml(source, id, controller.signal).then(result => {
      if (!controller.signal.aborted && result.available && result.content) setOnline({ key, token: authToken, lines: parseTtml(result.content) })
    }).catch(() => { /* Optional enhancement: preserve original lyrics. */ }).finally(() => {
      if (!controller.signal.aborted) setLoadingKey(null)
    })
    return () => controller.abort()
  }, [key, current?.actualSource, current?.actualId, authToken, preferTtml])
  useEffect(() => {
    setFetched(null); setLyricError(''); setLyricLoading(false)
    if (!current || !authToken) return
    const source = current.actualSource || current.source
    const id = current.actualId || (source === current.source ? current.id : null)
    if (!id) return
    const controller = new AbortController()
    setLyricLoading(true)
    void musicLyric(source, id, controller.signal).then(data => {
      if (!controller.signal.aborted) setFetched({key, token:authToken, data})
    }).catch(() => { if (!controller.signal.aborted) setLyricError('歌词暂时未能加载') })
      .finally(() => { if (!controller.signal.aborted) setLyricLoading(false) })
    return () => controller.abort()
  }, [key, current?.actualSource, current?.actualId, authToken, retry])
  useEffect(() => { setLocal(null) }, [key, authToken])
  const setLocalLyrics = useCallback((raw: string, filename: string) => {
    if (!key) throw new Error('请先选择歌曲')
    if (raw.length > 1024 * 1024) throw new Error('歌词文件不能超过 1 MB')
    const lines = /\.ttml$/i.test(filename) ? parseTtml(raw) : /\.lrc$/i.test(filename) ? parseLrc(raw) : []
    if (!lines.length) throw new Error('请选择包含时间标记的 TTML 或 LRC 歌词')
    setLocal({ key, token: authToken, lines })
  }, [key, authToken])
  const clearLocalLyrics = useCallback(() => setLocal(null), [])
  const effectiveLyric = fetched?.key === key && fetched.token === authToken && (fetched.data.lineLyrics || fetched.data.karaokeLyrics) ? fetched.data : current?.lyric
  const original = useMemo<TimedLyricLine[]>(() => {
    const words = parseYrc(effectiveLyric?.karaokeLyrics)
    return words.length ? words : parseLrc(effectiveLyric?.lineLyrics)
  }, [effectiveLyric?.lineLyrics, effectiveLyric?.karaokeLyrics])
  const localMatch = local?.key === key && local.token === authToken ? local : null
  const onlineMatch = preferTtml && online?.key === key && online.token === authToken ? online : null
  const lyricLines: TimedLyricLine[] = localMatch?.lines ?? onlineMatch?.lines ?? original
  const lyricFormat = localMatch ? '本地歌词' : onlineMatch ? 'TTML' : original.some(l => l.words?.length) ? '逐字歌词' : '原歌词'
  return { lyricLoading, lyricError, retryLyrics, lyricPlainText:effectiveLyric?.lineLyrics, lyricLines, activeLyricIndex: activeLyricIndex(lyricLines, currentTime), lyricFormat, ttmlLoading: loadingKey === key && !!key,
    preferTtml, setPreferTtml, bluetoothLyrics, setBluetoothLyrics, setLocalLyrics, clearLocalLyrics, hasLocalLyrics: !!localMatch }
}
