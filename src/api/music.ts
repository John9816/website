import { request } from './client'
import type {
  LyricView,
  MusicQuality,
  MusicPlaylistSourceId,
  MusicSourceId,
  PlaylistDetailView,
  PlaylistListView,
  PlayInfo,
  SearchResultView,
  ToplistDetailView,
  ToplistListView,
} from '../types'

export const musicSearch = (
  source: MusicSourceId,
  keyword: string,
  page = 1,
  pageSize = 10,
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
  pageSize = 30,
) =>
  request<ToplistDetailView>('/api/v1/music/toplist/detail', {
    query: { source, id, page, pageSize },
  })

export const musicPlaylist = (
  source: MusicPlaylistSourceId,
  page = 1,
  pageSize = 20,
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
  pageSize = 30,
) =>
  request<PlaylistDetailView>('/api/v1/music/playlist/detail', {
    query: { source, id, page, pageSize },
  })

export const musicNewSongs = (
  source: MusicSourceId,
  page = 1,
  pageSize = 30,
) =>
  request<ToplistDetailView>('/api/v1/music/new', {
    query: { source, page, pageSize },
  })
