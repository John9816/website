import { useMemo } from 'react'
import { parseLrc, type LrcLine } from '../utils/musicPlayer'

export type UseActiveLyricResult = {
  lines: LrcLine[]
  activeIndex: number
}

export function useActiveLyric(
  rawLyric: string | null | undefined,
  currentTime: number,
): UseActiveLyricResult {
  const lines = useMemo(() => parseLrc(rawLyric), [rawLyric])

  const activeIndex = useMemo(() => {
    if (!lines.length) return -1

    let lo = 0
    let hi = lines.length - 1
    let ans = -1

    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (lines[mid].time <= currentTime) {
        ans = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }

    return ans
  }, [lines, currentTime])

  return { lines, activeIndex }
}
