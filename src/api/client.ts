import type { ApiEnvelope } from '../types'

const BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '')
  .trim()
  .replace(/\/+$/, '')

const TOKEN_KEY = 'nav.token'
const TOKEN_TYPE_KEY = 'nav.tokenType'
const USER_KEY = 'nav.username'
export const AUTH_CHANGE_EVENT = 'nav-auth-change'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getTokenType(): string {
  return localStorage.getItem(TOKEN_TYPE_KEY) || 'Bearer'
}

export function setToken(token: string | null, tokenType = 'Bearer') {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(TOKEN_TYPE_KEY, tokenType)
  } else {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(TOKEN_TYPE_KEY)
  }

  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT))
}

export class ApiError extends Error {
  code: number
  constructor(code: number, message: string) {
    super(message)
    this.code = code
  }
}

type Options = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  auth?: boolean
  query?: Record<string, string | number | undefined>
  signal?: AbortSignal
}

export async function request<T>(path: string, opts: Options = {}): Promise<T> {
  const { method = 'GET', body, auth = false, query, signal } = opts
  const url = new URL(BASE + path, window.location.origin)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
    }
  }

  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth) {
    const t = getToken()
    if (t) headers['Authorization'] = `${getTokenType()} ${t}`
  }

  let res: Response
  try {
    res = await fetch(url.toString(), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      throw new ApiError(-2, '请求已取消')
    }
    throw new ApiError(-1, `网络错误: ${(e as Error).message}`)
  }

  if (res.status === 401) {
    localStorage.removeItem(USER_KEY)
    setToken(null)
    throw new ApiError(401, '登录已过期，请重新登录')
  }

  let json: ApiEnvelope<T>
  try {
    json = (await res.json()) as ApiEnvelope<T>
  } catch {
    throw new ApiError(res.status, `HTTP ${res.status}`)
  }

  if (json.code !== 0) {
    throw new ApiError(json.code, json.message || '请求失败')
  }
  return json.data
}
