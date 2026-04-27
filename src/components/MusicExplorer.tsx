import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  App as AntApp,
  Card,
  Input,
  Pagination,
  Segmented,
} from 'antd'
import {
  ListMusic,
  Search,
  Sparkles,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  musicNewSongs,
  musicPlaylist,
  musicSearch,
  musicToplist,
} from '../api/music'
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '../constants/pagination'
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

type MusicView = 'toplist' | 'playlist' | 'new' | 'search'

const VIEW_OPTIONS: Array<{
  label: string
  value: MusicView
  description: string
  icon: LucideIcon
}> = [
  {
    label: '榜单',
    value: 'toplist',
    description: '快速查看平台热榜和分类榜',
    icon: Trophy,
  },
  {
    label: '歌单',
    value: 'playlist',
    description: '按平台和分类翻推荐歌单',
    icon: ListMusic,
  },
  {
    label: '新歌',
    value: 'new',
    description: '跟进平台最近更新的新歌列表',
    icon: Sparkles,
  },
  {
    label: '搜索',
    value: 'search',
    description: '按歌曲、歌手、专辑直接开搜',
    icon: Search,
  },
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
  return value === 'toplist' || value === 'playlist' || value === 'new' || value === 'search'
}

export default function MusicExplorer() {
  const { message } = AntApp.useApp()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { setPlaylist } = useMusicPlayer()

  const [searchSource, setSearchSource] = useState<MusicSourceId>('qq')
  const [keyword, setKeyword] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SongSearchItem[]>([])
  const [searchPage, setSearchPage] = useState(1)
  const [searchPageSize, setSearchPageSize] = useState(DEFAULT_PAGE_SIZE)
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
  const [playlistPageSize, setPlaylistPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [playlists, setPlaylists] = useState<PlaylistItem[]>([])
  const [playlistTotal, setPlaylistTotal] = useState<number | null>(null)
  const [playlistLoading, setPlaylistLoading] = useState(false)

  const [newSource, setNewSource] = useState<MusicSourceId>('qq')
  const [newSongsPage, setNewSongsPage] = useState(1)
  const [newSongsPageSize, setNewSongsPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [newSongsLoading, setNewSongsLoading] = useState(false)
  const [newSongsDetail, setNewSongsDetail] = useState<ToplistDetailView | null>(null)

  const playlistRequestIdRef = useRef(0)
  const newSongsRequestIdRef = useRef(0)

  const view = isMusicView(searchParams.get('view')) ? searchParams.get('view') : 'toplist'

  const setView = useCallback(
    (nextView: MusicView) => {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.set('view', nextView)
      setSearchParams(nextParams, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const searchSongs = useCallback(
    async (nextKeyword: string, nextPage: number, nextPageSize = searchPageSize) => {
      const trimmed = nextKeyword.trim()
      if (!trimmed) {
        message.warning('请输入关键词')
        return
      }

      setSearching(true)
      try {
        const data = await musicSearch(searchSource, trimmed, nextPage, nextPageSize)
        setSearchResults(data.list)
        setSearchPage(nextPage)
        setSearchPageSize(nextPageSize)
        setSearchHasMore(data.list.length >= nextPageSize)
        setLastKeyword(trimmed)
        setPlaylist(data.list)
      } catch (error) {
        message.error((error as Error).message)
      } finally {
        setSearching(false)
      }
    },
    [message, searchPageSize, searchSource, setPlaylist],
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
        playlistPageSize,
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
  }, [message, playlistCategory, playlistPage, playlistPageSize, playlistSource])

  const loadNewSongs = useCallback(async () => {
    const requestId = ++newSongsRequestIdRef.current
    setNewSongsLoading(true)
    try {
      const data = await musicNewSongs(newSource, newSongsPage, newSongsPageSize)
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
  }, [message, newSongsPage, newSongsPageSize, newSource, setPlaylist])

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

  const stageDescription = useMemo(() => {
    switch (view) {
      case 'search':
        return '在这里集中搜索歌曲、歌手、专辑，搜索结果不再混在榜单、歌单、新歌模块里。'
      case 'toplist':
        return '榜单入口集中展示平台热门内容，适合先看趋势，再进入详情整组播放。'
      case 'playlist':
        return '歌单页更适合整包收歌，可以按平台和分类连续翻看。'
      case 'new':
        return '新歌页聚焦最近上架的内容，适合快速追更和补歌。'
    }
  }, [view])

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

  const activeViewOption = VIEW_OPTIONS.find((item) => item.value === view) ?? VIEW_OPTIONS[0]
  const ActiveViewIcon = activeViewOption.icon
  const hasSearchResults = searching || lastKeyword.length > 0 || searchResults.length > 0

  return (
    <Card
      className="music-browser"
      bordered={false}
      styles={{ body: { padding: 0 } }}
    >
      <div className="music-browser__layout">
        <aside className="music-browser__sidebar">
          <div className="music-browser__sidebar-head">
            <span className="music-browser__sidebar-kicker">功能导航</span>
            <span className="music-browser__sidebar-meta">{VIEW_OPTIONS.length} 个模块</span>
          </div>

          <nav className="music-browser__side-nav" aria-label="音乐功能导航">
          {VIEW_OPTIONS.map((item) => {
            const Icon = item.icon
            const isActive = item.value === view

            return (
              <button
                key={item.value}
                type="button"
                className={`music-browser__side-item${isActive ? ' is-active' : ''}`}
                aria-pressed={isActive}
                onClick={() => setView(item.value)}
                title={item.description}
              >
                <span className="music-browser__side-item-icon">
                  <Icon size={18} />
                </span>
                <span className="music-browser__side-item-name">{item.label}</span>
              </button>
            )
          })}
          </nav>

          <div className="music-browser__sidebar-summary" aria-label="当前模块摘要">
            <span className="music-browser__sidebar-summary-kicker">音乐中心</span>
            <div className="music-browser__sidebar-summary-title">
              <ListMusic size={16} />
              <span>多入口浏览</span>
            </div>
            <div className="music-browser__sidebar-summary-copy">
              <strong>搜索、榜单、歌单、新歌</strong>
              <span>左侧四个入口都是独立模块。</span>
              <span>只有切到搜索模块时才会显示搜索控件。</span>
            </div>
          </div>
        </aside>

        <div className="music-browser__content">
          {view === 'search' && (
            <>
              <section className="music-search-stage" aria-label="独立搜索">
                <div className="music-search-stage__copy">
                  <span className="music-stage-kicker">搜索模块</span>
                  <h2>搜索歌曲</h2>
                  <p>在这里集中搜索歌曲、歌手、专辑，搜索结果不会再混到其它浏览模块里。</p>
                </div>
                <div className="music-search-stage__controls">
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
              </section>

              {hasSearchResults && (
                <section className="music-search-results">
                  <div className="music-search-results__head">
                    <div className="music-search-results__copy">
                      <span className="music-search-results__label">
                        <Search size={14} />
                        <span>搜索结果</span>
                      </span>
                      <strong>{lastKeyword ? `“${lastKeyword}”` : '正在搜索'}</strong>
                    </div>
                    <span className="music-search-results__meta">
                      {lastKeyword ? `${sourceLabel(searchSource)} · ${searchResults.length} 首` : '搜索中'}
                    </span>
                  </div>
                  <MusicSongTable
                    songs={searchResults}
                    loading={searching}
                    emptyText="暂无结果"
                    page={searchPage}
                    pageSize={searchPageSize}
                    total={searchHasMore ? searchPage * searchPageSize + 1 : searchPage * searchPageSize}
                    onPageChange={(nextPage, nextPageSize) => {
                      void searchSongs(
                        lastKeyword || keyword,
                        nextPageSize !== searchPageSize ? 1 : nextPage,
                        nextPageSize,
                      )
                    }}
                  />
                </section>
              )}
            </>
          )}

          {view !== 'search' && (
            <div className="music-stage-header">
              <div className="music-stage-header__copy">
                <span className="music-stage-kicker">{activeViewOption.label}</span>
                <h1>{stageTitle}</h1>
                <p>{stageDescription}</p>
              </div>
              <div className="music-stage-header__panel" aria-label="当前模块信息">
                <span className="music-stage-header__panel-icon">
                  <ActiveViewIcon size={16} />
                </span>
                <span className="music-stage-header__panel-text">
                  {`${activeViewOption.label} · ${stageMeta}`}
                </span>
              </div>
            </div>
          )}

          {view === 'toplist' && (
            <>
              <div className="music-view-controls music-view-controls--compact">
                <Segmented
                  options={SOURCE_OPTIONS}
                  value={toplistSource}
                  onChange={(value) => setToplistSource(value as MusicSourceId)}
                />
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
                      <MusicCover src={item.coverUrl} size={128} rounded={24} />
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
                        <MusicCover src={item.coverUrl} size={128} rounded={24} />
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
                      current={playlistPage}
                      pageSize={playlistPageSize}
                      total={pageTotal(
                        playlistPage,
                        playlistPageSize,
                        playlists.length,
                        playlistTotal,
                      )}
                      onChange={(nextPage, nextPageSize) => {
                        setPlaylistPageSize(nextPageSize)
                        setPlaylistPage(nextPageSize !== playlistPageSize ? 1 : nextPage)
                      }}
                      responsive
                      showLessItems
                      showSizeChanger
                      showQuickJumper={false}
                      pageSizeOptions={PAGE_SIZE_OPTIONS}
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
              </div>

              <MusicSongTable
                songs={newSongsDetail?.list ?? []}
                loading={newSongsLoading}
                emptyText="暂无新歌"
                page={newSongsPage}
                pageSize={newSongsPageSize}
                total={newSongsDetail?.total}
                onPageChange={(nextPage, nextPageSize) => {
                  setNewSongsPageSize(nextPageSize)
                  setNewSongsPage(nextPageSize !== newSongsPageSize ? 1 : nextPage)
                }}
              />
            </>
          )}
        </div>
      </div>
    </Card>
  )
}
