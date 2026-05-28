import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { NavLink as RouterNavLink, useLocation } from 'react-router-dom'

interface TopbarNavItem {
  to: string
  label: string
  end?: boolean
}

const NAV_ITEMS: TopbarNavItem[] = [
  { to: '/', label: '导航', end: true },
  { to: '/music', label: '音乐' },
  { to: '/ai-chat', label: 'AI对话' },
  { to: '/ai-image', label: 'AI生图' },
]

function getActiveIndex(pathname: string, items: TopbarNavItem[]) {
  return Math.max(
    items.findIndex((item) => {
      if (item.end) return pathname === item.to
      return pathname === item.to || pathname.startsWith(`${item.to}/`)
    }),
    0,
  )
}

export default function TopbarNav() {
  const location = useLocation()
  const navRef = useRef<HTMLElement | null>(null)
  const linkRefs = useRef<Array<HTMLAnchorElement | null>>([])
  const activeIndex = useMemo(() => getActiveIndex(location.pathname, NAV_ITEMS), [location.pathname])
  const [indicator, setIndicator] = useState({ left: 6, width: 88, ready: false })

  useLayoutEffect(() => {
    const nav = navRef.current
    const link = linkRefs.current[activeIndex]
    if (!nav || !link) return

    const updateIndicator = () => {
      const navRect = nav.getBoundingClientRect()
      const linkRect = link.getBoundingClientRect()
      setIndicator({
        left: linkRect.left - navRect.left,
        width: linkRect.width,
        ready: true,
      })
    }

    updateIndicator()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateIndicator)
      return () => window.removeEventListener('resize', updateIndicator)
    }

    const observer = new ResizeObserver(updateIndicator)
    observer.observe(nav)
    observer.observe(link)
    return () => observer.disconnect()
  }, [activeIndex])

  return (
    <nav
      ref={navRef}
      className="topbar-nav"
      aria-label="主导航"
      style={{
        '--topbar-indicator-left': `${indicator.left}px`,
        '--topbar-indicator-width': `${indicator.width}px`,
      } as CSSProperties}
    >
      <span
        className={`topbar-nav__indicator${indicator.ready ? ' is-ready' : ''}`}
        aria-hidden="true"
      />
      {NAV_ITEMS.map((item, index) => (
        <RouterNavLink
          key={item.to}
          ref={(element) => {
            linkRefs.current[index] = element
          }}
          to={item.to}
          end={item.end}
          viewTransition
          className={({ isActive, isTransitioning }) =>
            [
              'topbar-nav__link',
              isActive ? 'is-active' : '',
              isTransitioning ? 'is-transitioning' : '',
            ]
              .filter(Boolean)
              .join(' ')
          }
        >
          <span className="topbar-nav__label">{item.label}</span>
        </RouterNavLink>
      ))}
    </nav>
  )
}
