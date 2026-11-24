import type { MusicSearchType, MusicSourceId } from '../../types'

export const MUSIC_SOURCE_OPTIONS: Array<{ label: string; value: MusicSourceId }> = [
  { label: 'QQ 音乐', value: 'qq' },
  { label: '网易云', value: 'netease' },
  { label: '酷我', value: 'kuwo' },
  { label: '汽水音乐', value: 'qishui' },
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
    // 黑源播放已改为服务端解密 + 本站音频流；这两个码现在只在服务异常时出现。
    if (detail?.code === 1012) return '黑源音频解码失败，请稍后重试。'
    if (detail?.code === 1003) return '黑源解析服务登录失败，请确认 TuneFree 账号配置后重试。'
  }
  return detail?.message || '播放失败，请稍后重试'
}

/** 已验证的黑源能力；个人音乐漫游需要扫码绑定。 */
export const QISHUI_CAPABILITIES = {
  supported: [
    '歌曲 / 歌单 / 歌手 / 专辑搜索',
    '歌词（LRC + YRC）',
    '搜索建议、歌单详情与分享链接导入',
    '专辑详情、歌手歌曲与歌手专辑',
  ],
  conditional: ['播放需要本站会员及服务端解析配置；个人音乐漫游需要扫码绑定'],
  discovery: ['榜单 / 推荐歌单 / 新歌：提供基于真实搜索的「搜索发现」'],
  unsupported: [],
} as const

/** 榜单 / 推荐 / 新歌视图的显式标注，避免把搜索结果误认为官方榜单。 */
export const QISHUI_DISCOVERY_NOTE =
  '此处为基于真实搜索的「搜索发现」。官方歌曲推荐和个人音乐漫游可在发现页使用。'

/** 搜索页展示的能力摘要。 */
export const QISHUI_CAPABILITY_HINT = '搜索无需扫码；个性推荐请前往音乐漫游。'
