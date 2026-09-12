import type { ApiEnvelope, LoginResponse } from '../types'

export const BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '')
  .trim()
  .replace(/\/+$/, '')

const TOKEN_KEY = 'nav.token'
const TOKEN_TYPE_KEY = 'nav.tokenType'
const USER_KEY = 'nav.username'
const AUTH_SESSION_KEY = 'nav.auth.session'
export const AUTH_CHANGE_EVENT = 'nav-auth-change'

type StoredAuthSession = {
  token: string
  tokenType: string
  username: string | null
  refreshToken: string | null
  sessionId: string
}

type RefreshState = {
  refreshToken: string
  promise: Promise<LoginResponse>
}

let refreshState: RefreshState | null = null

function createSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function readAuthSession(): StoredAuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY)
    if (raw) {
      const value = JSON.parse(raw) as Partial<StoredAuthSession>
      if (typeof value.token === 'string' && value.token) {
        const session: StoredAuthSession = {
          token: value.token,
          tokenType: typeof value.tokenType === 'string' && value.tokenType ? value.tokenType : 'Bearer',
          username: typeof value.username === 'string' && value.username ? value.username : null,
          refreshToken:
            typeof value.refreshToken === 'string' && value.refreshToken ? value.refreshToken : null,
          sessionId:
            typeof value.sessionId === 'string' && value.sessionId ? value.sessionId : createSessionId(),
        }
        if (session.sessionId !== value.sessionId) {
          localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session))
        }
        return session
      }
    }
  } catch {
    localStorage.removeItem(AUTH_SESSION_KEY)
  }

  const legacyToken = localStorage.getItem(TOKEN_KEY)
  if (!legacyToken) return null
  const migrated = {
    token: legacyToken,
    tokenType: localStorage.getItem(TOKEN_TYPE_KEY) || 'Bearer',
    username: localStorage.getItem(USER_KEY),
    refreshToken: null,
    sessionId: createSessionId(),
  }
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(migrated))
  return migrated
}

export function getToken(): string | null {
  return readAuthSession()?.token ?? null
}

export function getTokenType(): string {
  return readAuthSession()?.tokenType ?? 'Bearer'
}

export function getStoredUsername(): string | null {
  return readAuthSession()?.username ?? null
}

export function getRefreshToken(): string | null {
  return readAuthSession()?.refreshToken ?? null
}

function getAuthSessionId(): string | null {
  return readAuthSession()?.sessionId ?? null
}

export function setAuthSession(
  token: string,
  tokenType = 'Bearer',
  username: string | null = null,
  options: { emit?: boolean; refreshToken?: string | null; newSession?: boolean } = {},
) {
  const previous = readAuthSession()
  const session: StoredAuthSession = {
    token,
    tokenType,
    username,
    refreshToken:
      options.refreshToken !== undefined ? options.refreshToken : previous?.refreshToken ?? null,
    sessionId: options.newSession ? createSessionId() : previous?.sessionId ?? createSessionId(),
  }
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session))
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(TOKEN_TYPE_KEY)
  localStorage.removeItem(USER_KEY)
  if (options.emit !== false) {
    window.dispatchEvent(new Event(AUTH_CHANGE_EVENT))
  }
}

export function setToken(token: string | null, tokenType = 'Bearer', options: { emit?: boolean } = {}) {
  if (token) {
    const session: StoredAuthSession = {
      token,
      tokenType,
      username: readAuthSession()?.username ?? null,
      refreshToken: readAuthSession()?.refreshToken ?? null,
      sessionId: readAuthSession()?.sessionId ?? createSessionId(),
    }
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session))
  } else {
    localStorage.removeItem(AUTH_SESSION_KEY)
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(TOKEN_TYPE_KEY)
    localStorage.removeItem(USER_KEY)
  }

  if (options.emit !== false) {
    window.dispatchEvent(new Event(AUTH_CHANGE_EVENT))
  }
}

export class ApiError extends Error {
  code: number
  constructor(code: number, message: string) {
    super(message)
    this.code = code
  }
}

function normalizeApiErrorMessage(message: string | undefined): string {
  const raw = String(message || '').trim()
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as { detail?: unknown; message?: unknown }
      const detail = parsed.detail
      if (detail && typeof detail === 'object') {
        const record = detail as Record<string, unknown>
        const parts = [record.message, record.hint].filter(Boolean).map(String)
        if (parts.length) return parts.join('\n')
      }
      if (parsed.message) return String(parsed.message)
    } catch {
      // Fall through to raw message.
    }
  }
  return raw || 'Request failed'
}

type Options = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  body?: unknown
  auth?: boolean
  query?: Record<
    string,
    string | number | boolean | undefined | null | Array<string | number | boolean>
  >
  authToken?: string
  authTokenType?: string
  signal?: AbortSignal
  retryOnUnauthorized?: boolean
}

async function refreshAccessToken(accessToken: string, refreshToken: string): Promise<LoginResponse> {
  const response = await request<LoginResponse>('/api/auth/refresh', {
    method: 'POST',
    body: { refresh_token: refreshToken },
    retryOnUnauthorized: false,
  })
  if (!response?.token) {
    throw new ApiError(401, '登录已过期，请重新登录')
  }

  if (getToken() === accessToken && getRefreshToken() === refreshToken) {
    setAuthSession(
      response.token,
      response.tokenType || 'Bearer',
      response.username || getStoredUsername(),
      { refreshToken: response.refreshToken || refreshToken },
    )
  }
  return response
}

function getOrCreateRefresh(accessToken: string, refreshToken: string): Promise<LoginResponse> {
  if (refreshState?.refreshToken === refreshToken) {
    return refreshState.promise
  }

  const promise = refreshAccessToken(accessToken, refreshToken).finally(() => {
    if (refreshState?.promise === promise) refreshState = null
  })
  refreshState = { refreshToken, promise }
  return promise
}

function clearCurrentSession(accessToken: string) {
  if (getToken() === accessToken) setToken(null)
}

export async function request<T>(path: string, opts: Options = {}): Promise<T> {
  const {
    method = 'GET',
    body,
    auth = false,
    query,
    signal,
    retryOnUnauthorized = true,
  } = opts
  const url = new URL(BASE + path, window.location.origin)
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (Array.isArray(v)) {
        v.forEach((item) => {
          if (item !== undefined && item !== null && item !== '') {
            url.searchParams.append(k, String(item))
          }
        })
        continue
      }
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
    }
  }

  const headers: Record<string, string> = {}
  if (body !== undefined && !isFormData) headers['Content-Type'] = 'application/json'
  let requestToken: string | null = null
  let requestSessionId: string | null = null
  if (auth) {
    const t = opts.authToken ?? getToken()
    requestToken = t
    if (t && t === getToken()) requestSessionId = getAuthSessionId()
    const tokenType = opts.authTokenType ?? getTokenType()
    if (t) headers['Authorization'] = `${tokenType} ${t}`
  }

  let res: Response
  try {
    res = await fetch(url.toString(), {
      method,
      headers,
      body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
      signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      throw new ApiError(-2, '请求已取消')
    }
    throw new ApiError(-1, `网络错误: ${(e as Error).message}`)
  }

  let json: ApiEnvelope<T>
  try {
    json = (await res.json()) as ApiEnvelope<T>
  } catch {
    throw new ApiError(res.status, `HTTP ${res.status}`)
  }

  if (res.status === 401) {
    if (!auth || !requestToken) {
      throw new ApiError(401, normalizeApiErrorMessage(json.message))
    }
    const sentToken = requestToken
    const isCurrentToken = sentToken === getToken()

    if (!retryOnUnauthorized) {
      if (isCurrentToken) clearCurrentSession(sentToken)
      throw new ApiError(401, '登录已过期，请重新登录')
    }

    if (!isCurrentToken) {
      const nextToken = getToken()
      if (nextToken && requestSessionId && requestSessionId === getAuthSessionId()) {
        return request(path, {
          ...opts,
          authToken: nextToken,
          authTokenType: getTokenType(),
          retryOnUnauthorized: false,
        })
      }
      throw new ApiError(401, normalizeApiErrorMessage(json.message))
    }

    const refreshToken = getRefreshToken()
    if (!refreshToken) {
      clearCurrentSession(sentToken)
      throw new ApiError(401, '登录已过期，请重新登录')
    }

    try {
      const refreshed = await getOrCreateRefresh(sentToken, refreshToken)
      const nextToken = getToken()
      if (
        !nextToken ||
        nextToken !== refreshed.token ||
        !requestSessionId ||
        requestSessionId !== getAuthSessionId()
      ) {
        throw new ApiError(401, '登录状态已变更，请重试')
      }
      return request(path, {
        ...opts,
        authToken: nextToken,
        authTokenType: getTokenType(),
        retryOnUnauthorized: false,
      })
    } catch (error) {
      clearCurrentSession(sentToken)
      if (error instanceof ApiError && error.code === 401) {
        throw new ApiError(401, '登录已过期，请重新登录')
      }
      throw error
    }
  }

  if (json.code !== 0) {
    throw new ApiError(json.code, normalizeApiErrorMessage(json.message))
  }
  return json.data
}
