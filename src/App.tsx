import { Suspense, lazy, useEffect, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { App as AntApp, ConfigProvider, Spin, theme as antdTheme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { AuthProvider, useAuth } from './context/AuthContext'
import { MusicPlayerProvider, useMusicPlayer } from './context/MusicPlayerContext'
import { ThemeProvider, useTheme } from './context/ThemeContext'
import { usePageTitle } from './hooks/usePageTitle'
import BeianFooter from './components/BeianFooter'
import RouteErrorBoundary from './components/RouteErrorBoundary'

const HomePage = lazy(() => import('./pages/HomePage'))
const GlobalMusicDock = lazy(() => import('./components/GlobalMusicDock'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const MusicLayout = lazy(() => import('./pages/MusicLayout'))
const MusicPage = lazy(() => import('./pages/MusicPage'))
const AiChatPage = lazy(() => import('./pages/AiChatPage'))
const AiImagePage = lazy(() => import('./pages/AiImagePage'))
const ResumePage = lazy(() => import('./pages/ResumePage'))
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
const AdminUsers = lazy(() => import('./pages/AdminUsers'))
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
  const isLight = mode === 'light'
  const isDark = mode === 'dark'
  const colorPrimary = isDark ? '#f76cc6' : isLight ? '#2563eb' : '#41d1ff'
  const colorText = isLight ? '#111827' : '#f4f7fb'
  const colorTextSecondary = isLight ? 'rgba(71,85,105,0.78)' : 'rgba(226,235,245,0.72)'
  const colorBgBase = isDark ? '#000000' : isLight ? '#ffffff' : '#102f52'
  const colorBgContainer = isDark
    ? 'rgba(13, 15, 20, 0.84)'
    : isLight
      ? 'rgba(255, 255, 255, 0.94)'
      : 'rgba(8, 20, 40, 0.68)'
  const colorBgElevated = isDark
    ? 'rgba(18, 23, 31, 0.96)'
    : isLight
      ? 'rgba(255, 255, 255, 0.98)'
      : 'rgba(10, 24, 48, 0.92)'
  const colorBorder = isLight ? 'rgba(15, 23, 42, 0.12)' : 'rgba(255, 255, 255, 0.14)'
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
          colorText,
          colorTextSecondary,
          colorBgBase,
          colorBgContainer,
          colorBgElevated,
          colorBorder,
          colorBorderSecondary: isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.09)',
          colorFillTertiary: isDark
            ? 'rgba(247,108,198,0.12)'
            : isLight
              ? 'rgba(37,99,235,0.09)'
              : 'rgba(65,209,255,0.12)',
          boxShadow: isLight ? '0 18px 44px rgba(15,23,42,0.10)' : '0 18px 44px rgba(0,0,0,0.26)',
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
            activeShadow: `0 0 0 4px ${
              isDark ? 'rgba(247,108,198,0.14)' : isLight ? 'rgba(37,99,235,0.14)' : 'rgba(65,209,255,0.14)'
            }`,
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
            headerBg: isLight ? 'rgba(15,23,42,0.04)' : 'rgba(255,255,255,0.08)',
            rowHoverBg: isLight ? 'rgba(15,23,42,0.04)' : 'rgba(255,255,255,0.07)',
          },
        },
        algorithm: isLight ? antdTheme.defaultAlgorithm : antdTheme.darkAlgorithm,
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

function GlobalBeianFooterGate() {
  const location = useLocation()

  if (location.pathname === '/' || location.pathname.startsWith('/admin')) {
    return null
  }

  return <BeianFooter />
}

function RequireAdminRoute({ children }: { children: ReactNode }) {
  const auth = useAuth()

  if (auth.profileLoading) {
    return <RouteFallback />
  }

  if (!auth.token || !auth.user) {
    return <Navigate to="/login" state={{ from: '/resume' }} replace />
  }

  if (auth.user.role !== 'ADMIN') {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

export default function App() {
  return (
    <ThemeProvider>
      <ThemedAntd>
        <AuthProvider>
          <MusicPlayerProvider>
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <a className="skip-link" href="#app-route-start">
                跳到主要内容
              </a>
              <PageTitleSetter />
              <RouteFocusManager />
              <div id="app-route-start" className="app-route-start" tabIndex={-1} />
              <RouteErrorBoundary>
                <Suspense fallback={<RouteFallback />}>
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/ai-chat" element={<AiChatPage />} />
                    <Route path="/ai-image" element={<AiImagePage />} />
                    <Route
                      path="/resume"
                      element={
                        <RequireAdminRoute>
                          <ResumePage />
                        </RequireAdminRoute>
                      }
                    />
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
                      <Route path="users" element={<AdminUsers />} />
                      <Route path="password" element={<AdminPassword />} />
                    </Route>
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
              </RouteErrorBoundary>
              <GlobalBeianFooterGate />
              <GlobalMusicDockGate />
            </BrowserRouter>
          </MusicPlayerProvider>
        </AuthProvider>
      </ThemedAntd>
    </ThemeProvider>
  )
}
