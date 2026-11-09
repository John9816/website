import { request } from './client'
import { musicRead } from './musicRead'
import type {
  LyricView,
  MusicFavoriteItem,
  MusicFavoriteStatusView,
  MusicPublicShareView,
  MusicQuality,
  MusicHistoryItem,
  MusicPlaylistSourceId,
  MusicSourceId,
  PageView,
  PlaylistDetailView,
  AlbumDetailView,
  PlaylistListView,
  PlayInfo,
  SearchResultView,
  ToplistDetailView,
  ToplistListView,
  ImportedPlaylist,
  ImportedPlaylistItem,
  PlaylistFavoriteStatusView,
  ImportPlaylistRequest,
  UpdatePlaylistRequest,
  MusicSearchType,
  QishuiAccountView,
  ArtistDetailView,
  ArtistWorksView,
} from '../types'
import { DEFAULT_PAGE_SIZE } from '../constants/pagination'

export const getQishuiAccount = (signal?: AbortSignal) =>
  request<QishuiAccountView>('/api/v1/music/qishui/account', { auth: true, signal })

export const createQishuiQr = (signal?: AbortSignal) =>
  request<QishuiAccountView>('/api/v1/music/qishui/auth/qr', { method: 'POST', auth: true, signal })

export const pollQishuiQr = (sessionId: string, signal?: AbortSignal) =>
  request<QishuiAccountView>(`/api/v1/music/qishui/auth/qr/${encodeURIComponent(sessionId)}`, { auth: true, signal })

export const refreshQishuiAccount = (signal?: AbortSignal) =>
  request<QishuiAccountView>('/api/v1/music/qishui/account/refresh', { method: 'POST', auth: true, signal })

export const deleteQishuiAccount = (signal?: AbortSignal) =>
  request<void>('/api/v1/music/qishui/account', { method: 'DELETE', auth: true, signal })

export const musicSearch = (
  source: MusicSourceId,
  keyword: string,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  type: MusicSearchType = 'song',
  signal?: AbortSignal,
) =>
  musicRead<SearchResultView>('/api/v1/music/search', {
    auth: true, signal,
    query: {
      source,
      keyword,
      page,
      pageSize,
      type: type === 'song' ? undefined : type,
    },
  })

export const musicPlay = (
  source: MusicSourceId,
  id: string,
  quality: MusicQuality = '320k',
  options: { signal?: AbortSignal; prefetch?: boolean } = {},
) =>
  request<PlayInfo>('/api/v1/music/play', {
    auth: true,
    query: { source, id, quality, prefetch: options.prefetch || undefined },
    signal: options.signal,
  })

export const musicLyric = (source: MusicSourceId, id: string, signal?: AbortSignal) =>
  musicRead<LyricView>('/api/v1/music/lyric', { auth: true, query: { source, id }, signal })

export const musicToplist = (source: MusicSourceId) =>
  musicRead<ToplistListView>('/api/v1/music/toplist', {
    auth: true,
    query: { source },
  })

export const musicToplistDetail = (
  source: MusicSourceId,
  id: string,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
) =>
  musicRead<ToplistDetailView>('/api/v1/music/toplist/detail', {
    auth: true,
    query: { source, id, page, pageSize },
  })

export const musicPlaylist = (
  source: MusicPlaylistSourceId,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  category?: string,
  order?: string,
) =>
  musicRead<PlaylistListView>('/api/v1/music/playlist', {
    auth: true,
    query: { source, page, pageSize, category, order },
  })

export const musicPlaylistDetail = (
  source: MusicSourceId,
  id: string,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
) =>
  musicRead<PlaylistDetailView>('/api/v1/music/playlist/detail', {
    auth: true,
    query: { source, id, page, pageSize },
  })

export const musicAlbumDetail = (
  source: MusicSourceId,
  id: string,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
) =>
  musicRead<AlbumDetailView>('/api/v1/music/album/detail', {
    auth: true,
    query: { source, id, page, pageSize },
  })

/** 歌手简要资料；后端 @RequestParam List<String> ids 接受重复 query 键。 */
export const musicArtistDetail = (source: MusicSourceId, ids: string[]) =>
  musicRead<ArtistDetailView[]>('/api/v1/music/artist', {
    auth: true,
    query: { source, ids },
  })

/** 歌手作品：song 返回歌曲，album 返回专辑（黑源两者均已支持）。 */
export const musicArtistWorks = (
  source: MusicSourceId,
  id: string,
  type: 'song' | 'album' = 'song',
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
) =>
  musicRead<ArtistWorksView>('/api/v1/music/artist/works', {
    auth: true,
    query: { source, id, type, page, pageSize },
  })

export const musicNewSongs = (
  source: MusicSourceId,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
) =>
  musicRead<ToplistDetailView>('/api/v1/music/new', {
    auth: true,
    query: { source, page, pageSize },
  })

export interface MusicFavoritePayload {
  source: MusicSourceId
  songId: string
  name: string
  artist?: string
  album?: string
  coverUrl?: string
  durationSec?: number
}

export const getMusicHistory = (page = 0, size = DEFAULT_PAGE_SIZE) =>
  request<PageView<MusicHistoryItem>>('/api/user/music/history', {
    auth: true,
    query: { page, size },
  })

export const deleteMusicHistory = (id: number) =>
  request<void>(`/api/user/music/history/${id}`, {
    method: 'DELETE',
    auth: true,
  })

export const getMusicFavorites = (page = 0, size = DEFAULT_PAGE_SIZE) =>
  request<PageView<MusicFavoriteItem>>('/api/user/music/favorites', {
    auth: true,
    query: { page, size },
  })

export const saveMusicFavorite = (body: MusicFavoritePayload) =>
  request<MusicFavoriteItem>('/api/user/music/favorites', {
    method: 'POST',
    auth: true,
    body,
  })

export const deleteMusicFavorite = (source: MusicSourceId, songId: string) =>
  request<void>('/api/user/music/favorites', {
    method: 'DELETE',
    auth: true,
    query: { source, songId },
  })

export const getMusicFavoriteStatus = (source: MusicSourceId, songId: string) =>
  request<MusicFavoriteStatusView[]>('/api/user/music/favorites/status', {
    method: 'POST',
    auth: true,
    body: { source, songIds: [songId] },
  }).then((items) => items[0] ?? { source, songId, liked: false, favoriteId: null })

export const getMusicFavoriteStatuses = (source: MusicSourceId, songIds: string[]) =>
  request<MusicFavoriteStatusView[]>('/api/user/music/favorites/status', {
    method: 'POST',
    auth: true,
    body: { source, songIds },
  })

export const getPublicMusicShare = (token: string) =>
  request<MusicPublicShareView>(`/api/public/music/share/${encodeURIComponent(token)}`)

export const getImportedPlaylists = (page = 0, size = DEFAULT_PAGE_SIZE) =>
  request<PageView<ImportedPlaylist>>('/api/user/music/playlists', {
    auth: true,
    query: { page, size },
  })

export const getImportedPlaylistDetail = (id: number, page = 0, size = DEFAULT_PAGE_SIZE) =>
  request<PageView<ImportedPlaylistItem> & { playlist?: ImportedPlaylist }>(`/api/user/music/playlists/${id}`, {
    auth: true,
    query: { page, size },
  })

export const importPlaylist = (body: ImportPlaylistRequest) =>
  request<ImportedPlaylist>('/api/user/music/playlists/import', {
    method: 'POST',
    auth: true,
    body,
  })

export const getPlaylistFavoriteStatus = (source: MusicSourceId, playlistId: string) =>
  request<PlaylistFavoriteStatusView>('/api/user/music/playlist-favorites/status', {
    auth: true,
    query: { source, playlistId },
  })

export const savePlaylistFavorite = (source: MusicSourceId, playlistId: string) =>
  request<ImportedPlaylist>('/api/user/music/playlist-favorites', {
    method: 'POST',
    auth: true,
    body: { source, playlistId },
  })

export const deletePlaylistFavorite = (source: MusicSourceId, playlistId: string) =>
  request<void>('/api/user/music/playlist-favorites', {
    method: 'DELETE',
    auth: true,
    query: { source, playlistId },
  })

export const updateImportedPlaylist = (id: number, body: UpdatePlaylistRequest) =>
  request<ImportedPlaylist>(`/api/user/music/playlists/${id}`, {
    method: 'PATCH',
    auth: true,
    body,
  })

export const deleteImportedPlaylist = (id: number) =>
  request<void>(`/api/user/music/playlists/${id}`, {
    method: 'DELETE',
    auth: true,
  })

export const removePlaylistItem = (playlistId: number, itemId: number) =>
  request<void>(`/api/user/music/playlists/${playlistId}/items/${itemId}`, {
    method: 'DELETE',
    auth: true,
  })

export const qishuiSearchSuggestions = (keyword: string, signal?: AbortSignal) =>
  musicRead<string[]>('/api/v1/music/qishui/search/suggestions', { auth: true, query: { keyword }, signal })

export const musicTtml = (source: MusicSourceId, id: string, signal?: AbortSignal) =>
  musicRead<{available: boolean; content: string | null; provider: string | null}>('/api/v1/music/lyrics/ttml', { auth: true, query: { source, id }, signal })

export const qishuiSongInfo = (id: string, signal?: AbortSignal) =>
  musicRead<import('../types').SongSearchItem>('/api/v1/music/qishui/song', { auth:true, query:{id}, signal })
export const qishuiDiscovery = (signal?: AbortSignal, refresh = false) =>
  musicRead<{source:MusicSourceId;list:import('../types').SongSearchItem[]}>('/api/v1/music/qishui/discovery', {auth:true,signal}, 45_000, refresh)
export const qishuiRoamingModes = (signal?: AbortSignal) =>
  request<import('../types').QishuiFeedMode[]>('/api/v1/music/qishui/roaming/modes',{auth:true,signal})
export const startQishuiRoaming = (modeId?: string, signal?: AbortSignal) =>
  request<import('../types').QishuiRoamingPage>('/api/v1/music/qishui/roaming/sessions',{method:'POST',auth:true,query:{modeId},signal})
export const nextQishuiRoaming = (sessionId:string,sequence:number,signal?:AbortSignal) =>
  request<import('../types').QishuiRoamingPage>(`/api/v1/music/qishui/roaming/sessions/${encodeURIComponent(sessionId)}/next`,{method:'POST',auth:true,query:{sequence},signal})
export const closeQishuiRoaming = (sessionId:string) =>
  request<void>(`/api/v1/music/qishui/roaming/sessions/${encodeURIComponent(sessionId)}`,{method:'DELETE',auth:true})
