import { Suspense, lazy } from 'react'
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
const MusicToplistDetailPage = lazy(() => import('./pages/MusicToplistDetailPage'))
const MusicMyPlaylistDetailPage = lazy(() => import('./pages/MusicMyPlaylistDetailPage'))
const MusicSharePage = lazy(() => import('./pages/MusicSharePage'))
const AdminLayout = lazy(() => import('./pages/AdminLayout'))
const AdminCategories = lazy(() => import('./pages/AdminCategories'))
const AdminLinks = lazy(() => import('./pages/AdminLinks'))
const AdminConfigs = lazy(() => import('./pages/AdminConfigs'))
const AdminPassword = lazy(() => import('./pages/AdminPassword'))
const AdminKnowledgeBase = lazy(() => import('./pages/AdminKnowledgeBase'))
const KbSharePage = lazy(() => import('./pages/KbSharePage'))

function RouteFallback() {
  return (
    <div
      style={{
        minHeight: '40vh',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <Spin size="large" />
    </div>
  )
}

function ThemedAntd({ children }: { children: React.ReactNode }) {
  const { mode } = useTheme()
  const colorPrimary = mode === 'dark' ? '#5eead4' : '#0f766e'
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: { colorPrimary },
        algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
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

export default function App() {
  return (
    <ThemeProvider>
      <ThemedAntd>
        <AuthProvider>
          <MusicPlayerProvider>
            <BrowserRouter>
              <PageTitleSetter />
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
