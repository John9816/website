import { useEffect, useState } from 'react'

const KEY_LIQUID = 'music.appearance.liquid'
const KEY_MOTION = 'music.appearance.motion'
const CHANGE_EVENT = 'music:appearance-change'

const ON_OFF = ['on', 'off'] as const

function readEnum<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  try {
    const value = localStorage.getItem(key)
    return allowed.includes(value as T) ? (value as T) : fallback
  } catch {
    return fallback
  }
}

function persist(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // 隐私模式下仍可用，只是不跨会话保留
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { key, value } }))
}

export const getLiquidEnabled = () =>
  readEnum(KEY_LIQUID, ON_OFF, 'on') === 'on'
export const setLiquidEnabled = (value: boolean) =>
  persist(KEY_LIQUID, value ? 'on' : 'off')

export const getMotionEnabled = () =>
  readEnum(KEY_MOTION, ON_OFF, 'on') === 'on'
export const setMotionEnabled = (value: boolean) =>
  persist(KEY_MOTION, value ? 'on' : 'off')

type AppearanceState = {
  liquid: boolean
  motion: boolean
}

export type MusicAppearance = AppearanceState & {
  setLiquid: (value: boolean) => void
  setMotion: (value: boolean) => void
}

function snapshot(): AppearanceState {
  return {
    liquid: getLiquidEnabled(),
    motion: getMotionEnabled(),
  }
}

/** 轻量跨组件共享：localStorage + 自定义事件，不引入额外 Provider。 */
export function useMusicAppearance(): MusicAppearance {
  const [state, setState] = useState<AppearanceState>(snapshot)

  useEffect(() => {
    const sync = () => setState(snapshot())
    window.addEventListener(CHANGE_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  return {
    ...state,
    setLiquid: setLiquidEnabled,
    setMotion: setMotionEnabled,
  }
}
