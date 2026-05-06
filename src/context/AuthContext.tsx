import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getCurrentUser } from '../api/auth'
import { AUTH_CHANGE_EVENT, getToken, setToken } from '../api/client'
import type { CurrentUserView } from '../types'

interface AuthState {
  token: string | null
  username: string | null
  user: CurrentUserView | null
  profileLoading: boolean
  refreshProfile: () => Promise<void>
  login: (token: string, username: string, tokenType?: string) => void
  logout: () => void
}

const Ctx = createContext<AuthState | null>(null)

const USER_KEY = 'nav.username'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTok] = useState<string | null>(() => getToken())
  const [username, setUsername] = useState<string | null>(
    () => localStorage.getItem(USER_KEY),
  )
  const [user, setUser] = useState<CurrentUserView | null>(null)
  const [profileLoading, setProfileLoading] = useState(() => !!getToken())

  useEffect(() => {
    const syncAuthState = () => {
      const token = getToken()
      setTok(token)
      setUsername(token ? localStorage.getItem(USER_KEY) : null)
      if (!token) {
        setUser(null)
        setProfileLoading(false)
      }
    }

    window.addEventListener('storage', syncAuthState)
    window.addEventListener(AUTH_CHANGE_EVENT, syncAuthState)
    return () => {
      window.removeEventListener('storage', syncAuthState)
      window.removeEventListener(AUTH_CHANGE_EVENT, syncAuthState)
    }
  }, [])

  const refreshProfile = async () => {
    if (!getToken()) {
      setUser(null)
      setProfileLoading(false)
      return
    }

    setProfileLoading(true)
    try {
      const profile = await getCurrentUser()
      setUser(profile)
      setUsername(profile.username)
      localStorage.setItem(USER_KEY, profile.username)
    } finally {
      setProfileLoading(false)
    }
  }

  useEffect(() => {
    if (!token) {
      setUser(null)
      setProfileLoading(false)
      return
    }

    let cancelled = false
    setProfileLoading(true)
    getCurrentUser()
      .then((profile) => {
        if (cancelled) return
        setUser(profile)
        setUsername(profile.username)
        localStorage.setItem(USER_KEY, profile.username)
      })
      .catch(() => {
        if (cancelled) return
        setUser(null)
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [token])

  const value: AuthState = {
    token,
    username,
    user,
    profileLoading,
    refreshProfile,
    login(t, u, tokenType) {
      setToken(t, tokenType)
      localStorage.setItem(USER_KEY, u)
      setTok(t)
      setUsername(u)
      setProfileLoading(true)
    },
    logout() {
      setToken(null)
      localStorage.removeItem(USER_KEY)
      setTok(null)
      setUsername(null)
      setUser(null)
      setProfileLoading(false)
    },
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used within AuthProvider')
  return v
}
