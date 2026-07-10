import type { ReactNode } from 'react'
import { Layout, Menu, Button, Typography, ConfigProvider, Space, theme as antdTheme } from 'antd'
import type { MenuProps } from 'antd'
import {
  AppstoreOutlined,
  BookOutlined,
  HomeOutlined,
  KeyOutlined,
  LinkOutlined,
  LogoutOutlined,
  RocketOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme, type ThemeMode } from '../context/ThemeContext'
import ThemeToggle from '../components/ThemeToggle'
import '../styles/admin-shell.css'

const { Header, Sider, Content } = Layout

type AdminNavItem = {
  key: string
  title: string
  icon: ReactNode
}

export default function AdminLayout() {
  const auth = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const { mode } = useTheme()
  const isLight = mode === 'light'
  const canUseContentFactory = auth.user?.role === 'ADMIN' || auth.user?.canManageSystemConfig

  if (!auth.token) {
    return <Navigate to="/admin/login" state={{ from: location.pathname }} replace />
  }

  const navItems: AdminNavItem[] = [
    {
      key: '/admin/categories',
      icon: <AppstoreOutlined />,
      title: '分类',
    },
    {
      key: '/admin/links',
      icon: <LinkOutlined />,
      title: '链接',
    },
    {
      key: '/admin/kb',
      icon: <BookOutlined />,
      title: '知识库',
    },
    {
      key: '/admin/password',
      icon: <KeyOutlined />,
      title: '修改密码',
    },
  ]

  if (canUseContentFactory) {
    navItems.splice(2, 0, {
      key: '/admin/content',
      icon: <RocketOutlined />,
      title: '内容工厂',
    })
  }

  if (auth.user?.canManageSystemConfig) {
    navItems.splice(canUseContentFactory ? 3 : 2, 0, {
      key: '/admin/configs',
      icon: <SettingOutlined />,
      title: '系统配置',
    })
  }

  if (
    !auth.profileLoading &&
    !auth.user?.canManageSystemConfig &&
    location.pathname.startsWith('/admin/configs')
  ) {
    return <Navigate to="/admin/categories" replace />
  }

  if (
    !auth.profileLoading &&
    !canUseContentFactory &&
    location.pathname.startsWith('/admin/content')
  ) {
    return <Navigate to="/admin/categories" replace />
  }

  const selectedKey =
    navItems.find((item) => location.pathname.startsWith(item.key))?.key ?? '/admin/categories'
  const selectedTitle = navItems.find((item) => item.key === selectedKey)?.title ?? '管理'
  const menuItems: MenuProps['items'] = navItems.map((item) => ({
    key: item.key,
    icon: item.icon,
    label: <Link to={item.key}>{item.title}</Link>,
  }))

  const doLogout = () => {
    auth.logout()
    navigate('/', { replace: true })
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: isLight ? antdTheme.defaultAlgorithm : antdTheme.darkAlgorithm,
        token: {
          colorPrimary: mode === 'dark' ? '#fb7185' : isLight ? '#2563eb' : '#41d1ff',
          borderRadius: 8,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
        },
        components: {
          Layout: {
            headerBg: 'transparent',
            siderBg: 'transparent',
          },
          Menu: {
            itemBg: 'transparent',
            itemSelectedBg: 'transparent',
            itemHoverBg: 'transparent',
          },
        },
      }}
    >
      <LayoutContent
        mode={mode}
        selectedKey={selectedKey}
        selectedTitle={selectedTitle}
        menuItems={menuItems}
        auth={auth}
        doLogout={doLogout}
      />
    </ConfigProvider>
  )
}

function LayoutContent({
  mode,
  selectedKey,
  selectedTitle,
  menuItems,
  auth,
  doLogout,
}: {
  mode: ThemeMode
  selectedKey: string
  selectedTitle: string
  menuItems: MenuProps['items']
  auth: any
  doLogout: () => void
}) {
  const isWorkspaceRoute = selectedKey === '/admin/kb'

  return (
    <Layout hasSider className={`admin-shell${isWorkspaceRoute ? ' admin-shell--workspace' : ''}`}>
      <Sider
        theme={mode === 'light' ? 'light' : 'dark'}
        breakpoint="lg"
        collapsedWidth="0"
        width={240}
        className="admin-shell__sider"
        aria-label="后台导航"
      >
        <div className="admin-shell__brand">
          <span className="admin-shell__brand-mark" />
          <span className="admin-shell__brand-text">管理后台</span>
        </div>
        <Menu
          theme={mode === 'light' ? 'light' : 'dark'}
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          className="admin-shell__menu"
          aria-label="后台功能菜单"
        />
      </Sider>

      <Layout className="admin-shell__body">
        <Header className="admin-shell__header">
          <Typography.Title id="admin-page-title" level={5} className="admin-shell__title">
            {selectedTitle}
          </Typography.Title>
          <div className="admin-shell__header-actions">
            <Typography.Text type="secondary" className="admin-shell__welcome">
              {auth.username ? `欢迎，${auth.username}` : ''}
            </Typography.Text>
            <Space size={8} className="admin-shell__actions">
              <Link to="/">
                <Button type="text" icon={<HomeOutlined />}>
                  首页
                </Button>
              </Link>
              <Button type="text" danger icon={<LogoutOutlined />} onClick={doLogout}>
                退出
              </Button>
              <ThemeToggle bare />
            </Space>
          </div>
        </Header>
        <Content className="admin-shell__content" role="main" aria-labelledby="admin-page-title">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
