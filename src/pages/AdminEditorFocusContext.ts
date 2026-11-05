import { createContext } from 'react'

type AdminEditorFocusSetter = (focused: boolean) => void

export const AdminEditorFocusContext = createContext<AdminEditorFocusSetter | null>(null)
