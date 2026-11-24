// Cross-source song matching for automatic source fallback.
//
// Modelled on TuneFreeNext 4.3.7's AutomaticSourceFallbackResolver
// (`_normalize` + `_matchScore` + `_bestCandidateOrNull`, confirmed from the
// decompiled libapp.so). When a track cannot be played from its original source,
// we search the same title+artist on the other catalogs and pick the candidate
// that best matches, then re-resolve a playable URL there — silently, so the
// user never sees an error for a track that is actually available elsewhere.

import type { MusicSourceId, SongSearchItem } from '../../types'
import { musicSearch } from '../../api/music'

/** Source order used only for fallback, never for primary playback. */
export const FALLBACK_SOURCES: MusicSourceId[] = ['netease', 'qq', 'kuwo', 'qishui']

/** Strip noise and normalise a title/artist string for comparison. */
export function normalizeSongText(value: string | null | undefined): string {
  let text = String(value || '').toLowerCase().trim()
  // Full-width to half-width, then drop whitespace/punctuation that commonly
  // differs between catalogs (Live / 现场 / 伴奏 would change meaning, so keep
  // CJK and latin words and only remove separators).
  text = text.replace(/[\uFF01-\uFF5E]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  )
  text = text.replace(/[（(][^）)]*(现场|live|伴奏|remix|dj|版)[^）)]*[）)]/gi, '')
  text = text.replace(/[\s\-_/\\·•.,，。!！?？:：;；'"“”‘’`~～()（）\[\]【】{}<>]/g, '')
  return text
}

function normalizeArtist(value: string | null | undefined): string {
  return normalizeSongText(value)
}

/** Levenshtein-based similarity in [0,1], with a length guard. */
function textSimilarity(a: string, b: string): number {
  if (!a && !b) return 1
  if (!a || !b) return 0
  if (a === b) return 1
  const max = Math.max(a.length, b.length)
  if (max > 80) return a.includes(b) || b.includes(a) ? 0.8 : 0
  // Two-row Levenshtein.
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  let curr = new Array<number>(b.length + 1)
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    const swap = prev
    prev = curr
    curr = swap
  }
  return Math.max(0, 1 - prev[b.length] / max)
}

export interface FallbackCandidate<T extends { name: string; artist?: string }> {
  song: T
  score: number
}

/**
 * Score a candidate against a source song by normalised title + artist.
 * Title carries most of the weight; a matching artist is a strong tie-breaker.
 * Candidates below a minimum score are rejected to avoid playing the wrong song.
 */
export function scoreCandidate<T extends { name: string; artist?: string }>(
  source: { name: string; artist?: string },
  candidate: T,
): number {
  const titleScore = textSimilarity(
    normalizeSongText(source.name),
    normalizeSongText(candidate.name),
  )
  const artistScore = textSimilarity(
    normalizeArtist(source.artist),
    normalizeArtist(candidate.artist),
  )
  // Require a reasonable title match; artist mostly breaks ties.
  if (titleScore < 0.55) return 0
  return titleScore * 0.72 + artistScore * 0.28
}

/** Pick the highest-scoring candidate, or null when none clears the threshold. */
export function bestCandidateOrNull<
  T extends { name: string; artist?: string; source?: MusicSourceId },
>(
  source: { name: string; artist?: string },
  candidates: T[],
  excludeSource?: MusicSourceId,
): T | null {
  let best: T | null = null
  let bestScore = 0
  for (const candidate of candidates) {
    if (excludeSource && candidate.source === excludeSource) continue
    const score = scoreCandidate(source, candidate)
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }
  return bestScore >= 0.62 ? best : null
}

/**
 * Search one fallback source for the same track and return the best match.
 * Search failures are swallowed so callers can try the next source.
 */
export async function findBestMatchOnSource(
  query: { name: string; artist?: string },
  source: MusicSourceId,
  signal?: AbortSignal,
): Promise<SongSearchItem | null> {
  const leadArtist = normalizeArtist(query.artist)
  const keyword = leadArtist ? `${query.name} ${query.artist}` : query.name
  let list: SongSearchItem[]
  try {
    const result = await musicSearch(source, keyword, 1, 8, 'song', signal)
    list = result.list || result.songs || []
  } catch {
    return null
  }
  if (signal?.aborted) return null
  return bestCandidateOrNull(query, list, source)
}
