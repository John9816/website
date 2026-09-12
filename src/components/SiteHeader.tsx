import { forwardRef } from 'react'
import { LogIn } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { siteImages } from '../utils/siteImages'
import ThemeToggle from './ThemeToggle'
import TopbarNav from './TopbarNav'
import TopbarUserMenu from './TopbarUserMenu'
import '../styles/topbar.css'

const SiteHeader = forwardRef<HTMLElement, { className?: string }>(function SiteHeader(
  { className = '' },
  ref,
) {
  const auth = useAuth()
  const location = useLocation()

  return (
    <header ref={ref} className={`topbar site-header ${className}`.trim()}>
      <Link to="/" className="topbar-brand" aria-label="oldwang 首页">
        <img src={siteImages.logo.url} alt="" width={34} height={34} />
        <span>oldwang<span className="topbar-brand__period">.</span></span>
      </Link>
      <TopbarNav />
      <div className="topbar-actions" aria-label="站点操作">
        <ThemeToggle />
        {auth.token ? <TopbarUserMenu /> : (
          <Link
            to="/login"
            className="topbar-action"
            state={{ from: `${location.pathname}${location.search}` }}
          >
            <LogIn size={16} aria-hidden="true" />
            <span>登录</span>
          </Link>
        )}
      </div>
    </header>
  )
})

export default SiteHeader
