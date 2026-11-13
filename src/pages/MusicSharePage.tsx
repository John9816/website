import { sourceLabel } from '../features/music/sources'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { App as AntApp, Button, Result, Spin } from 'antd'
import { ChevronLeft, Copy, Headphones, LockOpen, Pause, Play, RefreshCcw } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { getPublicMusicShare } from '../api/music'
import MusicCover from '../components/MusicCover'
import { useMusicBrowse } from '../context/MusicPlayerContext'
import type { MusicPublicShareView, SongSearchItem } from '../types'
import { coverUrlForSize, formatDuration } from '../utils/musicPlayer'
import { copyText } from '../utils/share'
import '../styles/music-share-live.css'

const ALL_QUALITIES = ['128k', '320k', 'flac', 'flac24bit'] as const

function toSongSearchItem(data: MusicPublicShareView): SongSearchItem {
  return {
    id: data.songId,
    source: data.source,
    name: data.name,
    artist: data.artist ?? '',
    album: data.album ?? undefined,
    coverUrl: data.playInfo?.coverUrl || data.coverUrl || undefined,
    durationSec: data.playInfo?.durationSec ?? data.durationSec ?? undefined,
    availableQualities: [...ALL_QUALITIES],
  }
}

function absoluteCoverUrl(raw?: string | null, origin?: string): string {
  const value = (raw || '').trim()
  if (/^https?:\/\//i.test(value)) return value
  if (origin && value.startsWith('/')) return `${origin}${value}`
  return origin ? `${origin}/share-cover.png` : ''
}

/** Upsert a document.head meta tag and remember its previous value for cleanup. */
function upsertMeta(
  attr: 'property' | 'name',
  key: string,
  value: string,
  restore: Map<string, string | null>,
) {
  const selector = `meta[${attr}="${key}"]`
  let el = document.head.querySelector<HTMLMetaElement>(selector)
  const id = `${attr}:${key}`
  if (!restore.has(id)) restore.set(id, el?.getAttribute('content') ?? null)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', value)
}

export default function MusicSharePage() {
  const { message } = AntApp.useApp()
  const { token } = useParams<{ token: string }>()
  const { playResolvedSong, togglePlay, isPlaying, playLoading } = useMusicBrowse()
  const [loading, setLoading] = useState(true)
  const [share, setShare] = useState<MusicPublicShareView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [started, setStarted] = useState(false)
  const autoTriedToken = useRef<string | null>(null)

  const loadShare = useCallback(async () => {
    if (!token) {
      setShare(null)
      setError('分享令牌缺失')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const data = await getPublicMusicShare(token)
      setShare(data)
    } catch (nextError) {
      setShare(null)
      setError((nextError as Error).message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void loadShare()
  }, [loadShare])

  const shareUrl = useMemo(() => {
    if (!token || typeof window === 'undefined') return ''
    return new URL(`/music/share/${token}`, window.location.origin).toString()
  }, [token])

  // Give real users (and in-app browsers) the same title/card as social crawlers get
  // from the Node layer. Restore everything on unmount so the SPA keeps its own meta.
  useEffect(() => {
    if (!share) return
    const previousTitle = document.title
    const restore = new Map<string, string | null>()
    const who = share.artist?.trim() || '未知歌手'
    const title = `${share.name} - ${who} · 无需登录点开即听`
    const description = `${share.name} - ${who}，无需登录，点开即听。来自 751152.xyz 音乐分享。`
    const origin = typeof window === 'undefined' ? undefined : window.location.origin
    const cover = absoluteCoverUrl(share.playInfo?.coverUrl ?? share.coverUrl, origin)

    document.title = title
    upsertMeta('property', 'og:title', title, restore)
    upsertMeta('property', 'og:description', description, restore)
    upsertMeta('property', 'og:type', 'music.song', restore)
    if (shareUrl) upsertMeta('property', 'og:url', shareUrl, restore)
    if (cover) {
      upsertMeta('property', 'og:image', cover, restore)
      upsertMeta('name', 'twitter:image', cover, restore)
    }
    upsertMeta('name', 'twitter:card', 'summary_large_image', restore)
    upsertMeta('name', 'twitter:title', title, restore)
    upsertMeta('name', 'twitter:description', description, restore)

    return () => {
      document.title = previousTitle
      for (const [id, previous] of restore) {
        const [attr, key] = id.split(':')
        const el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
        if (!el) continue
        if (previous === null) el.remove()
        else el.setAttribute('content', previous)
      }
    }
  }, [share, shareUrl])

  // Try to start playback as soon as the public share resolves. Browsers may block
  // autoplay; the big play button below always remains available as the fallback.
  useEffect(() => {
    if (!token || !share?.playable || !share.playInfo?.playUrl) return
    if (autoTriedToken.current === token) return
    autoTriedToken.current = token
    void playResolvedSong(toSongSearchItem(share), share.playInfo, share.requestedQuality)
      .then(() => setStarted(true))
      .catch(() => {
        // Autoplay rejection (NotAllowedError etc.) is expected; the user can tap play.
      })
  }, [token, share, playResolvedSong, share?.requestedQuality])

  const handleCopyLink = async () => {
    if (!shareUrl) return
    try {
      await copyText(shareUrl)
      message.success('公开链接已复制')
    } catch {
      message.error('复制失败，请检查浏览器权限')
    }
  }

  const handlePrimary = async () => {
    if (!share) return
    if (started) {
      togglePlay()
      return
    }
    if (!share.playInfo?.playUrl) {
      await loadShare()
      return
    }
    try {
      await playResolvedSong(toSongSearchItem(share), share.playInfo, share.requestedQuality)
      setStarted(true)
    } catch {
      message.error('播放失败，请稍后重新解析')
    }
  }

  const heroCoverUrl = coverUrlForSize(share?.playInfo?.coverUrl ?? share?.coverUrl ?? undefined, 320)
  const heroStyle = heroCoverUrl
    ? ({ ['--sl-cover' as string]: `url(${JSON.stringify(heroCoverUrl)})` } as CSSProperties)
    : undefined

  if (loading && !share) {
    return (
      <div className="sl-page sl-page--center">
        <Spin size="large" />
        <p className="sl-loading-copy">正在准备这首歌…</p>
      </div>
    )
  }

  if (error && !share) {
    return (
      <div className="sl-page sl-page--center">
        <Result
          status="warning"
          title="分享歌曲不可用"
          subTitle={error}
          extra={
            <div className="sl-actions">
              <Link to="/music">
                <Button type="primary">返回音乐页</Button>
              </Link>
              <Button icon={<RefreshCcw size={14} />} onClick={() => void loadShare()}>
                重试
              </Button>
            </div>
          }
        />
      </div>
    )
  }

  if (!share) return null

  const actualSource = share.playInfo?.actualSource || share.playInfo?.source || share.source
  const actualQuality = share.playInfo?.actualQuality || share.playInfo?.requestedQuality
  const lyricText = share.playInfo?.lyric?.lineLyrics?.trim()
  const pausedByBrowser = started && !isPlaying && !playLoading
  const primaryLabel = !started
    ? '立即播放'
    : isPlaying
      ? '暂停'
      : pausedByBrowser
        ? '继续播放'
        : '播放中'

  return (
    <div className="sl-page" style={heroStyle}>
      <div className="sl-ambient" aria-hidden="true" />
      <div className="sl-ambient-cover" aria-hidden="true" />

      <header className="sl-topbar">
        <Link to="/music" className="sl-back">
          <ChevronLeft size={16} />
          <span>返回音乐页</span>
        </Link>
        <div className="sl-actions">
          <Button icon={<Copy size={14} />} onClick={() => void handleCopyLink()}>
            复制链接
          </Button>
          <Button icon={<RefreshCcw size={14} />} loading={loading} onClick={() => void loadShare()}>
            刷新
          </Button>
        </div>
      </header>

      <main className="sl-stage">
        <div className="sl-cover-wrap">
          <MusicCover
            src={share.playInfo?.coverUrl ?? share.coverUrl ?? undefined}
            size={260}
            rounded={28}
            loading="eager"
            className="sl-cover"
          />
          <span className="sl-cover-ring" aria-hidden="true" />
        </div>

        <div className="sl-copy">
          <div className="sl-badges">
            <span className="sl-badge sl-badge--free">
              <LockOpen size={13} />
              无需登录 · 点开即听
            </span>
            <span className="sl-badge">{sourceLabel(share.source)}</span>
            {actualQuality ? <span className="sl-badge">{actualQuality.toUpperCase()}</span> : null}
          </div>

          <h1 className="sl-title">{share.name}</h1>
          <p className="sl-artist">
            {share.artist || '未知歌手'}
            {share.album ? <span> · {share.album}</span> : null}
          </p>

          <div className="sl-meta">
            <span>{formatDuration(share.durationSec ?? share.playInfo?.durationSec)}</span>
            <span>{sourceLabel(actualSource)}</span>
            <span className={share.playable ? 'is-ok' : 'is-warn'}>
              {share.playable ? '当前可播放' : '解析暂不可用'}
            </span>
          </div>

          <div className="sl-play-row">
            <button
              type="button"
              className={`sl-play-btn${isPlaying ? ' is-playing' : ''}`}
              onClick={() => void handlePrimary()}
              aria-label={primaryLabel}
              disabled={playLoading && !started}
            >
              {isPlaying ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" />}
            </button>
            <div className="sl-play-copy">
              <strong>{primaryLabel}</strong>
              <span>
                {started
                  ? isPlaying
                    ? '正在播放，点按可暂停'
                    : '浏览器已拦截自动播放，点按即可继续'
                  : share.playable
                    ? '已自动尝试播放；若未出声，点按即可收听'
                    : share.playError || '正在重新解析可播放地址'}
              </span>
            </div>
          </div>

          <p className="sl-hint">
            <Headphones size={14} />
            这条链接是公开单曲，不需要账号，转发给朋友也能直接听。
          </p>
        </div>
      </main>

      <footer className="sl-footer">
        <div className="sl-footer-link" title={shareUrl}>
          {shareUrl || '当前环境无法生成完整公开链接'}
        </div>
        <div className="sl-footer-facts">
          <span>访问量 {share.viewCount}</span>
          <span>·</span>
          <span>{share.playInfo?.fromCache ? '缓存命中' : '实时解析'}</span>
          <span>·</span>
          <span>751152.xyz 音乐分享</span>
        </div>
      </footer>

      {lyricText ? (
        <section className="sl-lyrics" aria-label="歌词预览">
          <pre>{lyricText}</pre>
        </section>
      ) : null}
    </div>
  )
}
