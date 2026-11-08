import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from 'react'

export type ThemeMode = 'light' | 'dark'

export const THEME_MODES: ThemeMode[] = ['light', 'dark']

interface ThemeState {
  mode: ThemeMode
  toggle: () => void
  setMode: (m: ThemeMode) => void
}

const Ctx = createContext<ThemeState | null>(null)
const KEY = 'nav.theme'
const DEFAULT_MODE: ThemeMode = 'light'

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark'
}

function getInitial(): ThemeMode {
  try {
    const saved = localStorage.getItem(KEY)
    return isThemeMode(saved) ? saved : DEFAULT_MODE
  } catch {
    return DEFAULT_MODE
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(getInitial)

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', mode)
    try {
      localStorage.setItem(KEY, mode)
    } catch {
      // The selected theme still works when browser storage is unavailable.
    }
  }, [mode])

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === KEY || event.key === null) setModeState(getInitial())
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

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
