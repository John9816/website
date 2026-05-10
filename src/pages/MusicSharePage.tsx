import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { App as AntApp, Button, Result, Spin, Typography } from 'antd'
import { ChevronLeft, Copy, Play, RefreshCcw } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { getPublicMusicShare } from '../api/music'
import MusicCover from '../components/MusicCover'
import { useMusicPlayer } from '../context/MusicPlayerContext'
import type { MusicPublicShareView, MusicSourceId, SongSearchItem } from '../types'
import { formatDuration, normalizeCoverUrl } from '../utils/musicPlayer'
import { copyText, formatDateTime } from '../utils/share'

const ALL_QUALITIES = ['128k', '320k', 'flac', 'flac24bit'] as const

function sourceLabel(source: MusicSourceId) {
  switch (source) {
    case 'qq':
      return 'QQ 音乐'
    case 'netease':
      return '网易云'
    case 'kuwo':
      return '酷我'
  }
}

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

export default function MusicSharePage() {
  const { message } = AntApp.useApp()
  const { token } = useParams<{ token: string }>()
  const { playPlaylist } = useMusicPlayer()
  const [loading, setLoading] = useState(true)
  const [share, setShare] = useState<MusicPublicShareView | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  const shareSong = useMemo(() => (share ? toSongSearchItem(share) : null), [share])
  const shareUrl = useMemo(() => {
    if (!token || typeof window === 'undefined') return ''
    return new URL(`/music/share/${token}`, window.location.origin).toString()
  }, [token])

  const handleCopyLink = async () => {
    if (!shareUrl) return
    try {
      await copyText(shareUrl)
      message.success('公开链接已复制')
    } catch {
      message.error('复制失败，请检查浏览器权限')
    }
  }

  const handlePlay = async () => {
    if (!shareSong || !share) return
    await playPlaylist([shareSong], 0, share.requestedQuality)
  }

  const heroCoverUrl = normalizeCoverUrl(share?.playInfo?.coverUrl ?? share?.coverUrl ?? undefined)
  const heroStyle = heroCoverUrl
    ? ({
        ['--music-detail-cover' as string]: `url(${JSON.stringify(heroCoverUrl)})`,
      } as CSSProperties)
    : undefined

  if (loading && !share) {
    return (
      <div className="music-detail-shell music-share-shell music-share-shell--center">
        <Spin size="large" />
      </div>
    )
  }

  if (error && !share) {
    return (
      <div className="music-detail-shell music-share-shell">
        <Result
          status="warning"
          title="分享歌曲不可用"
          subTitle={error}
          extra={
            <div className="music-detail-actions-group">
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

  return (
    <div className="music-detail-shell music-share-shell">
      <div className="music-detail-actions">
        <Link to="/music" className="music-back-link">
          <ChevronLeft size={16} />
          <span>返回音乐页</span>
        </Link>

        <div className="music-detail-actions-group">
          <Button icon={<Copy size={14} />} onClick={() => void handleCopyLink()}>
            复制公开链接
          </Button>
          <Button icon={<RefreshCcw size={14} />} loading={loading} onClick={() => void loadShare()}>
            刷新解析
          </Button>
        </div>
      </div>

      <div
        className={`music-detail-hero${heroCoverUrl ? ' music-detail-hero--with-cover' : ''}`}
        style={heroStyle}
      >
        <MusicCover
          src={share.playInfo?.coverUrl ?? share.coverUrl ?? undefined}
          size={148}
          rounded={32}
          loading="eager"
        />
        <div className="music-detail-hero__copy">
          <span className="music-stage-kicker">公开单曲分享</span>
          <h2>{share.name}</h2>
          <p>
            {share.artist || '未知歌手'}
            {share.album ? ` · ${share.album}` : ''}
          </p>
          <div className="music-detail-meta">
            <span>{sourceLabel(share.source)}</span>
            <span>{formatDuration(share.durationSec ?? share.playInfo?.durationSec)}</span>
            <span>预设 {share.requestedQuality.toUpperCase()}</span>
            <span>{share.playable ? '当前可播放' : '当前解析失败'}</span>
          </div>
        </div>
      </div>

      <div className="music-share-grid">
        <section className="music-share-card">
          <div className="music-share-card__head">
            <div>
              <Typography.Title level={4} style={{ margin: 0 }}>
                播放状态
              </Typography.Title>
              <Typography.Text type="secondary">
                分享页已实时尝试解析当前可用播放地址
              </Typography.Text>
            </div>
            <span
              className={`music-share-state-pill${
                share.playable ? ' is-playable' : ' is-unavailable'
              }`}
            >
              {share.playable ? '可播放' : '暂不可播放'}
            </span>
          </div>

          <p className="music-share-card__copy">
            {share.playable
              ? '当前链接已解析成功，可以直接用下方按钮播放，也可以稍后再次刷新检查。'
              : share.playError || '当前没有解析到可播放地址，你可以稍后重试。'}
          </p>

          <div className="music-share-facts">
            <span>解析来源：{sourceLabel(actualSource)}</span>
            <span>实际音质：{actualQuality ? actualQuality.toUpperCase() : '-'}</span>
            <span>缓存状态：{share.playInfo?.fromCache ? '命中缓存' : '实时解析'}</span>
            <span>
              链接时效：
              {typeof share.playInfo?.expireSec === 'number' ? `${share.playInfo.expireSec} 秒` : '-'}
            </span>
          </div>

          <div className="music-detail-actions-group">
            <Button type="primary" icon={<Play size={14} />} onClick={() => void handlePlay()}>
              立即播放
            </Button>
            <Button icon={<RefreshCcw size={14} />} loading={loading} onClick={() => void loadShare()}>
              重新解析
            </Button>
          </div>
        </section>

        <section className="music-share-card">
          <div className="music-share-card__head">
            <div>
              <Typography.Title level={4} style={{ margin: 0 }}>
                分享信息
              </Typography.Title>
              <Typography.Text type="secondary">这首歌的公开访问快照</Typography.Text>
            </div>
          </div>

          <div className="music-share-facts">
            <span>访问量：{share.viewCount}</span>
            <span>过期时间：{formatDateTime(share.expiresAt)}</span>
            <span>歌曲来源：{sourceLabel(share.source)}</span>
            <span>公开路由：`/music/share/:token`</span>
          </div>

          <div className="music-share-link" title={shareUrl}>
            {shareUrl || '当前环境无法生成完整公开链接'}
          </div>
        </section>

        {lyricText ? (
          <section className="music-share-card music-share-card--full">
            <div className="music-share-card__head">
              <div>
                <Typography.Title level={4} style={{ margin: 0 }}>
                  歌词预览
                </Typography.Title>
                <Typography.Text type="secondary">
                  使用公开分享时解析到的当前歌词内容
                </Typography.Text>
              </div>
            </div>
            <pre className="music-share-lyric">{lyricText}</pre>
          </section>
        ) : null}
      </div>
    </div>
  )
}
