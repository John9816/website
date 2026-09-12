export function installViewportMetrics() {
  let frame = 0

  const update = () => {
    window.cancelAnimationFrame(frame)
    frame = window.requestAnimationFrame(() => {
      const viewport = window.visualViewport
      const height = Math.round(viewport?.height || window.innerHeight)
      document.documentElement.style.setProperty('--app-height', `${height}px`)
    })
  }

  update()
  window.addEventListener('resize', update, { passive: true })
  window.addEventListener('orientationchange', update, { passive: true })
  window.visualViewport?.addEventListener('resize', update, { passive: true })
  window.visualViewport?.addEventListener('scroll', update, { passive: true })
}
