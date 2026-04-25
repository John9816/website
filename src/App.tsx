import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { App as AntApp, ConfigProvider, theme as antdTheme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { AuthProvider } from './context/AuthContext'
import { MusicPlayerProvider } from './context/MusicPlayerContext'
import { ThemeProvider, useTheme } from './context/ThemeContext'
import GlobalMusicDock from './components/GlobalMusicDock'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import MusicLayout from './pages/MusicLayout'
import MusicPage from './pages/MusicPage'
import MusicPlaylistDetailPage from './pages/MusicPlaylistDetailPage'
import MusicToplistDetailPage from './pages/MusicToplistDetailPage'
import AdminLayout from './pages/AdminLayout'
import AdminCategories from './pages/AdminCategories'
import AdminLinks from './pages/AdminLinks'
import AdminConfigs from './pages/AdminConfigs'
import AdminImage from './pages/AdminImage'
import AdminPassword from './pages/AdminPassword'

function ThemedAntd({ children }: { children: React.ReactNode }) {
  const { mode } = useTheme()
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: { colorPrimary: '#2563eb' },
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
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/music" element={<MusicLayout />}>
                  <Route index element={<MusicPage />} />
                  <Route path="toplist/:source/:id" element={<MusicToplistDetailPage />} />
                  <Route path="playlist/:source/:id" element={<MusicPlaylistDetailPage />} />
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
              <GlobalMusicDock />
            </BrowserRouter>
          </MusicPlayerProvider>
        </AuthProvider>
      </ThemedAntd>
    </ThemeProvider>
  )
}
