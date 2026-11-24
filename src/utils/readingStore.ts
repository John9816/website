/** 阅读器本地状态：阅读设置 + 阅读进度。按登录会话隔离，避免串号。 */

import { getAuthSessionId } from '../api/client'

export type ReadingTheme = 'paper' | 'sepia' | 'green' | 'night'
export type PageTurnMode = 'scroll' | 'tap'

export interface ReadingSettings {
  fontSize: number
  lineHeight: number
  pagePadding: number
  theme: ReadingTheme
  turnMode: PageTurnMode
}

export interface ReadingProgress {
  chapterUrl: string
  chapterTitle: string
  scrollRatio: number
  updatedAt: number
}

const SETTINGS_KEY = 'nav.reading.settings'
const PROGRESS_KEY = 'nav.reading.progress'

export const DEFAULT_SETTINGS: ReadingSettings = {
  fontSize: 19,
  lineHeight: 1.9,
  pagePadding: 20,
  theme: 'paper',
  turnMode: 'scroll',
}

function sessionSuffix() {
  const id = getAuthSessionId() || 'guest'
  return `:${id}`
}

export function loadSettings(): ReadingSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY + sessionSuffix())
    if (!raw) return { ...DEFAULT_SETTINGS }
    const saved = JSON.parse(raw) as Partial<ReadingSettings>
    return { ...DEFAULT_SETTINGS, ...saved }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: ReadingSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY + sessionSuffix(), JSON.stringify(settings))
  } catch {
    /* ignore quota / privacy mode */
  }
}

function progressMap(): Record<string, ReadingProgress> {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY + sessionSuffix())
    return raw ? (JSON.parse(raw) as Record<string, ReadingProgress>) : {}
  } catch {
    return {}
  }
}

/** key 用 bookUrl，跨书源同书可能因 URL 不同各自记进度，属预期。 */
export function bookKey(sourceId: string | undefined, bookUrl: string) {
  return `${sourceId || 'default'}::${bookUrl}`
}

export function loadProgress(key: string): ReadingProgress | null {
  return progressMap()[key] ?? null
}

export function saveProgress(key: string, progress: ReadingProgress) {
  try {
    const map = progressMap()
    map[key] = progress
    localStorage.setItem(PROGRESS_KEY + sessionSuffix(), JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

export function clearProgress(key: string) {
  try {
    const map = progressMap()
    delete map[key]
    localStorage.setItem(PROGRESS_KEY + sessionSuffix(), JSON.stringify(map))
  } catch {
    /* ignore */
  }
}
