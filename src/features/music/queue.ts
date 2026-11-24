import type { SongSearchItem } from '../../types'

export type QueueInsertPosition = 'next' | 'last'

/** Queue operations are pure so playback behavior can be regression-tested without a browser. */
export function insertIntoQueue(
  queue: SongSearchItem[],
  song: SongSearchItem,
  currentIndex: number,
  position: QueueInsertPosition,
) {
  const next = [...queue]
  const insertionIndex = position === 'next'
    ? Math.min(queue.length, Math.max(0, currentIndex + 1))
    : queue.length
  next.splice(insertionIndex, 0, song)
  return next
}

export function removeQueueIndex(
  queue: SongSearchItem[],
  index: number,
  currentIndex: number,
) {
  if (index < 0 || index >= queue.length || index === currentIndex) return queue
  return queue.filter((_item, itemIndex) => itemIndex !== index)
}

export function clearQueueKeepingCurrent(
  queue: SongSearchItem[],
  currentIndex: number,
) {
  const current = currentIndex >= 0 ? queue[currentIndex] : undefined
  return current ? [current] : []
}

export function moveQueueItemToNext(
  queue: SongSearchItem[],
  index: number,
  currentIndex: number,
) {
  if (index <= currentIndex + 1 || index >= queue.length) return queue
  const next = [...queue]
  const [song] = next.splice(index, 1)
  next.splice(Math.max(0, currentIndex + 1), 0, song)
  return next
}
