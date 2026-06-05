import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { App as AntApp, Button } from 'antd'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Heart, Play, RefreshCcw } from 'lucide-react'
import { musicAlbumDetail } from '../api/music'
import MusicCover from '../components/MusicCover'
import MusicShareAction from '../components/MusicShareAction'
import MusicSongTable from '../components/MusicSongTable'
import { DEFAULT_PAGE_SIZE } from '../constants/pagination'
import { useMusicPlayer } from '../context/MusicPlayerContext'
import { useMusicFavorites } from '../hooks/useMusicFavorites'
import type { AlbumDetailView, MusicSourceId } from '../types'
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
      return 'QQ Music'
    case 'netease':
      return 'NetEase Music'
    case 'kuwo':
      return 'Kuwo Music'
  }
}

export default function MusicAlbumDetailPage() {
  const { message } = AntApp.useApp()
  const location = useLocation()
  const navigate = useNavigate()
  const { source, id } = useParams()
  const { playPlaylist, setPlaylist, setAutoNextHandler } = useMusicPlayer()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<AlbumDetailView | null>(null)
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
        const data = await musicAlbumDetail(validSource, id, targetPage, pageSize)
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
    const artist = detail?.artist || sourceLabel(validSource)
    return `${artist} · ${detail?.list.length ?? 0} tracks`
  }, [detail?.artist, detail?.list.length, validSource])

  const heroCoverUrl = normalizeCoverUrl(detail?.coverUrl)
  const heroStyle = heroCoverUrl
    ? ({
        ['--music-detail-cover' as string]: `url(${JSON.stringify(heroCoverUrl)})`,
      } as CSSProperties)
    : undefined

  const renderSongActions = (song: AlbumDetailView['list'][number]) => (
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
          aria-label={favoriteState.isFavorite(song) ? 'Cancel favorite' : 'Add favorite'}
          title={favoriteState.isFavorite(song) ? 'Cancel favorite' : 'Add favorite'}
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
        <div className="music-empty-state">Invalid album parameters</div>
      </div>
    )
  }

  return (
    <div className="music-detail-shell">
      <div
        className={`music-detail-hero${heroCoverUrl ? ' music-detail-hero--with-cover' : ''}`}
        style={heroStyle}
      >
        <Link to="/music?view=search&type=album" className="music-hero-back" title="Back">
          <ChevronLeft size={20} />
        </Link>

        <MusicCover src={detail?.coverUrl} size={148} rounded={32} loading="eager" />
        <div className="music-detail-hero__copy">
          <span className="music-stage-kicker">Album detail</span>
          <h2>{detail?.name || 'Loading...'}</h2>
          <p>{detail?.description || metaText}</p>
          <div className="music-detail-meta">
            <span>{metaText}</span>
            {detail?.publishTime && <span>{detail.publishTime}</span>}
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
              Play all
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
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="music-detail-list-head">
        <div className="music-detail-list-copy">
          <h3>Tracks</h3>
          <p>{detail?.total ? `${detail.total} tracks total` : metaText}</p>
        </div>
      </div>

      <MusicSongTable
        songs={detail?.list ?? []}
        loading={loading}
        emptyText="No album tracks"
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
