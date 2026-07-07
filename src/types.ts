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

export interface ContentStatusConfig {
  key: string
  label: string
  ready: boolean
}

export interface ContentFactoryStatus {
  aiReady: boolean
  imageReady: boolean
  wechatReady: boolean
  configs: ContentStatusConfig[]
}

export interface ContentHotSource {
  id: string
  name: string
}

export interface ContentHotTopic {
  id: string
  source: string
  sourceName: string
  rank: number
  title: string
  url?: string | null
  hot?: string | null
  summary?: string | null
  capturedAt: string
}

export interface ContentHotTopicsView {
  capturedAt: string
  sources: ContentHotSource[]
  items: ContentHotTopic[]
}

export type ContentArticleStatus = 'DRAFT' | 'WECHAT_DRAFT' | 'PUBLISHED'
export type ContentArticleLength = 'short' | 'standard' | 'long'
export type ContentArticleCategory = string
export type ContentArticleLayoutTheme = 'clean' | 'warm' | 'magazine'
export type ContentArticleImageMode = 'generate' | 'fetch' | 'none'
export type ContentArticleResearchDepth = 'quick' | 'standard' | 'deep'
export type ContentAutomationStage = 'topic' | 'research' | 'generate' | 'review' | 'wechat_draft' | 'publish'
export type ContentAutomationStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED'

export interface ContentAutomationLog {
  id: string
  stage: ContentAutomationStage
  status: ContentAutomationStatus
  message: string
  detail?: string | null
  createdAt: string
}

export interface ContentAutomationJob {
  id: string
  stage: ContentAutomationStage
  status: ContentAutomationStatus
  attempts: number
  maxAttempts: number
  nextRunAt?: string | null
  errorMessage?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface ContentWechatPublishRecord {
  id: string
  action: 'draft' | 'publish'
  status: ContentAutomationStatus
  mediaId?: string | null
  publishId?: string | null
  url?: string | null
  errorMessage?: string | null
  createdAt: string
}

export interface ContentAutomationView {
  currentStage?: ContentAutomationStage | null
  logs: ContentAutomationLog[]
  jobs: ContentAutomationJob[]
  publishRecords: ContentWechatPublishRecord[]
}

export interface ContentArticle {
  id: number
  title: string
  digest?: string | null
  contentMarkdown?: string | null
  contentHtml: string
  coverPrompt?: string | null
  coverImageUrl?: string | null
  topics: ContentHotTopic[]
  tags: string[]
  riskTips: string[]
  model?: string | null
  category?: ContentArticleCategory | null
  layoutTheme?: ContentArticleLayoutTheme | null
  imageMode?: ContentArticleImageMode | null
  automation?: ContentAutomationView | Record<string, unknown> | null
  status: ContentArticleStatus
  wechatMediaId?: string | null
  wechatPublishId?: string | null
  wechatUrl?: string | null
  errorMessage?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface ContentArticleGeneratePayload {
  topics?: ContentHotTopic[]
  topic?: string
  category?: ContentArticleCategory
  layoutTheme?: ContentArticleLayoutTheme
  imageMode?: ContentArticleImageMode
  researchEnabled?: boolean
  researchDepth?: ContentArticleResearchDepth
  searchQueries?: string[]
  autoWechatDraft?: boolean
  autoPublish?: boolean
  angle?: string
  audience?: string
  tone?: string
  length?: ContentArticleLength
  generateCover?: boolean
  coverStyle?: string
  model?: string
}

export interface ContentWechatDraftResult {
  mediaId: string
  url?: string | null
  mode?: 'wechat' | 'local'
}

export interface LoginResponse {
  token: string
  tokenType: string
  expiresInMinutes: number
  username: string
  role?: string
}

export interface UserCreditView {
  credits: number
  imageCreditCost: number
  dailyCheckInReward: number
  checkedInToday: boolean
  lastCheckInDate?: string | null
}

export interface CurrentUserView {
  id: number
  username: string
  role: 'ADMIN' | 'USER'
  canManageSystemConfig: boolean
  credits?: number
  imageCreditCost?: number
  dailyCheckInReward?: number
  checkedInToday?: boolean
  lastCheckInDate?: string | null
}

export interface ImageGenerateDataItem {
  url: string | null
  b64Json?: string | null
  revisedPrompt?: string | null
}

export interface ImageGenerateResult {
  created: number
  model: string
  data: ImageGenerateDataItem[]
  usage?: Record<string, unknown> | null
}

export type ImageTaskStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'

export interface ImageTaskView {
  id: number
  prompt: string
  size?: string | null
  n: number
  model: string
  status: ImageTaskStatus
  errorMessage?: string | null
  result?: ImageGenerateResult | null
  createdAt?: string
  updatedAt?: string
  completedAt?: string | null
}

export interface PageView<T> {
  items: T[]
  total: number
  page: number
  size: number
}

export interface GeneratedImageView {
  id: number
  taskId?: number | null
  type?: string | null
  status?: ImageTaskStatus | null
  prompt: string
  imageUrl: string | null
  imageData?: string | null
  model: string
  size?: string | null
  isShared: boolean
  errorMessage?: string | null
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
export type MusicSearchType = 'song' | 'album' | 'artist' | 'playlist'

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
  type?: MusicSearchType
  keyword: string
  page: number
  pageSize: number
  total?: number | null
  list: SongSearchItem[]
  songs?: SongSearchItem[]
  artists?: SearchCollectionItem[]
  albums?: SearchCollectionItem[]
  playlists?: SearchCollectionItem[]
}

export interface SearchCollectionItem {
  id: string
  source: MusicSourceId
  type: MusicSearchType
  name: string
  artist?: string
  creatorName?: string
  coverUrl?: string
  trackCount?: number
  playCount?: number
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

export interface AlbumDetailView {
  id: string
  source: MusicSourceId
  name?: string
  coverUrl?: string
  description?: string
  artist?: string
  publishTime?: string
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
  source: MusicSourceId
  songId: string
  liked: boolean
  favoriteId?: number | null
}

export interface MusicPublicShareView {
  token: string
  source: MusicSourceId
  songId: string
  name: string
  artist?: string | null
  album?: string | null
  coverUrl?: string | null
  durationSec?: number | null
  requestedQuality: MusicQuality
  expiresAt?: string | null
  viewCount: number
  playable: boolean
  playError?: string | null
  playInfo?: PlayInfo | null
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

export interface ImportedPlaylist {
  id: number
  source: MusicSourceId
  externalId: string
  name: string
  description?: string | null
  coverUrl?: string | null
  creatorName?: string | null
  trackCount?: number
  playCount?: number
  sourceUrl?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface ImportedPlaylistItem {
  id: number
  playlistId: number
  source: MusicSourceId
  songId: string
  name: string
  artist?: string | null
  album?: string | null
  coverUrl?: string | null
  durationSec?: number | null
  sortOrder: number
  createdAt?: string
}

export interface ImportedPlaylistDetailView {
  playlist: ImportedPlaylist
  items: ImportedPlaylistItem[]
  total: number
  page: number
  size: number
}

export interface ImportPlaylistRequest {
  url: string
  name?: string
}

export interface UpdatePlaylistRequest {
  name?: string
}
