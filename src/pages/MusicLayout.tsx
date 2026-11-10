import { Suspense, lazy, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { useMusicBrowse } from '../context/MusicPlayerContext'
import MusicWorkspace from '../features/music/MusicWorkspace'
import MusicLiquidBackdrop from '../components/MusicLiquidBackdrop'
import { useMusicAppearance } from '../utils/musicAppearance'
import '../styles/music.css'
import '../styles/music-promo.css'
import '../styles/music-studio.css'
import '../styles/music-liquid.css'
const MusicPlayerBar = lazy(() => import('../components/MusicPlayerBar'))
export default function MusicLayout() {
  const { current } = useMusicBrowse()
  const appearance = useMusicAppearance()
  useEffect(() => {
    const root = document.documentElement
    root.dataset.musicMotion = appearance.motion ? 'on' : 'off'
    root.dataset.musicLiquid = appearance.liquid ? 'on' : 'off'
  }, [appearance.motion, appearance.liquid])
  return <div className="music-page music-studio music-liquid">
    <MusicLiquidBackdrop />
    <MusicWorkspace><main className={`music-body${current ? ' music-body--with-player' : ''}`} aria-label="音乐内容"><Outlet/></main></MusicWorkspace>
    <Suspense fallback={null}><MusicPlayerBar/></Suspense>
  </div>
}
