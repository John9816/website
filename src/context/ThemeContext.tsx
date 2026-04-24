import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type Mode = 'light' | 'dark'

interface ThemeState {
  mode: Mode
  toggle: () => void
  setMode: (m: Mode) => void
}

const Ctx = createContext<ThemeState | null>(null)
const KEY = 'nav.theme'

function getInitial(): Mode {
  const saved = localStorage.getItem(KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(getInitial)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode)
    localStorage.setItem(KEY, mode)
  }, [mode])

  const value: ThemeState = {
    mode,
    setMode: setModeState,
    toggle: () => setModeState((m) => (m === 'dark' ? 'light' : 'dark')),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTheme() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useTheme must be used within ThemeProvider')
  return v
}
