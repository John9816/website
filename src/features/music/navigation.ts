import {
  Compass,
  Heart,
  History,
  ListMusic,
  Radio,
  Search,
  Sparkles,
  Trophy,
} from 'lucide-react'
export const MUSIC_VIEWS = [
  { value: 'discover', label: '发现音乐', icon: Compass, group: '探索' },
  { value: 'roaming', label: '音乐漫游', icon: Radio, group: '探索' },
  { value: 'search', label: '搜索', icon: Search, group: '探索' },
  { value: 'toplist', label: '榜单', icon: Trophy, group: '探索' },
  { value: 'playlist', label: '歌单', icon: ListMusic, group: '探索' },
  { value: 'new', label: '新歌', icon: Sparkles, group: '探索' },
  { value: 'favorites', label: '喜欢', icon: Heart, group: '我的音乐' },
  {
    value: 'my-playlists',
    label: '我的歌单',
    icon: ListMusic,
    group: '我的音乐',
  },
  { value: 'history', label: '历史', icon: History, group: '我的音乐' },
] as const
export type MusicView = (typeof MUSIC_VIEWS)[number]['value']
export function isMusicView(value: string | null): value is MusicView {
  return MUSIC_VIEWS.some((item) => item.value === value)
}
