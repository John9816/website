type Env = {
  BACKEND_URL?: string
}

type PagesContext = {
  request: Request
  env: Env
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

function json(status: number, body: Record<string, string>) {
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
  const backend = getBackendUrl(env)
  if (!backend) {
    return json(500, { message: 'BACKEND_URL is required for Cloudflare Pages.' })
  }

  const incoming = new URL(request.url)
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
