import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { App as AntApp, Button } from 'antd'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ChevronLeft, Play, RefreshCcw } from 'lucide-react'
import { musicToplistDetail } from '../api/music'
import MusicCover from '../components/MusicCover'
import MusicSongTable from '../components/MusicSongTable'
import { DEFAULT_PAGE_SIZE } from '../constants/pagination'
import { useMusicPlayer } from '../context/MusicPlayerContext'
import type { MusicSourceId, ToplistDetailView } from '../types'
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

export default function MusicToplistDetailPage() {
  const { message } = AntApp.useApp()
  const location = useLocation()
  const { source, id } = useParams()
  const { playPlaylist, setPlaylist, setAutoNextHandler } = useMusicPlayer()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<ToplistDetailView | null>(null)
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
        const data = await musicToplistDetail(validSource, id, targetPage, pageSize)
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
    return `${sourceLabel(validSource)} · ${detail?.list.length ?? 0} 首`
  }, [detail?.list.length, validSource])

  const heroCoverUrl = normalizeCoverUrl(detail?.coverUrl)
  const heroStyle = heroCoverUrl
    ? ({
        ['--music-detail-cover' as string]: `url(${JSON.stringify(heroCoverUrl)})`,
      } as CSSProperties)
    : undefined

  if (!validSource || !id) {
    return (
      <div className="music-detail-shell">
        <div className="music-empty-state">榜单参数无效</div>
      </div>
    )
  }

  return (
    <div className="music-detail-shell">
      <div className="music-detail-actions">
        <Link to="/music?view=toplist" className="music-back-link">
          <ChevronLeft size={16} />
          <span>返回榜单</span>
        </Link>
      </div>

      <div
        className={`music-detail-hero${heroCoverUrl ? ' music-detail-hero--with-cover' : ''}`}
        style={heroStyle}
      >
        <MusicCover src={detail?.coverUrl} size={148} rounded={32} loading="eager" />
        <div className="music-detail-hero__copy">
          <span className="music-stage-kicker">榜单详情</span>
          <h2>{detail?.name || '加载中...'}</h2>
          <p>{detail?.description || detail?.updateTime || metaText}</p>
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
        emptyText="暂无榜单歌曲"
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
