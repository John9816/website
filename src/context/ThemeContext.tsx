import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type ThemeMode = 'image' | 'light' | 'dark'

export const THEME_MODES: ThemeMode[] = ['image', 'light', 'dark']

interface ThemeState {
  mode: ThemeMode
  toggle: () => void
  setMode: (m: ThemeMode) => void
}

const Ctx = createContext<ThemeState | null>(null)
const KEY = 'nav.theme'

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'image' || value === 'light' || value === 'dark'
}

function getInitial(): ThemeMode {
  const saved = localStorage.getItem(KEY)
  if (isThemeMode(saved)) return saved
  return 'image'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(getInitial)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode)
    localStorage.setItem(KEY, mode)
  }, [mode])

  const value: ThemeState = {
    mode,
    setMode: setModeState,
    toggle: () =>
      setModeState((current) => {
        const currentIndex = THEME_MODES.indexOf(current)
        return THEME_MODES[(currentIndex + 1) % THEME_MODES.length]
      }),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTheme() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useTheme must be used within ThemeProvider')
  return v
}
