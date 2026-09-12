import { Suspense, lazy, useEffect, useRef } from 'react'
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom'
import { Download } from 'lucide-react'
import SiteHeader from '../components/SiteHeader'
import { useMusicPlayer } from '../context/MusicPlayerContext'
import '../styles/topbar.css'
import '../styles/music.css'
import '../styles/music-promo.css'

const MusicPlayerBar = lazy(() => import('../components/MusicPlayerBar'))

export default function MusicLayout() {
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
      <SiteHeader ref={topbarRef} />

      <div className={`music-body${current ? ' music-body--with-player' : ''}`}>
        <Outlet />
      </div>

      {showPromoLauncher ? (
        <RouterLink className="music-promo-launcher" to="/music/app">
          <Download size={16} />
          <span>下载 App</span>
        </RouterLink>
      ) : null}

      <Suspense fallback={null}>
        <MusicPlayerBar />
      </Suspense>
    </div>
  )
}
