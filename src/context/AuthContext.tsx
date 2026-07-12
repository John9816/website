import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { checkInToday, getCurrentUser, getUserCredits } from '../api/auth'
import {
  ApiError,
  AUTH_CHANGE_EVENT,
  getStoredUsername,
  getToken,
  getTokenType,
  setAuthSession,
  setToken,
} from '../api/client'
import type { CurrentUserView, UserCreditView } from '../types'

interface AuthState {
  token: string | null
  username: string | null
  user: CurrentUserView | null
  credits: UserCreditView | null
  profileLoading: boolean
  refreshProfile: () => Promise<void>
  refreshCredits: () => Promise<UserCreditView | null>
  updateProfile: (profile: CurrentUserView) => void
  checkIn: () => Promise<UserCreditView>
  login: (token: string, username: string, tokenType?: string, profile?: CurrentUserView) => void
  logout: () => void
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTok] = useState<string | null>(() => getToken())
  const [username, setUsername] = useState<string | null>(() => getStoredUsername())
  const [user, setUser] = useState<CurrentUserView | null>(null)
  const [credits, setCredits] = useState<UserCreditView | null>(null)
  const [profileLoading, setProfileLoading] = useState(() => !!getToken())
  const authVersionRef = useRef(0)

  const applyProfile = (profile: CurrentUserView, expectedToken?: string | null) => {
    if (expectedToken !== undefined && getToken() !== expectedToken) {
      return
    }
    setUser(profile)
    setUsername(profile.username)
    const activeToken = getToken()
    if (activeToken) {
      setAuthSession(activeToken, getTokenType(), profile.username, { emit: false })
    }
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
      const nextToken = getToken()
      setTok((previousToken) => {
        if (previousToken !== nextToken) {
          authVersionRef.current += 1
          setUser(null)
          setCredits(null)
          setProfileLoading(!!nextToken)
        }
        return nextToken
      })
      setUsername(nextToken ? getStoredUsername() : null)
      if (!nextToken) {
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

    const requestToken = getToken()
    const requestVersion = authVersionRef.current
    setProfileLoading(true)
    try {
      const profile = await getCurrentUser(requestToken ?? undefined)
      if (authVersionRef.current === requestVersion) {
        applyProfile(profile, requestToken)
      }
    } finally {
      if (authVersionRef.current === requestVersion) {
        setProfileLoading(false)
      }
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

    const requestToken = token
    const requestVersion = authVersionRef.current
    let cancelled = false
    setProfileLoading(true)
    getCurrentUser(requestToken)
      .then((profile) => {
        if (cancelled || authVersionRef.current !== requestVersion) return
        applyProfile(profile, requestToken)
        void refreshCredits().catch(() => undefined)
      })
      .catch(() => {
        if (cancelled || authVersionRef.current !== requestVersion) return
        setUser(null)
        setCredits(null)
      })
      .finally(() => {
        if (!cancelled && authVersionRef.current === requestVersion) setProfileLoading(false)
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
    updateProfile: applyProfile,
    checkIn,
    login(t, u, tokenType, profile) {
      authVersionRef.current += 1
      setUser(null)
      setCredits(null)
      setProfileLoading(true)
      setAuthSession(t, tokenType, profile?.username ?? u, { emit: false })
      setTok(t)
      setUsername(profile?.username ?? u)
      if (profile) {
        applyProfile(profile, t)
        setProfileLoading(false)
      }
    },
    logout() {
      authVersionRef.current += 1
      setToken(null, 'Bearer', { emit: false })
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
