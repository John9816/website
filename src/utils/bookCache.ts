// Offline cache for reading chapters, backed by IndexedDB.
//
// Reading API requires auth and chapters live on third-party sites that can go
// down or geo-block. This store keeps chapter text + book metadata on disk so a
// cached chapter opens instantly and stays readable offline. Design mirrors
// richAudioStore: per-entry TTL, total byte cap with LRU eviction, fail-soft on
// private browsing / quota errors, and per-session key isolation (no cross-user
// leakage when accounts switch on the same device).

import { getAuthSessionId } from '../api/client'
import type { BookContent, BookChapterList, BookView } from '../api/reading'

const DB_NAME = 'nav-book-offline'
const DB_VERSION = 1
const STORE = 'chapters'
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024 // 64 MB of text
const KEY_TTL = 'nav.book.offline.ttl'
const KEY_LIMIT = 'nav.book.offline.limit'

export interface CachedChapter {
  key: string
  session: string
  payload: {
    content: BookContent
    book?: BookView
    chapters?: BookChapterList
  }
  size: number
  savedAt: number
  expiresAt: number
  lastAccessedAt: number
}

function sessionId() {
  return getAuthSessionId() || 'guest'
}

function readConfigNumber(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback
  const raw = Number(window.localStorage.getItem(key))
  return Number.isFinite(raw) && raw > 0 ? raw : fallback
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'key' })
        store.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false })
        store.createIndex('session', 'session', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

function reqResult<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Cache key is session-scoped so switching accounts never serves another user's data. */
export function chapterCacheKey(sourceId: string | undefined, bookUrl: string, chapterUrl: string) {
  return `${sessionId()}|${sourceId || 'default'}::${bookUrl}::${chapterUrl}`
}

export function bookCacheKey(sourceId: string | undefined, bookUrl: string) {
  return `${sessionId()}|${sourceId || 'default'}::${bookUrl}`
}

function evictIfNeeded(store: IDBObjectStore) {
  const limit = readConfigNumber(KEY_LIMIT, DEFAULT_MAX_BYTES)
  const entries: CachedChapter[] = []
  const cursorReq = store.index('lastAccessedAt').openCursor()
  cursorReq.onsuccess = () => {
    const cursor = cursorReq.result
    if (cursor) {
      entries.push(cursor.value as CachedChapter)
      cursor.continue()
    } else {
      let total = entries.reduce((sum, e) => sum + e.size, 0)
      if (total <= limit) return
      entries.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt)
      for (const e of entries) {
        if (total <= limit) break
        store.delete(e.key)
        total -= e.size
      }
    }
  }
}

/** Read a cached chapter, refreshing LRU and rejecting expired entries. */
export async function readChapter(key: string): Promise<CachedChapter['payload'] | null> {
  try {
    const db = await openDb()
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const entry = await reqResult(store.get(key) as IDBRequest<CachedChapter | undefined>)
    if (!entry || entry.session !== sessionId()) {
      db.close()
      return null
    }
    if (Date.now() > entry.expiresAt) {
      store.delete(key)
      void txDone(tx).catch(() => {})
      db.close()
      return null
    }
    entry.lastAccessedAt = Date.now()
    store.put(entry)
    void txDone(tx).catch(() => {})
    db.close()
    return entry.payload
  } catch {
    return null
  }
}

/** Persist a chapter (optionally with book + toc metadata) to the offline cache. */
export async function writeChapter(
  key: string,
  payload: CachedChapter['payload'],
): Promise<boolean> {
  try {
    const db = await openDb()
    const ttl = readConfigNumber(KEY_TTL, DEFAULT_TTL_MS)
    const now = Date.now()
    const bytes = JSON.stringify(payload).length * 2
    const entry: CachedChapter = {
      key,
      session: sessionId(),
      payload,
      size: bytes,
      savedAt: now,
      expiresAt: now + ttl,
      lastAccessedAt: now,
    }
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    store.put(entry)
    evictIfNeeded(store)
    await txDone(tx)
    db.close()
    return true
  } catch {
    return false
  }
}

export async function removeChapter(key: string): Promise<void> {
  try {
    const db = await openDb()
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    await txDone(tx)
    db.close()
  } catch {
    /* ignore */
  }
}

/** Drop every cached chapter for the current signed-in session. */
export async function clearMyOfflineCache(): Promise<number> {
  try {
    const db = await openDb()
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const req = store.index('session').getAllKeys(sessionId())
    const keys = await reqResult(req)
    keys.forEach((k) => store.delete(k))
    await txDone(tx)
    db.close()
    return keys.length
  } catch {
    return 0
  }
}

/** Count cached chapters for the current session (for the settings badge). */
export async function countMyOfflineChapters(): Promise<number> {
  try {
    const db = await openDb()
    const tx = db.transaction(STORE, 'readonly')
    const keys = await reqResult(store_getAllKeys(tx, sessionId()))
    db.close()
    return keys.length
  } catch {
    return 0
  }
}

function store_getAllKeys(tx: IDBTransaction, session: string): IDBRequest<IDBValidKey[]> {
  return tx.objectStore(STORE).index('session').getAllKeys(session)
}
