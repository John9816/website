import { useEffect, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import {
  BookOpen,
  Compass,
  Image as ImageIcon,
  LogIn,
  MessageSquare,
  Moon,
  Music2,
  Sun,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { siteImages } from '../utils/siteImages'
import TopbarUserMenu from './TopbarUserMenu'
import '../styles/app-shell.css'

/**
 * 全局应用外壳：一个产品，两种形态。
 * - PC（>900px）：左侧空间栏 Rail（图标 + 微标签）
 * - H5（≤900px）：顶部精简头 + 底部标签栏
 * 沉浸式空间（/music）在 H5 下隐藏外壳，保留其自身的移动导航。
 */

const SPACES = [
  { to: '/', label: '导航', Icon: Compass, end: true },
  { to: '/music', label: '音乐', Icon: Music2, end: false },
  { to: '/ai-chat', label: 'AI 对话', Icon: MessageSquare, end: false },
  { to: '/ai-image', label: 'AI 生图', Icon: ImageIcon, end: false },
  { to: '/editor/', label: '文档', Icon: BookOpen, end: false },
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

function ThemeCycleButton({ className }: { className: string }) {
  const { mode, toggle } = useTheme()
  const dark = mode === 'dark'
  return (
    <button
      type="button"
      className={className}
      aria-label={dark ? '切换到白天模式' : '切换到黑夜模式'}
      title={dark ? '白天模式' : '黑夜模式'}
      onClick={toggle}
    >
      {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    </button>
  )
}

export default function AppShell({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const location = useLocation()
  // 沉浸式空间（音乐）在 H5 下使用自己的移动导航，外壳只提供 PC 空间栏
  const immersiveMobile = location.pathname.startsWith('/music')

  // 供全局浮层（如音乐坞）感知外壳/标签栏的存在，避让底部空间
  useEffect(() => {
    document.body.classList.add('has-app-shell')
    if (!immersiveMobile) document.body.classList.add('has-app-tabbar')
    return () => {
      document.body.classList.remove('has-app-shell')
      document.body.classList.remove('has-app-tabbar')
    }
  }, [immersiveMobile])

  const loginState = { from: `${location.pathname}${location.search}` }

  return (
    <div className={`app-shell${immersiveMobile ? ' app-shell--immersive-mobile' : ''}`}>
      {/* PC：左侧空间栏 */}
      <aside className="app-shell__rail" aria-label="空间导航">
        <Link to="/" className="app-shell__brand" aria-label="oldwang 首页">
          <img src={siteImages.logo.url} alt="" width={34} height={34} />
        </Link>
        <nav className="app-shell__rail-nav" aria-label="主导航">
          {SPACES.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onPointerEnter={() => preloadRoute(to)}
              onFocus={() => preloadRoute(to)}
              className={({ isActive }) =>
                `app-shell__rail-item${isActive ? ' is-active' : ''}`
              }
            >
              <Icon size={20} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="app-shell__rail-bottom">
          <ThemeCycleButton className="app-shell__icon-btn" />
          {auth.token ? (
            <TopbarUserMenu />
          ) : (
            <Link
              to="/login"
              state={loginState}
              className="app-shell__icon-btn"
              aria-label="登录"
              title="登录"
            >
              <LogIn size={18} aria-hidden="true" />
            </Link>
          )}
        </div>
      </aside>

      {/* H5：顶部精简头 */}
      <header className="app-shell__topbar">
        <Link to="/" className="app-shell__topbar-brand" aria-label="oldwang 首页">
          <img src={siteImages.logo.url} alt="" width={28} height={28} />
          <span>
            oldwang<span className="app-shell__brand-period">.</span>
          </span>
        </Link>
        <div className="app-shell__topbar-actions">
          <ThemeCycleButton className="app-shell__icon-btn" />
          {auth.token ? (
            <TopbarUserMenu />
          ) : (
            <Link to="/login" state={loginState} className="app-shell__topbar-login">
              <LogIn size={15} aria-hidden="true" />
              <span>登录</span>
            </Link>
          )}
        </div>
      </header>

      {/* 内容区 */}
      <div className="app-shell__content">{children}</div>

      {/* H5：底部标签栏 */}
      <nav className="app-shell__tabbar" aria-label="主导航">
        {SPACES.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onPointerEnter={() => preloadRoute(to)}
            className={({ isActive }) =>
              `app-shell__tab${isActive ? ' is-active' : ''}`
            }
          >
            <Icon size={21} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
