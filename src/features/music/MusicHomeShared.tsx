import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  BookOpen,
  CarFront,
  Dumbbell,
  Heart,
  MoonStar,
  Music2,
  Radio,
  Sparkles,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import MusicShareAction from '../../components/MusicShareAction'
import MusicQueueActions from '../../components/MusicQueueActions'
import { useMusicFavorites } from '../../hooks/useMusicFavorites'
import { coverUrlForSize, normalizeCoverUrl } from '../../utils/musicPlayer'
import type { SongSearchItem } from '../../types'

/** 两个功能页共用的「喜欢 / 分享」行内操作，保持与现有列表一致。 */
export function useSongActions(songs: SongSearchItem[]) {
  const favorites = useMusicFavorites(songs)
  const renderActions = (song: SongSearchItem): ReactNode => (
    <>
      <button
        type="button"
        className={`music-icon-action${favorites.isFavorite(song) ? ' is-active' : ''}`}
        disabled={favorites.isFavoriteLoading(song)}
        aria-label={favorites.isFavorite(song) ? '取消喜欢' : '加入喜欢'}
        onClick={(event) => {
          event.stopPropagation()
          void favorites.toggleFavorite(song)
        }}
      >
        <Heart
          size={16}
          fill={favorites.isFavorite(song) ? 'currentColor' : 'none'}
        />
      </button>
      <MusicQueueActions song={song} />
      <MusicShareAction song={song} />
    </>
  )
  return { favorites, renderActions }
}

/** 稳定的「今日」标识：日期 + 星期，不做随机期次编号，避免编造数据。 */
export function dailyMeta(now = new Date()) {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  return {
    dateLabel: `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`,
    weekday: weekdays[now.getDay()],
    shortDate: `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`,
  }
}

export function songKey(song: Pick<SongSearchItem, 'source' | 'id'>) {
  return `${song.source}:${song.id}`
}

export function formatClock(ms?: number, sec?: number) {
  const total = typeof ms === 'number' ? Math.round(ms / 1000) : sec
  if (!total || !Number.isFinite(total) || total <= 0) return '--:--'
  const m = Math.floor(total / 60)
  const s = Math.floor(total % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** 推荐理由：优先用 AI 生成的理由，按「歌名+歌手」匹配；无理由时不编造。 */
export function matchReason(
  song: { name?: string | null; artist?: string | null },
  reasons: Array<{ song: SongSearchItem; reason: string }>,
) {
  const name = (song.name ?? '').trim().toLowerCase()
  const artist = (song.artist ?? '').trim().toLowerCase()
  const hit = reasons.find((item) => {
    const n = item.song.name.trim().toLowerCase()
    const a = item.song.artist.trim().toLowerCase()
    return n === name && (a === artist || !artist || !a)
  })
  return hit?.reason?.trim() || ''
}

/* ==========================================================================
 * Aurora Live · 共享层
 * 最近搜索沿用既有 localStorage key（music-recent-searches-v1），与
 * MusicExplorer / 搜索浮层共用同一份数据，避免各写一套。
 * ========================================================================== */

export const RECENT_SEARCHES_KEY = 'music-recent-searches-v1'
export const HOT_SEARCHES = ['周杰伦', '陈奕迅', '轻音乐', '城市夜景', '独立摇滚', '治愈钢琴']

export function readRecentSearches(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]')
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string').slice(0, 8)
      : []
  } catch {
    return []
  }
}

/** 写入一条最近搜索并返回最新列表（写库失败时仍返回内存结果）。 */
export function pushRecentSearch(keyword: string): string[] {
  const trimmed = keyword.trim()
  if (!trimmed) return readRecentSearches()
  const next = [trimmed, ...readRecentSearches().filter((item) => item !== trimmed)].slice(0, 8)
  try { localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next)) } catch { /* storage is optional */ }
  return next
}

export function clearRecentSearchesStorage(): void {
  try { localStorage.removeItem(RECENT_SEARCHES_KEY) } catch { /* storage is optional */ }
}

/* ---------- 极光色板 / tone ---------- */
export type AuroraTone = 'coral' | 'violet' | 'blue' | 'green' | 'amber' | 'pink'
const AURORA_TONES: AuroraTone[] = ['coral', 'violet', 'blue', 'green', 'amber', 'pink']

export function toneForSeed(seed: string): AuroraTone {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return AURORA_TONES[hash % AURORA_TONES.length]
}

/** 主页「场景频道」：内置 lucide 图标 + 极光渐变，链接到站内真实视图，不编造内容。 */
export type AuroraScene = {
  id: string
  name: string
  desc: string
  Icon: LucideIcon
  tone: AuroraTone
  view: string
  glyph: 'wave' | 'orb' | 'beam' | 'ring' | 'bloom' | 'ripple'
}

export const AURORA_SCENES: AuroraScene[] = [
  { id: 'night', name: '深夜电台', desc: '安静的夜里，留一盏灯给旋律', Icon: MoonStar, tone: 'violet', view: 'roaming', glyph: 'orb' },
  { id: 'commute', name: '通勤路上', desc: '把拥挤的路途交给节拍', Icon: CarFront, tone: 'blue', view: 'roaming', glyph: 'wave' },
  { id: 'focus', name: '专注时刻', desc: '低干扰的旋律，陪你进入心流', Icon: BookOpen, tone: 'green', view: 'roaming', glyph: 'beam' },
  { id: 'workout', name: '运动燃点', desc: '提速心跳，把步频交给鼓点', Icon: Dumbbell, tone: 'coral', view: 'roaming', glyph: 'ring' },
  { id: 'chart', name: '热门榜单', desc: '大家都在听的此刻流行', Icon: Trophy, tone: 'amber', view: 'toplist', glyph: 'bloom' },
  { id: 'fresh', name: '新歌速递', desc: '刚上架的声音，先听为快', Icon: Sparkles, tone: 'pink', view: 'new', glyph: 'ripple' },
]

/**
 * 封面：底层永远是「极光渐变 + 音符」兜底，远程图只作为增强层覆盖。
 * 加载失败 / 返回 0 宽时把 img 卸载（setFailed），露出底层，绝不裸 img 破图。
 */
export function AuroraCover({
  src,
  seed,
  size,
  rounded = 12,
  className = '',
  loading = 'lazy',
}: {
  src?: string | null
  seed: string
  size: number
  rounded?: number
  className?: string
  loading?: 'lazy' | 'eager'
}) {
  const tone = useMemo(() => toneForSeed(seed), [seed])
  const url = useMemo(
    () => coverUrlForSize(src ?? undefined, size) ?? normalizeCoverUrl(src ?? undefined),
    [src, size],
  )
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [url])

  return (
    <span
      className={`aurora-cover aurora-tone--${tone} ${className}`.trim()}
      style={{ width: size, height: size, borderRadius: rounded }}
      aria-hidden="true"
    >
      <Music2 size={Math.round(size * 0.38)} strokeWidth={1.6} className="aurora-cover__fallback" />
      {url && !failed && (
        <img
          className="aurora-cover__remote"
          src={url}
          alt=""
          loading={loading}
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={(event) => { if (!event.currentTarget.naturalWidth) setFailed(true) }}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  )
}

/**
 * 场景图形：lucide 图标 + 极光渐变常驻；可选 iconUrl 仅作增强，失败即卸载。
 * 漫游调频控件用它渲染真实 QishuiFeedMode 的 iconUrl，保证不破图。
 */
export function AuroraSceneArt({
  Icon = Radio,
  iconUrl,
  tone,
  seed = 'scene',
  size = 40,
}: {
  Icon?: LucideIcon
  iconUrl?: string | null
  tone: AuroraTone
  seed?: string
  size?: number
}) {
  const url = useMemo(() => normalizeCoverUrl(iconUrl ?? undefined), [iconUrl])
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [url])

  return (
    <span className={`aurora-scene-art aurora-tone--${tone}`} style={{ width: size, height: size }} data-seed={seed} aria-hidden="true">
      <Icon size={Math.round(size * 0.5)} strokeWidth={1.8} className="aurora-scene-art__icon" />
      {url && !failed && (
        <img
          className="aurora-scene-art__remote"
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={(event) => { if (!event.currentTarget.naturalWidth) setFailed(true) }}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  )
}
