import { Suspense, lazy, useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useMusicBrowse } from '../context/MusicPlayerContext'
import AppShell from '../components/AppShell'
import MusicWorkspace from '../features/music/MusicWorkspace'
import MusicContextPanel, { type MusicContextTab } from '../components/MusicContextPanel'
import { useMusicAppearance } from '../utils/musicAppearance'
import '../styles/music.css'
import '../styles/music-promo.css'
import '../styles/music-studio.css'
import '../styles/music-liquid.css'
import '../styles/music-v4.css'
// Apple Music 风独立深色皮肤：必须排在 music-v4.css 之后以覆盖浅色样式。
import '../styles/apple-music.css'

const MusicPlayerBar = lazy(() => import('../components/MusicPlayerBar'))

export default function MusicLayout() {
  const { current } = useMusicBrowse()
  const appearance = useMusicAppearance()
  // 右侧播放面板默认收起，不再按宽屏自动弹出；用户点底部播放条的队列按钮才展开。
  const [contextOpen, setContextOpen] = useState(false)
  const [contextTab, setContextTab] = useState<MusicContextTab>('now')

  useEffect(() => {
    const root = document.documentElement
    root.dataset.musicMotion = appearance.motion ? 'on' : 'off'
    root.dataset.musicLiquid = appearance.liquid ? 'on' : 'off'
  }, [appearance.motion, appearance.liquid])

  const toggleQueue = () => {
    if (contextOpen && contextTab === 'queue') {
      setContextOpen(false)
      return
    }
    setContextTab('queue')
    setContextOpen(true)
  }

  return (
    <AppShell>
      <div className={`music-page music-studio music-v4${current ? ' has-current' : ''}${current && contextOpen ? ' has-context' : ''}`}>
        <MusicWorkspace>
          <main className={`music-body${current ? ' music-body--with-player' : ''}`} aria-label="音乐内容"><Outlet /></main>
        </MusicWorkspace>
        <MusicContextPanel open={contextOpen} tab={contextTab} onTabChange={setContextTab} onClose={() => setContextOpen(false)} />
        <Suspense fallback={null}><MusicPlayerBar onToggleQueue={toggleQueue} queueOpen={contextOpen && contextTab === 'queue'} /></Suspense>
      </div>
    </AppShell>
  )
}
