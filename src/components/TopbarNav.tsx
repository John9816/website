import { Compass, Image, MessageSquare, Music2 } from 'lucide-react'
import { NavLink } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/', label: '导航', Icon: Compass, end: true },
  { to: '/music', label: '音乐', Icon: Music2 },
  { to: '/ai-chat', label: 'AI 对话', Icon: MessageSquare },
  { to: '/ai-image', label: 'AI 生图', Icon: Image },
]

const preloaders: Record<string, () => Promise<unknown>> = {
  '/': () => import('../pages/HomePage'),
  '/music': () => Promise.all([import('../pages/MusicLayout'), import('../pages/MusicPage')]),
  '/ai-chat': () => import('../pages/AiChatPage'),
  '/ai-image': () => import('../pages/AiImagePage'),
}
const preloadedRoutes = new Set<string>()

function preloadRoute(to: string) {
  if (preloadedRoutes.has(to)) return
  const preload = preloaders[to]
  if (!preload) return
  preloadedRoutes.add(to)
  void preload().catch(() => preloadedRoutes.delete(to))
}

export default function TopbarNav() {
  return (
    <nav className="topbar-nav" aria-label="主导航">
      {NAV_ITEMS.map(({ to, label, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onPointerEnter={() => preloadRoute(to)}
          onFocus={() => preloadRoute(to)}
          className={({ isActive }) => `topbar-nav__link${isActive ? ' is-active' : ''}`}
        >
          <Icon size={17} aria-hidden="true" />
          <span className="topbar-nav__label">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
