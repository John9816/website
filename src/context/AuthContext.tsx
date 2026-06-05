import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { checkInToday, getCurrentUser, getUserCredits } from '../api/auth'
import { ApiError, AUTH_CHANGE_EVENT, getToken, setToken } from '../api/client'
import type { CurrentUserView, UserCreditView } from '../types'

interface AuthState {
  token: string | null
  username: string | null
  user: CurrentUserView | null
  credits: UserCreditView | null
  profileLoading: boolean
  refreshProfile: () => Promise<void>
  refreshCredits: () => Promise<UserCreditView | null>
  checkIn: () => Promise<UserCreditView>
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
  const [credits, setCredits] = useState<UserCreditView | null>(null)
  const [profileLoading, setProfileLoading] = useState(() => !!getToken())

  const applyProfile = (profile: CurrentUserView) => {
    setUser(profile)
    setUsername(profile.username)
    localStorage.setItem(USER_KEY, profile.username)
    const profileCredits = profile.credits
    if (typeof profileCredits === 'number') {
      setCredits((previous) => ({
        credits: profileCredits,
        imageCreditCost: profile.imageCreditCost ?? previous?.imageCreditCost ?? 1,
        dailyCheckInReward: profile.dailyCheckInReward ?? previous?.dailyCheckInReward ?? 5,
        checkedInToday: profile.checkedInToday ?? previous?.checkedInToday ?? false,
        lastCheckInDate: profile.lastCheckInDate ?? previous?.lastCheckInDate ?? null,
      }))
    }
  }

  useEffect(() => {
    const syncAuthState = () => {
      const token = getToken()
      setTok(token)
      setUsername(token ? localStorage.getItem(USER_KEY) : null)
      if (!token) {
        setUser(null)
        setCredits(null)
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
      setCredits(null)
      setProfileLoading(false)
      return
    }

    setProfileLoading(true)
    try {
      const profile = await getCurrentUser()
      applyProfile(profile)
    } finally {
      setProfileLoading(false)
    }
  }

  const refreshCredits = async () => {
    if (!getToken()) {
      setCredits(null)
      return null
    }
    try {
      const nextCredits = await getUserCredits()
      setCredits(nextCredits)
      return nextCredits
    } catch (error) {
      if (error instanceof ApiError && (error.code === 404 || error.code === 405)) {
        return null
      }
      throw error
    }
  }

  const checkIn = async () => {
    const nextCredits = await checkInToday()
    setCredits(nextCredits)
    return nextCredits
  }

  useEffect(() => {
    if (!token) {
      setUser(null)
      setCredits(null)
      setProfileLoading(false)
      return
    }

    let cancelled = false
    setProfileLoading(true)
    getCurrentUser()
      .then((profile) => {
        if (cancelled) return
        applyProfile(profile)
        void refreshCredits().catch(() => undefined)
      })
      .catch(() => {
        if (cancelled) return
        setUser(null)
        setCredits(null)
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
    credits,
    profileLoading,
    refreshProfile,
    refreshCredits,
    checkIn,
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
      setCredits(null)
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
