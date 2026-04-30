import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { App as AntApp, Button } from 'antd'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ChevronLeft, Play, RefreshCcw } from 'lucide-react'
import { musicPlaylistDetail } from '../api/music'
import MusicCover from '../components/MusicCover'
import MusicSongTable from '../components/MusicSongTable'
import { DEFAULT_PAGE_SIZE } from '../constants/pagination'
import { useMusicPlayer } from '../context/MusicPlayerContext'
import type { MusicSourceId, PlaylistDetailView } from '../types'
import { hydrateCollectionCovers, normalizeCoverUrl } from '../utils/musicPlayer'

type MusicCollectionRouteState = {
  coverUrl?: string
}

function isMusicSourceId(value: string | undefined): value is MusicSourceId {
  return value === 'qq' || value === 'netease' || value === 'kuwo'
}

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

function formatPlayCount(value?: number) {
  if (!value || value <= 0) return '0'
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)} 亿`
  if (value >= 10000) return `${(value / 10000).toFixed(1)} 万`
  return String(value)
}

export default function MusicPlaylistDetailPage() {
  const { message } = AntApp.useApp()
  const location = useLocation()
  const { source, id } = useParams()
  const { playPlaylist, setPlaylist, setAutoNextHandler } = useMusicPlayer()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<PlaylistDetailView | null>(null)
  const requestIdRef = useRef(0)
  const autoplayPendingRef = useRef(false)

  const validSource = isMusicSourceId(source) ? source : null
  const routeCoverUrl = (location.state as MusicCollectionRouteState | null)?.coverUrl

  const loadPage = useCallback(
    async (targetPage: number, options?: { autoplay?: boolean }) => {
      if (!validSource || !id) return
      const requestId = ++requestIdRef.current
      setLoading(true)
      try {
        const data = await musicPlaylistDetail(validSource, id, targetPage, pageSize)
        if (requestId !== requestIdRef.current) return
        const hydrated = hydrateCollectionCovers(data.coverUrl, data.list, routeCoverUrl)
        const nextDetail = {
          ...data,
          coverUrl: hydrated.coverUrl,
          list: hydrated.list,
        }
        setDetail(nextDetail)
        if (options?.autoplay && nextDetail.list.length) {
          void playPlaylist(nextDetail.list)
        } else {
          setPlaylist(nextDetail.list)
        }
      } catch (error) {
        if (requestId !== requestIdRef.current) return
        message.error((error as Error).message)
      } finally {
        if (requestId === requestIdRef.current) setLoading(false)
      }
    },
    [id, message, pageSize, playPlaylist, routeCoverUrl, setPlaylist, validSource],
  )

  useEffect(() => {
    if (!validSource || !id) return
    const wantAutoplay = autoplayPendingRef.current
    autoplayPendingRef.current = false
    void loadPage(page, { autoplay: wantAutoplay })
  }, [id, loadPage, page, validSource])

  useEffect(() => {
    const total = detail?.total
    if (!validSource || !id || typeof total !== 'number') {
      setAutoNextHandler(null)
      return
    }
    const hasNextPage = page * pageSize < total
    if (!hasNextPage) {
      setAutoNextHandler(null)
      return
    }
    setAutoNextHandler(() => {
      autoplayPendingRef.current = true
      setPage((current) => current + 1)
    })
    return () => setAutoNextHandler(null)
  }, [detail?.total, id, page, pageSize, setAutoNextHandler, validSource])

  const metaText = useMemo(() => {
    if (!validSource) return ''

    const creator = detail?.creatorName || sourceLabel(validSource)
    const count = `${detail?.list.length ?? 0} 首`
    const playCount = detail?.playCount ? ` · 播放 ${formatPlayCount(detail.playCount)}` : ''
    return `${creator} · ${count}${playCount}`
  }, [detail?.creatorName, detail?.list.length, detail?.playCount, validSource])

  const heroCoverUrl = normalizeCoverUrl(detail?.coverUrl)
  const heroStyle = heroCoverUrl
    ? ({
        ['--music-detail-cover' as string]: `url(${JSON.stringify(heroCoverUrl)})`,
      } as CSSProperties)
    : undefined

  if (!validSource || !id) {
    return (
      <div className="music-detail-shell">
        <div className="music-empty-state">歌单参数无效</div>
      </div>
    )
  }

  return (
    <div className="music-detail-shell">
      <div className="music-detail-actions">
        <Link to="/music?view=playlist" className="music-back-link">
          <ChevronLeft size={16} />
          <span>返回歌单</span>
        </Link>
      </div>

      <div
        className={`music-detail-hero${heroCoverUrl ? ' music-detail-hero--with-cover' : ''}`}
        style={heroStyle}
      >
        <MusicCover src={detail?.coverUrl} size={148} rounded={32} loading="eager" />
        <div className="music-detail-hero__copy">
          <span className="music-stage-kicker">歌单详情</span>
          <h2>{detail?.name || '加载中...'}</h2>
          <p>{detail?.description || metaText}</p>
          <div className="music-detail-meta">
            <span>{metaText}</span>
            {detail?.updateTime && <span>{detail.updateTime}</span>}
          </div>
        </div>
      </div>

      <div className="music-detail-list-head">
        <div className="music-detail-list-copy">
          <h3>歌曲列表</h3>
          <p>{detail?.total ? `共 ${detail.total} 首` : metaText}</p>
        </div>
        <div className="music-detail-actions-group">
          <Button
            type="primary"
            icon={<Play size={14} />}
            disabled={!detail?.list?.length}
            onClick={() => {
              if (!detail?.list?.length) return
              void playPlaylist(detail.list)
            }}
          >
            播放全部
          </Button>
          <Button
            icon={<RefreshCcw size={14} />}
            onClick={() => {
              setPage(1)
            }}
          >
            刷新
          </Button>
        </div>
      </div>

      <MusicSongTable
        songs={detail?.list ?? []}
        loading={loading}
        emptyText="暂无歌单歌曲"
        page={page}
        pageSize={pageSize}
        total={detail?.total}
        onPageChange={(nextPage, nextPageSize) => {
          setPageSize(nextPageSize)
          setPage(nextPageSize !== pageSize ? 1 : nextPage)
        }}
      />
    </div>
  )
}
