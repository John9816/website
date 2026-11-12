import type { MouseEvent } from 'react'
import { ArrowUpToLine, ListPlus } from 'lucide-react'
import { useMusicBrowse } from '../context/MusicPlayerContext'
import type { SongSearchItem } from '../types'

/** Shared track-level queue actions used by desktop tables, mobile rows and recommendation lists. */
export default function MusicQueueActions({ song }: { song: SongSearchItem }) {
  const { addToQueue } = useMusicBrowse()
  const add = (position: 'next' | 'last', event: MouseEvent) => {
    event.stopPropagation()
    addToQueue(song, position)
  }
  return (
    <span className="music-queue-actions">
      <button
        type="button"
        className="music-icon-action"
        onClick={(event) => add('next', event)}
        aria-label={`下一首播放：${song.name}`}
        title="下一首播放"
      >
        <ArrowUpToLine size={16} />
      </button>
      <button
        type="button"
        className="music-icon-action"
        onClick={(event) => add('last', event)}
        aria-label={`添加到队列：${song.name}`}
        title="添加到队列"
      >
        <ListPlus size={16} />
      </button>
    </span>
  )
}
