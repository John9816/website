import { request } from './client'
import type {
  LyricView,
  MusicFavoriteItem,
  MusicFavoriteStatusView,
  MusicPublicShareView,
  MusicQuality,
  MusicHistoryItem,
  MusicPlaylistSourceId,
  MusicShareView,
  MusicSourceId,
  PageView,
  PlaylistDetailView,
  PlaylistListView,
  PlayInfo,
  SearchResultView,
  ToplistDetailView,
  ToplistListView,
  ImportedPlaylist,
  ImportedPlaylistItem,
  ImportPlaylistRequest,
  UpdatePlaylistRequest,
} from '../types'
import { DEFAULT_PAGE_SIZE } from '../constants/pagination'

export const musicSearch = (
  source: MusicSourceId,
  keyword: string,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
) =>
  request<SearchResultView>('/api/v1/music/search', {
    query: { source, keyword, page, pageSize },
  })

export const musicPlay = (
  source: MusicSourceId,
  id: string,
  quality: MusicQuality = 'flac',
) =>
  request<PlayInfo>('/api/v1/music/play', {
    auth: true,
    query: { source, id, quality },
  })

export const musicLyric = (source: MusicSourceId, id: string) =>
  request<LyricView>('/api/v1/music/lyric', { query: { source, id } })

export const musicToplist = (source: MusicSourceId) =>
  request<ToplistListView>('/api/v1/music/toplist', {
    query: { source },
  })

export const musicToplistDetail = (
  source: MusicSourceId,
  id: string,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
) =>
  request<ToplistDetailView>('/api/v1/music/toplist/detail', {
    query: { source, id, page, pageSize },
  })

export const musicPlaylist = (
  source: MusicPlaylistSourceId,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  category?: string,
  order?: string,
) =>
  request<PlaylistListView>('/api/v1/music/playlist', {
    query: { source, page, pageSize, category, order },
  })

export const musicPlaylistDetail = (
  source: MusicSourceId,
  id: string,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
) =>
  request<PlaylistDetailView>('/api/v1/music/playlist/detail', {
    query: { source, id, page, pageSize },
  })

export const musicNewSongs = (
  source: MusicSourceId,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
) =>
  request<ToplistDetailView>('/api/v1/music/new', {
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

export interface MusicSharePayload extends MusicFavoritePayload {
  requestedQuality?: MusicQuality
  expiresAt?: string | null
  rotateToken?: boolean
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

export const getMusicShareStatus = (source: MusicSourceId, songId: string) =>
  request<MusicShareView | null>('/api/user/music/shares/status', {
    auth: true,
    query: { source, songId },
  })

export const saveMusicShare = (body: MusicSharePayload) =>
  request<MusicShareView>('/api/user/music/shares', {
    method: 'POST',
    auth: true,
    body,
  })

export const deleteMusicShare = (source: MusicSourceId, songId: string) =>
  request<void>('/api/user/music/shares', {
    method: 'DELETE',
    auth: true,
    query: { source, songId },
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
