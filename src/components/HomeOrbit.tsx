import { useEffect, useId, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import type { HomeOrbitScene, OrbitPalette } from '../utils/homeOrbitScene'
import '../styles/home-orbit.css'

function readPalette(host: HTMLElement): OrbitPalette {
  const style = getComputedStyle(host)
  return {
    accent: style.getPropertyValue('--accent').trim(),
    warm: style.getPropertyValue('--accent-warm').trim(),
    background: style.getPropertyValue('--bg').trim(),
  }
}

export default function HomeOrbit() {
  const { mode } = useTheme()
  const hostRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const sceneRef = useRef<HomeOrbitScene | null>(null)
  const syncRef = useRef<() => void>(() => {})
  const pausedRef = useRef(false)
  const [paused, setPaused] = useState(false)
  const [ready, setReady] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const hintId = useId()

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    // Older Safari supports matchMedia but only provides addListener.
    if (media.addEventListener) media.addEventListener('change', update)
    else media.addListener(update)
    return () => {
      if (media.removeEventListener) media.removeEventListener('change', update)
      else media.removeListener(update)
    }
  }, [])

  useEffect(() => {
    setReady(false)
    const host = hostRef.current
    const button = buttonRef.current
    if (!host || !button || reducedMotion) return
    let cancelled = false
    let loading = false
    let inView = false
    let scene: HomeOrbitScene | null = null

    const sync = () => scene?.setRunning(inView && !document.hidden && !pausedRef.current)
    syncRef.current = sync
    // Defer the 129KB scene bundle until the browser is idle, so it does not
    // compete with the HTML/CSS/entry JS on the first-screen critical path.
    // IntersectionObserver still gates *whether* to load; idle only decides
    // *when*. An absolute fallback timer is always armed: requestIdleCallback
    // may never fire in headless browsers, background tabs, or on a
    // continuously busy main thread, and relying on it alone silently drops
    // the 3D scene. Whichever path runs first cancels the other.
    let idleHandle: number | undefined
    let fallbackTimer: number | undefined
    const scheduleLoad = () => {
      if (loading || cancelled) return
      const run = () => {
        cancelScheduled()
        if (!cancelled) void load()
      }
      const ric = (window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
        cancelIdleCallback?: (handle: number) => void
      }).requestIdleCallback
      if (typeof ric === 'function') {
        idleHandle = ric(run, { timeout: 2500 })
      }
      fallbackTimer = window.setTimeout(run, 1500)
    }
    const cancelScheduled = () => {
      const cancelRic = (window as Window & {
        cancelIdleCallback?: (handle: number) => void
      }).cancelIdleCallback
      if (idleHandle !== undefined && typeof cancelRic === 'function') cancelRic(idleHandle)
      if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer)
      idleHandle = undefined
      fallbackTimer = undefined
    }
    const load = async () => {
      if (loading || cancelled) return
      loading = true
      try {
        const { createHomeOrbitScene } = await import('../utils/homeOrbitScene')
        if (cancelled) return
        scene = createHomeOrbitScene(host, button, readPalette(host), () => {
          if (!cancelled) setReady(false)
        })
        sceneRef.current = scene
        setReady(!!scene)
        sync()
      } catch {
        // Animation is optional: imports, GPU limits, and context loss must not break navigation.
        scene?.dispose()
        if (!cancelled) setReady(false)
      }
    }
    const observer = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(([entry]) => {
        inView = entry.isIntersecting
        if (inView) scheduleLoad()
        else cancelScheduled()
        sync()
      })
      : null
    if (observer) observer.observe(host)
    else { inView = true; scheduleLoad() }
    document.addEventListener('visibilitychange', sync)

    return () => {
      cancelled = true
      cancelScheduled()
      observer?.disconnect()
      document.removeEventListener('visibilitychange', sync)
      scene?.dispose()
      sceneRef.current = null
      syncRef.current = () => {}
    }
  }, [reducedMotion])

  useEffect(() => {
    pausedRef.current = paused
    syncRef.current()
  }, [paused])

  useEffect(() => {
    // Read after ThemeProvider has applied its data-theme attribute.
    const frame = requestAnimationFrame(() => {
      if (hostRef.current) sceneRef.current?.setPalette(readPalette(hostRef.current))
    })
    return () => cancelAnimationFrame(frame)
  }, [mode])

  return (
    <div className={`home-orbit${ready ? ' is-ready' : ''}`}>
      <div className="home-orbit__stage">
        <div className="home-orbit__fallback" aria-hidden="true">
          <span className="home-orbit__globe" />
          <span className="home-orbit__ring home-orbit__ring--one" />
          <span className="home-orbit__ring home-orbit__ring--two" />
          <span className="home-orbit__satellite" />
        </div>
        <div ref={hostRef} className="home-orbit__canvas" aria-hidden="true" />
        <button
          ref={buttonRef}
          type="button"
          className="home-orbit__interaction"
          aria-label="互动导航星球：方向键旋转，回车或空格触发光环"
          aria-describedby={hintId}
          disabled={!ready || paused}
        />
      </div>
      <div className="home-orbit__footer">
        <span id={hintId} className="home-orbit__hint">
          {ready ? paused ? '让灵感停留片刻' : '拖动旋转 · 点击泛起涟漪' : '让灵感，在这里相连'}
        </span>
        {ready && (
          <button
            type="button"
            className="home-orbit__toggle"
            aria-label={paused ? '播放首页动画' : '暂停首页动画'}
            onClick={() => setPaused(value => !value)}
          >
            {paused ? <Play size={12} aria-hidden="true" /> : <Pause size={12} aria-hidden="true" />}
          </button>
        )}
      </div>
    </div>
  )
}
