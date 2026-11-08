import { sourceLabel, isMusicSourceId } from '../features/music/sources'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { App as AntApp, Button } from 'antd'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Heart, Play, RefreshCcw } from 'lucide-react'
import {
  deletePlaylistFavorite,
  getPlaylistFavoriteStatus,
  musicPlaylistDetail,
  savePlaylistFavorite,
} from '../api/music'
import MusicCover from '../components/MusicCover'
import MusicShareAction from '../components/MusicShareAction'
import MusicSongTable from '../components/MusicSongTable'
import { DEFAULT_PAGE_SIZE } from '../constants/pagination'
import { useAuth } from '../context/AuthContext'
import { useMusicPlayer } from '../context/MusicPlayerContext'
import { useMusicFavorites } from '../hooks/useMusicFavorites'
import type { MusicSourceId, PlaylistDetailView } from '../types'
import { hydrateCollectionCovers, normalizeCoverUrl } from '../utils/musicPlayer'

type MusicCollectionRouteState = {
  coverUrl?: string
}



function formatPlayCount(value?: number) {
  if (!value || value <= 0) return '0'
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)} 亿`
  if (value >= 10000) return `${(value / 10000).toFixed(1)} 万`
  return String(value)
}

export default function MusicPlaylistDetailPage() {
  const { message } = AntApp.useApp()
  const auth = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const { source, id } = useParams()
  const { playPlaylist, setPlaylist, setAutoNextHandler } = useMusicPlayer()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<PlaylistDetailView | null>(null)
  const [playlistFavorite, setPlaylistFavorite] = useState(false)
  const [playlistFavoriteLoading, setPlaylistFavoriteLoading] = useState(false)
  const requestIdRef = useRef(0)
  const autoplayPendingRef = useRef(false)

  const validSource = isMusicSourceId(source) ? source : null
  const routeCoverUrl = (location.state as MusicCollectionRouteState | null)?.coverUrl
  const favoriteState = useMusicFavorites(detail?.list ?? [])

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
    if (!auth.token || !validSource || !id) {
      setPlaylistFavorite(false)
      return
    }

    let active = true
    void getPlaylistFavoriteStatus(validSource, id)
      .then((status) => {
        if (active) setPlaylistFavorite(status.favorite)
      })
      .catch(() => {
        if (active) setPlaylistFavorite(false)
      })
    return () => {
      active = false
    }
  }, [auth.token, id, validSource])

  const togglePlaylistFavorite = async () => {
    if (!auth.token) {
      message.info('登录后可收藏歌单')
      return
    }
    if (!validSource || !id || playlistFavoriteLoading) return

    setPlaylistFavoriteLoading(true)
    try {
      if (playlistFavorite) {
        await deletePlaylistFavorite(validSource, id)
        setPlaylistFavorite(false)
        message.success('已取消收藏')
      } else {
        await savePlaylistFavorite(validSource, id)
        setPlaylistFavorite(true)
        message.success('歌单已收藏')
      }
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setPlaylistFavoriteLoading(false)
    }
  }

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

  const renderSongActions = (song: PlaylistDetailView['list'][number]) => (
    <>
      {favoriteState.canFavorite ? (
        <button
          type="button"
          className={`music-icon-action${favoriteState.isFavorite(song) ? ' is-active' : ''}`}
          disabled={favoriteState.isFavoriteLoading(song)}
          onClick={(event) => {
            event.stopPropagation()
            void favoriteState.toggleFavorite(song)
          }}
          aria-label={favoriteState.isFavorite(song) ? '取消喜欢' : '加入喜欢'}
          title={favoriteState.isFavorite(song) ? '取消喜欢' : '加入喜欢'}
        >
          <Heart
            size={16}
            fill={favoriteState.isFavorite(song) ? 'currentColor' : 'none'}
          />
        </button>
      ) : null}
      <MusicShareAction song={song} />
    </>
  )

  const searchByMeta = useCallback(
    (nextKeyword: string, nextSource: MusicSourceId, nextType: 'artist' | 'album' = 'artist') => {
      const trimmed = nextKeyword.trim()
      if (!trimmed) return
      navigate(
        `/music?view=search&type=${nextType}&source=${nextSource}&keyword=${encodeURIComponent(trimmed)}`,
      )
    },
    [navigate],
  )

  if (!validSource || !id) {
    return (
      <div className="music-detail-shell">
        <div className="music-empty-state">歌单参数无效</div>
      </div>
    )
  }

  return (
    <div className="music-detail-shell">
      <div
        className={`music-detail-hero${heroCoverUrl ? ' music-detail-hero--with-cover' : ''}`}
        style={heroStyle}
      >
        <Link to="/music?view=playlist" className="music-hero-back" title="返回歌单">
          <ChevronLeft size={20} />
        </Link>

        <MusicCover src={detail?.coverUrl} size={148} rounded={32} loading="eager" />
        <div className="music-detail-hero__copy">
          <span className="music-stage-kicker">歌单详情</span>
          <h2>{detail?.name || '加载中...'}</h2>
          <p>{detail?.description || metaText}</p>
          <div className="music-detail-meta">
            <span>{metaText}</span>
            {detail?.updateTime && <span>{detail.updateTime}</span>}
          </div>

          <div className="music-hero-actions">
            <Button
              type="primary"
              size="large"
              icon={<Play size={16} fill="currentColor" />}
              disabled={!detail?.list?.length}
              onClick={() => {
                if (!detail?.list?.length) return
                void playPlaylist(detail.list)
              }}
              className="music-hero-play-btn"
            >
              播放全部
            </Button>
            <Button
              ghost
              size="large"
              icon={<RefreshCcw size={16} />}
              onClick={() => {
                setPage(1)
              }}
              className="music-hero-refresh-btn"
            >
              刷新
            </Button>
            <Button
              ghost
              danger={playlistFavorite}
              size="large"
              icon={<Heart size={16} fill={playlistFavorite ? 'currentColor' : 'none'} />}
              loading={playlistFavoriteLoading}
              onClick={() => void togglePlaylistFavorite()}
            >
              {playlistFavorite ? '已收藏' : '收藏歌单'}
            </Button>
          </div>
        </div>
      </div>

      <div className="music-detail-list-head">
        <div className="music-detail-list-copy">
          <h3>歌曲列表</h3>
          <p>{detail?.total ? `共 ${detail.total} 首` : metaText}</p>
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
        renderActions={renderSongActions}
        actionColumnWidth={favoriteState.canFavorite ? 176 : 132}
        onSearchArtist={(artist, source) => searchByMeta(artist, source, 'artist')}
        onSearchAlbum={(album, source) => searchByMeta(album, source, 'album')}
      />
    </div>
  )
}
