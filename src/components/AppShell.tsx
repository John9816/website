import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { LogIn, Moon, Sun } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { getTabVisibility } from '../api/public'
import { APP_TABS, DEFAULT_TAB_VISIBILITY, parseTabVisibility } from '../constants/tabs'
import { siteImages } from '../utils/siteImages'
import TopbarUserMenu from './TopbarUserMenu'
import '../styles/app-shell.css'

/**
 * 全局应用外壳：一个产品，两种形态。
 * - PC（>900px）：顶部横栏（logo + 空间导航 + 账户区）
 * - H5（≤900px）：顶部精简头 + 底部标签栏
 * 沉浸式空间（音乐/文档）在 H5 下隐藏外壳 chrome，保留其自身移动导航。
 * Tab 显隐由管理员在系统配置中设置（公开读取，失败时全部显示）。
 */

const preloaders: Record<string, () => Promise<unknown>> = {
  '/': () => import('../pages/HomePage'),
  '/music': () => Promise.all([import('../pages/MusicLayout'), import('../pages/MusicPage')]),
  '/ai-chat': () => import('../pages/AiChatPage'),
  '/ai-image': () => import('../pages/AiImagePage'),
  '/server-monitor': () => import('../pages/ServerMonitorPage'),
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
  const [visibility, setVisibility] = useState<Record<string, boolean>>(DEFAULT_TAB_VISIBILITY)

  // 加载管理员配置的 tab 显隐；失败时保持默认全部显示
  useEffect(() => {
    let alive = true
    getTabVisibility()
      .then((raw) => { if (alive) setVisibility(parseTabVisibility(raw)) })
      .catch(() => { /* 网络/接口异常时维持默认全显示 */ })
    return () => { alive = false }
  }, [])

  const visibleTabs = APP_TABS.filter((tab) => visibility[tab.id] !== false)

  // 沉浸式空间（音乐/文档）在 H5 下使用自己的移动导航，外壳只提供 PC 顶部栏
  const immersiveMobile = location.pathname.startsWith('/music')
    || location.pathname.startsWith('/editor')

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

  const topnav = (
    <nav className="app-shell__nav" aria-label="主导航">
      {visibleTabs.map(({ id, to, label, Icon, end }) => (
        <NavLink
          key={id}
          to={to}
          end={end}
          onPointerEnter={() => preloadRoute(to)}
          onFocus={() => preloadRoute(to)}
          className={({ isActive }) =>
            `app-shell__nav-item${isActive ? ' is-active' : ''}`
          }
        >
          <Icon size={17} aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )

  return (
    <div className={`app-shell${immersiveMobile ? ' app-shell--immersive-mobile' : ''}`}>
      {/* PC：顶部横栏 */}
      <header className="app-shell__topbar">
        <Link to="/" className="app-shell__brand" aria-label="oldwang 首页">
          <img src={siteImages.logo.url} alt="" width={34} height={34} />
          <span className="app-shell__brand-name">
            oldwang<span className="app-shell__brand-period">.</span>
          </span>
        </Link>

        {topnav}

        <div className="app-shell__topbar-actions">
          <ThemeCycleButton className="app-shell__icon-btn" />
          {auth.token ? (
            <TopbarUserMenu />
          ) : (
            <Link
              to="/login"
              state={loginState}
              className="app-shell__topbar-login"
              aria-label="登录"
            >
              <LogIn size={15} aria-hidden="true" />
              <span>登录</span>
            </Link>
          )}
        </div>
      </header>

      {/* H5：顶部精简头 */}
      <header className="app-shell__mobile-head">
        <Link to="/" className="app-shell__mobile-brand" aria-label="oldwang 首页">
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
            <Link to="/login" state={loginState} className="app-shell__icon-btn" aria-label="登录">
              <LogIn size={18} aria-hidden="true" />
            </Link>
          )}
        </div>
      </header>

      {/* 内容区 */}
      <div className="app-shell__content">{children}</div>

      {/* H5：底部标签栏 */}
      <nav className="app-shell__tabbar" aria-label="主导航">
        {visibleTabs.map(({ id, to, label, Icon, end }) => (
          <NavLink
            key={id}
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
