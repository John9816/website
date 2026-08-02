import { Suspense, lazy, useEffect, useRef } from 'react'
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom'
import { LogIn, Sparkles } from 'lucide-react'
import TopbarNav from '../components/TopbarNav'
import TopbarUserMenu from '../components/TopbarUserMenu'
import ThemeToggle from '../components/ThemeToggle'
import { useAuth } from '../context/AuthContext'
import { useMusicPlayer } from '../context/MusicPlayerContext'
import '../styles/topbar.css'
import '../styles/music.css'
import '../styles/music-promo.css'

const MusicPlayerBar = lazy(() => import('../components/MusicPlayerBar'))

export default function MusicLayout() {
  const auth = useAuth()
  const { current } = useMusicPlayer()
  const location = useLocation()
  const pageRef = useRef<HTMLDivElement | null>(null)
  const topbarRef = useRef<HTMLElement | null>(null)
  const showPromoLauncher = location.pathname !== '/music/app'

  useEffect(() => {
    const page = pageRef.current
    const topbar = topbarRef.current
    if (!page || !topbar) return

    const updateTopbarHeight = () => {
      page.style.setProperty('--music-topbar-height', `${topbar.offsetHeight}px`)
    }

    updateTopbarHeight()

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateTopbarHeight)
      observer.observe(topbar)
      return () => observer.disconnect()
    }

    window.addEventListener('resize', updateTopbarHeight)
    return () => window.removeEventListener('resize', updateTopbarHeight)
  }, [])

  return (
    <div ref={pageRef} className="music-page">
      <header ref={topbarRef} className="topbar">
        <RouterLink to="/" className="topbar-brand">
          <span className="brand-dot" />
          <span className="brand-title">oldwang</span>
        </RouterLink>

        <TopbarNav />

        <div className="topbar-actions">
          {!auth.token ? (
            <RouterLink to="/login" className="topbar-action">
              <LogIn size={16} />
              <span>登录</span>
            </RouterLink>
          ) : null}
          <ThemeToggle />
          {auth.token && <TopbarUserMenu />}
        </div>
      </header>

      <div className={`music-body${current ? ' music-body--with-player' : ''}`}>
        <Outlet />
      </div>

      {showPromoLauncher ? (
        <RouterLink className="music-promo-launcher" to="/music/app">
          <Sparkles size={16} />
          <span>下载 App</span>
        </RouterLink>
      ) : null}

      <Suspense fallback={null}>
        <MusicPlayerBar />
      </Suspense>
    </div>
  )
}
