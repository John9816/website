import type { ReactNode } from 'react'
import { KbContext } from './context'
import { useKb } from './hooks/useKb'

export function KbContextProvider({ children }: { children: ReactNode }) {
  const value = useKb()

  return <KbContext.Provider value={value}>{children}</KbContext.Provider>
}
