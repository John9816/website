import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Button, Drawer } from 'antd'
import {
  ArrowLeft,
  ArrowUpRight,
  AudioLines,
  Download,
  Menu,
  Moon,
  Sun,
} from 'lucide-react'
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { MUSIC_VIEWS, isMusicView, type MusicView } from './navigation'
import { isMusicSourceId } from './sources'
import { musicToplist, qishuiDiscovery } from '../../api/music'
import MusicSearchInput from '../../components/MusicSearchInput'
import TopbarUserMenu from '../../components/TopbarUserMenu'
import '../../styles/topbar.css'
import BeianFooter from '../../components/BeianFooter'

export default function MusicWorkspace({ children }: { children: ReactNode }) {
  const location = useLocation(),
    navigate = useNavigate(),
    [params] = useSearchParams()
  const auth = useAuth(),
    theme = useTheme()
  const [menuOpen, setMenuOpen] = useState(false),
    [query, setQuery] = useState('')
  const searchRef = useRef<HTMLDivElement>(null)
  const view = isMusicView(params.get('view'))
    ? (params.get('view') as MusicView)
    : 'discover'
  const detail = location.pathname !== '/music'
  const source = isMusicSourceId(params.get('source'))
    ? (params.get('source')! as import('../../types').MusicSourceId)
    : 'qishui'
  useLayoutEffect(() => {
    setMenuOpen(false)
    setQuery(params.get('keyword') || params.get('q') || '')
  }, [location.key])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const editable =
        event.target instanceof HTMLElement &&
        (event.target.isContentEditable ||
          !!event.target.closest('input,textarea,select'))
      if (
        ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') ||
        (event.key === '/' && !editable)
      ) {
        event.preventDefault()
        searchRef.current?.querySelector('input')?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const go = (target: MusicView) => {
    navigate(`/music?view=${target}`)
    setMenuOpen(false)
  }
  const warm = (target: MusicView) => {
    if (!auth.token) return
    if (target === 'discover' || target === 'roaming')
      void qishuiDiscovery().catch(() => {})
    if (target === 'toplist') void musicToplist('qq').catch(() => {})
  }
  const navigation = (
    <nav className="music-studio-nav" aria-label="音乐功能导航">
      {['探索', '我的音乐'].map((group) => (
        <div className="music-studio-nav__group" key={group}>
          <small>{group}</small>
          {MUSIC_VIEWS.filter((item) => item.group === group).map(
            ({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                className={!detail && value === view ? 'is-active' : ''}
                aria-current={!detail && value === view ? 'page' : undefined}
                onClick={() => go(value)}
                onPointerEnter={() => warm(value)}
                onFocus={() => warm(value)}
              >
                <Icon size={19} />
                <span>{label}</span>
                {value === 'roaming' && <i />}
              </button>
            ),
          )}
        </div>
      ))}
    </nav>
  )
  const brand = (
    <Link to="/music" className="music-studio-brand">
      <span>
        <AudioLines size={24} />
      </span>
      <strong>
        Duck<span>Music</span>
      </strong>
    </Link>
  )
  return (
    <>
      <aside className="music-studio-sidebar">
        {brand}
        {navigation}
        <div className="music-studio-sidebar__bottom">
          <Link to="/music/app">
            <Download size={17} />
            获取 App
            <ArrowUpRight size={15} />
          </Link>
          <Link to="/">
            返回主站
            <ArrowUpRight size={15} />
          </Link>
          <BeianFooter />
        </div>
      </aside>
      <div className="music-studio-main">
        <header className="music-studio-header">
          <button
            className="music-studio-menu music-studio-icon"
            type="button"
            aria-label="打开音乐菜单"
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={21} />
          </button>
          {detail ? (
            <button
              className="music-studio-back music-studio-icon"
              type="button"
              aria-label="返回音乐"
              onClick={() =>
                window.history.state?.idx > 0
                  ? navigate(-1)
                  : navigate('/music')
              }
            >
              <ArrowLeft size={20} />
            </button>
          ) : (
            <span className="music-studio-section">
              {MUSIC_VIEWS.find((v) => v.value === view)?.label}
            </span>
          )}
          <div className="music-studio-search" ref={searchRef}>
            <MusicSearchInput
              source={source}
              value={query}
              onChange={setQuery}
              onSearch={(value) => {
                if (value.trim())
                  navigate(
                    `/music?view=search&source=${source}&type=${params.get('type') || 'song'}&keyword=${encodeURIComponent(value.trim())}`,
                  )
              }}
              placeholder="搜索你想听的音乐"
              enterButton={<span aria-label="搜索">搜</span>}
            />
            <kbd>⌘ K</kbd>
          </div>
          <div className="music-studio-tools">
            <button
              className="music-studio-icon"
              type="button"
              aria-label={
                theme.mode === 'dark' ? '切换到白天模式' : '切换到黑夜模式'
              }
              title={theme.mode === 'dark' ? '白天模式' : '黑夜模式'}
              onClick={theme.toggle}
            >
              {theme.mode === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            {auth.token ? (
              <TopbarUserMenu />
            ) : (
              <Button
                type="primary"
                onClick={() =>
                  navigate('/login', {
                    state: { from: location.pathname + location.search },
                  })
                }
              >
                登录
              </Button>
            )}
          </div>
        </header>
        {children}
      </div>
      <nav className="music-studio-mobile-nav" aria-label="移动音乐导航">
        {['discover', 'search', 'roaming', 'my-playlists']
          .map((id) => MUSIC_VIEWS.find((v) => v.value === id)!)
          .map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              aria-current={!detail && value === view ? 'page' : undefined}
              className={!detail && value === view ? 'is-active' : ''}
              onClick={() => go(value)}
            >
              <Icon size={21} />
              <span>{value === 'my-playlists' ? '我的音乐' : label}</span>
            </button>
          ))}
      </nav>
      <Drawer
        placement="left"
        width={280}
        title={brand}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        className="music-studio-menu-drawer music-studio-overlay"
      >
        {navigation}
        <Link to="/music/app" onClick={() => setMenuOpen(false)}>
          获取 DuckMusic App
        </Link>
        <BeianFooter />
      </Drawer>
    </>
  )
}
