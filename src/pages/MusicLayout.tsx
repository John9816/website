import { Suspense, lazy } from 'react'
import { Link as RouterLink, NavLink as RouterNavLink, Outlet } from 'react-router-dom'
import { LogIn, Settings } from 'lucide-react'
import ThemeToggle from '../components/ThemeToggle'
import { useAuth } from '../context/AuthContext'
import { useMusicPlayer } from '../context/MusicPlayerContext'
import '../styles/topbar.css'
import '../styles/music.css'

const MusicPlayerBar = lazy(() => import('../components/MusicPlayerBar'))

export default function MusicLayout() {
  const auth = useAuth()
  const { current } = useMusicPlayer()

  return (
    <div className="music-page">
      <header className="topbar">
        <RouterLink to="/" className="topbar-brand">
          <span className="brand-dot" />
          <span className="brand-title">我的导航</span>
        </RouterLink>

        <nav className="topbar-nav" aria-label="主导航">
          <RouterNavLink
            to="/"
            end
            className={({ isActive }) => `topbar-nav__link${isActive ? ' is-active' : ''}`}
          >
            导航
          </RouterNavLink>
          <RouterNavLink
            to="/music"
            className={({ isActive }) => `topbar-nav__link${isActive ? ' is-active' : ''}`}
          >
            音乐
          </RouterNavLink>
        </nav>

        <div className="topbar-actions">
          {auth.token ? (
            <RouterLink to="/admin" className="topbar-action">
              <Settings size={16} />
              <span>管理</span>
            </RouterLink>
          ) : (
            <RouterLink to="/login" className="topbar-action">
              <LogIn size={16} />
              <span>登录</span>
            </RouterLink>
          )}
          <ThemeToggle />
        </div>
      </header>

      <div className={`music-body ${current ? 'music-body--with-player' : ''}`}>
        <Outlet />
      </div>

      <Suspense fallback={null}>
        <MusicPlayerBar />
      </Suspense>
    </div>
  )
}
