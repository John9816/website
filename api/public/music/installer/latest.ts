/**
 * Public music app installer metadata.
 * Prefer the live DuckMusic update manifest used by the Android client:
 * https://api.751152.xyz/updates/latest.json
 */

const MUSIC_UPDATE_MANIFEST_URL = 'https://api.751152.xyz/updates/latest.json'

const FALLBACK_RELEASE = {
  version: '1.1.24',
  buildNumber: 35,
  title: '柒伍壹壹音乐',
  channel: 'DuckMusic',
  fileName: 'DuckMusic-v1.1.24-arm64-v8a.apk',
  downloadUrl: 'https://api.751152.xyz/updates/DuckMusic-v1.1.24-arm64-v8a.apk',
  sizeBytes: undefined as number | undefined,
  releasedAt: '2026-07-31',
  notes:
    'Android 音乐客户端：多音源搜索播放、榜单歌单、云端收藏与历史、歌词队列、网络电台与电视直播、AI 生图与视频解析。',
  platform: 'Android',
  minAndroid: '8.0',
  packageName: 'com.music.player',
}

type UpdateManifest = {
  version?: string
  buildNumber?: number
  downloadUrl?: string
  download_url?: string
  description?: string
  downloads?: Record<string, string>
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'public, max-age=60',
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

function pickDownload(manifest: UpdateManifest): { url: string; fileName: string } | null {
  const downloads = manifest.downloads ?? {}
  const preferred =
    downloads['arm64-v8a'] ||
    downloads.arm64 ||
    manifest.downloadUrl ||
    manifest.download_url ||
    ''
  const url = preferred.trim()
  if (!url) return null
  const fileName = url.split('/').pop()?.split('?')[0] || `DuckMusic-v${manifest.version || 'latest'}.apk`
  return { url, fileName }
}

function mapManifest(manifest: UpdateManifest) {
  const picked = pickDownload(manifest)
  if (!picked || !manifest.version) return null
  return {
    version: String(manifest.version).replace(/^v/i, ''),
    buildNumber: typeof manifest.buildNumber === 'number' ? manifest.buildNumber : null,
    title: '柒伍壹壹音乐',
    channel: 'DuckMusic',
    fileName: picked.fileName,
    downloadUrl: picked.url,
    sizeBytes: undefined as number | undefined,
    releasedAt: new Date().toISOString().slice(0, 10),
    notes: manifest.description?.trim() || FALLBACK_RELEASE.notes,
    platform: 'Android',
    minAndroid: '8.0',
    packageName: 'com.music.player',
  }
}

async function resolveRelease() {
  try {
    const response = await fetch(MUSIC_UPDATE_MANIFEST_URL, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'website-music-promo/1.0',
      },
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return FALLBACK_RELEASE
    const manifest = (await response.json()) as UpdateManifest
    return mapManifest(manifest) ?? FALLBACK_RELEASE
  } catch {
    return FALLBACK_RELEASE
  }
}

export async function GET() {
  const data = await resolveRelease()
  return json(200, {
    code: 0,
    message: 'ok',
    data,
  })
}
