type Env = {
  BACKEND_URL?: string
}

type PagesContext = {
  request: Request
  env: Env
}

const MUSIC_INSTALLER_ROUTE = '/api/public/music/installer/latest'
const MUSIC_UPDATE_MANIFEST_URL = 'https://api.751152.xyz/updates/latest.json'
const MUSIC_INSTALLER_FALLBACK = {
  version: '1.1.24',
  buildNumber: 35,
  title: '柒伍壹壹音乐',
  channel: 'DuckMusic',
  fileName: 'DuckMusic-v1.1.24-arm64-v8a.apk',
  downloadUrl: 'https://api.751152.xyz/updates/DuckMusic-v1.1.24-arm64-v8a.apk',
  releasedAt: '2026-07-31',
  notes:
    'Android 音乐客户端：多音源搜索播放、榜单歌单、云端收藏与历史、歌词队列、网络电台与电视直播、AI 生图与视频解析。',
  platform: 'Android',
  minAndroid: '8.0',
  packageName: 'com.music.player',
}

type MusicUpdateManifest = {
  version?: string
  buildNumber?: number
  downloadUrl?: string
  download_url?: string
  description?: string
  downloads?: Record<string, string>
}

function mapMusicInstallerRelease(manifest: MusicUpdateManifest) {
  const downloads = manifest.downloads ?? {}
  const downloadUrl = (
    downloads['arm64-v8a'] ||
    downloads.arm64 ||
    manifest.downloadUrl ||
    manifest.download_url ||
    ''
  ).trim()
  if (!downloadUrl || !manifest.version) return null
  const fileName =
    downloadUrl.split('/').pop()?.split('?')[0] || `DuckMusic-v${manifest.version}.apk`
  return {
    version: String(manifest.version).replace(/^v/i, ''),
    buildNumber: typeof manifest.buildNumber === 'number' ? manifest.buildNumber : null,
    title: '柒伍壹壹音乐',
    channel: 'DuckMusic',
    fileName,
    downloadUrl,
    releasedAt: new Date().toISOString().slice(0, 10),
    notes: manifest.description?.trim() || MUSIC_INSTALLER_FALLBACK.notes,
    platform: 'Android',
    minAndroid: '8.0',
    packageName: 'com.music.player',
  }
}

async function resolveMusicInstallerRelease() {
  try {
    const response = await fetch(MUSIC_UPDATE_MANIFEST_URL, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'website-music-promo/1.0',
      },
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return MUSIC_INSTALLER_FALLBACK
    const manifest = (await response.json()) as MusicUpdateManifest
    return mapMusicInstallerRelease(manifest) ?? MUSIC_INSTALLER_FALLBACK
  } catch {
    return MUSIC_INSTALLER_FALLBACK
  }
}

const HOP_BY_HOP_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
] as const

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

function getBackendUrl(env: Env) {
  const value = env.BACKEND_URL?.trim().replace(/\/+$/, '')
  if (!value) return null

  try {
    return new URL(value)
  } catch {
    return null
  }
}

function buildHeaders(request: Request) {
  const headers = new Headers(request.headers)

  for (const name of HOP_BY_HOP_HEADERS) {
    headers.delete(name)
  }

  headers.delete('host')
  headers.delete('origin')
  headers.delete('referer')

  return headers
}

export async function onRequest({ request, env }: PagesContext) {
  const incoming = new URL(request.url)

  if (incoming.pathname === MUSIC_INSTALLER_ROUTE) {
    if (request.method !== 'GET') {
      return json(405, { code: 405, message: 'Method not allowed.', data: null })
    }

    const data = await resolveMusicInstallerRelease()
    return json(200, {
      code: 0,
      message: 'ok',
      data,
    })
  }

  const backend = getBackendUrl(env)
  if (!backend) {
    return json(500, { message: 'BACKEND_URL is required for Cloudflare Pages.' })
  }

  const upstreamUrl = new URL(backend)
  upstreamUrl.pathname = `${backend.pathname.replace(/\/$/, '')}${incoming.pathname}`
  upstreamUrl.search = incoming.search

  const init: RequestInit = {
    method: request.method,
    headers: buildHeaders(request),
    redirect: 'manual',
  }

  if (!['GET', 'HEAD'].includes(request.method)) {
    init.body = request.body
  }

  return fetch(upstreamUrl, init)
}
