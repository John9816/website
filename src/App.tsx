import { Suspense, lazy, useEffect, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { App as AntApp, ConfigProvider, Spin, theme as antdTheme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { AuthProvider } from './context/AuthContext'
import { MusicPlayerProvider, useMusicPlayer } from './context/MusicPlayerContext'
import { ThemeProvider, useTheme } from './context/ThemeContext'
import { usePageTitle } from './hooks/usePageTitle'

const HomePage = lazy(() => import('./pages/HomePage'))
const GlobalMusicDock = lazy(() => import('./components/GlobalMusicDock'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const MusicLayout = lazy(() => import('./pages/MusicLayout'))
const MusicPage = lazy(() => import('./pages/MusicPage'))
const AiChatPage = lazy(() => import('./pages/AiChatPage'))
const AiImagePage = lazy(() => import('./pages/AiImagePage'))
const MusicPlaylistDetailPage = lazy(
  () => import('./pages/MusicPlaylistDetailPage'),
)
const MusicAlbumDetailPage = lazy(() => import('./pages/MusicAlbumDetailPage'))
const MusicToplistDetailPage = lazy(() => import('./pages/MusicToplistDetailPage'))
const MusicMyPlaylistDetailPage = lazy(() => import('./pages/MusicMyPlaylistDetailPage'))
const MusicSharePage = lazy(() => import('./pages/MusicSharePage'))
const AdminLayout = lazy(() => import('./pages/AdminLayout'))
const AdminCategories = lazy(() => import('./pages/AdminCategories'))
const AdminLinks = lazy(() => import('./pages/AdminLinks'))
const AdminConfigs = lazy(() => import('./pages/AdminConfigs'))
const AdminContentFactory = lazy(() => import('./pages/AdminContentFactory'))
const AdminPassword = lazy(() => import('./pages/AdminPassword'))
const AdminKnowledgeBase = lazy(() => import('./pages/AdminKnowledgeBase'))
const KbSharePage = lazy(() => import('./pages/KbSharePage'))

function RouteFallback() {
  return (
    <div className="route-fallback" role="status" aria-live="polite">
      <div className="route-fallback__panel">
        <span className="brand-dot" aria-hidden="true" />
        <div className="route-fallback__copy">
          <strong>正在加载页面</strong>
          <span>请稍等，内容马上就好</span>
        </div>
        <Spin size="small" />
      </div>
      <div className="route-fallback__skeleton" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}

function ThemedAntd({ children }: { children: ReactNode }) {
  const { mode } = useTheme()
  const isDark = mode === 'dark'
  const colorPrimary = mode === 'dark' ? '#5eead4' : '#0f766e'
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary,
          borderRadius: 8,
          borderRadiusLG: 8,
          controlHeight: 40,
          controlHeightLG: 44,
          controlHeightSM: 32,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
          colorText: isDark ? '#edf7f2' : '#14201c',
          colorTextSecondary: isDark ? '#a9bbb3' : '#53635e',
          colorBgContainer: isDark ? '#17201d' : '#ffffff',
          colorBgElevated: isDark ? '#1f2b27' : '#ffffff',
          colorBorder: isDark ? '#2d3b36' : '#dbe5e0',
          colorBorderSecondary: isDark ? '#26342f' : '#e7eee9',
          colorFillTertiary: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,118,110,0.08)',
          boxShadow:
            isDark ? '0 18px 48px rgba(0,0,0,0.36)' : '0 18px 48px rgba(15,118,110,0.12)',
          motionDurationFast: '0.12s',
          motionDurationMid: '0.18s',
          motionEaseOut: 'cubic-bezier(0.2, 0.82, 0.2, 1)',
        },
        components: {
          Button: {
            borderRadius: 8,
            controlHeight: 40,
            controlHeightLG: 44,
            defaultShadow: 'none',
            primaryShadow: 'none',
          },
          Input: {
            borderRadius: 8,
            activeShadow: `0 0 0 4px ${isDark ? 'rgba(94,234,212,0.14)' : 'rgba(15,118,110,0.12)'}`,
          },
          Select: {
            borderRadius: 8,
            controlHeight: 40,
          },
          Segmented: {
            borderRadius: 8,
            trackPadding: 4,
          },
          Drawer: {
            paddingLG: 20,
          },
          Modal: {
            borderRadiusLG: 8,
          },
          Table: {
            headerBg: isDark ? '#1f2b27' : '#eef3f0',
            rowHoverBg: isDark ? '#23322d' : '#edf7f4',
          },
        },
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      }}
    >
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  )
}

function PageTitleSetter() {
  usePageTitle()
  return null
}

function GlobalMusicDockGate() {
  const location = useLocation()
  const { current } = useMusicPlayer()

  if (!current || location.pathname.startsWith('/music')) return null

  return (
    <Suspense fallback={null}>
      <GlobalMusicDock />
    </Suspense>
  )
}

function RouteFocusManager() {
  const location = useLocation()

  useEffect(() => {
    window.requestAnimationFrame(() => {
      document.getElementById('app-route-start')?.focus({ preventScroll: true })
    })
  }, [location.pathname, location.search])

  return null
}

export default function App() {
  return (
    <ThemeProvider>
      <ThemedAntd>
        <AuthProvider>
          <MusicPlayerProvider>
            <BrowserRouter>
              <a className="skip-link" href="#app-route-start">
                跳到主要内容
              </a>
              <PageTitleSetter />
              <RouteFocusManager />
              <div id="app-route-start" className="app-route-start" tabIndex={-1} />
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/ai-chat" element={<AiChatPage />} />
                  <Route path="/ai-image" element={<AiImagePage />} />
                  <Route path="/kb/share/:token" element={<KbSharePage />} />
                  <Route path="/music" element={<MusicLayout />}>
                    <Route index element={<MusicPage />} />
                    <Route path="share/:token" element={<MusicSharePage />} />
                    <Route
                      path="toplist/:source/:id"
                      element={<MusicToplistDetailPage />}
                    />
                    <Route
                      path="playlist/:source/:id"
                      element={<MusicPlaylistDetailPage />}
                    />
                    <Route
                      path="album/:source/:id"
                      element={<MusicAlbumDetailPage />}
                    />
                    <Route
                      path="my-playlist/:id"
                      element={<MusicMyPlaylistDetailPage />}
                    />
                  </Route>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                  <Route path="/admin/login" element={<LoginPage />} />
                  <Route path="/admin" element={<AdminLayout />}>
                    <Route index element={<Navigate to="categories" replace />} />
                    <Route path="categories" element={<AdminCategories />} />
                    <Route path="links" element={<AdminLinks />} />
                    <Route path="configs" element={<AdminConfigs />} />
                    <Route path="content" element={<AdminContentFactory />} />
                    <Route path="kb" element={<AdminKnowledgeBase />} />
                    <Route path="password" element={<AdminPassword />} />
                  </Route>
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
              <GlobalMusicDockGate />
            </BrowserRouter>
          </MusicPlayerProvider>
        </AuthProvider>
      </ThemedAntd>
    </ThemeProvider>
  )
}
