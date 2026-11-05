import { Suspense, lazy, useEffect, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { App as AntApp, ConfigProvider, Spin, theme as antdTheme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { AuthProvider, useAuth } from './context/AuthContext'
import { MEMBERSHIP_ENABLED } from './config/features'
import { MusicPlayerProvider, useMusicPlayer } from './context/MusicPlayerContext'
import { ThemeProvider, useTheme } from './context/ThemeContext'
import { usePageTitle } from './hooks/usePageTitle'
import BeianFooter from './components/BeianFooter'
import RouteErrorBoundary from './components/RouteErrorBoundary'
import {
  canAccessAdminPermission,
  getFirstAccessibleAdminPath,
  type AdminPermission,
} from './utils/permissions'

const HomePage = lazy(() => import('./pages/HomePage'))
const GlobalMusicDock = lazy(() => import('./components/GlobalMusicDock'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'))
const MusicLayout = lazy(() => import('./pages/MusicLayout'))
const MusicPage = lazy(() => import('./pages/MusicPage'))
const MusicPromoPage = lazy(() => import('./pages/MusicPromoPage'))
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
const AdminUsers = lazy(() => import('./pages/AdminUsers'))
const AdminRedeemCodes = lazy(() => import('./pages/AdminRedeemCodes'))
const AdminKnowledgeBase = lazy(() => import('./pages/AdminKnowledgeBase'))
const KbSharePage = lazy(() => import('./pages/KbSharePage'))
const DevEditorPreview = lazy(() => import('./pages/DevEditorPreview'))

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
  const colorPrimary = isLight ? '#167d70' : '#79c5b1'
  const colorText = isLight ? '#242d29' : '#e8eeea'
  const colorTextSecondary = isLight ? '#718079' : '#a0afa6'
  const colorBgBase = isLight ? '#f5f7f6' : '#171d1a'
  const colorBgContainer = isLight ? '#ffffff' : '#202724'
  const colorBgElevated = isLight ? '#ffffff' : '#272f2b'
  const colorBorder = isLight ? '#e2e8e4' : '#34413a'
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
          fontFamily: 'var(--font-sans)',
          colorText,
          colorTextLightSolid: isLight ? '#ffffff' : '#132a22',
          colorTextSecondary,
          colorBgBase,
          colorBgContainer,
          colorBgElevated,
          colorBorder,
          colorBorderSecondary: isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.09)',
          colorFillTertiary: isLight ? '#f0f3f1' : '#2a342e',
          boxShadow: isLight ? '0 8px 28px rgba(30,52,41,0.08)' : '0 8px 28px rgba(0,0,0,0.16)',
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
              isLight ? 'rgba(22,125,112,0.12)' : 'rgba(121,197,177,0.12)'
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
  const auth = useAuth()

  if (
    location.pathname === '/'
    || location.pathname.startsWith('/admin')
    || (location.pathname === '/ai-image' && !!auth.token)
  ) {
    return null
  }

  return <BeianFooter />
}

function RequireAdminPermission({
  permission,
  children,
}: {
  permission: AdminPermission
  children: ReactNode
}) {
  const auth = useAuth()

  if (auth.profileLoading) {
    return <RouteFallback />
  }

  if (!auth.token || !auth.user) {
    return <Navigate to="/admin/login" state={{ from: '/admin' }} replace />
  }

  if (!canAccessAdminPermission(auth.user, permission)) {
    return <Navigate to={getFirstAccessibleAdminPath(auth.user)} replace />
  }

  return <>{children}</>
}

function RequireAdminShell({ children }: { children: ReactNode }) {
  const auth = useAuth()

  if (auth.profileLoading) {
    return <RouteFallback />
  }

  if (!auth.token || !auth.user) {
    return <Navigate to="/admin/login" state={{ from: '/admin' }} replace />
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
                    <Route path="/kb/share/:token" element={<KbSharePage />} />
                    <Route path="/music" element={<MusicLayout />}>
                      <Route index element={<MusicPage />} />
                      <Route path="app" element={<MusicPromoPage />} />
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
                    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                    <Route path="/admin/login" element={<LoginPage />} />
                    <Route
                      path="/admin"
                      element={
                        <RequireAdminShell>
                          <AdminLayout />
                        </RequireAdminShell>
                      }
                    >
                      <Route index element={<Navigate to="categories" replace />} />
                      <Route path="categories" element={<AdminCategories />} />
                      <Route path="links" element={<AdminLinks />} />
                      <Route
                        path="configs"
                        element={
                          <RequireAdminPermission permission="systemConfig">
                            <AdminConfigs />
                          </RequireAdminPermission>
                        }
                      />
                      <Route
                        path="content"
                        element={
                          <RequireAdminPermission permission="contentFactory">
                            <AdminContentFactory />
                          </RequireAdminPermission>
                        }
                      />
                      <Route path="kb" element={<AdminKnowledgeBase />} />
                      <Route
                        path="redeem-codes"
                        element={MEMBERSHIP_ENABLED ? (
                          <RequireAdminPermission permission="systemConfig">
                            <AdminRedeemCodes />
                          </RequireAdminPermission>
                        ) : <Navigate to="/admin" replace />}
                      />
                      <Route
                        path="users"
                        element={
                          <RequireAdminPermission permission="systemConfig">
                            <AdminUsers />
                          </RequireAdminPermission>
                        }
                      />
                      <Route path="password" element={<AdminPassword />} />
                    </Route>
                    {import.meta.env.DEV ? (
                      <Route path="/dev/editor" element={<DevEditorPreview />} />
                    ) : null}
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
