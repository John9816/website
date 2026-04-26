import { useEffect, useMemo, useRef, useState } from 'react'
import { App as AntApp, Button } from 'antd'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, Play, RefreshCcw } from 'lucide-react'
import { musicToplistDetail } from '../api/music'
import MusicCover from '../components/MusicCover'
import MusicSongTable from '../components/MusicSongTable'
import { DEFAULT_PAGE_SIZE } from '../constants/pagination'
import { useMusicPlayer } from '../context/MusicPlayerContext'
import type { MusicSourceId, ToplistDetailView } from '../types'

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
  const { source, id } = useParams()
  const { playPlaylist, setPlaylist } = useMusicPlayer()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<ToplistDetailView | null>(null)
  const requestIdRef = useRef(0)

  const validSource = isMusicSourceId(source) ? source : null

  useEffect(() => {
    if (!validSource || !id) return

    const requestId = ++requestIdRef.current
    setLoading(true)

    musicToplistDetail(validSource, id, page, pageSize)
      .then((data) => {
        if (requestId !== requestIdRef.current) return
        setDetail(data)
        setPlaylist(data.list)
      })
      .catch((error) => {
        if (requestId !== requestIdRef.current) return
        message.error((error as Error).message)
      })
      .finally(() => {
        if (requestId !== requestIdRef.current) return
        setLoading(false)
      })
  }, [id, message, page, pageSize, setPlaylist, validSource])

  const metaText = useMemo(() => {
    if (!validSource) return ''
    return `${sourceLabel(validSource)} · ${detail?.list.length ?? 0} 首`
  }, [detail?.list.length, validSource])

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

      <div className="music-detail-hero">
        <MusicCover src={detail?.coverUrl} size={148} rounded={32} />
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
