import { request } from './client'
import type {
  LyricView,
  MusicFavoriteItem,
  MusicFavoriteStatusView,
  MusicQuality,
  MusicHistoryItem,
  MusicPlaylistSourceId,
  MusicSourceId,
  PageView,
  PlaylistDetailView,
  PlaylistListView,
  PlayInfo,
  SearchResultView,
  ToplistDetailView,
  ToplistListView,
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
  request<MusicFavoriteStatusView>('/api/user/music/favorites/status', {
    auth: true,
    query: { source, songId },
  })
