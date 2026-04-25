import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  App as AntApp,
  Button,
  Card,
  Input,
  Pagination,
  Segmented,
  Select,
} from 'antd'
import { RefreshCcw } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  musicNewSongs,
  musicPlaylist,
  musicSearch,
  musicToplist,
} from '../api/music'
import { useMusicPlayer } from '../context/MusicPlayerContext'
import type {
  MusicPlaylistSourceId,
  MusicSourceId,
  PlaylistItem,
  SongSearchItem,
  ToplistDetailView,
  ToplistItem,
} from '../types'
import MusicCover from './MusicCover'
import MusicSongTable from './MusicSongTable'

type MusicView = 'search' | 'toplist' | 'playlist' | 'new'

const VIEW_OPTIONS = [
  { label: '搜索', value: 'search' },
  { label: '榜单', value: 'toplist' },
  { label: '歌单', value: 'playlist' },
  { label: '新歌', value: 'new' },
]

const SOURCE_OPTIONS = [
  { label: 'QQ 音乐', value: 'qq' },
  { label: '网易云', value: 'netease' },
  { label: '酷我', value: 'kuwo' },
]

const PLAYLIST_SOURCE_OPTIONS = [
  { label: '网易云', value: 'netease' },
  { label: '酷我', value: 'kuwo' },
]

const QUALITY_OPTIONS = [
  { label: '128k', value: '128k' },
  { label: '320k', value: '320k' },
  { label: 'FLAC', value: 'flac' },
  { label: 'FLAC 24bit', value: 'flac24bit' },
] as const

const SEARCH_PAGE_SIZE = 10
const DETAIL_PAGE_SIZE = 20
const PLAYLIST_PAGE_SIZE = 12

function sourceLabel(source: MusicSourceId) {
  return SOURCE_OPTIONS.find((item) => item.value === source)?.label ?? source
}

function formatPlayCount(value?: number) {
  if (!value || value <= 0) return '0'
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)} 亿`
  if (value >= 10000) return `${(value / 10000).toFixed(1)} 万`
  return String(value)
}

function pageTotal(
  page: number,
  pageSize: number,
  count: number,
  total?: number | null,
) {
  if (typeof total === 'number') return total
  return count >= pageSize ? page * pageSize + 1 : page * pageSize
}

function isMusicView(value: string | null): value is MusicView {
  return value === 'search' || value === 'toplist' || value === 'playlist' || value === 'new'
}

export default function MusicExplorer() {
  const { message } = AntApp.useApp()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { preferredQuality, setPreferredQuality, setPlaylist } = useMusicPlayer()

  const [searchSource, setSearchSource] = useState<MusicSourceId>('qq')
  const [keyword, setKeyword] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SongSearchItem[]>([])
  const [searchPage, setSearchPage] = useState(1)
  const [searchHasMore, setSearchHasMore] = useState(false)
  const [lastKeyword, setLastKeyword] = useState('')

  const [toplistSource, setToplistSource] = useState<MusicSourceId>('qq')
  const [toplists, setToplists] = useState<ToplistItem[]>([])
  const [toplistLoading, setToplistLoading] = useState(false)

  const [playlistSource, setPlaylistSource] =
    useState<MusicPlaylistSourceId>('netease')
  const [playlistCategoryDraft, setPlaylistCategoryDraft] = useState('全部')
  const [playlistCategory, setPlaylistCategory] = useState('全部')
  const [playlistPage, setPlaylistPage] = useState(1)
  const [playlists, setPlaylists] = useState<PlaylistItem[]>([])
  const [playlistTotal, setPlaylistTotal] = useState<number | null>(null)
  const [playlistLoading, setPlaylistLoading] = useState(false)

  const [newSource, setNewSource] = useState<MusicSourceId>('qq')
  const [newSongsPage, setNewSongsPage] = useState(1)
  const [newSongsLoading, setNewSongsLoading] = useState(false)
  const [newSongsDetail, setNewSongsDetail] = useState<ToplistDetailView | null>(null)

  const playlistRequestIdRef = useRef(0)
  const newSongsRequestIdRef = useRef(0)

  const view = isMusicView(searchParams.get('view')) ? searchParams.get('view') : 'search'

  const setView = useCallback(
    (nextView: MusicView) => {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.set('view', nextView)
      setSearchParams(nextParams, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const searchSongs = useCallback(
    async (nextKeyword: string, nextPage: number) => {
      const trimmed = nextKeyword.trim()
      if (!trimmed) {
        message.warning('请输入关键词')
        return
      }

      setSearching(true)
      try {
        const data = await musicSearch(searchSource, trimmed, nextPage, SEARCH_PAGE_SIZE)
        setSearchResults(data.list)
        setSearchPage(nextPage)
        setSearchHasMore(data.list.length >= SEARCH_PAGE_SIZE)
        setLastKeyword(trimmed)
        setPlaylist(data.list)
      } catch (error) {
        message.error((error as Error).message)
      } finally {
        setSearching(false)
      }
    },
    [message, searchSource, setPlaylist],
  )

  const loadToplists = useCallback(async () => {
    setToplistLoading(true)
    try {
      const data = await musicToplist(toplistSource)
      setToplists(data.list)
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setToplistLoading(false)
    }
  }, [message, toplistSource])

  const loadPlaylists = useCallback(async () => {
    const requestId = ++playlistRequestIdRef.current
    setPlaylistLoading(true)
    try {
      const data = await musicPlaylist(
        playlistSource,
        playlistPage,
        PLAYLIST_PAGE_SIZE,
        playlistSource === 'netease' ? playlistCategory : undefined,
        playlistSource === 'netease' ? 'hot' : undefined,
      )
      if (requestId !== playlistRequestIdRef.current) return
      setPlaylists(data.list)
      setPlaylistTotal(data.total)
    } catch (error) {
      if (requestId !== playlistRequestIdRef.current) return
      message.error((error as Error).message)
    } finally {
      if (requestId !== playlistRequestIdRef.current) return
      setPlaylistLoading(false)
    }
  }, [message, playlistCategory, playlistPage, playlistSource])

  const loadNewSongs = useCallback(async () => {
    const requestId = ++newSongsRequestIdRef.current
    setNewSongsLoading(true)
    try {
      const data = await musicNewSongs(newSource, newSongsPage, DETAIL_PAGE_SIZE)
      if (requestId !== newSongsRequestIdRef.current) return
      setNewSongsDetail(data)
      setPlaylist(data.list)
    } catch (error) {
      if (requestId !== newSongsRequestIdRef.current) return
      message.error((error as Error).message)
    } finally {
      if (requestId !== newSongsRequestIdRef.current) return
      setNewSongsLoading(false)
    }
  }, [message, newSongsPage, newSource, setPlaylist])

  useEffect(() => {
    if (view === 'toplist') void loadToplists()
  }, [view, loadToplists])

  useEffect(() => {
    if (view === 'playlist') void loadPlaylists()
  }, [view, loadPlaylists])

  useEffect(() => {
    if (view === 'new') void loadNewSongs()
  }, [view, loadNewSongs])

  const stageTitle = useMemo(() => {
    switch (view) {
      case 'search':
        return lastKeyword ? `“${lastKeyword}”` : '搜索歌曲'
      case 'toplist':
        return '热门榜单'
      case 'playlist':
        return '推荐歌单'
      case 'new':
        return newSongsDetail?.name || '最新歌曲'
    }
  }, [lastKeyword, newSongsDetail?.name, view])

  const stageMeta = useMemo(() => {
    switch (view) {
      case 'search':
        return lastKeyword
          ? `${sourceLabel(searchSource)} · ${searchResults.length} 首`
          : '输入歌曲、歌手或专辑'
      case 'toplist':
        return `${sourceLabel(toplistSource)} · ${toplists.length} 个榜单`
      case 'playlist':
        return `${sourceLabel(playlistSource)} · ${playlists.length} 个歌单`
      case 'new':
        return `${sourceLabel(newSource)} · ${newSongsDetail?.list.length ?? 0} 首`
    }
  }, [
    lastKeyword,
    newSongsDetail?.list.length,
    newSource,
    playlistSource,
    playlists.length,
    searchResults.length,
    searchSource,
    toplistSource,
    toplists.length,
    view,
  ])

  return (
    <Card
      className="music-browser"
      style={{ borderRadius: 30 }}
      styles={{ body: { padding: 0 } }}
    >
      <div className="music-browser__toolbar">
        <Segmented
          options={VIEW_OPTIONS}
          value={view}
          onChange={(value) => setView(value as MusicView)}
        />
        <div className="music-browser__toolbar-side">
          <span className="music-toolbar-label">音质</span>
          <Select
            value={preferredQuality}
            onChange={setPreferredQuality}
            options={QUALITY_OPTIONS as unknown as { label: string; value: string }[]}
            style={{ width: 150 }}
          />
        </div>
      </div>

      <div className="music-browser__content">
        <div className="music-stage-header">
          <div className="music-stage-header__copy">
            <span className="music-stage-kicker">
              {VIEW_OPTIONS.find((item) => item.value === view)?.label}
            </span>
            <h2>{stageTitle}</h2>
            <p>{stageMeta}</p>
          </div>
        </div>

        {view === 'search' && (
          <>
            <div className="music-view-controls">
              <Segmented
                options={SOURCE_OPTIONS}
                value={searchSource}
                onChange={(value) => setSearchSource(value as MusicSourceId)}
              />
              <Input.Search
                className="music-search-box"
                placeholder="歌曲 / 歌手 / 专辑"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                onSearch={() => {
                  void searchSongs(keyword, 1)
                }}
                enterButton="搜索"
                loading={searching}
                allowClear
              />
            </div>
            <MusicSongTable
              songs={searchResults}
              loading={searching}
              emptyText="暂无结果"
              page={searchPage}
              pageSize={SEARCH_PAGE_SIZE}
              total={searchHasMore ? searchPage * SEARCH_PAGE_SIZE + 1 : searchPage * SEARCH_PAGE_SIZE}
              onPageChange={(nextPage) => {
                void searchSongs(lastKeyword || keyword, nextPage)
              }}
            />
          </>
        )}

        {view === 'toplist' && (
          <>
            <div className="music-view-controls music-view-controls--compact">
              <Segmented
                options={SOURCE_OPTIONS}
                value={toplistSource}
                onChange={(value) => setToplistSource(value as MusicSourceId)}
              />
              <Button
                icon={<RefreshCcw size={14} />}
                onClick={() => {
                  void loadToplists()
                }}
              >
                刷新
              </Button>
            </div>

            {toplists.length > 0 ? (
              <div className="music-collection-grid">
                {toplists.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="music-collection-card"
                    onClick={() => {
                      navigate(`/music/toplist/${toplistSource}/${encodeURIComponent(item.id)}`)
                    }}
                  >
                    <MusicCover src={item.coverUrl} size={76} rounded={20} />
                    <div className="music-collection-card__body">
                      <div className="music-collection-card__title">{item.name}</div>
                      <div className="music-collection-card__meta">
                        {item.updateTime || sourceLabel(item.source)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="music-empty-state">
                {toplistLoading ? '正在加载榜单...' : '暂无榜单'}
              </div>
            )}
          </>
        )}

        {view === 'playlist' && (
          <>
            <div className="music-view-controls music-view-controls--stack">
              <Segmented
                options={PLAYLIST_SOURCE_OPTIONS}
                value={playlistSource}
                onChange={(value) => {
                  setPlaylistSource(value as MusicPlaylistSourceId)
                  setPlaylistPage(1)
                }}
              />
              {playlistSource === 'netease' && (
                <div className="music-inline-controls">
                  <Input
                    value={playlistCategoryDraft}
                    onChange={(event) => setPlaylistCategoryDraft(event.target.value)}
                    onPressEnter={() => {
                      setPlaylistCategory(playlistCategoryDraft.trim() || '全部')
                      setPlaylistPage(1)
                    }}
                    placeholder="分类"
                  />
                  <Button
                    onClick={() => {
                      setPlaylistCategory(playlistCategoryDraft.trim() || '全部')
                      setPlaylistPage(1)
                    }}
                  >
                    应用
                  </Button>
                </div>
              )}
            </div>

            {playlists.length > 0 ? (
              <>
                <div className="music-collection-grid">
                  {playlists.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="music-collection-card"
                      onClick={() => {
                        navigate(
                          `/music/playlist/${playlistSource}/${encodeURIComponent(item.id)}`,
                        )
                      }}
                    >
                      <MusicCover src={item.coverUrl} size={76} rounded={20} />
                      <div className="music-collection-card__body">
                        <div className="music-collection-card__title">{item.name}</div>
                        <div className="music-collection-card__meta">
                          {item.creatorName || sourceLabel(item.source)}
                        </div>
                        <div className="music-collection-card__meta">
                          {item.trackCount ? `${item.trackCount} 首` : '公开歌单'}
                          {typeof item.playCount === 'number'
                            ? ` · ${formatPlayCount(item.playCount)}`
                            : ''}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="music-pagination">
                  <Pagination
                    simple
                    current={playlistPage}
                    pageSize={PLAYLIST_PAGE_SIZE}
                    total={pageTotal(
                      playlistPage,
                      PLAYLIST_PAGE_SIZE,
                      playlists.length,
                      playlistTotal,
                    )}
                    onChange={(nextPage) => {
                      setPlaylistPage(nextPage)
                    }}
                  />
                </div>
              </>
            ) : (
              <div className="music-empty-state">
                {playlistLoading ? '正在加载歌单...' : '暂无歌单'}
              </div>
            )}
          </>
        )}

        {view === 'new' && (
          <>
            <div className="music-view-controls music-view-controls--compact">
              <Segmented
                options={SOURCE_OPTIONS}
                value={newSource}
                onChange={(value) => {
                  setNewSource(value as MusicSourceId)
                  setNewSongsPage(1)
                }}
              />
              <Button
                icon={<RefreshCcw size={14} />}
                onClick={() => {
                  void loadNewSongs()
                }}
              >
                刷新
              </Button>
            </div>
            <MusicSongTable
              songs={newSongsDetail?.list ?? []}
              loading={newSongsLoading}
              emptyText="暂无新歌"
              page={newSongsPage}
              pageSize={newSongsDetail?.pageSize ?? DETAIL_PAGE_SIZE}
              total={newSongsDetail?.total}
              onPageChange={(nextPage) => {
                setNewSongsPage(nextPage)
              }}
            />
          </>
        )}
      </div>
    </Card>
  )
}
