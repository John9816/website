export type LrcLine = { time: number; text: string }

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

function normalizeRemoteUrl(url?: string) {
  if (!url) return undefined
  if (!/^https?:\/\//i.test(url)) return url

  let target: URL
  try {
    target = new URL(url)
  } catch {
    return url
  }

  if (isHttpsPage() && !isLocalHostname() && isKuwoHost(target.hostname)) {
    // Kuwo CDN URLs are often HTTP-only or present an invalid HTTPS certificate.
    return buildMediaProxyUrl(target.toString())
  }

  if (isHttpsPage() && target.protocol === 'http:') {
    return 'https:' + url.slice(5)
  }

  return url
}

export function normalizeCoverUrl(url?: string): string | undefined {
  return normalizeRemoteUrl(url)
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
      return '播放地址不可用，可能已过期'
    default:
      return err.message || '播放失败'
  }
}

export function detectUnsupportedFormat(url: string): string | null {
  const lower = url.toLowerCase()
  if (/\.(wma)(\?|$)/.test(lower) || /[?&]format\$wma\b/.test(lower)) {
    return 'WMA'
  }
  if (/\.(ape)(\?|$)/.test(lower) || /[?&]format\$ape\b/.test(lower)) {
    return 'APE'
  }
  return null
}
