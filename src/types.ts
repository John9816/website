export interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
}

export interface Category {
  id: number
  name: string
  icon?: string | null
  sortOrder: number
  createdAt?: string
  updatedAt?: string
}

export interface NavLink {
  id: number
  categoryId: number
  name: string
  url: string
  description?: string | null
  icon?: string | null
  sortOrder: number
  createdAt?: string
  updatedAt?: string
}

export interface CategoryWithLinks extends Category {
  links: NavLink[]
}

export interface SysConfig {
  id: number
  configKey: string
  configValue: string
  description?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface LoginResponse {
  token: string
  tokenType: string
  expiresInMinutes: number
  username: string
}

export interface ImageGenerateResult {
  model: string
  imageUrl: string | null
  content: string | null
  raw?: unknown
}

export interface PageView<T> {
  items: T[]
  total: number
  page: number
  size: number
}

export interface GeneratedImageView {
  id: number
  prompt: string
  imageUrl: string
  model: string
  createdAt: string
}

export type MusicSourceId = 'qq' | 'netease' | 'kuwo'
export type MusicPlaylistSourceId = Extract<MusicSourceId, 'netease' | 'kuwo'>
export type MusicQuality = '128k' | '320k' | 'flac' | 'flac24bit'

export interface SongSearchItem {
  id: string
  source: MusicSourceId
  name: string
  artist: string
  album?: string
  albumId?: string
  coverUrl?: string
  durationMs?: number
  durationSec?: number
  availableQualities: MusicQuality[]
}

export interface SearchResultView {
  source: MusicSourceId
  keyword: string
  page: number
  pageSize: number
  list: SongSearchItem[]
}

export interface LyricInfo {
  lineLyrics: string | null
  karaokeLyrics: string | null
}

export interface PlayInfo {
  id: string
  source: MusicSourceId
  actualSource?: MusicSourceId
  name?: string
  artist?: string
  album?: string
  coverUrl?: string
  durationSec?: number
  playUrl: string
  requestedQuality: MusicQuality
  actualQuality?: MusicQuality
  fileSize?: number
  expireSec?: number
  fromCache?: boolean
  lyric?: LyricInfo
}

export interface LyricView {
  id: string
  source: MusicSourceId
  lineLyrics: string | null
  karaokeLyrics: string | null
}

export interface ToplistItem {
  id: string
  source: MusicSourceId
  name: string
  coverUrl?: string
  description?: string
  updateTime?: string
}

export interface ToplistListView {
  source: MusicSourceId
  list: ToplistItem[]
}

export interface ToplistDetailView {
  id: string
  source: MusicSourceId
  name?: string
  coverUrl?: string
  description?: string
  updateTime?: string
  page: number
  pageSize: number
  total: number | null
  list: SongSearchItem[]
}

export interface PlaylistItem {
  id: string
  source: MusicSourceId
  name: string
  coverUrl?: string
  description?: string
  creatorName?: string
  trackCount?: number
  playCount?: number
}

export interface PlaylistListView {
  source: MusicSourceId
  category?: string | null
  order?: string | null
  page: number
  pageSize: number
  total: number | null
  list: PlaylistItem[]
}

export interface PlaylistDetailView {
  id: string
  source: MusicSourceId
  name?: string
  coverUrl?: string
  description?: string
  creatorName?: string
  playCount?: number
  updateTime?: string
  page: number
  pageSize: number
  total: number | null
  list: SongSearchItem[]
}
