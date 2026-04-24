import { Link as RouterLink, Outlet } from 'react-router-dom'
import { Home as HomeIcon, Music2, Settings } from 'lucide-react'
import ThemeToggle from '../components/ThemeToggle'
import MusicPlayerBar from '../components/MusicPlayerBar'
import { useMusicPlayer } from '../context/MusicPlayerContext'
import '../styles/music.css'

export default function MusicLayout() {
  const { current } = useMusicPlayer()

  return (
    <div className="music-page">
      <header className="music-header">
        <h1 className="brand-title">
          <span className="brand-icon">
            <Music2 size={18} />
          </span>
          音乐中心
        </h1>
        <div className="header-actions">
          <ThemeToggle />
          <RouterLink to="/admin" className="music-back">
            <Settings size={16} />
            <span>管理</span>
          </RouterLink>
          <RouterLink to="/" className="music-back">
            <HomeIcon size={16} />
            <span>返回首页</span>
          </RouterLink>
        </div>
      </header>

      <div className={`music-body ${current ? 'music-body--with-player' : ''}`}>
        <Outlet />
      </div>

      <MusicPlayerBar />
    </div>
  )
}
