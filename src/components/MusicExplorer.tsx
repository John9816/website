import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from 'react'
import { App as AntApp, Button, Card, Input, Modal, Pagination, Segmented } from 'antd'
import {
  ChevronLeft,
  ChevronRight,
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
import type {
  MusicFavoriteItem,
  MusicHistoryItem,
  MusicPlaylistSourceId,
  MusicQuality,
  MusicSearchType,
  MusicSourceId,
  PlaylistItem,
  SearchCollectionItem,
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
  icon: LucideIcon
  searchMode?: boolean
  authRequired?: boolean
}> = [
  {
    label: '榜单',
    value: 'toplist',
    icon: Trophy,
  },
  {
    label: '歌单',
    value: 'playlist',
    icon: ListMusic,
  },
  {
    label: '我的歌单',
    value: 'my-playlists',
    icon: ListMusic,
    authRequired: true,
  },
  {
    label: '新歌',
    value: 'new',
    icon: Sparkles,
  },
  {
    label: '历史',
    value: 'history',
    icon: History,
  },
  {
    label: '喜欢',
    value: 'favorites',
    icon: Heart,
  },
  {
    label: '搜索',
    value: 'search',
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
  const seen = (page - 1) * pageSize + count
  return count >= pageSize ? seen + 1 : seen
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

function isMusicSourceId(value: string | null): value is MusicSourceId {
  return value === 'qq' || value === 'netease' || value === 'kuwo'
}

function isMusicSearchType(value: string | null): value is MusicSearchType {
  return (
    value === 'song' ||
    value === 'artist' ||
    value === 'album' ||
    value === 'playlist'
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

type SearchCollections = Record<Exclude<MusicSearchType, 'song'>, SearchCollectionItem[]>

const SEARCH_TYPE_OPTIONS: Array<{
  label: string
  value: MusicSearchType
  placeholder: string
  emptyText: string
}> = [
  {
    label: '歌曲',
    value: 'song',
    placeholder: '输入歌名、歌手或专辑',
    emptyText: '没有找到歌曲，换个关键词或平台试试',
  },
  {
    label: '歌手',
    value: 'artist',
    placeholder: '输入歌手名，例如 林俊杰',
    emptyText: '没有找到歌手',
  },
  {
    label: '专辑',
    value: 'album',
    placeholder: '输入专辑名或歌手名',
    emptyText: '没有找到专辑',
  },
  {
    label: '歌单',
    value: 'playlist',
    placeholder: '输入歌单名、主题或创建者',
    emptyText: '没有找到歌单',
  },
]

function searchCollectionLabel(type: SearchCollectionItem['type']) {
  switch (type) {
    case 'artist':
      return '歌手'
    case 'album':
      return '专辑'
    case 'playlist':
      return '歌单'
    default:
      return ''
  }
}

function normalizeImportPlaylistUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return trimmed

  try {
    const url = new URL(trimmed)
    const host = url.hostname.toLowerCase()
    const pathname = url.pathname.toLowerCase()

    if (host === 'y.qq.com' || host.endsWith('.y.qq.com')) {
      const pathPlaylistId = pathname.match(/\/playlist\/(\d+)/)?.[1]
      if (pathPlaylistId) {
        return `https://y.qq.com/n/ryqq/playlist/${pathPlaylistId}`
      }

      const queryPlaylistId =
        url.searchParams.get('id') ||
        url.searchParams.get('disstid') ||
        url.searchParams.get('dirid')

      if (
        queryPlaylistId &&
        /^\d+$/.test(queryPlaylistId) &&
        (pathname.includes('playlist') || pathname.includes('taoge') || pathname.includes('songlist'))
      ) {
        return `https://y.qq.com/n/ryqq/playlist/${queryPlaylistId}`
      }
    }

    return trimmed
  } catch {
    return trimmed
  }
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
  const [searchType, setSearchType] = useState<MusicSearchType>('song')
  const [keyword, setKeyword] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SongSearchItem[]>([])
  const [searchCollections, setSearchCollections] = useState<SearchCollections>({
    artist: [],
    album: [],
    playlist: [],
  })
  const [searchPage, setSearchPage] = useState(1)
  const [searchPageSize, setSearchPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [lastKeyword, setLastKeyword] = useState('')
  const [lastSearchSource, setLastSearchSource] = useState<MusicSourceId>('qq')
  const [lastSearchType, setLastSearchType] = useState<MusicSearchType>('song')
  const searchRequestIdRef = useRef(0)

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
  const urlSearchRef = useRef('')

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

  const setView = useCallback(
    (nextView: MusicView) => {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.set('view', nextView)
      setSearchParams(nextParams, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const searchSongs = useCallback(
    async (
      nextKeyword: string,
      nextPage: number,
      nextPageSize = searchPageSize,
      nextSource = searchSource,
      nextType = searchType,
    ) => {
      const trimmed = nextKeyword.trim()
      if (!trimmed) {
        message.warning('请输入关键词')
        return
      }

      const requestId = ++searchRequestIdRef.current
      setSearching(true)
      try {
        const data = await musicSearch(nextSource, trimmed, nextPage, nextPageSize, nextType)
        if (requestId !== searchRequestIdRef.current) return

        const nextCollections: SearchCollections = {
          artist: [],
          album: [],
          playlist: [],
        }
        if (nextType === 'artist') nextCollections.artist = data.artists ?? []
        if (nextType === 'album') nextCollections.album = data.albums ?? []
        if (nextType === 'playlist') nextCollections.playlist = data.playlists ?? []

        setSearchResults(nextType === 'song' ? data.list : [])
        setSearchCollections({
          artist: nextCollections.artist,
          album: nextCollections.album,
          playlist: nextCollections.playlist,
        })
        setSearchPage(nextPage)
        setSearchPageSize(nextPageSize)
        setLastKeyword(trimmed)
        setLastSearchSource(nextSource)
        setLastSearchType(nextType)
        if (nextType === 'song') setPlaylist(data.list)
      } catch (error) {
        if (requestId !== searchRequestIdRef.current) return
        message.error((error as Error).message)
      } finally {
        if (requestId !== searchRequestIdRef.current) return
        setSearching(false)
      }
    },
    [message, searchPageSize, searchSource, searchType, setPlaylist],
  )

  useEffect(() => {
    if (view !== 'search') return

    const nextKeyword = (searchParams.get('keyword') || searchParams.get('q') || '').trim()
    if (!nextKeyword) return

    const nextSourceParam = searchParams.get('source')
    const nextTypeParam = searchParams.get('type')
    const nextSource = isMusicSourceId(nextSourceParam) ? nextSourceParam : searchSource
    const nextType = isMusicSearchType(nextTypeParam) ? nextTypeParam : 'song'
    const nextKey = `${nextSource}:${nextType}:${nextKeyword}`

    if (urlSearchRef.current === nextKey) return
    urlSearchRef.current = nextKey

    setKeyword(nextKeyword)
    setSearchSource(nextSource)
    setSearchType(nextType)
    void searchSongs(nextKeyword, 1, searchPageSize, nextSource, nextType)
  }, [searchPageSize, searchParams, searchSongs, searchSource, view])

  const searchByMeta = useCallback(
    (nextKeyword: string, nextSource: MusicSourceId, nextType: MusicSearchType = 'song') => {
      const trimmed = nextKeyword.trim()
      if (!trimmed) return
      const nextParams = new URLSearchParams(searchParams)
      nextParams.set('view', 'search')
      nextParams.set('source', nextSource)
      nextParams.set('type', nextType)
      nextParams.set('keyword', trimmed)
      nextParams.delete('q')
      urlSearchRef.current = `${nextSource}:${nextType}:${trimmed}`
      setSearchParams(nextParams, { replace: true })
      setSearchSource(nextSource)
      setSearchType(nextType)
      setKeyword(trimmed)
      void searchSongs(trimmed, 1, searchPageSize, nextSource, nextType)
    },
    [searchPageSize, searchParams, searchSongs, setSearchParams],
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
    const normalizedUrl = normalizeImportPlaylistUrl(importUrl)
    setImporting(true)
    try {
      await importPlaylist({ url: normalizedUrl })
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

  const activeSearchTypeOption =
    SEARCH_TYPE_OPTIONS.find((item) => item.value === searchType) ?? SEARCH_TYPE_OPTIONS[0]
  const lastSearchTypeOption =
    SEARCH_TYPE_OPTIONS.find((item) => item.value === lastSearchType) ?? SEARCH_TYPE_OPTIONS[0]
  const activeSearchCollectionItems =
    lastSearchType === 'song' ? [] : searchCollections[lastSearchType]
  const activeSearchResultCount =
    lastSearchType === 'song' ? searchResults.length : activeSearchCollectionItems.length

  const stageMeta = useMemo(() => {
    switch (view) {
      case 'search':
        return lastKeyword
          ? `${sourceLabel(lastSearchSource)} · ${lastSearchTypeOption.label} · ${activeSearchResultCount} 个结果`
          : '选择类型后搜索'
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
    activeSearchResultCount,
    lastKeyword,
    lastSearchSource,
    lastSearchTypeOption.label,
    myPlaylistsTotal,
    newSongsDetail?.list.length,
    newSource,
    playlistSource,
    playlists.length,
    toplistSource,
    toplists.length,
    view,
  ])

  const hasSearchResults =
    searching || lastKeyword.length > 0 || searchResults.length > 0 || activeSearchCollectionItems.length > 0

  const handleQuickSearch = useCallback(() => {
    setView('search')
    const trimmed = keyword.trim()
    if (!trimmed) return
    void searchSongs(trimmed, 1, searchPageSize, searchSource, searchType)
  }, [keyword, searchPageSize, searchSongs, searchSource, searchType, setView])

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
      ) : null}
      <MusicShareAction song={song} />
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

  const renderSearchCollectionResults = (
    type: Exclude<MusicSearchType, 'song'>,
    items: SearchCollectionItem[],
  ) => (
    <section className="music-search-group music-search-group--wide" aria-label={lastSearchTypeOption.label}>
      <div className="music-search-group__head">
        <strong>{lastSearchTypeOption.label}</strong>
        <span>{items.length} 个</span>
      </div>
      {items.length > 0 ? (
        <div className="music-search-collection-grid">
          {items.map((item) => (
            <button
              key={`${item.source}:${item.type}:${item.id}`}
              type="button"
              className="music-search-collection-card"
              onClick={() => {
                if (type === 'playlist') {
                  navigate(`/music/playlist/${item.source}/${encodeURIComponent(item.id)}`, {
                    state: { coverUrl: item.coverUrl },
                  })
                  return
                }
                if (type === 'album') {
                  navigate(`/music/album/${item.source}/${encodeURIComponent(item.id)}`, {
                    state: { coverUrl: item.coverUrl },
                  })
                  return
                }
                searchByMeta(item.name, item.source, 'song')
              }}
            >
              <MusicCover src={item.coverUrl} size={64} rounded={14} />
              <div className="music-search-collection-card__body">
                <span className="music-search-collection-card__type">
                  {searchCollectionLabel(item.type)}
                </span>
                <strong>{item.name}</strong>
                <span>
                  {item.artist || item.creatorName || sourceLabel(item.source)}
                  {typeof item.trackCount === 'number' ? ` · ${item.trackCount} 首` : ''}
                  {typeof item.playCount === 'number'
                    ? ` · ${formatPlayCount(item.playCount)} 次播放`
                    : ''}
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="music-search-group__empty">
          {searching ? '正在搜索...' : lastSearchTypeOption.emptyText}
        </div>
      )}
    </section>
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
                  >
                    <span className="music-browser__side-item-icon">
                      <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                    </span>
                    <span className="music-browser__side-item-name">{item.label}</span>
                  </button>
                )
              })}
            </nav>
          </aside>

          <div className="music-browser__main">
            <div className="music-browser__topline">
              <div className="music-browser__history-controls" aria-label="页面导航">
                <button type="button" onClick={() => navigate(-1)} aria-label="后退" title="后退">
                  <ChevronLeft size={18} />
                </button>
                <button type="button" onClick={() => navigate(1)} aria-label="前进" title="前进">
                  <ChevronRight size={18} />
                </button>
              </div>

              <div className="music-browser__topline-copy">
                <h1>{stageTitle}</h1>
                <p>{stageMeta}</p>
              </div>

              <Input.Search
                className="music-browser__quick-search"
                placeholder="搜索歌曲、歌手、专辑或歌单"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                onSearch={handleQuickSearch}
                enterButton={<Search size={16} />}
                loading={searching}
                allowClear
              />
            </div>

            <div className="music-browser__content">
          {view === 'search' && (
            <>
              <section className="music-search-stage" aria-label="独立搜索">
                <div className="music-search-stage__controls">
                  <Segmented
                    options={SOURCE_OPTIONS}
                    value={searchSource}
                    onChange={(value) => {
                      setSearchSource(value as MusicSourceId)
                      setSearchPage(1)
                    }}
                  />
                  <Segmented
                    className="music-search-type-switch"
                    options={SEARCH_TYPE_OPTIONS.map((item) => ({
                      label: item.label,
                      value: item.value,
                    }))}
                    value={searchType}
                    onChange={(value) => {
                      setSearchType(value as MusicSearchType)
                      setSearchPage(1)
                    }}
                  />
                  <Input.Search
                    className="music-search-box"
                    placeholder={activeSearchTypeOption.placeholder}
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    onSearch={() => {
                      void searchSongs(keyword, 1, searchPageSize, searchSource, searchType)
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
                      {lastKeyword
                        ? `${sourceLabel(lastSearchSource)} · ${lastSearchTypeOption.label} · ${activeSearchResultCount} 个结果`
                        : '搜索中'}
                    </span>
                    {lastSearchType === 'song' ? (
                      <Button
                        type="primary"
                        size="small"
                        icon={<Play size={14} />}
                        disabled={searching || searchResults.length === 0}
                        onClick={() => {
                          void playPlaylist(searchResults)
                        }}
                      >
                        播放全部
                      </Button>
                    ) : null}
                  </div>
                  {lastSearchType === 'song' ? (
                    <MusicSongTable
                      songs={searchResults}
                      loading={searching}
                      emptyText={lastSearchTypeOption.emptyText}
                      page={searchPage}
                      pageSize={searchPageSize}
                      total={pageTotal(searchPage, searchPageSize, searchResults.length)}
                      onPageChange={(nextPage, nextPageSize) => {
                        void searchSongs(
                          lastKeyword || keyword,
                          nextPageSize !== searchPageSize ? 1 : nextPage,
                          nextPageSize,
                          lastSearchSource,
                          lastSearchType,
                        )
                      }}
                      renderActions={renderSongActions}
                      actionColumnWidth={auth.token ? 176 : 132}
                      onSearchArtist={(artist, source) => searchByMeta(artist, source, 'song')}
                      onSearchAlbum={(album, source) => searchByMeta(album, source, 'album')}
                    />
                  ) : (
                    <>
                      <div className="music-search-groups">
                        {renderSearchCollectionResults(lastSearchType, activeSearchCollectionItems)}
                      </div>
                      {activeSearchCollectionItems.length > 0 && (
                        <div className="music-pagination music-pagination--bottom">
                          <Pagination
                            current={searchPage}
                            pageSize={searchPageSize}
                            total={pageTotal(
                              searchPage,
                              searchPageSize,
                              activeSearchCollectionItems.length,
                            )}
                            onChange={(nextPage, nextPageSize) => {
                              void searchSongs(
                                lastKeyword || keyword,
                                nextPageSize !== searchPageSize ? 1 : nextPage,
                                nextPageSize,
                                lastSearchSource,
                                lastSearchType,
                              )
                            }}
                            responsive
                            showLessItems
                            showSizeChanger={{
                              popupClassName: 'music-pagination-size-dropdown',
                            }}
                            showQuickJumper={false}
                            pageSizeOptions={PAGE_SIZE_OPTIONS}
                            showTotal={(totalItems, range) =>
                              `${range[0]}-${range[1]} / ${totalItems}`
                            }
                          />
                        </div>
                      )}
                    </>
                  )}
                </section>
              )}
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
                      showSizeChanger={{
                        popupClassName: 'music-pagination-size-dropdown',
                      }}
                      showQuickJumper={false}
                      pageSizeOptions={PAGE_SIZE_OPTIONS}
                      showTotal={(totalItems, range) =>
                        `${range[0]}-${range[1]} / ${totalItems}`
                      }
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
                renderActions={renderSongActions}
                actionColumnWidth={auth.token ? 176 : 132}
                onSearchArtist={(artist, source) => searchByMeta(artist, source, 'artist')}
                onSearchAlbum={(album, source) => searchByMeta(album, source, 'album')}
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
                    onSearchArtist={(artist, source) => searchByMeta(artist, source, 'artist')}
                    onSearchAlbum={(album, source) => searchByMeta(album, source, 'album')}
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
                    onSearchArtist={(artist, source) => searchByMeta(artist, source, 'artist')}
                    onSearchAlbum={(album, source) => searchByMeta(album, source, 'album')}
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
                          showSizeChanger={{
                            popupClassName: 'music-pagination-size-dropdown',
                          }}
                          showQuickJumper={false}
                          pageSizeOptions={PAGE_SIZE_OPTIONS}
                          showTotal={(totalItems, range) =>
                            `${range[0]}-${range[1]} / ${totalItems}`
                          }
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
