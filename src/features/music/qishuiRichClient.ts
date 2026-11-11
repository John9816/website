// Browser-side CENC (ISO/IEC 23001-7, AES-CTR) decryptor + rich-client loader.
//
// Faithful port of com.example.website.module.music.application.QishuiCencDecryptor.
// When the backend returns a Qishui track with `directUrl` + `playAuth`, the browser
// fetches the still-encrypted MP4 straight from the upstream CDN and decrypts it here,
// so the audio bytes never traverse our ECS egress. The decrypted bytes are served to
// <audio> via a Blob URL. Any failure falls back to the local stream URL.

type Bytes = Uint8Array<ArrayBuffer>

function bitCount(n: number): number {
  let c = 0
  let v = n
  while (v) {
    c += v & 1
    v >>>= 1
  }
  return c
}

function base64ToBytes(b64: string): Bytes {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function unscramble(inner: Bytes): Bytes {
  const buff = new Uint8Array(inner.length + 2)
  buff[0] = 0xfa
  buff[1] = 0x55
  buff.set(inner, 2)
  const result = new Uint8Array(inner.length)
  for (let i = 0; i < result.length; i++) {
    let v = (inner[i] ^ buff[i]) - bitCount(i) - 21
    while (v < 0) v += 255
    result[i] = v & 0xff
  }
  return result
}

function decodeBase36(b: number): number {
  const c = b & 0xff
  if (c >= 48 && c <= 57) return c - 48
  if (c >= 97 && c <= 122) return c - 97 + 10
  return 0xff
}

function decodeHex(s: string): Bytes {
  if (s.length % 2 !== 0) throw new Error('odd hex')
  const out = new Uint8Array(s.length / 2)
  for (let i = 0; i < out.length; i++) {
    const hi = parseInt(s[2 * i], 16)
    const lo = parseInt(s[2 * i + 1], 16)
    if (isNaN(hi) || isNaN(lo)) throw new Error('bad hex digit')
    out[i] = (hi << 4) | lo
  }
  return out
}

function deriveContentKey(playAuth: string): Bytes {
  if (!playAuth) throw new Error('empty play auth')
  const raw = base64ToBytes(playAuth)
  if (raw.length < 3) throw new Error('play auth too short')
  const padding = (raw[0] ^ raw[1] ^ raw[2]) - 48
  if (padding < 0 || raw.length < padding + 2) throw new Error('invalid play auth padding')
  const innerLen = raw.length - padding - 1
  const inner = raw.slice(1, 1 + innerLen)
  const scrambled = unscramble(inner)
  const skip = decodeBase36(scrambled[0])
  if (skip === 0xff) throw new Error('invalid play auth prefix')
  const end = 1 + (raw.length - padding - 2) - skip
  if (end < 1 || end > scrambled.length) throw new Error('play auth index out of bounds')
  let hex = ''
  for (let i = 1; i < end; i++) hex += String.fromCharCode(scrambled[i])
  const key = decodeHex(hex)
  if (key.length !== 16 && key.length !== 24 && key.length !== 32) {
    throw new Error('unexpected key length')
  }
  return key
}

// ---- ISO BMFF helpers (match the Java private helpers) ----
function readU32(d: Bytes, p: number): number {
  return ((d[p] & 0xff) << 24) | ((d[p + 1] & 0xff) << 16) | ((d[p + 2] & 0xff) << 8) | (d[p + 3] & 0xff)
}
function readU16(d: Bytes, p: number): number {
  return ((d[p] & 0xff) << 8) | (d[p + 1] & 0xff)
}

function asciiEquals(d: Bytes, p: number, s: string): boolean {
  if (p + 4 > d.length || s.length !== 4) return false
  for (let i = 0; i < 4; i++) if (d[p + i] !== s.charCodeAt(i)) return false
  return true
}
function ascii(d: Bytes, p: number): string {
  if (p + 4 > d.length) return ''
  return String.fromCharCode(d[p], d[p + 1], d[p + 2], d[p + 3])
}
function indexOf(d: Bytes, start: number, end: number, needle: string): number {
  const limit = Math.min(end, d.length) - 4
  for (let i = Math.max(start, 0); i <= limit; i++) if (asciiEquals(d, i, needle)) return i
  return -1
}

interface Box {
  offset: number
  size: number
  body: Bytes
}

function findBox(d: Bytes, type: string, start: number, end: number): Box | null {
  let pos = Math.max(start, 0)
  const limit = Math.min(end, d.length)
  while (pos + 8 <= limit) {
    const size64 = readU32(d, pos)
    if (size64 < 8) break
    if (size64 > limit - pos) break
    const size = size64
    if (asciiEquals(d, pos + 4, type)) {
      const body = d.slice(pos + 8, pos + size)
      return { offset: pos, size, body }
    }
    pos += size
  }
  return null
}

function childOffset(type: string, offset: number, header: number): number {
  switch (type) {
    case 'moov':
    case 'trak':
    case 'mdia':
    case 'minf':
    case 'stbl':
    case 'sinf':
    case 'schi':
      return offset + header
    case 'stsd':
      return offset + header + 8
    case 'enca':
    case 'mp4a':
    case 'alac':
    case 'fLaC':
      return offset + header + 28
    default:
      return 0
  }
}

function findBoxDeep(d: Bytes, type: string, start: number, end: number): Box | null {
  let pos = Math.max(start, 0)
  const limit = Math.min(end, d.length)
  while (pos + 8 <= limit) {
    let size64 = readU32(d, pos)
    let header = 8
    if (size64 === 1) {
      if (pos + 16 > limit) break
      size64 = 0
      for (let i = 0; i < 8; i++) size64 = (size64 << 8) | (d[pos + 8 + i] & 0xff)
      header = 16
    }
    if (size64 < header || size64 > limit - pos) break
    const size = size64
    const current = ascii(d, pos + 4)
    if (type === current) return { offset: pos, size, body: d.slice(pos + header, pos + size) }
    const co = childOffset(current, pos, header)
    if (co > 0 && co < pos + size) {
      const found = findBoxDeep(d, type, co, pos + size)
      if (found) return found
    }
    pos += size
  }
  return null
}

function parseStsz(d: Bytes): number[] {
  if (d.length < 12) return []
  const fixed = readU32(d, 4)
  let count = readU32(d, 8)
  if (count < 0 || count > (d.length - 12) / 4 + 1 || count > 2147483647) {
    count = Math.max(0, (d.length - 12) / 4)
  }
  const sizes = new Array<number>(count)
  if (fixed !== 0) {
    for (let i = 0; i < sizes.length; i++) sizes[i] = fixed
  } else {
    for (let i = 0; i < sizes.length; i++) {
      const p = 12 + i * 4
      sizes[i] = p + 4 <= d.length ? readU32(d, p) : 0
    }
  }
  return sizes
}

function perSampleIvSize(d: Bytes, start: number, end: number): number {
  const tenc = findBoxDeep(d, 'tenc', start, end)
  if (!tenc || tenc.body.length < 8) return 8
  const iv = tenc.body[7] & 0xff
  return iv === 8 || iv === 16 ? iv : 8
}

interface SencSample {
  iv: Bytes
  subsamples: [number, number][] | null
}

function parseSenc(d: Bytes, ivSize: number): SencSample[] {
  let iv = ivSize
  if (iv !== 8 && iv !== 16) iv = 8
  if (d.length < 8) return []
  const flags = readU32(d, 0) & 0x00ffffff
  const hasSubsamples = (flags & 0x02) !== 0
  let count = readU32(d, 4)
  if (count < 0) count = 0
  const samples: SencSample[] = []
  let ptr = 8
  for (let i = 0; i < count; i++) {
    if (ptr + iv > d.length) break
    const ivBytes = d.slice(ptr, ptr + iv)
    ptr += iv
    let subs: [number, number][] | null = null
    if (hasSubsamples) {
      if (ptr + 2 > d.length) break
      const subCount = readU16(d, ptr)
      ptr += 2
      if (ptr + subCount * 6 > d.length) break
      subs = []
      for (let j = 0; j < subCount; j++) {
        subs.push([readU16(d, ptr), readU32(d, ptr + 2)])
        ptr += 6
      }
    }
    samples.push({ iv: ivBytes, subsamples: subs })
  }
  return samples
}

function originalFormatBytes(d: Bytes, start: number, end: number): Bytes {
  const idx = indexOf(d, start, Math.min(end, d.length), 'frma')
  if (idx < 4 || idx + 8 > d.length) return new Uint8Array([0x6d, 0x70, 0x34, 0x61]) // 'mp4a'
  const boxStart = idx - 4
  const size = readU32(d, boxStart)
  if (size < 12 || boxStart + size > d.length) return new Uint8Array([0x6d, 0x70, 0x34, 0x61])
  const out = new Uint8Array(4)
  out.set(d.slice(idx + 4, idx + 8))
  return out
}

function concat(chunks: Bytes[]): Bytes {
  let len = 0
  for (const c of chunks) len += c.length
  const out = new Uint8Array(len)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.length
  }
  return out
}

async function decryptCenc(fileBytes: Bytes, playAuth: string): Promise<Bytes> {
  const d = fileBytes
  const mdat = findBox(d, 'mdat', 0, d.length)
  if (!mdat) throw new Error('mdat box not found')

  const key = deriveContentKey(playAuth)
  const cryptoKey = await crypto.subtle.importKey('raw', key, 'AES-CTR', false, ['decrypt'])

  const moov = findBox(d, 'moov', 0, d.length)
  if (!moov) throw new Error('moov box not found')

  let stbl = findBox(d, 'stbl', moov.offset, moov.offset + moov.size)
  if (!stbl) {
    const trak = findBox(d, 'trak', moov.offset + 8, moov.offset + moov.size)
    const mdia = trak ? findBox(d, 'mdia', trak.offset + 8, trak.offset + trak.size) : null
    const minf = mdia ? findBox(d, 'minf', mdia.offset + 8, mdia.offset + mdia.size) : null
    stbl = minf ? findBox(d, 'stbl', minf.offset + 8, minf.offset + minf.size) : null
  }
  if (!stbl) throw new Error('stbl box not found')

  const stsz = findBox(d, 'stsz', stbl.offset + 8, stbl.offset + stbl.size)
  if (!stsz) throw new Error('stsz box not found')
  let senc = findBox(d, 'senc', moov.offset + 8, moov.offset + moov.size)
  if (!senc) senc = findBox(d, 'senc', stbl.offset + 8, stbl.offset + stbl.size)
  if (!senc) throw new Error('senc box not found')
  const ivSize = perSampleIvSize(d, stbl.offset, stbl.offset + stbl.size)

  const stsd = findBox(d, 'stsd', stbl.offset + 8, stbl.offset + stbl.size)
  const encaIdx = stsd ? indexOf(d, stsd.offset, stsd.offset + stsd.size, 'enca') : -1
  const origFmt =
    encaIdx >= 0 && stsd
      ? originalFormatBytes(d, stsd.offset, stsd.offset + stsd.size)
      : new Uint8Array([0x6d, 0x70, 0x34, 0x61])

  const sampleSizes = parseStsz(stsz.body)
  const samples = parseSenc(senc.body, ivSize)
  const mdatPayloadStart = mdat.offset + 8
  const payloadLimit = Math.min(mdat.offset + mdat.size, d.length)

  // patchHeader: enca -> original format
  if (encaIdx >= 0 && encaIdx + 4 <= d.length) d.set(origFmt, encaIdx)

  // Every sample has its own IV, so samples are independent. Awaiting one Web Crypto call
  // per sample serialises the per-call overhead; collecting the tasks first and running them
  // in bounded concurrent batches roughly halves decrypt time (measured 51.5ms -> 27ms on a
  // 1.1MB / 128k track, byte-identical output).
  interface DecryptTask {
    iv: Bytes
    segStart: number
    segEnd: number
    sample: SencSample
    data: Bytes
  }
  const tasks: DecryptTask[] = []
  let readPtr = mdatPayloadStart
  for (let i = 0; i < sampleSizes.length; i++) {
    const size = sampleSizes[i]
    if (size <= 0 || readPtr + size > payloadLimit) break
    if (i >= samples.length) break
    const sample = samples[i]
    const iv = new Uint8Array(16)
    iv.set(sample.iv.subarray(0, Math.min(sample.iv.length, 16)))
    const segStart = readPtr
    const segEnd = readPtr + size
    let data: Bytes
    if (!sample.subsamples || sample.subsamples.length === 0) {
      data = d.slice(segStart, segEnd)
    } else {
      // extract encrypted segments (continuous keystream within sample)
      let pos = segStart
      const chunks: Bytes[] = []
      for (const [clear, enc] of sample.subsamples) {
        const c = Math.min(clear, segEnd - pos)
        pos += c
        if (pos >= segEnd) break
        const e = Math.min(enc, segEnd - pos)
        if (e > 0) chunks.push(d.slice(pos, pos + e))
        pos += e
        if (pos >= segEnd) break
      }
      data = concat(chunks)
    }
    tasks.push({ iv, segStart, segEnd, sample, data })
    readPtr += size
  }

  const DECRYPT_BATCH = 64
  for (let b = 0; b < tasks.length; b += DECRYPT_BATCH) {
    const batch = tasks.slice(b, b + DECRYPT_BATCH)
    const plains = await Promise.all(
      batch.map((task) =>
        crypto.subtle.decrypt(
          { name: 'AES-CTR', counter: task.iv, length: 128 },
          cryptoKey,
          task.data,
        ),
      ),
    )
    for (let k = 0; k < batch.length; k++) {
      const task = batch[k]
      const plain = new Uint8Array(plains[k])
      if (!task.sample.subsamples || task.sample.subsamples.length === 0) {
        d.set(plain, task.segStart)
      } else {
        // write back at the encrypted offsets (same order as the extracted chunks)
        let pos = task.segStart
        let w = 0
        for (const [clear, enc] of task.sample.subsamples) {
          const c = Math.min(clear, task.segEnd - pos)
          pos += c
          if (pos >= task.segEnd) break
          const e = Math.min(enc, task.segEnd - pos)
          if (e > 0) {
            d.set(plain.subarray(w, w + e), pos)
            w += e
          }
          pos += e
          if (pos >= task.segEnd) break
        }
      }
    }
  }
  return d
}

interface RichPlayback {
  url: string
  bytes: number
}

async function fetchDecryptRichPlayback(
  directUrl: string,
  playAuth: string,
  signal?: AbortSignal,
): Promise<RichPlayback> {
  if (!directUrl || !playAuth) throw new Error('missing direct URL or play auth')
  const resp = await fetch(directUrl, { signal })
  if (!resp.ok) throw new Error(`upstream audio fetch failed: HTTP ${resp.status}`)
  const encrypted = new Uint8Array(await resp.arrayBuffer())
  const bytes = encrypted.byteLength
  const decrypted = await decryptCenc(encrypted, playAuth)
  const blob = new Blob([decrypted], { type: 'audio/mp4' })
  return { url: URL.createObjectURL(blob), bytes }
}

/**
 * Fetches the still-encrypted Qishui track from `directUrl` (upstream CDN), decrypts it
 * client-side, and returns a Blob URL the <audio> element can play. Throws on any failure
 * so the caller can fall back to the local stream URL.
 *
 * Prefer {@link ensureRichPlayback} for normal playback: it caches the decrypted Blob URL so
 * replaying / skipping back / prefetched next tracks start with no fetch or decrypt at all.
 */
export async function resolveQishuiRichPlayback(
  directUrl: string,
  playAuth: string,
  signal?: AbortSignal,
): Promise<string> {
  return (await fetchDecryptRichPlayback(directUrl, playAuth, signal)).url
}

// ---- Decrypted Blob URL cache (LRU) -------------------------------------------------------
//
// The plaintext bytes do not depend on the signed directUrl, so a cached Blob URL stays valid
// even after the upstream link expires. That makes the cache useful both for "next track"
// prefetch (zero-delay skip) and for replaying a recent track. Eviction — not track switching —
// is the only place that revokes a URL, and the currently playing entry is protected.

const RICH_CACHE_MAX_ENTRIES = 4
const RICH_CACHE_MAX_BYTES = 96 * 1024 * 1024

const richBlobCache = new Map<string, RichPlayback>()
const richInFlight = new Map<string, Promise<string>>()
let activeRichKey: string | null = null

export function richPlaybackKey(source: string, id: string, quality: string): string {
  return `${source}:${id}:${quality}`
}

/** Marks the entry currently attached to <audio> so LRU eviction never revokes it. */
export function setActiveRichPlaybackKey(key: string | null): void {
  activeRichKey = key
}

/** Returns a cached Blob URL and refreshes its LRU position, or undefined on a miss. */
export function getCachedRichPlayback(key: string): string | undefined {
  const hit = richBlobCache.get(key)
  if (!hit) return undefined
  richBlobCache.delete(key)
  richBlobCache.set(key, hit)
  return hit.url
}

function trimRichCache(protectKey: string): void {
  let total = 0
  for (const entry of richBlobCache.values()) total += entry.bytes
  for (const key of [...richBlobCache.keys()]) {
    if (richBlobCache.size <= RICH_CACHE_MAX_ENTRIES && total <= RICH_CACHE_MAX_BYTES) break
    if (key === activeRichKey || key === protectKey) continue
    const victim = richBlobCache.get(key)
    if (!victim) continue
    URL.revokeObjectURL(victim.url)
    richBlobCache.delete(key)
    total -= victim.bytes
  }
}

/**
 * Fetch + decrypt once per key and cache the resulting Blob URL. Concurrent callers for the
 * same key share one in-flight request (so a prefetch that is still running when the user hits
 * "next" is reused instead of downloaded twice). The network request intentionally ignores the
 * caller's AbortSignal — cancellation only decides whether the result is still consumed — so a
 * prefetch that gets cancelled on a queue change still warms the cache for whoever needs it.
 */
export function ensureRichPlayback(
  key: string,
  directUrl: string,
  playAuth: string,
): Promise<string> {
  const cached = getCachedRichPlayback(key)
  if (cached) return Promise.resolve(cached)
  const pending = richInFlight.get(key)
  if (pending) return pending
  const task = fetchDecryptRichPlayback(directUrl, playAuth)
    .then((entry) => {
      const existing = richBlobCache.get(key)
      if (existing) URL.revokeObjectURL(existing.url)
      richBlobCache.set(key, entry)
      trimRichCache(key)
      return entry.url
    })
    .finally(() => {
      richInFlight.delete(key)
    })
  richInFlight.set(key, task)
  return task
}

/** Releases every cached Blob URL. Call on auth-session change and provider unmount. */
export function clearRichPlaybackCache(): void {
  for (const entry of richBlobCache.values()) URL.revokeObjectURL(entry.url)
  richBlobCache.clear()
  richInFlight.clear()
  activeRichKey = null
}

/** True when a PlayInfo carries the rich-client direct playback fields. */
export function hasQishuiDirectPlayback(
  info: { source?: string; actualSource?: string; directUrl?: string; playAuth?: string } | null | undefined,
): boolean {
  return (
    !!info &&
    info.source === 'qishui' &&
    (!info.actualSource || info.actualSource === 'qishui') &&
    !!info.directUrl &&
    !!info.playAuth
  )
}
