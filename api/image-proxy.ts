const FORWARDED_REQUEST_HEADERS = ['accept', 'if-none-match', 'if-modified-since'] as const
const FORWARDED_RESPONSE_HEADERS = [
  'cache-control',
  'content-disposition',
  'content-length',
  'content-type',
  'etag',
  'last-modified',
] as const

function json(status: number, body: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

function isIpv4(hostname: string) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)
}

function parseIpv4(hostname: string) {
  if (!isIpv4(hostname)) return null
  const parts = hostname.split('.').map((part) => Number(part))
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null
  return parts
}

function isBlockedIpv4(parts: number[]) {
  const [a, b] = parts
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a >= 224) return true
  return false
}

function hasBlockedHostname(hostname: string) {
  const lower = hostname.toLowerCase()
  if (
    lower === 'localhost' ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.local') ||
    lower === '0.0.0.0'
  ) {
    return true
  }

  if (lower.startsWith('[') && lower.endsWith(']')) {
    return true
  }

  const ipv4 = parseIpv4(lower)
  return ipv4 ? isBlockedIpv4(ipv4) : false
}

function buildUpstreamHeaders(request: Request) {
  const headers = new Headers()

  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }

  return headers
}

async function proxy(request: Request, method: 'GET' | 'HEAD') {
  const targetValue = new URL(request.url).searchParams.get('url')?.trim()
  if (!targetValue) {
    return json(400, { message: 'Missing `url` query parameter.' })
  }

  let target: URL
  try {
    target = new URL(targetValue)
  } catch {
    return json(400, { message: 'Invalid target url.' })
  }

  if (target.protocol !== 'http:') {
    return json(400, { message: 'Only http images need proxying.' })
  }

  if (target.username || target.password) {
    return json(400, { message: 'Target auth info is not allowed.' })
  }

  if (hasBlockedHostname(target.hostname)) {
    return json(403, { message: 'Target host is not allowed.' })
  }

  let upstream: Response
  try {
    upstream = await fetch(target, {
      method,
      headers: buildUpstreamHeaders(request),
      redirect: 'follow',
    })
  } catch {
    return json(502, { message: 'Failed to fetch upstream image.' })
  }

  const headers = new Headers()

  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name)
    if (value) headers.set(name, value)
  }

  headers.set('X-Image-Proxy', 'vercel')

  return new Response(method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    headers,
  })
}

export function GET(request: Request) {
  return proxy(request, 'GET')
}

export function HEAD(request: Request) {
  return proxy(request, 'HEAD')
}
