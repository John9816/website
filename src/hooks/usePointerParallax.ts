import { useEffect, useRef } from 'react'

type ParallaxOptions = {
  /** 归一化坐标最大绝对值，默认 1 */
  clamp?: number
  /** 阻尼系数 0-1，越大跟随越快，默认 0.09 */
  ease?: number
}

/**
 * 鼠标视差：把容器内的指针位置归一化写入 CSS 变量 --px / --py（约 -1..1），
 * 供后代装饰元素分层使用。用 rAF + 阻尼插值，静止时自动停帧；触屏、无精确指针、
 * 减少动效时自动停用，运行时偏好切换也会归零。
 */
export function usePointerParallax<T extends HTMLElement>({ clamp = 1, ease = 0.09 }: ParallaxOptions = {}) {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')
    const disabled = () => reduceMotion.matches || !finePointer.matches

    let targetX = 0
    let targetY = 0
    let currentX = 0
    let currentY = 0
    let raf = 0

    const tick = () => {
      currentX += (targetX - currentX) * ease
      currentY += (targetY - currentY) * ease
      el.style.setProperty('--px', currentX.toFixed(4))
      el.style.setProperty('--py', currentY.toFixed(4))
      const moving =
        Math.abs(targetX - currentX) > 0.0005 ||
        Math.abs(targetY - currentY) > 0.0005
      raf = moving ? requestAnimationFrame(tick) : 0
    }
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(tick)
    }
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || disabled()) return
      const rect = el.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const nx = ((event.clientX - rect.left) / rect.width - 0.5) * 2
      const ny = ((event.clientY - rect.top) / rect.height - 0.5) * 2
      targetX = Math.max(-clamp, Math.min(clamp, nx))
      targetY = Math.max(-clamp, Math.min(clamp, ny))
      kick()
    }
    const onLeave = () => {
      targetX = 0
      targetY = 0
      kick()
    }
    const onPreferenceChange = () => {
      if (!disabled()) return
      targetX = 0
      targetY = 0
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      el.style.setProperty('--px', '0')
      el.style.setProperty('--py', '0')
    }

    el.style.setProperty('--px', '0')
    el.style.setProperty('--py', '0')
    el.addEventListener('pointermove', onMove, { passive: true })
    el.addEventListener('pointerleave', onLeave)
    reduceMotion.addEventListener('change', onPreferenceChange)
    finePointer.addEventListener('change', onPreferenceChange)

    return () => {
      if (raf) cancelAnimationFrame(raf)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
      reduceMotion.removeEventListener('change', onPreferenceChange)
      finePointer.removeEventListener('change', onPreferenceChange)
      el.style.removeProperty('--px')
      el.style.removeProperty('--py')
    }
  }, [clamp, ease])

  return ref
}
