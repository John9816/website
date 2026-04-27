import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getToken, setToken } from '../api/client'

interface AuthState {
  token: string | null
  username: string | null
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

  useEffect(() => {
    const onStorage = () => {
      setTok(getToken())
      setUsername(localStorage.getItem(USER_KEY))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const value: AuthState = {
    token,
    username,
    login(t, u, tokenType) {
      setToken(t, tokenType)
      localStorage.setItem(USER_KEY, u)
      setTok(t)
      setUsername(u)
    },
    logout() {
      setToken(null)
      localStorage.removeItem(USER_KEY)
      setTok(null)
      setUsername(null)
    },
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used within AuthProvider')
  return v
}
