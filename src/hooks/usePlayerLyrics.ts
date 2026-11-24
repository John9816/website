import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { musicLyric, musicTtml } from '../api/music'
import type { PlayInfo, LyricView } from '../types'
import { hasQishuiInlineLyrics, parseLrc } from '../utils/musicPlayer'
import { parseTtml, parseYrc, activeLyricIndex, lyricPreviewText, type TimedLyricLine } from '../utils/musicLyrics'
function preference(key: string, fallback: boolean) { try { const v = localStorage.getItem(key); return v == null ? fallback : v === 'true' } catch { return fallback } }
export function usePlayerLyrics(current: PlayInfo | null, currentTime: number, authSessionId: string | null) {
  const [preferTtml, setPreferTtml] = useState(() => preference('music-prefer-ttml', true))
  const [bluetoothLyrics, setBluetoothLyrics] = useState(() => preference('music-bluetooth-lyrics', false))
  const [online, setOnline] = useState<{ key: string; session: string; lines: TimedLyricLine[] } | null>(null)
  const [local, setLocal] = useState<{ key: string; session: string | null; lines: TimedLyricLine[] } | null>(null)
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const [fetched, setFetched] = useState<{key:string; session:string; data:LyricView} | null>(null)
  const [lyricLoading, setLyricLoading] = useState(false)
  const [lyricError, setLyricError] = useState('')
  const [retry, setRetry] = useState<{ key: string; version: number } | null>(null)
  const consumedRetry = useRef<typeof retry>(null)
  const key = current ? `${current.source}:${current.id}` : ''
  const retryLyrics = useCallback(() => setRetry(v => ({ key, version: (v?.version || 0) + 1 })), [key])
  const inlineLyrics = hasQishuiInlineLyrics(current)
  useEffect(() => { try { localStorage.setItem('music-prefer-ttml', String(preferTtml)) } catch {} }, [preferTtml])
  useEffect(() => { try { localStorage.setItem('music-bluetooth-lyrics', String(bluetoothLyrics)) } catch {} }, [bluetoothLyrics])
  useEffect(() => {
    setOnline(null); setLoadingKey(null)
    if (!current || !authSessionId || !preferTtml || !['qq', 'netease'].includes(current.actualSource || current.source)) return
    const source = current.actualSource || current.source
    const id = current.actualId || (source === current.source ? current.id : null)
    if (!id) return
    const controller = new AbortController()
    setLoadingKey(key)
    void musicTtml(source, id, controller.signal).then(result => {
      if (!controller.signal.aborted && result.available && result.content) setOnline({ key, session: authSessionId, lines: parseTtml(result.content) })
    }).catch(() => { /* Optional enhancement: preserve original lyrics. */ }).finally(() => {
      if (!controller.signal.aborted) setLoadingKey(null)
    })
    return () => controller.abort()
  }, [key, current?.actualSource, current?.actualId, authSessionId, preferTtml])
  useEffect(() => {
    setFetched(null); setLyricError(''); setLyricLoading(false)
    if (!current || !authSessionId) return
    const refresh = retry?.key === key && consumedRetry.current !== retry
    if (refresh) consumedRetry.current = retry
    if (inlineLyrics && !refresh) return
    const source = current.actualSource || current.source
    const id = current.actualId || (source === current.source ? current.id : null)
    if (!id) return
    const controller = new AbortController()
    setLyricLoading(true)
    void musicLyric(source, id, controller.signal, refresh).then(data => {
      if (!controller.signal.aborted) setFetched({key, session:authSessionId, data})
    }).catch(() => { if (!controller.signal.aborted) setLyricError('歌词暂时未能加载') })
      .finally(() => { if (!controller.signal.aborted) setLyricLoading(false) })
    return () => controller.abort()
  }, [key, current?.actualSource, current?.actualId, authSessionId, retry, inlineLyrics])
  useEffect(() => { setLocal(null) }, [key, authSessionId])
  const setLocalLyrics = useCallback((raw: string, filename: string) => {
    if (!key) throw new Error('请先选择歌曲')
    if (raw.length > 1024 * 1024) throw new Error('歌词文件不能超过 1 MB')
    const lines = /\.ttml$/i.test(filename) ? parseTtml(raw) : /\.lrc$/i.test(filename) ? parseLrc(raw) : []
    if (!lines.length) throw new Error('请选择包含时间标记的 TTML 或 LRC 歌词')
    setLocal({ key, session: authSessionId, lines })
  }, [key, authSessionId])
  const clearLocalLyrics = useCallback(() => setLocal(null), [])
  const effectiveLyric = fetched?.key === key && fetched.session === authSessionId && (fetched.data.lineLyrics || fetched.data.karaokeLyrics) ? fetched.data : current?.lyric
  const original = useMemo<TimedLyricLine[]>(() => {
    const words = parseYrc(effectiveLyric?.karaokeLyrics)
    return words.length ? words : parseLrc(effectiveLyric?.lineLyrics)
  }, [effectiveLyric?.lineLyrics, effectiveLyric?.karaokeLyrics])
  const localMatch = local?.key === key && local.session === authSessionId ? local : null
  const onlineMatch = preferTtml && online?.key === key && online.session === authSessionId ? online : null
  const lyricLines: TimedLyricLine[] = localMatch?.lines ?? onlineMatch?.lines ?? original
  const lyricFormat = localMatch ? '本地歌词' : onlineMatch ? 'TTML' : original.some(l => l.words?.length) ? '逐字歌词' : '原歌词'
  const lyricPreview = lyricPreviewText(lyricLines, currentTime) || effectiveLyric?.lineLyrics?.trim().split(/\r?\n/)[0] || (lyricLoading ? '正在加载歌词…' : lyricError || '暂无歌词')
  return { lyricPreview, lyricLoading, lyricError, retryLyrics, lyricPlainText:effectiveLyric?.lineLyrics, lyricLines, activeLyricIndex: activeLyricIndex(lyricLines, currentTime), lyricFormat, ttmlLoading: loadingKey === key && !!key,
    preferTtml, setPreferTtml, bluetoothLyrics, setBluetoothLyrics, setLocalLyrics, clearLocalLyrics, hasLocalLyrics: !!localMatch }
}
