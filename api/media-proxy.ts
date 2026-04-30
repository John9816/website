const ALLOWED_HOST_SUFFIX = '.kuwo.cn'
const FORWARDED_REQUEST_HEADERS = ['accept', 'if-range', 'range'] as const
const FORWARDED_RESPONSE_HEADERS = [
  'accept-ranges',
  'cache-control',
  'content-disposition',
  'content-length',
  'content-range',
  'content-type',
  'etag',
  'last-modified',
] as const

function isAllowedTarget(target: URL) {
  const hostname = target.hostname.toLowerCase()
  return hostname === 'kuwo.cn' || hostname.endsWith(ALLOWED_HOST_SUFFIX)
}

function json(status: number, body: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
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

  if (!['http:', 'https:'].includes(target.protocol)) {
    return json(400, { message: 'Unsupported target protocol.' })
  }

  if (!isAllowedTarget(target)) {
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
    return json(502, { message: 'Failed to fetch upstream media.' })
  }

  const headers = new Headers()

  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name)
    if (value) headers.set(name, value)
  }

  headers.set('X-Media-Proxy', 'vercel')

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
