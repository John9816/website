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
  role?: string
}

export interface CurrentUserView {
  id: number
  username: string
  role: 'ADMIN' | 'USER'
  canManageSystemConfig: boolean
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

export type AiModelCapability =
  | 'text_chat'
  | 'audio_input'
  | 'audio_output'
  | 'voice_customization'

export interface AiModelView {
  model: string
  defaultModel: boolean
  capabilities: AiModelCapability[]
}

export interface AiVoiceView {
  id: string
  label: string
}

export interface AiConversationView {
  id: number
  title: string
  model: string
  lastMessagePreview: string | null
  lastMessageAt: string
  createdAt: string
  updatedAt: string
}

export interface AiChatMessageView {
  id: number
  role: 'user' | 'assistant' | 'system'
  content: string
  model: string | null
  audioAvailable: boolean
  audioMimeType: string | null
  audioModel: string | null
  audioUrl: string | null
  finishReason: string | null
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
  createdAt: string
}

export interface AiConversationCreateRequest {
  title?: string
  model?: string
}

export interface AiConversationSendRequest {
  content?: string
  model?: string
  responseAudio?: boolean
  ttsModel?: string
  ttsFormat?: string
  ttsVoice?: string
  ttsPrompt?: string
  inputAudioData?: string
}

export interface AiConversationReplyView {
  conversation: AiConversationView
  userMessage: AiChatMessageView
  assistantMessage: AiChatMessageView
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

export interface MusicHistoryItem {
  id: number
  source: MusicSourceId
  songId: string
  name: string
  artist?: string | null
  album?: string | null
  coverUrl?: string | null
  durationSec?: number | null
  playedAt?: string
  createdAt?: string
}

export interface MusicFavoriteItem {
  id: number
  source: MusicSourceId
  songId: string
  name: string
  artist?: string | null
  album?: string | null
  coverUrl?: string | null
  durationSec?: number | null
  likedAt?: string
}

export interface MusicFavoriteStatusView {
  liked: boolean
  favoriteId?: number | null
}

export type KbDocStatus = 'draft' | 'published'

export interface KbSpace {
  id: number
  name: string
  description?: string | null
  icon?: string | null
  sortOrder: number
  docCount: number
  createdAt?: string
  updatedAt?: string
}

export interface KbDocTreeNode {
  id: number
  parentId?: number | null
  title: string
  status: KbDocStatus
  sortOrder: number
  children: KbDocTreeNode[]
}

export interface KbTag {
  id: number
  name: string
  color?: string | null
  createdAt?: string
}

export interface KbDocShare {
  docId: number
  token: string
  enabled: boolean
  expiresAt?: string | null
  viewCount: number
  createdAt?: string
  updatedAt?: string
}

export interface KbDocSummary {
  id: number
  spaceId: number
  parentId?: number | null
  title: string
  summary?: string | null
  status: KbDocStatus
  sortOrder: number
  versionNo: number
  createdAt?: string
  updatedAt?: string
}

export interface KbDoc {
  id: number
  spaceId: number
  parentId?: number | null
  title: string
  summary?: string | null
  contentJson?: string | null
  contentHtml?: string | null
  status: KbDocStatus
  sortOrder: number
  versionNo: number
  tags: KbTag[]
  share?: KbDocShare | null
  createdAt?: string
  updatedAt?: string
}

export interface KbDocVersion {
  id: number
  docId: number
  versionNo: number
  title: string
  summary?: string | null
  editorUserId: number
  changeNote?: string | null
  createdAt?: string
}

export interface KbDocVersionDetail {
  id: number
  docId: number
  versionNo: number
  title: string
  summary?: string | null
  contentJson?: string | null
  contentHtml?: string | null
  editorUserId: number
  changeNote?: string | null
  createdAt?: string
}

export interface KbPublicDoc {
  id: number
  token: string
  title: string
  summary?: string | null
  contentJson?: string | null
  contentHtml?: string | null
  updatedAt?: string
  documents: KbPublicDocItem[]
}

export interface KbPublicDocItem {
  id: number
  token: string
  parentId?: number | null
  title: string
  summary?: string | null
  sortOrder?: number
  updatedAt?: string
}
