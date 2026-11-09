import { Suspense, lazy } from 'react'
import { Outlet } from 'react-router-dom'
import { useMusicBrowse } from '../context/MusicPlayerContext'
import MusicWorkspace from '../features/music/MusicWorkspace'
import '../styles/music.css'
import '../styles/music-promo.css'
import '../styles/music-studio.css'
const MusicPlayerBar = lazy(() => import('../components/MusicPlayerBar'))
export default function MusicLayout() {
  const { current } = useMusicBrowse()
  return <div className="music-page music-studio">
    <MusicWorkspace><main className={`music-body${current ? ' music-body--with-player' : ''}`} aria-label="音乐内容"><Outlet/></main></MusicWorkspace>
    <Suspense fallback={null}><MusicPlayerBar/></Suspense>
  </div>
}
