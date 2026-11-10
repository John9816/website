import type { PlayInfo } from '../types'

export type LrcLine = { time: number; text: string }

export function hasQishuiInlineLyrics(info: PlayInfo | null) {
  return info?.source === 'qishui' && (!info.actualSource || info.actualSource === 'qishui')
    && !!(info.lyric?.lineLyrics?.trim() || info.lyric?.karaokeLyrics?.trim())
}

const KUWO_HOST_SUFFIX = '.kuwo.cn'
const MEDIA_PROXY_PATH = '/_media'

export function parseLrc(text: string | null | undefined): LrcLine[] {
  if (!text) return []
  const lines = text.split(/\r?\n/)
  const out: LrcLine[] = []
  const re = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g

  for (const raw of lines) {
    const tags: number[] = []
    let match: RegExpExecArray | null
    re.lastIndex = 0

    while ((match = re.exec(raw))) {
      const m = Number(match[1])
      const s = Number(match[2])
      const ms = match[3] ? Number(match[3].padEnd(3, '0').slice(0, 3)) : 0
      tags.push(m * 60 + s + ms / 1000)
    }

    const content = raw.replace(re, '').trim()
    if (!tags.length) continue

    for (const t of tags) {
      out.push({ time: t, text: content })
    }
  }

  out.sort((a, b) => a.time - b.time)
  return out
}

export function formatDuration(sec?: number) {
  if (!sec || !Number.isFinite(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function isHttpsPage() {
  return typeof window !== 'undefined' && window.location.protocol === 'https:'
}

function isLocalHostname() {
  if (typeof window === 'undefined') return false
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
}

function isKuwoHost(hostname: string) {
  const lower = hostname.toLowerCase()
  return lower === 'kuwo.cn' || lower.endsWith(KUWO_HOST_SUFFIX)
}

function buildMediaProxyUrl(url: string) {
  return `${MEDIA_PROXY_PATH}?url=${encodeURIComponent(url)}`
}

function parseRemoteUrl(url: string) {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

function hasUsableAssetPath(target: URL) {
  return target.pathname !== '' && target.pathname !== '/' && !target.pathname.endsWith('/')
}

function normalizeRemoteUrl(
  url?: string,
  options?: { requireUsableAssetPath?: boolean },
) {
  if (!url) return undefined
  if (!/^https?:\/\//i.test(url)) return url

  const target = parseRemoteUrl(url)
  if (!target) return url
  if (options?.requireUsableAssetPath && !hasUsableAssetPath(target)) return undefined

  if (isHttpsPage() && !isLocalHostname() && isKuwoHost(target.hostname)) {
    // Kuwo CDN URLs are often HTTP-only or present an invalid HTTPS certificate.
    return buildMediaProxyUrl(target.toString())
  }

  if (isHttpsPage() && target.protocol === 'http:') {
    return 'https:' + url.slice(5)
  }

  return url
}

// Qishui/ByteDance image CDN returns the -image.image ORIGINAL template (often
// 1440px~3000px, several MB per cover) while the UI only renders 44px~240px
// thumbnails. The same asset served as -image.webp is browser-decodable and
// ~13x smaller in production measurements. Size-resize query params on this CDN
// are ignored/400, only the format suffix works, so we rewrite just that suffix.
const QISHUI_IMAGE_TEMPLATE_MARK = '~tplv-'
const QISHUI_ORIGINAL_IMAGE_SUFFIX = /-image\.image(?=$|[?#])/
const QISHUI_WEBP_IMAGE_SUFFIX = '-image.webp'

function compactCoverUrl(url: string): string {
  if (!url.includes(QISHUI_IMAGE_TEMPLATE_MARK)) return url
  return url.replace(QISHUI_ORIGINAL_IMAGE_SUFFIX, QISHUI_WEBP_IMAGE_SUFFIX)
}

export function normalizeCoverUrl(url?: string): string | undefined {
  const normalized = normalizeRemoteUrl(url, { requireUsableAssetPath: true })
  return normalized ? compactCoverUrl(normalized) : normalized
}

export function resolveCoverUrl(
  ...urls: Array<string | null | undefined>
): string | undefined {
  for (const candidate of urls) {
    const normalized = normalizeCoverUrl(candidate ?? undefined)
    if (normalized) return normalized
  }
  return undefined
}

export function fillMissingCoverUrls<T extends { coverUrl?: string }>(
  items: T[],
  fallbackUrl?: string,
): T[] {
  if (!fallbackUrl) return items

  let changed = false
  const nextItems = items.map((item) => {
    if (normalizeCoverUrl(item.coverUrl)) return item
    changed = true
    return { ...item, coverUrl: fallbackUrl }
  })

  return changed ? nextItems : items
}

export function hydrateCollectionCovers<T extends { coverUrl?: string }>(
  coverUrl: string | undefined,
  items: T[],
  fallbackUrl?: string,
) {
  const firstSongCoverUrl = items.find((item) => normalizeCoverUrl(item.coverUrl))?.coverUrl
  const resolvedCoverUrl = resolveCoverUrl(coverUrl, fallbackUrl, firstSongCoverUrl)

  return {
    coverUrl: resolvedCoverUrl,
    list: fillMissingCoverUrls(items, resolvedCoverUrl),
  }
}

export function normalizeMediaUrl(url?: string): string {
  return normalizeRemoteUrl(url) ?? ''
}

export function describeMediaError(err: MediaError | null): string {
  if (!err) return '未知错误'
  switch (err.code) {
    case 1:
      return '加载被中止'
    case 2:
      return '网络错误，音频资源不可用'
    case 3:
      return '音频解码失败，格式可能不兼容'
    case 4:
      // MEDIA_ERR_SRC_NOT_SUPPORTED: the browser rejected the resource before or during load.
      // It is often a blocked cross-origin request or an unsupported codec, NOT an expired URL.
      return '音频地址无法加载，可能是格式不支持或被网络拦截'
    default:
      return err.message || '播放失败'
  }
}

export function detectUnsupportedFormat(url?: string | null): string | null {
  // 播放响应偶发缺 playUrl 时不能让整页崩掉（此处曾被 undefined 触发白屏）
  if (!url) return null
  const lower = url.toLowerCase()
  if (/\.(wma)(\?|$)/.test(lower) || /[?&]format\$wma\b/.test(lower)) {
    return 'WMA'
  }
  if (/\.(ape)(\?|$)/.test(lower) || /[?&]format\$ape\b/.test(lower)) {
    return 'APE'
  }
  return null
}
