import { useEffect, useMemo, useState } from 'react'
import { App as AntApp, Button } from 'antd'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, RefreshCcw } from 'lucide-react'
import { musicPlaylistDetail } from '../api/music'
import MusicCover from '../components/MusicCover'
import MusicSongTable from '../components/MusicSongTable'
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

const PAGE_SIZE = 20

export default function MusicPlaylistDetailPage() {
  const { message } = AntApp.useApp()
  const { source, id } = useParams()
  const { setPlaylist } = useMusicPlayer()
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<PlaylistDetailView | null>(null)

  const validSource = isMusicSourceId(source) ? source : null

  useEffect(() => {
    if (!validSource || !id) return
    setLoading(true)
    musicPlaylistDetail(validSource, id, page, PAGE_SIZE)
      .then((data) => {
        setDetail(data)
        setPlaylist(data.list)
      })
      .catch((error) => {
        message.error((error as Error).message)
      })
      .finally(() => setLoading(false))
  }, [id, message, page, setPlaylist, validSource])

  const metaText = useMemo(() => {
    if (!validSource) return ''
    return `${detail?.creatorName || sourceLabel(validSource)} · ${
      detail?.list.length ?? 0
    } 首${
      detail?.playCount
        ? ` · 播放 ${detail.playCount >= 10000 ? `${(detail.playCount / 10000).toFixed(1)} 万` : detail.playCount}`
        : ''
    }`
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
        <Link to={`/music?view=playlist`} className="music-back-link">
          <ChevronLeft size={16} />
          <span>返回歌单</span>
        </Link>
        <Button
          icon={<RefreshCcw size={14} />}
          onClick={() => {
            setPage(1)
          }}
        >
          刷新
        </Button>
      </div>

      <div className="music-detail-hero">
        <MusicCover src={detail?.coverUrl} size={120} rounded={28} />
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
        page={detail?.page ?? page}
        pageSize={detail?.pageSize ?? PAGE_SIZE}
        total={detail?.total}
        onPageChange={(nextPage) => setPage(nextPage)}
      />
    </div>
  )
}
