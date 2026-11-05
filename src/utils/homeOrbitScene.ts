import {
  BufferGeometry, Float32BufferAttribute, Group, LineBasicMaterial, LineLoop,
  MathUtils, Mesh, MeshBasicMaterial, PerspectiveCamera, Points, PointsMaterial,
  Scene, SphereGeometry, TorusGeometry, Vector3, WebGLRenderer,
} from 'three'

export interface OrbitPalette {
  accent: string
  warm: string
  background: string
}

export interface HomeOrbitScene {
  setRunning: (running: boolean) => void
  setPalette: (palette: OrbitPalette) => void
  dispose: () => void
}

/** A single, lazily loaded scene. No React updates occur inside the render loop. */
export function createHomeOrbitScene(
  host: HTMLElement,
  interaction: HTMLButtonElement,
  palette: OrbitPalette,
  onUnavailable: () => void,
): HomeOrbitScene | null {
  const canvas = document.createElement('canvas')
  const compact = window.matchMedia('(pointer: coarse)').matches
  const context = canvas.getContext('webgl2', { alpha: true, antialias: !compact, powerPreference: 'low-power' })
  if (!context) return null

  const renderer = new WebGLRenderer({ canvas, context, alpha: true, antialias: !compact })
  const scene = new Scene()
  const camera = new PerspectiveCamera(34, 1, 0.1, 30)
  camera.position.z = 7.4
  const world = new Group()
  world.rotation.set(0.2, -0.3, -0.22)
  scene.add(world)

  const geometries = new Set<BufferGeometry>()
  const materials = new Set<LineBasicMaterial | MeshBasicMaterial | PointsMaterial>()
  const removers: (() => void)[] = []
  let frame = 0
  let running = false
  let disposed = false
  let lastTime = 0
  let elapsed = 0
  let pulseAge = 10
  let resizeObserver: ResizeObserver | undefined

  function dispose() {
    if (disposed) return
    disposed = true
    cancelAnimationFrame(frame)
    resizeObserver?.disconnect()
    removers.forEach(remove => remove())
    geometries.forEach(geometry => geometry.dispose())
    materials.forEach(material => material.dispose())
    renderer.dispose()
    renderer.forceContextLoss()
    canvas.remove()
  }

  function geometry<T extends BufferGeometry>(value: T): T {
    geometries.add(value)
    return value
  }

  function material<T extends LineBasicMaterial | MeshBasicMaterial | PointsMaterial>(value: T): T {
    materials.add(value)
    return value
  }

  function listen<K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, handler: (event: HTMLElementEventMap[K]) => void) {
    target.addEventListener(type, handler)
    removers.push(() => target.removeEventListener(type, handler))
  }

  try {
    canvas.setAttribute('aria-hidden', 'true')
    renderer.setClearColor(0x000000, 0)
    host.append(canvas)

    const gridMaterial = material(new LineBasicMaterial({ color: palette.accent, transparent: true, opacity: 0.2 }))
    const orbitMaterial = material(new LineBasicMaterial({ color: palette.accent, transparent: true, opacity: 0.48 }))
    const warmMaterial = material(new MeshBasicMaterial({ color: palette.warm }))
    const nodeMaterial = material(new MeshBasicMaterial({ color: palette.accent }))
    const coreMaterial = material(new MeshBasicMaterial({ color: palette.background }))
    const pointMaterial = material(new PointsMaterial({ color: palette.accent, size: 0.024, transparent: true, opacity: 0.65 }))
    const pulseMaterial = material(new MeshBasicMaterial({ color: palette.warm, transparent: true, opacity: 0, depthWrite: false }))

    // The opaque core hides the back hemisphere, keeping the fine lines legible.
    world.add(new Mesh(geometry(new SphereGeometry(0.965, 32, 24)), coreMaterial))
    const globe = new Group()
    world.add(globe)
    function circle(radius: number, y = 0) {
      return Array.from({ length: 96 }, (_, index) => {
        const angle = index / 96 * Math.PI * 2
        return new Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius)
      })
    }
    for (let index = -3; index <= 3; index++) {
      const latitude = index * Math.PI / 8
      globe.add(new LineLoop(geometry(new BufferGeometry().setFromPoints(circle(Math.cos(latitude), Math.sin(latitude)))), gridMaterial))
    }
    for (let index = 0; index < 6; index++) {
      const meridian = new LineLoop(geometry(new BufferGeometry().setFromPoints(circle(1))), gridMaterial)
      meridian.rotation.set(Math.PI / 2, index * Math.PI / 6, 0)
      globe.add(meridian)
    }

    const positions: number[] = []
    const count = compact ? 170 : 300
    for (let index = 0; index < count; index++) {
      const y = 1 - 2 * (index + 0.5) / count
      const radius = Math.sqrt(1 - y * y)
      const angle = index * Math.PI * (3 - Math.sqrt(5))
      positions.push(Math.cos(angle) * radius * 1.015, y * 1.015, Math.sin(angle) * radius * 1.015)
    }
    globe.add(new Points(geometry(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3))), pointMaterial))

    const nodeGeometry = geometry(new SphereGeometry(0.047, 12, 8))
    const orbits = [1.32, 1.61].map((radius, index) => {
      const orbit = new Group()
      orbit.rotation.set(0.35 + index * 0.8, 0, 0.25 - index * 0.55)
      orbit.add(new LineLoop(geometry(new BufferGeometry().setFromPoints(circle(radius))), orbitMaterial))
      const node = new Mesh(nodeGeometry, index ? warmMaterial : nodeMaterial)
      orbit.add(node)
      world.add(orbit)
      return { node, radius, offset: index * 2.6 }
    })
    const pulse = new Mesh(geometry(new TorusGeometry(1.04, 0.009, 6, 96)), pulseMaterial)
    pulse.rotation.x = Math.PI / 2
    world.add(pulse)

    let pointerX = 0
    let pointerY = 0
    let rotationX = 0.2
    let rotationY = -0.3
    let dragging = false
    let moved = false
    let lastX = 0
    let lastY = 0
    let dragDistance = 0

    function render() {
      if (disposed) return
      try {
        renderer.render(scene, camera)
      } catch {
        dispose()
        onUnavailable()
      }
    }

    function tick(now: number) {
      frame = 0
      if (!running || disposed) return
      const delta = Math.min((now - lastTime) / 1000, 0.05)
      lastTime = now
      elapsed += delta
      pulseAge += delta
      const ease = 1 - Math.exp(-delta * 6)
      world.rotation.x = MathUtils.lerp(world.rotation.x, rotationX + pointerY * 0.12, ease)
      world.rotation.y = MathUtils.lerp(world.rotation.y, rotationY + pointerX * 0.2, ease)
      globe.rotation.y += delta * 0.075
      world.position.y = Math.sin(elapsed * 0.65) * 0.045
      orbits.forEach(({ node, radius, offset }) => {
        const angle = elapsed * 0.22 + offset
        node.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
      })
      pulse.visible = pulseAge < 1.5
      if (pulse.visible) {
        pulse.scale.setScalar(1 + pulseAge * 0.85)
        pulseMaterial.opacity = Math.max(0, 0.65 * (1 - pulseAge / 1.5))
      }
      render()
      if (!disposed) frame = requestAnimationFrame(tick)
    }

    function resize() {
      const { width, height } = host.getBoundingClientRect()
      if (!width || !height || disposed) return
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compact ? 1.25 : 1.75))
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      render()
    }

    listen(interaction, 'pointerdown', event => {
      if (!running || !event.isPrimary || event.button !== 0) return
      dragging = true
      moved = false
      dragDistance = 0
      lastX = event.clientX
      lastY = event.clientY
      interaction.setPointerCapture(event.pointerId)
    })
    listen(interaction, 'pointermove', event => {
      if (!running || !event.isPrimary) return
      const bounds = interaction.getBoundingClientRect()
      pointerX = MathUtils.clamp((event.clientX - bounds.left) / bounds.width * 2 - 1, -1, 1)
      pointerY = MathUtils.clamp((event.clientY - bounds.top) / bounds.height * 2 - 1, -1, 1)
      if (dragging) {
        const dx = event.clientX - lastX
        const dy = event.clientY - lastY
        dragDistance += Math.abs(dx) + Math.abs(dy)
        moved = dragDistance > 5
        rotationY += dx * 0.008
        rotationX = MathUtils.clamp(rotationX + dy * 0.005, -0.65, 0.65)
        lastX = event.clientX
        lastY = event.clientY
      }
    })
    const release = () => { dragging = false }
    listen(interaction, 'pointerup', release)
    listen(interaction, 'pointercancel', release)
    listen(interaction, 'lostpointercapture', release)
    listen(interaction, 'pointerleave', () => { pointerX = 0; pointerY = 0 })
    listen(interaction, 'click', event => {
      if (running && (!moved || event.detail === 0)) pulseAge = 0
      moved = false
    })
    listen(interaction, 'keydown', event => {
      if (!running || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
      event.preventDefault()
      if (event.key === 'ArrowLeft') rotationY -= 0.3
      if (event.key === 'ArrowRight') rotationY += 0.3
      if (event.key === 'ArrowUp') rotationX = Math.max(-0.65, rotationX - 0.2)
      if (event.key === 'ArrowDown') rotationX = Math.min(0.65, rotationX + 0.2)
    })
    const onContextLost = () => {
      dispose()
      onUnavailable()
    }
    canvas.addEventListener('webglcontextlost', onContextLost)
    removers.push(() => canvas.removeEventListener('webglcontextlost', onContextLost))

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(host)
    } else {
      window.addEventListener('resize', resize)
      removers.push(() => window.removeEventListener('resize', resize))
    }
    resize()
    if (disposed) return null

    return {
      setRunning(next) {
        running = next
        if (!next) {
          cancelAnimationFrame(frame)
          frame = 0
          dragging = false
        } else if (!frame && !disposed) {
          lastTime = performance.now()
          frame = requestAnimationFrame(tick)
        }
      },
      setPalette(next) {
        gridMaterial.color.set(next.accent)
        orbitMaterial.color.set(next.accent)
        nodeMaterial.color.set(next.accent)
        pointMaterial.color.set(next.accent)
        warmMaterial.color.set(next.warm)
        pulseMaterial.color.set(next.warm)
        coreMaterial.color.set(next.background)
        render()
      },
      dispose,
    }
  } catch (error) {
    dispose()
    throw error
  }
}
