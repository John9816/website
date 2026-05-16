import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from 'react'
import { App as AntApp, Button, Card, Input, Modal, Pagination, Segmented } from 'antd'
import {
  Heart,
  History,
  ListMusic,
  LogIn,
  Play,
  Search,
  Sparkles,
  Trash2,
  Trophy,
  Upload,
  type LucideIcon,
} from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  deleteMusicHistory,
  getMusicFavorites,
  getMusicHistory,
  musicNewSongs,
  musicPlaylist,
  musicSearch,
  musicToplist,
  getImportedPlaylists,
  importPlaylist,
} from '../api/music'
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '../constants/pagination'
import { useAuth } from '../context/AuthContext'
import { useMusicPlayer } from '../context/MusicPlayerContext'
import { useMusicFavorites } from '../hooks/useMusicFavorites'
import { useMusicShares } from '../hooks/useMusicShares'
import type {
  MusicFavoriteItem,
  MusicHistoryItem,
  MusicPlaylistSourceId,
  MusicQuality,
  MusicSourceId,
  PlaylistItem,
  SongSearchItem,
  ToplistDetailView,
  ToplistItem,
  ImportedPlaylist,
} from '../types'
import { hydrateCollectionCovers } from '../utils/musicPlayer'
import MusicCover from './MusicCover'
import MusicShareAction from './MusicShareAction'
import MusicSongTable from './MusicSongTable'

type MusicView = 'toplist' | 'playlist' | 'new' | 'history' | 'favorites' | 'search' | 'my-playlists'

const VIEW_OPTIONS: Array<{
  label: string
  value: MusicView
  description: string
  icon: LucideIcon
  searchMode?: boolean
  authRequired?: boolean
}> = [
  {
    label: '榜单',
    value: 'toplist',
    description: '快速查看平台热门榜单和分类榜。',
    icon: Trophy,
  },
  {
    label: '歌单',
    value: 'playlist',
    description: '按平台和分类浏览推荐歌单。',
    icon: ListMusic,
  },
  {
    label: '我的歌单',
    value: 'my-playlists',
    description: '管理你从外部导入的歌单。',
    icon: ListMusic,
    authRequired: true,
  },
  {
    label: '新歌',
    value: 'new',
    description: '跟进平台最近更新的新歌列表。',
    icon: Sparkles,
  },
  {
    label: '历史',
    value: 'history',
    description: '查看登录用户最近播放过的歌曲。',
    icon: History,
  },
  {
    label: '喜欢',
    value: 'favorites',
    description: '集中管理你收藏过的歌曲。',
    icon: Heart,
  },
  {
    label: '搜索',
    value: 'search',
    description: '按歌曲、歌手、专辑直接搜索。',
    icon: Search,
    searchMode: true,
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

const ALL_QUALITIES: MusicQuality[] = ['128k', '320k', 'flac', 'flac24bit']

function sourceLabel(source: MusicSourceId) {
  return SOURCE_OPTIONS.find((item) => item.value === source)?.label ?? source
}

function formatPlayCount(value?: number) {
  if (!value || value <= 0) return '0'
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)} 亿`
  if (value >= 10000) return `${(value / 10000).toFixed(1)} 万`
  return String(value)
}

function pageTotal(page: number, pageSize: number, count: number, total?: number | null) {
  if (typeof total === 'number') return total
  return count >= pageSize ? page * pageSize + 1 : page * pageSize
}

function isMusicView(value: string | null): value is MusicView {
  return (
    value === 'toplist' ||
    value === 'playlist' ||
    value === 'new' ||
    value === 'history' ||
    value === 'favorites' ||
    value === 'search' ||
    value === 'my-playlists'
  )
}

function toSongSearchItem(item: MusicHistoryItem | MusicFavoriteItem): SongSearchItem {
  return {
    id: item.songId,
    source: item.source,
    name: item.name,
    artist: item.artist ?? '',
    album: item.album ?? undefined,
    coverUrl: item.coverUrl ?? undefined,
    durationSec: item.durationSec ?? undefined,
    availableQualities: ALL_QUALITIES,
  }
}

function itemSongKey(item: Pick<MusicHistoryItem, 'source' | 'songId'>) {
  return `${item.source}:${item.songId}`
}

function songKey(song: Pick<SongSearchItem, 'source' | 'id'>) {
  return `${song.source}:${song.id}`
}

function MusicAuthPrompt() {
  return (
    <div className="music-auth-prompt">
      <span className="music-auth-prompt__icon">
        <LogIn size={18} />
      </span>
      <strong>登录后可使用播放历史和我喜欢的音乐</strong>
      <p>公开音乐浏览不受影响，但这两个模块依赖你的个人账户数据。</p>
      <div className="music-auth-prompt__actions">
        <Link to="/login">
          <Button type="primary">去登录</Button>
        </Link>
        <Link to="/register">
          <Button>注册账号</Button>
        </Link>
      </div>
    </div>
  )
}

export default function MusicExplorer() {
  const { message } = AntApp.useApp()
  const auth = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { playPlaylist, setPlaylist } = useMusicPlayer()

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

  const [playlistSource, setPlaylistSource] = useState<MusicPlaylistSourceId>('netease')
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

  const [historyPage, setHistoryPage] = useState(1)
  const [historyPageSize, setHistoryPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [historyItems, setHistoryItems] = useState<MusicHistoryItem[]>([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyDeletingId, setHistoryDeletingId] = useState<number | null>(null)

  const [favoritePage, setFavoritePage] = useState(1)
  const [favoritePageSize, setFavoritePageSize] = useState(DEFAULT_PAGE_SIZE)
  const [favoriteItems, setFavoriteItems] = useState<MusicFavoriteItem[]>([])
  const [favoriteTotal, setFavoriteTotal] = useState(0)
  const [favoriteLoading, setFavoriteLoading] = useState(false)

  const [myPlaylistsPage, setMyPlaylistsPage] = useState(1)
  const [myPlaylistsPageSize, setMyPlaylistsPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [myPlaylists, setMyPlaylists] = useState<ImportedPlaylist[]>([])
  const [myPlaylistsTotal, setMyPlaylistsTotal] = useState(0)
  const [myPlaylistsLoading, setMyPlaylistsLoading] = useState(false)
  const [importDialogVisible, setImportDialogVisible] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)

  const playlistRequestIdRef = useRef(0)
  const newSongsRequestIdRef = useRef(0)
  const historyRequestIdRef = useRef(0)
  const favoriteRequestIdRef = useRef(0)
  const myPlaylistsRequestIdRef = useRef(0)

  const view = isMusicView(searchParams.get('view')) ? searchParams.get('view') : 'toplist'

  const historySongs = useMemo(() => historyItems.map(toSongSearchItem), [historyItems])
  const favoriteSongs = useMemo(() => favoriteItems.map(toSongSearchItem), [favoriteItems])

  const activeSongs = useMemo(() => {
    switch (view) {
      case 'search':
        return searchResults
      case 'new':
        return newSongsDetail?.list ?? []
      case 'history':
        return historySongs
      case 'favorites':
        return favoriteSongs
      default:
        return []
    }
  }, [favoriteSongs, historySongs, newSongsDetail?.list, searchResults, view])

  const favoriteState = useMusicFavorites(activeSongs)
  const shareState = useMusicShares(activeSongs)

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
      const hydrated = hydrateCollectionCovers(data.coverUrl, data.list)
      const nextDetail = {
        ...data,
        coverUrl: hydrated.coverUrl,
        list: hydrated.list,
      }
      setNewSongsDetail(nextDetail)
      setPlaylist(nextDetail.list)
    } catch (error) {
      if (requestId !== newSongsRequestIdRef.current) return
      message.error((error as Error).message)
    } finally {
      if (requestId !== newSongsRequestIdRef.current) return
      setNewSongsLoading(false)
    }
  }, [message, newSongsPage, newSongsPageSize, newSource, setPlaylist])

  const loadHistory = useCallback(async () => {
    if (!auth.token) return
    const requestId = ++historyRequestIdRef.current
    setHistoryLoading(true)
    try {
      const data = await getMusicHistory(historyPage - 1, historyPageSize)
      if (requestId !== historyRequestIdRef.current) return
      setHistoryItems(data.items)
      setHistoryTotal(data.total)
      setPlaylist(data.items.map(toSongSearchItem))
    } catch (error) {
      if (requestId !== historyRequestIdRef.current) return
      message.error((error as Error).message)
    } finally {
      if (requestId !== historyRequestIdRef.current) return
      setHistoryLoading(false)
    }
  }, [auth.token, historyPage, historyPageSize, message, setPlaylist])

  const loadFavorites = useCallback(async () => {
    if (!auth.token) return
    const requestId = ++favoriteRequestIdRef.current
    setFavoriteLoading(true)
    try {
      const data = await getMusicFavorites(favoritePage - 1, favoritePageSize)
      if (requestId !== favoriteRequestIdRef.current) return
      setFavoriteItems(data.items)
      setFavoriteTotal(data.total)
      setPlaylist(data.items.map(toSongSearchItem))
    } catch (error) {
      if (requestId !== favoriteRequestIdRef.current) return
      message.error((error as Error).message)
    } finally {
      if (requestId !== favoriteRequestIdRef.current) return
      setFavoriteLoading(false)
    }
  }, [auth.token, favoritePage, favoritePageSize, message, setPlaylist])

  const loadMyPlaylists = useCallback(async () => {
    if (!auth.token) return
    const requestId = ++myPlaylistsRequestIdRef.current
    setMyPlaylistsLoading(true)
    try {
      const data = await getImportedPlaylists(myPlaylistsPage - 1, myPlaylistsPageSize)
      if (requestId !== myPlaylistsRequestIdRef.current) return
      setMyPlaylists(data.items)
      setMyPlaylistsTotal(data.total)
    } catch (error) {
      if (requestId !== myPlaylistsRequestIdRef.current) return
      message.error((error as Error).message)
    } finally {
      if (requestId !== myPlaylistsRequestIdRef.current) return
      setMyPlaylistsLoading(false)
    }
  }, [auth.token, myPlaylistsPage, myPlaylistsPageSize, message])

  const handleImportPlaylist = useCallback(async () => {
    if (!importUrl.trim()) {
      message.warning('请输入分享链接')
      return
    }
    setImporting(true)
    try {
      await importPlaylist({ url: importUrl.trim() })
      message.success('导入成功！')
      setImportDialogVisible(false)
      setImportUrl('')
      void loadMyPlaylists()
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setImporting(false)
    }
  }, [importUrl, loadMyPlaylists, message])

  useEffect(() => {
    if (view === 'toplist') void loadToplists()
  }, [view, loadToplists])

  useEffect(() => {
    if (view === 'playlist') void loadPlaylists()
  }, [view, loadPlaylists])

  useEffect(() => {
    if (view === 'my-playlists' && auth.token) void loadMyPlaylists()
  }, [auth.token, loadMyPlaylists, view])

  useEffect(() => {
    if (view === 'new') void loadNewSongs()
  }, [view, loadNewSongs])

  useEffect(() => {
    if (view === 'history' && auth.token) void loadHistory()
  }, [auth.token, loadHistory, view])

  useEffect(() => {
    if (view === 'favorites' && auth.token) void loadFavorites()
  }, [auth.token, loadFavorites, view])

  useEffect(() => {
    if (auth.token) return
    setHistoryItems([])
    setHistoryTotal(0)
    setFavoriteItems([])
    setFavoriteTotal(0)
    setMyPlaylists([])
    setMyPlaylistsTotal(0)
  }, [auth.token])

  const stageTitle = useMemo(() => {
    switch (view) {
      case 'search':
        return lastKeyword ? `“${lastKeyword}”` : '搜索歌曲'
      case 'toplist':
        return '热门榜单'
      case 'playlist':
        return '推荐歌单'
      case 'my-playlists':
        return '我的歌单'
      case 'new':
        return newSongsDetail?.name || '最新歌曲'
      case 'history':
        return '播放历史'
      case 'favorites':
        return '我喜欢的音乐'
    }
  }, [lastKeyword, newSongsDetail?.name, view])

  const stageDescription = useMemo(() => {
    switch (view) {
      case 'search':
        return '集中搜索歌曲、歌手和专辑，搜索结果不会再混入其他浏览模块。'
      case 'toplist':
        return '先看平台趋势，再进入榜单详情整组播放。'
      case 'playlist':
        return '按平台和分类连续浏览推荐歌单，适合整包收歌。'
      case 'my-playlists':
        return auth.token
          ? '从 QQ 音乐/网易云音乐导入你喜欢的歌单，统一在这管理。'
          : '我的歌单需要登录后才能导入和管理。'
      case 'new':
        return '快速跟进平台最近上新的歌曲，适合补歌和追更。'
      case 'history':
        return auth.token
          ? '这里会自动记录你登录后播放过的歌曲，重复播放会刷新到最前面。'
          : '播放历史依赖你的个人账户数据，登录后才会开始记录。'
      case 'favorites':
        return auth.token
          ? '收藏会按用户维度永久保存，你可以从任何歌表里把歌曲加入喜欢列表。'
          : '喜欢列表依赖你的个人账户数据，登录后可跨页面收藏歌曲。'
    }
  }, [auth.token, view])

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
      case 'my-playlists':
        return auth.token ? `已导入 · ${myPlaylistsTotal} 个歌单` : '登录后可导入'
      case 'new':
        return `${sourceLabel(newSource)} · ${newSongsDetail?.list.length ?? 0} 首`
      case 'history':
        return auth.token ? `最近播放 · ${historyTotal} 首` : '登录后开始记录'
      case 'favorites':
        return auth.token ? `已收藏 · ${favoriteTotal} 首` : '登录后可收藏'
    }
  }, [
    auth.token,
    favoriteTotal,
    historyTotal,
    lastKeyword,
    myPlaylistsTotal,
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

  const handleToggleFavorite = async (song: SongSearchItem) => {
    const nextLiked = await favoriteState.toggleFavorite(song)
    if (view !== 'favorites' || nextLiked) return

    setFavoriteItems((previous) =>
      previous.filter((item) => itemSongKey(item) !== songKey(song)),
    )
    setFavoriteTotal((previous) => Math.max(0, previous - 1))
    if (favoriteItems.length === 1 && favoritePage > 1) {
      setFavoritePage((previous) => Math.max(1, previous - 1))
    }
  }

  const handleDeleteHistory = async (song: SongSearchItem) => {
    const target = historyItems.find((item) => itemSongKey(item) === songKey(song))
    if (!target) return

    setHistoryDeletingId(target.id)
    try {
      await deleteMusicHistory(target.id)
      message.success('已从播放历史中移除')
      if (historyItems.length === 1 && historyPage > 1) {
        setHistoryPage((previous) => Math.max(1, previous - 1))
      } else {
        setHistoryItems((previous) => previous.filter((item) => item.id !== target.id))
        setHistoryTotal((previous) => Math.max(0, previous - 1))
      }
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setHistoryDeletingId(null)
    }
  }

  const renderSongActions = (song: SongSearchItem) => (
    <>
      {auth.token ? (
        <>
          <button
          type="button"
          className={`music-icon-action${favoriteState.isFavorite(song) ? ' is-active' : ''}`}
          disabled={favoriteState.isFavoriteLoading(song)}
          onClick={(event) => {
            event.stopPropagation()
            void handleToggleFavorite(song)
          }}
          aria-label={favoriteState.isFavorite(song) ? '取消喜欢' : '加入喜欢'}
          title={favoriteState.isFavorite(song) ? '取消喜欢' : '加入喜欢'}
        >
          <Heart
            size={16}
            fill={favoriteState.isFavorite(song) ? 'currentColor' : 'none'}
          />
          </button>
          <MusicShareAction
            song={song}
            shared={shareState.isShared(song)}
            loading={shareState.isShareLoading(song)}
            initialShare={shareState.getShare(song)}
            onChange={(share) => shareState.setShare(song, share)}
          />
        </>
      ) : null}
      {view === 'history' ? (
        <button
          type="button"
          className="music-icon-action"
          disabled={
            historyDeletingId ===
            historyItems.find((item) => itemSongKey(item) === songKey(song))?.id
          }
          onClick={(event) => {
            event.stopPropagation()
            void handleDeleteHistory(song)
          }}
          aria-label="删除历史"
          title="删除历史"
        >
          <Trash2 size={16} />
        </button>
      ) : null}
    </>
  )

  return (
    <Fragment>
      <Card className="music-browser" bordered={false} styles={{ body: { padding: 0 } }}>
      <div
        className={`music-browser__layout${
          view === 'search' ? ' music-browser__layout--search' : ''
        }`}
      >
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
                  className={`music-browser__side-item${isActive ? ' is-active' : ''}${
                    item.searchMode ? ' music-browser__side-item--search' : ''
                  }`}
                  aria-pressed={isActive}
                  onClick={() => setView(item.value)}
                  title={item.description}
                >
                  <span className="music-browser__side-item-icon">
                    <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                  </span>
                  <span className="music-browser__side-item-name">{item.label}</span>
                </button>
              )
            })}
          </nav>

          <div className="music-browser__sidebar-summary" aria-label="当前模块摘要">
            <span className="music-browser__sidebar-summary-kicker">2026 Music</span>
            <div className="music-browser__sidebar-summary-title">
              <Sparkles size={16} className="music-dock-spin" style={{ color: 'var(--accent)' }} />
              <span>沉浸式体验</span>
            </div>
            <div className="music-browser__sidebar-summary-copy">
              <strong>现代、流畅、灵动</strong>
              <span>左侧模块互相独立，切换时不会打断当前播放。</span>
              <span>基于玻璃拟态设计的 UI，提供最纯粹的听歌环境。</span>
            </div>
          </div>
        </aside>

        <div className="music-browser__main">
          <div className="music-browser__content">
          {view === 'search' && (
            <>
              <section className="music-search-stage" aria-label="独立搜索">
                <div className="music-search-stage__copy">
                  <span className="music-stage-kicker">搜索模块</span>
                  <h2>搜索歌曲</h2>
                  <p>集中搜索歌曲、歌手和专辑，搜索结果不会再混入其他浏览模块。</p>
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
                    renderActions={auth.token ? renderSongActions : undefined}
                    actionColumnWidth={auth.token ? 176 : 76}
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
                        navigate(`/music/toplist/${toplistSource}/${encodeURIComponent(item.id)}`, {
                          state: { coverUrl: item.coverUrl },
                        })
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
                            {
                              state: { coverUrl: item.coverUrl },
                            },
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
                  <div className="music-pagination music-pagination--bottom">
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

              <div className="music-library-toolbar">
                <Button
                  type="primary"
                  icon={<Play size={14} />}
                  disabled={!newSongsDetail?.list.length}
                  onClick={() => {
                    if (!newSongsDetail?.list.length) return
                    void playPlaylist(newSongsDetail.list)
                  }}
                >
                  播放全部
                </Button>
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
                renderActions={auth.token ? renderSongActions : undefined}
                actionColumnWidth={auth.token ? 176 : 76}
              />
            </>
          )}

          {view === 'history' && (
            <>
              {!auth.token ? (
                <MusicAuthPrompt />
              ) : (
                <>
                  <div className="music-library-toolbar">
                    <Button
                      type="primary"
                      icon={<Play size={14} />}
                      disabled={!historySongs.length}
                      onClick={() => {
                        if (!historySongs.length) return
                        void playPlaylist(historySongs)
                      }}
                    >
                      播放全部
                    </Button>
                  </div>
                  <MusicSongTable
                    songs={historySongs}
                    loading={historyLoading}
                    emptyText="还没有播放历史，开始播放歌曲后这里会自动出现"
                    page={historyPage}
                    pageSize={historyPageSize}
                    total={historyTotal}
                    onPageChange={(nextPage, nextPageSize) => {
                      setHistoryPageSize(nextPageSize)
                      setHistoryPage(nextPageSize !== historyPageSize ? 1 : nextPage)
                    }}
                    renderActions={renderSongActions}
                    actionColumnWidth={212}
                  />
                </>
              )}
            </>
          )}

          {view === 'favorites' && (
            <>
              {!auth.token ? (
                <MusicAuthPrompt />
              ) : (
                <>
                  <div className="music-library-toolbar">
                    <Button
                      type="primary"
                      icon={<Play size={14} />}
                      disabled={!favoriteSongs.length}
                      onClick={() => {
                        if (!favoriteSongs.length) return
                        void playPlaylist(favoriteSongs)
                      }}
                    >
                      播放全部
                    </Button>
                  </div>
                  <MusicSongTable
                    songs={favoriteSongs}
                    loading={favoriteLoading}
                    emptyText="你还没有收藏歌曲，登录后可在搜索和歌单里点亮爱心"
                    page={favoritePage}
                    pageSize={favoritePageSize}
                    total={favoriteTotal}
                    onPageChange={(nextPage, nextPageSize) => {
                      setFavoritePageSize(nextPageSize)
                      setFavoritePage(nextPageSize !== favoritePageSize ? 1 : nextPage)
                    }}
                    renderActions={renderSongActions}
                    actionColumnWidth={176}
                  />
                </>
              )}
            </>
          )}

          {view === 'my-playlists' && (
            <>
              {!auth.token ? (
                <MusicAuthPrompt />
              ) : (
                <>
                  <div className="music-library-toolbar">
                    <Button
                      type="primary"
                      icon={<Upload size={14} />}
                      onClick={() => {
                        setImportUrl('')
                        setImportDialogVisible(true)
                      }}
                    >
                      导入歌单
                    </Button>
                  </div>
                  {myPlaylists.length > 0 ? (
                    <>
                      <div className="music-collection-grid">
                        {myPlaylists.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className="music-collection-card"
                            onClick={() => {
                              navigate(
                                `/music/my-playlist/${item.id}`,
                                {
                                  state: { coverUrl: item.coverUrl },
                                },
                              )
                            }}
                          >
                            <MusicCover src={item.coverUrl ?? undefined} size={128} rounded={24} />
                            <div className="music-collection-card__body">
                              <div className="music-collection-card__title">{item.name}</div>
                              <div className="music-collection-card__meta">
                                {item.creatorName || sourceLabel(item.source)}
                              </div>
                              <div className="music-collection-card__meta">
                                {item.trackCount ? `${item.trackCount} 首` : ''}
                                {typeof item.playCount === 'number'
                                  ? ` · ${formatPlayCount(item.playCount)}`
                                  : ''}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                      <div className="music-pagination music-pagination--bottom">
                        <Pagination
                          current={myPlaylistsPage}
                          pageSize={myPlaylistsPageSize}
                          total={pageTotal(
                            myPlaylistsPage,
                            myPlaylistsPageSize,
                            myPlaylists.length,
                            myPlaylistsTotal,
                          )}
                          onChange={(nextPage, nextPageSize) => {
                            setMyPlaylistsPageSize(nextPageSize)
                            setMyPlaylistsPage(nextPageSize !== myPlaylistsPageSize ? 1 : nextPage)
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
                      {myPlaylistsLoading ? '正在加载我的歌单...' : '暂无歌单，点击上方按钮导入'}
                    </div>
                  )}
                </>
              )}
            </>
          )}
          </div>
        </div>
      </div>
    </Card>

    <Modal
      title="导入歌单"
      open={importDialogVisible}
      onCancel={() => setImportDialogVisible(false)}
      onOk={handleImportPlaylist}
      confirmLoading={importing}
      okText="导入"
    >
      <p style={{ marginBottom: 16 }}>请粘贴 QQ 音乐/网易云音乐的分享链接：</p>
      <Input
        placeholder="https://..."
        value={importUrl}
        onChange={(e) => setImportUrl(e.target.value)}
        onPressEnter={handleImportPlaylist}
      />
    </Modal>
    </Fragment>
  )
}
