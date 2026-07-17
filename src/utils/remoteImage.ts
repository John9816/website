const IMAGE_PROXY_PATH = '/_image'

function isHttpsPage() {
  return typeof window !== 'undefined' && window.location.protocol === 'https:'
}

function isLocalHostname() {
  if (typeof window === 'undefined') return false
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
}

export function buildImageProxyUrl(url: string) {
  return `${IMAGE_PROXY_PATH}?url=${encodeURIComponent(url)}`
}

function shouldProxyRemoteImage(target: URL) {
  const host = target.hostname.toLowerCase()
  return host === 'cdn.oreateai.com' || host.endsWith('.oreateai.com')
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

export function normalizeRemoteImageUrl(
  url?: string | null,
  options?: { requireUsableAssetPath?: boolean },
) {
  if (!url) return undefined
  if (!/^https?:\/\//i.test(url)) return url

  const target = parseRemoteUrl(url)
  if (!target) return url
  if (options?.requireUsableAssetPath && !hasUsableAssetPath(target)) return undefined

  if (isHttpsPage() && !isLocalHostname() && (target.protocol === 'http:' || shouldProxyRemoteImage(target))) {
    return buildImageProxyUrl(target.toString())
  }

  return url
}
