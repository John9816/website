import type { MusicSearchType, MusicSourceId } from '../../types'

export const MUSIC_SOURCE_OPTIONS: Array<{ label: string; value: MusicSourceId }> = [
  { label: 'QQ 音乐', value: 'qq' },
  { label: '网易云', value: 'netease' },
  { label: '酷我', value: 'kuwo' },
  { label: '汽水音乐（黑源）', value: 'qishui' },
]

export const STANDARD_CATALOG_SOURCE_OPTIONS = MUSIC_SOURCE_OPTIONS.filter(s => s.value !== 'qishui')

export function isMusicSourceId(value: unknown): value is MusicSourceId {
  return MUSIC_SOURCE_OPTIONS.some(s => s.value === value)
}

export function sourceLabel(source: string) {
  return MUSIC_SOURCE_OPTIONS.find(s => s.value === source)?.label ?? source
}

export function supportedSearchTypes(_source: MusicSourceId): MusicSearchType[] {
  // 黑源现已支持歌曲、歌手、专辑、歌单四类搜索（歌手/专辑经上游实测可用）。
  return ['song', 'artist', 'album', 'playlist']
}

export function normalizeSearchType(source: MusicSourceId, type: MusicSearchType): MusicSearchType {
  return supportedSearchTypes(source).includes(type) ? type : 'song'
}

export function musicPlaybackError(source: MusicSourceId, error: unknown): string {
  const detail = error as { code?: number; message?: string }
  if (source === 'qishui') {
    if (detail?.code === 1012) return '这首歌曲使用加密音频，网页暂不支持播放。'
    if (detail?.code === 1003) return '黑源播放服务暂未就绪，搜索和收藏仍可使用。'
  }
  return detail?.message || '播放失败，请稍后重试'
}

/**
 * 黑源能力：专辑详情 /album/detail/、歌手专辑 /artist/albums/、
 * 歌手搜索 search_type=artist 均经上游真实请求验证；专辑搜索由真实歌曲结果聚合。
 * 车机版上游没有官方榜单 / 推荐 / 新歌端点（100+ 路径组合实测未命中），
 * 这三项改为基于真实 /search/ 的「搜索发现」，并明确标注，不伪装成官方榜单。
 */
export const QISHUI_CAPABILITIES = {
  supported: [
    '歌曲 / 歌单 / 歌手 / 专辑搜索',
    '歌词（LRC + YRC）',
    '歌单详情与按 ID 导入',
    '专辑详情、歌手歌曲与歌手专辑',
  ],
  conditional: ['播放解析：需配置 QISHUI_PARSE_ACCESS_TOKEN 且为本站会员，加密音频不支持'],
  discovery: ['榜单 / 推荐歌单 / 新歌：提供基于真实搜索的「搜索发现」'],
  unsupported: [],
} as const

/** 榜单 / 推荐 / 新歌视图的显式标注，避免把搜索结果误认为官方榜单。 */
export const QISHUI_DISCOVERY_NOTE =
  '提示：汽水音乐车机版上游没有官方榜单 / 推荐 / 新歌接口，此处为基于真实搜索的「搜索发现」，不是官方榜单。'

/** 搜索页展示的能力摘要。 */
export const QISHUI_CAPABILITY_HINT =
  `可用：${QISHUI_CAPABILITIES.supported.join('、')}；` +
  `${QISHUI_CAPABILITIES.discovery.join('；')}。` +
  `播放需单独配置解析凭据；曲库搜索无需扫码授权。`
