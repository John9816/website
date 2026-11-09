import { AUTH_CHANGE_EVENT, getAuthSessionId, request } from './client'
import { MusicReadCache } from '../utils/musicReadCache'
const cache = new MusicReadCache()
let scope: string | null = null
export function clearMusicReads() {
  scope = null
  cache.clear()
}
function syncScope() {
  const session = getAuthSessionId()
  if (session !== scope) {
    cache.clear()
    scope = session
  }
  return session
}
if (typeof window !== 'undefined') {
  window.addEventListener(AUTH_CHANGE_EVENT, syncScope)
  window.addEventListener('storage', syncScope)
}
export function musicRead<T>(
  path: string,
  options: NonNullable<Parameters<typeof request>[1]> = {},
  ttl = 60_000,
  refresh = false,
): Promise<T> {
  const session = syncScope()
  if (!session) return request<T>(path, options)
  const query = Object.entries(options.query || {})
    .filter(([, v]) => v != null)
    .sort(([a], [b]) => a.localeCompare(b))
  const key = `${session}:${path}:${JSON.stringify(query)}`
  if (refresh) cache.evict(key)
  return cache.read(
    key,
    (signal) => request<T>(path, { ...options, signal }),
    ttl,
    options.signal,
  )
}
