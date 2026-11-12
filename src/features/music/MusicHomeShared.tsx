import type { ReactNode } from 'react'
import { Heart } from 'lucide-react'
import MusicShareAction from '../../components/MusicShareAction'
import MusicQueueActions from '../../components/MusicQueueActions'
import { useMusicFavorites } from '../../hooks/useMusicFavorites'
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
