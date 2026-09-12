import { useEffect, useState, type ReactNode } from 'react'
import { Layout, Menu, Button, Typography, ConfigProvider, Drawer, Grid, Space, Tooltip, theme as antdTheme } from 'antd'
import type { MenuProps } from 'antd'
import {
  AppstoreOutlined,
  BookOutlined,
  GiftOutlined,
  HomeOutlined,
  KeyOutlined,
  LinkOutlined,
  LogoutOutlined,
  MenuOutlined,
  RocketOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme, type ThemeMode } from '../context/ThemeContext'
import ThemeToggle from '../components/ThemeToggle'
import {
  canAccessAdminPermission,
  canManageSystemConfig,
  canUseContentFactory,
  getAdminPermissionForPath,
  getFirstAccessibleAdminPath,
} from '../utils/permissions'
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
  const contentFactoryVisible = canUseContentFactory(auth.user)
  const systemConfigVisible = canManageSystemConfig(auth.user)

  if (!auth.token) {
    return <Navigate to="/admin/login" state={{ from: location.pathname }} replace />
  }

  if (auth.profileLoading || !auth.user) {
    return (
      <div className="admin-shell-loading" role="status" aria-live="polite">
        正在确认权限...
      </div>
    )
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

  if (contentFactoryVisible) {
    navItems.splice(2, 0, {
      key: '/admin/content',
      icon: <RocketOutlined />,
      title: '内容工厂',
    })
  }

  if (systemConfigVisible) {
    navItems.splice(contentFactoryVisible ? 3 : 2, 0, {
      key: '/admin/configs',
      icon: <SettingOutlined />,
      title: '系统配置',
    })

    navItems.splice(contentFactoryVisible ? 4 : 3, 0, {
      key: '/admin/redeem-codes',
      icon: <GiftOutlined />,
      title: '兑换码',
    })

    navItems.splice(contentFactoryVisible ? 5 : 4, 0, {
      key: '/admin/users',
      icon: <TeamOutlined />,
      title: '用户管理',
    })
  }

  const currentPermission = getAdminPermissionForPath(location.pathname)
  if (!canAccessAdminPermission(auth.user, currentPermission)) {
    return <Navigate to={getFirstAccessibleAdminPath(auth.user)} replace />
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
          colorPrimary: isLight ? '#167d70' : '#6cbba9',
          colorBgContainer: isLight ? '#ffffff' : '#202724',
          colorBgLayout: isLight ? '#f5f7f6' : '#171d1a',
          colorBorder: isLight ? '#e2e8e4' : '#34413a',
          borderRadius: 6,
          fontFamily: 'var(--font-sans)',
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
  auth: ReturnType<typeof useAuth>
  doLogout: () => void
}) {
  const [navigationOpen, setNavigationOpen] = useState(false)
  const screens = Grid.useBreakpoint()
  const isKnowledgeWorkspace = selectedKey === '/admin/kb'

  useEffect(() => {
    setNavigationOpen(false)
  }, [selectedKey])

  useEffect(() => {
    if (screens.lg) setNavigationOpen(false)
  }, [screens.lg])

  const navigation = (
    <>
      <Link to="/" className="admin-shell__brand">
        <span className="admin-shell__brand-mark"><AppstoreOutlined /></span>
        <span className="admin-shell__brand-text">个人导航<small>管理后台</small></span>
      </Link>
      <div className="admin-shell__nav-label">工作空间</div>
      <Menu
        theme={mode === 'light' ? 'light' : 'dark'}
        mode="inline"
        selectedKeys={[selectedKey]}
        items={menuItems}
        className="admin-shell__menu"
        aria-label="后台功能菜单"
        onClick={() => setNavigationOpen(false)}
      />
      <div className="admin-shell__sider-footer">
        <Link to="/"><HomeOutlined /><span>返回首页</span></Link>
      </div>
    </>
  )

  return (
    <Layout hasSider className={`admin-shell${isKnowledgeWorkspace ? ' admin-shell--knowledge' : ''}`}>
      <Sider
        theme={mode === 'light' ? 'light' : 'dark'}
        width={228}
        className="admin-shell__sider"
        aria-label="后台导航"
      >
        {navigation}
      </Sider>
      <Drawer
        title="导航"
        placement="left"
        width={280}
        open={navigationOpen}
        onClose={() => setNavigationOpen(false)}
        rootClassName="admin-shell__drawer"
      >
        <nav id="admin-mobile-navigation" className="admin-shell__mobile-navigation" aria-label="后台导航">
          {navigation}
        </nav>
      </Drawer>

      <Layout className="admin-shell__body">
        <Header className="admin-shell__header">
          <div className="admin-shell__heading">
            <Tooltip title="打开导航">
              <Button
                type="text"
                icon={<MenuOutlined />}
                className="admin-shell__menu-button"
                aria-label="打开导航"
                aria-expanded={navigationOpen}
                aria-controls="admin-mobile-navigation"
                onClick={() => setNavigationOpen(true)}
              />
            </Tooltip>
            <span className="admin-shell__breadcrumb">管理后台<span>/</span></span>
            <Typography.Title id="admin-page-title" level={5} className="admin-shell__title">
              {selectedTitle}
            </Typography.Title>
          </div>
          <div className="admin-shell__header-actions">
            <Typography.Text type="secondary" className="admin-shell__welcome">
              {auth.username ?? ''}
            </Typography.Text>
            <Space size={4} className="admin-shell__actions">
              <Tooltip title="返回首页">
                <Link to="/" className="admin-shell__home-button" aria-label="返回首页">
                  <HomeOutlined />
                </Link>
              </Tooltip>
              <ThemeToggle bare />
              <Tooltip title="退出登录">
                <Button type="text" icon={<LogoutOutlined />} onClick={doLogout} aria-label="退出登录">
                </Button>
              </Tooltip>
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
