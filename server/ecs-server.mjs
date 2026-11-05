import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import https from 'node:https'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const rootDir = resolve(__dirname, '..')
const distDir = resolve(process.env.DIST_DIR || join(rootDir, 'dist'))
const host = process.env.HOST || '127.0.0.1'
const port = Number(process.env.PORT || 3000)
const backendUrl = normalizeBackendUrl(process.env.BACKEND_URL)
const apiProxyTimeoutMs = positiveInteger(process.env.API_PROXY_TIMEOUT_MS, 30000)

const hopByHopHeaders = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

const imageRequestHeaders = ['accept', 'if-none-match', 'if-modified-since']
const imageResponseHeaders = [
  'cache-control',
  'content-disposition',
  'content-length',
  'content-type',
  'etag',
  'last-modified',
]
const mediaRequestHeaders = ['accept', 'if-range', 'range']
const mediaResponseHeaders = [
  'accept-ranges',
  'cache-control',
  'content-disposition',
  'content-length',
  'content-range',
  'content-type',
  'etag',
  'last-modified',
]
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

function mapMusicInstallerRelease(manifest) {
  const downloads = manifest?.downloads ?? {}
  const downloadUrl = (
    downloads['arm64-v8a'] ||
    downloads.arm64 ||
    manifest?.downloadUrl ||
    manifest?.download_url ||
    ''
  )
    .toString()
    .trim()
  if (!downloadUrl || !manifest?.version) return null
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
    notes: String(manifest.description || '').trim() || MUSIC_INSTALLER_FALLBACK.notes,
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
    const manifest = await response.json()
    return mapMusicInstallerRelease(manifest) ?? MUSIC_INSTALLER_FALLBACK
  } catch {
    return MUSIC_INSTALLER_FALLBACK
  }
}

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.xml', 'application/xml; charset=utf-8'],
])

const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://hi.751152.xyz'
const SITE_NAME = '个人导航'
const DEFAULT_DESCRIPTION =
  '个人导航与工作台：常用网站导航、AI 对话、AI 生图、在线音乐与知识库，一站直达。'

// 服务端逐路由 meta，与前端 src/hooks/usePageTitle.ts 保持一致。
// 爬虫无需执行 JS 即可读到正确的 title/description/canonical。
const routeMeta = [
  {
    prefix: '/music/app',
    title: '柒伍壹壹音乐 App',
    description:
      '下载柒伍壹壹音乐 Android 客户端：多音源搜索播放、榜单歌单、云端收藏、歌词队列、电台电视直播与实用工具。',
    index: true,
  },
  { prefix: '/music', title: '音乐', description: '在线音乐聚合：QQ、网易云、酷我搜索、播放、歌词、榜单与歌单，一处畅听。', index: true },
  { prefix: '/', title: '首页', description: DEFAULT_DESCRIPTION, index: true, exact: true },
]

function metaForPath(pathname) {
  const clean = pathname.replace(/\/+$/, '') || '/'
  for (const m of routeMeta) {
    if (m.exact ? clean === m.prefix : clean === m.prefix || clean.startsWith(m.prefix + '/')) {
      // 分享等动态子路径含私有内容，即便命中前缀也不收录
      const isDynamicShare = clean.startsWith('/music/share') || clean.startsWith('/kb/share')
      return { ...m, index: m.index && !isDynamicShare, path: clean }
    }
  }
  return { title: SITE_NAME, description: DEFAULT_DESCRIPTION, index: false, path: clean }
}

function escapeHtml(str) {
  return str.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

let indexHtmlCache = null
function readIndexHtml() {
  const p = join(distDir, 'index.html')
  if (!indexHtmlCache || indexHtmlCache.mtimeMs !== statSync(p).mtimeMs) {
    indexHtmlCache = { html: readFileSync(p, 'utf8'), mtimeMs: statSync(p).mtimeMs }
  }
  return indexHtmlCache.html
}

function renderIndexHtml(pathname) {
  const meta = metaForPath(pathname)
  const fullTitle =
    meta.title === SITE_NAME ? SITE_NAME : `${escapeHtml(meta.title)} - ${SITE_NAME}`
  const desc = escapeHtml(meta.description)
  const canonical = `${SITE_ORIGIN}${meta.path === '/' ? '/' : meta.path}`
  const robots = meta.index ? 'index,follow' : 'noindex,nofollow'

  let html = readIndexHtml()
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${fullTitle}</title>`)
  html = replaceMeta(html, 'name', 'description', desc)
  html = replaceMeta(html, 'name', 'robots', robots)
  html = replaceMeta(html, 'property', 'og:title', fullTitle)
  html = replaceMeta(html, 'property', 'og:description', desc)
  html = replaceMeta(html, 'property', 'og:url', canonical)
  html = replaceMeta(html, 'name', 'twitter:title', fullTitle)
  html = replaceMeta(html, 'name', 'twitter:description', desc)
  html = html.replace(
    /<link\s+rel="canonical"[^>]*>/i,
    meta.index ? `<link rel="canonical" href="${canonical}" />` : '',
  )
  return html
}

function replaceMeta(html, attr, key, value) {
  const re = new RegExp(`<meta\\s+${attr}="${key}"[^>]*>`, 'i')
  const tag = `<meta ${attr}="${key}" content="${value}" />`
  return re.test(html) ? html.replace(re, tag) : html.replace(/<\/head>/i, `  ${tag}\n  </head>`)
}

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

    if (requestUrl.pathname === '/healthz') {
      sendJson(res, 200, { ok: 'true' })
      return
    }

    if (requestUrl.pathname === '/_image') {
      await handleRemoteAssetProxy(req, res, requestUrl, {
        markerHeader: 'X-Image-Proxy',
        markerValue: 'ecs',
        requestHeaders: imageRequestHeaders,
        responseHeaders: imageResponseHeaders,
        validateTarget: validateImageTarget,
        upstreamFailureMessage: 'Failed to fetch upstream image.',
      })
      return
    }

    if (requestUrl.pathname === '/_media') {
      await handleRemoteAssetProxy(req, res, requestUrl, {
        markerHeader: 'X-Media-Proxy',
        markerValue: 'ecs',
        requestHeaders: mediaRequestHeaders,
        responseHeaders: mediaResponseHeaders,
        validateTarget: validateMediaTarget,
        upstreamFailureMessage: 'Failed to fetch upstream media.',
      })
      return
    }

    if (requestUrl.pathname === MUSIC_INSTALLER_ROUTE) {
      if (req.method !== 'GET') {
        sendJson(res, 405, { message: 'Method not allowed.' })
        return
      }

      const data = await resolveMusicInstallerRelease()
      sendJson(res, 200, {
        code: 0,
        message: 'ok',
        data,
      })
      return
    }

    if (requestUrl.pathname === '/api' || requestUrl.pathname.startsWith('/api/')) {
      await handleApiProxy(req, res, requestUrl)
      return
    }

    serveStatic(req, res, requestUrl)
  } catch (error) {
    console.error(error)
    sendJson(res, 500, { message: 'Internal server error.' })
  }
})

server.listen(port, host, () => {
  console.log(`ECS server listening on http://${host}:${port}`)
  console.log(`Serving static files from ${distDir}`)
  console.log(`API upstream: ${backendUrl ? backendUrl.origin + backendUrl.pathname.replace(/\/$/, '') : '(not configured)'}`)
})

function normalizeBackendUrl(value) {
  const trimmed = value?.trim().replace(/\/+$/, '')
  if (!trimmed) return null

  try {
    return new URL(trimmed)
  } catch {
    return null
  }
}

async function handleApiProxy(req, res, incomingUrl) {
  if (!backendUrl) {
    sendJson(res, 500, { message: 'BACKEND_URL is required for ECS API proxy.' })
    return
  }

  const upstreamUrl = new URL(backendUrl)
  upstreamUrl.pathname = `${backendUrl.pathname.replace(/\/$/, '')}${incomingUrl.pathname}`
  upstreamUrl.search = incomingUrl.search

  const headers = buildApiHeaders(req)
  const controller = new AbortController()
  let abortCause = null
  let timeoutId = null

  const abortUpstream = (cause) => {
    if (controller.signal.aborted) return
    abortCause = cause
    controller.abort(
      new Error(
        cause === 'timeout'
          ? `API proxy upstream timed out after ${apiProxyTimeoutMs}ms`
          : 'API proxy client disconnected',
      ),
    )
  }
  const onRequestAborted = () => abortUpstream('client')
  const onResponseClose = () => {
    if (!res.writableEnded) abortUpstream('client')
  }

  req.once('aborted', onRequestAborted)
  res.once('close', onResponseClose)
  timeoutId = setTimeout(() => abortUpstream('timeout'), apiProxyTimeoutMs)
  timeoutId.unref?.()

  if (req.aborted || res.destroyed) abortUpstream('client')

  const init = {
    method: req.method,
    headers,
    redirect: 'manual',
    signal: controller.signal,
  }

  if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
    init.body = req
    init.duplex = 'half'
  }

  try {
    const upstream = await fetch(upstreamUrl, init)
    clearTimeout(timeoutId)
    timeoutId = null
    await sendFetchResponse(res, upstream, { copyHeaders: 'all' })
  } catch (error) {
    if (abortCause !== 'client') {
      console.error('API proxy failed:', error)
      if (!res.headersSent && !res.destroyed && !res.writableEnded) {
        sendJson(res, 502, { message: 'Failed to fetch upstream API.' })
      } else if (!res.destroyed && !res.writableEnded) {
        res.destroy()
      }
    }
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
    req.off('aborted', onRequestAborted)
    res.off('close', onResponseClose)
  }
}

function positiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

function buildApiHeaders(req) {
  const headers = new Headers()
  const forwardedHeaders = new Set([
    'cf-connecting-ip',
    'forwarded',
    'x-forwarded-for',
    'x-forwarded-host',
    'x-forwarded-proto',
    'x-real-ip',
  ])

  for (const [name, value] of Object.entries(req.headers)) {
    const lowerName = name.toLowerCase()
    if (!value || hopByHopHeaders.has(lowerName)) continue
    if (['host', 'origin', 'referer'].includes(lowerName) || forwardedHeaders.has(lowerName)) continue

    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item)
    } else {
      headers.set(name, value)
    }
  }

  const host = req.headers.host
  const clientIp = normalizeClientIp(req.headers['x-real-ip']) || normalizeClientIp(req.socket.remoteAddress)
  if (host) headers.set('x-forwarded-host', host)
  if (clientIp) {
    headers.set('x-real-ip', clientIp)
    headers.set('x-forwarded-for', clientIp)
  }
  headers.set('x-forwarded-proto', 'https')

  return headers
}

function normalizeClientIp(value) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed || trimmed.includes(',') || trimmed.includes('\r') || trimmed.includes('\n')) return ''
  return trimmed.slice(0, 45)
}

async function handleRemoteAssetProxy(req, res, incomingUrl, options) {
  if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
    sendJson(res, 405, { message: 'Method not allowed.' })
    return
  }

  const targetValue = incomingUrl.searchParams.get('url')?.trim()
  if (!targetValue) {
    sendJson(res, 400, { message: 'Missing `url` query parameter.' })
    return
  }

  let target
  try {
    target = new URL(targetValue)
  } catch {
    sendJson(res, 400, { message: 'Invalid target url.' })
    return
  }

  const validationError = options.validateTarget(target)
  if (validationError) {
    sendJson(res, validationError.status, { message: validationError.message })
    return
  }

  const headers = new Headers()
  for (const name of options.requestHeaders) {
    const value = req.headers[name]
    if (typeof value === 'string') headers.set(name, value)
  }

  let upstream
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      redirect: 'follow',
    })
  } catch (error) {
    if (isOreateCdnTarget(target)) {
      console.warn('Asset proxy fetch failed for Oreate CDN, retrying with node https fallback:', error?.message || error)
      await proxyRemoteAssetViaNodeRequest(req, res, target, options, true)
      return
    }
    console.error('Asset proxy failed:', error)
    sendJson(res, 502, { message: options.upstreamFailureMessage })
    return
  }

  sendFetchResponse(res, upstream, {
    copyHeaders: options.responseHeaders,
    extraHeaders: [[options.markerHeader, options.markerValue]],
    headOnly: req.method === 'HEAD',
  })
}

function isOreateCdnTarget(target) {
  const hostname = target.hostname.toLowerCase()
  return hostname === 'cdn.oreateai.com' || hostname.endsWith('.oreateai.com')
}

function proxyRemoteAssetViaNodeRequest(req, res, target, options, allowInsecureTls = false) {
  return new Promise((resolve) => {
    const client = target.protocol === 'https:' ? https : http
    const requestOptions = {
      method: req.method || 'GET',
      headers: Object.fromEntries(
        Array.from(options.requestHeaders || [])
          .map((name) => [name, req.headers[name]])
          .filter(([, value]) => typeof value === 'string')
      ),
    }

    if (target.protocol === 'https:' && allowInsecureTls) {
      requestOptions.agent = new https.Agent({ rejectUnauthorized: false })
    }

    const upstreamReq = client.request(target, requestOptions, (upstreamRes) => {
      const responseHeaders = {}
      for (const name of options.responseHeaders || []) {
        const value = upstreamRes.headers[name.toLowerCase()]
        if (value) responseHeaders[name] = Array.isArray(value) ? value.join(', ') : value
      }
      for (const [name, value] of options.extraHeaders || [[options.markerHeader, options.markerValue]]) {
        responseHeaders[name] = value
      }
      if (!responseHeaders['cache-control'] && !responseHeaders['Cache-Control']) {
        responseHeaders['Cache-Control'] = 'public, max-age=3600'
      }
      res.writeHead(upstreamRes.statusCode || 502, responseHeaders)
      if (req.method === 'HEAD') {
        upstreamRes.resume()
        res.end()
        resolve()
        return
      }
      upstreamRes.on('end', resolve)
      upstreamRes.on('error', (error) => {
        console.error('Asset proxy fallback stream failed:', error)
        if (!res.headersSent) sendJson(res, 502, { message: options.upstreamFailureMessage })
        else res.end()
        resolve()
      })
      upstreamRes.pipe(res)
    })

    upstreamReq.on('error', (error) => {
      console.error('Asset proxy fallback failed:', error)
      if (!res.headersSent) sendJson(res, 502, { message: options.upstreamFailureMessage })
      else res.end()
      resolve()
    })
    upstreamReq.setTimeout(30000, () => upstreamReq.destroy(new Error('Asset proxy fallback timeout')))
    upstreamReq.end()
  })
}

function validateImageTarget(target) {
  if (!['http:', 'https:'].includes(target.protocol)) {
    return { status: 400, message: 'Unsupported target protocol.' }
  }

  if (target.username || target.password) {
    return { status: 400, message: 'Target auth info is not allowed.' }
  }

  if (hasBlockedHostname(target.hostname)) {
    return { status: 403, message: 'Target host is not allowed.' }
  }

  return null
}

function validateMediaTarget(target) {
  if (!['http:', 'https:'].includes(target.protocol)) {
    return { status: 400, message: 'Unsupported target protocol.' }
  }

  const hostname = target.hostname.toLowerCase()
  if (hostname !== 'kuwo.cn' && !hostname.endsWith('.kuwo.cn')) {
    return { status: 403, message: 'Target host is not allowed.' }
  }

  return null
}

function isIpv4(hostname) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)
}

function parseIpv4(hostname) {
  if (!isIpv4(hostname)) return null
  const parts = hostname.split('.').map((part) => Number(part))
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null
  return parts
}

function isBlockedIpv4(parts) {
  const [a, b] = parts
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a >= 224) return true
  return false
}

function hasBlockedHostname(hostname) {
  const lower = hostname.toLowerCase()
  if (
    lower === 'localhost' ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.local') ||
    lower === '0.0.0.0'
  ) {
    return true
  }

  if (lower.startsWith('[') && lower.endsWith(']')) return true

  const ipv4 = parseIpv4(lower)
  return ipv4 ? isBlockedIpv4(ipv4) : false
}

function serveStatic(req, res, requestUrl) {
  if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
    sendJson(res, 405, { message: 'Method not allowed.' })
    return
  }

  const pathname = decodePathname(requestUrl.pathname)
  if (!pathname) {
    sendJson(res, 400, { message: 'Invalid path.' })
    return
  }

  const filePath = resolveFilePath(pathname)
  const candidate = filePath && getExistingFile(filePath)

  // SPA 路由回退：没有对应的真实文件、或解析到的就是 index.html（含首页 "/")时，
  // 返回带逐路由 meta 的 index.html，让爬虫无需执行 JS 即可读到正确的
  // title/description/canonical。真实静态资源（js/css/图片等）走原样直发。
  const servesIndexHtml =
    !candidate || normalize(candidate) === normalize(join(distDir, 'index.html'))
  if (servesIndexHtml) {
    const indexPath = join(distDir, 'index.html')
    if (!existsSync(indexPath)) {
      sendJson(res, 404, { message: 'Not found.' })
      return
    }
    const html = renderIndexHtml(pathname)
    const body = Buffer.from(html, 'utf8')
    res.writeHead(200, {
      'Content-Length': String(body.byteLength),
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    })
    res.end(req.method === 'HEAD' ? undefined : body)
    return
  }

  const finalPath = candidate

  if (!isInsideDist(finalPath) || !existsSync(finalPath)) {
    sendJson(res, 404, { message: 'Not found.' })
    return
  }

  const stat = statSync(finalPath)
  const ext = extname(finalPath).toLowerCase()
  const headers = {
    'Content-Length': String(stat.size),
    'Content-Type': contentTypes.get(ext) || 'application/octet-stream',
    'Cache-Control': cacheControlFor(finalPath),
  }

  res.writeHead(200, headers)
  if (req.method === 'HEAD') {
    res.end()
    return
  }

  createReadStream(finalPath).pipe(res)
}

function decodePathname(pathname) {
  try {
    return decodeURIComponent(pathname)
  } catch {
    return null
  }
}

function resolveFilePath(pathname) {
  const withoutLeadingSlash = pathname.replace(/^\/+/, '')
  const normalized = normalize(withoutLeadingSlash)
  const filePath = resolve(distDir, normalized)
  return isInsideDist(filePath) ? filePath : null
}

function getExistingFile(filePath) {
  if (!existsSync(filePath)) return null
  const stat = statSync(filePath)
  if (stat.isFile()) return filePath

  const indexPath = join(filePath, 'index.html')
  if (stat.isDirectory() && existsSync(indexPath) && statSync(indexPath).isFile()) {
    return indexPath
  }

  return null
}

function isInsideDist(filePath) {
  const relative = normalize(filePath).slice(distDir.length)
  return filePath === distDir || relative.startsWith(sep) || relative === ''
}

function cacheControlFor(filePath) {
  const normalizedPath = filePath.replace(/\\/g, '/')
  if (normalizedPath.includes('/assets/') || normalizedPath.includes('/models/')) {
    return 'public, max-age=31536000, immutable'
  }
  if (normalizedPath.includes('/bank-nav/static/')) {
    return 'public, max-age=604800, stale-while-revalidate=86400'
  }
  return 'no-cache'
}

async function sendFetchResponse(res, upstream, options = {}) {
  const responseHeaders = {}

  if (options.copyHeaders === 'all') {
    upstream.headers.forEach((value, name) => {
      if (!hopByHopHeaders.has(name.toLowerCase())) responseHeaders[name] = value
    })
  } else {
    for (const name of options.copyHeaders || []) {
      const value = upstream.headers.get(name)
      if (value) responseHeaders[name] = value
    }
  }

  for (const [name, value] of options.extraHeaders || []) {
    responseHeaders[name] = value
  }

  res.writeHead(upstream.status, responseHeaders)

  if (options.headOnly || !upstream.body) {
    res.end()
    return
  }

  for await (const chunk of upstream.body) {
    res.write(chunk)
  }
  res.end()
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload),
    'Content-Type': 'application/json; charset=utf-8',
  })
  res.end(payload)
}
