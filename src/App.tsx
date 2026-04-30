import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { App as AntApp, ConfigProvider, Spin, theme as antdTheme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { AuthProvider } from './context/AuthContext'
import { MusicPlayerProvider } from './context/MusicPlayerContext'
import { ThemeProvider, useTheme } from './context/ThemeContext'

const HomePage = lazy(() => import('./pages/HomePage'))
const GlobalMusicDock = lazy(() => import('./components/GlobalMusicDock'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const MusicLayout = lazy(() => import('./pages/MusicLayout'))
const MusicPage = lazy(() => import('./pages/MusicPage'))
const MusicPlaylistDetailPage = lazy(
  () => import('./pages/MusicPlaylistDetailPage'),
)
const MusicToplistDetailPage = lazy(() => import('./pages/MusicToplistDetailPage'))
const AdminLayout = lazy(() => import('./pages/AdminLayout'))
const AdminCategories = lazy(() => import('./pages/AdminCategories'))
const AdminLinks = lazy(() => import('./pages/AdminLinks'))
const AdminConfigs = lazy(() => import('./pages/AdminConfigs'))
const AdminImage = lazy(() => import('./pages/AdminImage'))
const AdminPassword = lazy(() => import('./pages/AdminPassword'))

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
  const colorPrimary = mode === 'dark' ? '#eb645b' : '#d33a31'
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

export default function App() {
  return (
    <ThemeProvider>
      <ThemedAntd>
        <AuthProvider>
          <MusicPlayerProvider>
            <BrowserRouter>
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/music" element={<MusicLayout />}>
                    <Route index element={<MusicPage />} />
                    <Route
                      path="toplist/:source/:id"
                      element={<MusicToplistDetailPage />}
                    />
                    <Route
                      path="playlist/:source/:id"
                      element={<MusicPlaylistDetailPage />}
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
                    <Route path="image" element={<AdminImage />} />
                    <Route path="password" element={<AdminPassword />} />
                  </Route>
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
              <Suspense fallback={null}>
                <GlobalMusicDock />
              </Suspense>
            </BrowserRouter>
          </MusicPlayerProvider>
        </AuthProvider>
      </ThemedAntd>
    </ThemeProvider>
  )
}
