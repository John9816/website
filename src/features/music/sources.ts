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

export function supportedSearchTypes(source: MusicSourceId): MusicSearchType[] {
  return source === 'qishui' ? ['song', 'playlist'] : ['song', 'artist', 'album', 'playlist']
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
