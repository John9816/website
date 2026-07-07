import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const rootDir = resolve(__dirname, '..')
const distDir = resolve(process.env.DIST_DIR || join(rootDir, 'dist'))
const host = process.env.HOST || '127.0.0.1'
const port = Number(process.env.PORT || 3000)
const backendUrl = normalizeBackendUrl(process.env.BACKEND_URL)

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
])

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
  const init = {
    method: req.method,
    headers,
    redirect: 'manual',
  }

  if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
    init.body = req
    init.duplex = 'half'
  }

  let upstream
  try {
    upstream = await fetch(upstreamUrl, init)
  } catch (error) {
    console.error('API proxy failed:', error)
    sendJson(res, 502, { message: 'Failed to fetch upstream API.' })
    return
  }

  sendFetchResponse(res, upstream, { copyHeaders: 'all' })
}

function buildApiHeaders(req) {
  const headers = new Headers()

  for (const [name, value] of Object.entries(req.headers)) {
    if (!value || hopByHopHeaders.has(name.toLowerCase())) continue
    if (['host', 'origin', 'referer'].includes(name.toLowerCase())) continue

    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item)
    } else {
      headers.set(name, value)
    }
  }

  const host = req.headers.host
  if (host) headers.set('x-forwarded-host', host)
  headers.set('x-forwarded-proto', 'https')

  return headers
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
  const finalPath = candidate || join(distDir, 'index.html')

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
