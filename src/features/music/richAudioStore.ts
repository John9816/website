// Persistent cache for decrypted Qishui audio, backed by IndexedDB.
//
// In-memory Blob URLs (see qishuiRichClient) disappear on reload, so replaying a
// recent track always meant a fresh fetch + decrypt. This store keeps the
// plaintext bytes on disk, keyed by the same source:id:quality rich key. Because
// the plaintext does not depend on the signed (short-lived) directUrl, a cached
// entry stays valid across URL expiry until its own TTL lapses.
//
// Design (mirrors TuneFreeNext's AudioCacheCoordinator + cache limit/validity):
//   - TTL per entry (default 30 days) with an absolute expiry timestamp.
//   - Total byte cap with LRU eviction by lastAccessedAt.
//   - All operations fail soft: private browsing / quota errors never break playback.
//   - Only the bytes are stored; callers create the Blob URL in memory.

const DB_NAME = 'qishui-rich-audio'
const DB_VERSION = 1
const STORE = 'audio'
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000
const DEFAULT_MAX_BYTES = 256 * 1024 * 1024
const KEY_TTL = 'qishui-rich-audio.ttl'
const KEY_LIMIT = 'qishui-rich-audio.limit'

// localStorage keys are used for config so they can be tuned without a DB open.
function readConfigNumber(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback
  const raw = Number(window.localStorage.getItem(key))
  return Number.isFinite(raw) && raw > 0 ? raw : fallback
}

interface StoredAudio {
  key: string
  bytes: ArrayBuffer
  size: number
  savedAt: number
  expiresAt: number
  lastAccessedAt: number
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

/** Read cached plaintext bytes, refreshing LRU and rejecting expired entries. */
export async function readStoredAudio(key: string): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    const db = await openDb()
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const entry = await reqResult(store.get(key) as IDBRequest<StoredAudio | undefined>)
    if (!entry) {
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
    // Copy into a fresh ArrayBuffer-backed view: the stored buffer may be SharedArrayBuffer
    // typed, and Blob parts require a plain ArrayBuffer-backed Uint8Array.
    return new Uint8Array(entry.bytes.slice(0))
  } catch {
    return null
  }
}

/** Persist plaintext bytes with TTL, then enforce the total byte cap (LRU). */
export async function writeStoredAudio(key: string, bytes: Uint8Array): Promise<void> {
  try {
    const db = await openDb()
    const now = Date.now()
    const ttl = readConfigNumber(KEY_TTL, DEFAULT_TTL_MS)
    const maxBytes = readConfigNumber(KEY_LIMIT, DEFAULT_MAX_BYTES)
    const entry: StoredAudio = {
      key,
      // Copy into a standalone ArrayBuffer — the source may be a view into a larger buffer.
      bytes: bytes.slice().buffer,
      size: bytes.byteLength,
      savedAt: now,
      expiresAt: now + ttl,
      lastAccessedAt: now,
    }
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    store.put(entry)
    await txDone(tx)
    await enforceCap(db, maxBytes)
    db.close()
  } catch {
    // Storage is best-effort; playback must never depend on it.
  }
}

async function enforceCap(db: IDBDatabase, maxBytes: number): Promise<void> {
  try {
    const tx = db.transaction(STORE, 'readonly')
    const all = await reqResult((tx.objectStore(STORE).getAll() as IDBRequest<StoredAudio[]>))
    const total = all.reduce((sum, e) => sum + e.size, 0)
    if (total <= maxBytes) return
    const victims = all
      .slice()
      .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt)
    let overflow = total - maxBytes
    const toDelete: string[] = []
    for (const entry of victims) {
      if (overflow <= 0) break
      toDelete.push(entry.key)
      overflow -= entry.size
    }
    if (!toDelete.length) return
    const delTx = db.transaction(STORE, 'readwrite')
    const delStore = delTx.objectStore(STORE)
    for (const key of toDelete) delStore.delete(key)
    await txDone(delTx)
  } catch {
    // Ignore eviction failures.
  }
}

/** Remove one cached entry (e.g. on auth change). */
export async function deleteStoredAudio(key: string): Promise<void> {
  try {
    const db = await openDb()
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    await txDone(tx)
    db.close()
  } catch {
    // ignore
  }
}

/** Clear all cached audio (auth session change). */
export async function clearStoredAudio(): Promise<void> {
  try {
    const db = await openDb()
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).clear()
    await txDone(tx)
    db.close()
  } catch {
    // ignore
  }
}
