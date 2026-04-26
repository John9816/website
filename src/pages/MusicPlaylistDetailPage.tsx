import { useEffect, useMemo, useRef, useState } from 'react'
import { App as AntApp, Button } from 'antd'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, Play, RefreshCcw } from 'lucide-react'
import { musicPlaylistDetail } from '../api/music'
import MusicCover from '../components/MusicCover'
import MusicSongTable from '../components/MusicSongTable'
import { DEFAULT_PAGE_SIZE } from '../constants/pagination'
import { useMusicPlayer } from '../context/MusicPlayerContext'
import type { MusicSourceId, PlaylistDetailView } from '../types'

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
  const { source, id } = useParams()
  const { playPlaylist, setPlaylist } = useMusicPlayer()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<PlaylistDetailView | null>(null)
  const requestIdRef = useRef(0)

  const validSource = isMusicSourceId(source) ? source : null

  useEffect(() => {
    if (!validSource || !id) return

    const requestId = ++requestIdRef.current
    setLoading(true)

    musicPlaylistDetail(validSource, id, page, pageSize)
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

    const creator = detail?.creatorName || sourceLabel(validSource)
    const count = `${detail?.list.length ?? 0} 首`
    const playCount = detail?.playCount ? ` · 播放 ${formatPlayCount(detail.playCount)}` : ''
    return `${creator} · ${count}${playCount}`
  }, [detail?.creatorName, detail?.list.length, detail?.playCount, validSource])

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
          <span className="music-stage-kicker">歌单详情</span>
          <h2>{detail?.name || '加载中...'}</h2>
          <p>{detail?.description || metaText}</p>
          <div className="music-detail-meta">
            <span>{metaText}</span>
            {detail?.updateTime && <span>{detail.updateTime}</span>}
          </div>
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
