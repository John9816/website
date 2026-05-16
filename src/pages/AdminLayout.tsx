import { Layout, Menu, Button, Typography, ConfigProvider, Space, theme as antdTheme } from 'antd'
import {
  AppstoreOutlined,
  BookOutlined,
  HomeOutlined,
  KeyOutlined,
  LinkOutlined,
  LogoutOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import ThemeToggle from '../components/ThemeToggle'

const { Header, Sider, Content } = Layout

export default function AdminLayout() {
  const auth = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const { mode } = useTheme()

  if (!auth.token) {
    return <Navigate to="/admin/login" state={{ from: location.pathname }} replace />
  }

  const items = [
    {
      key: '/admin/categories',
      icon: <AppstoreOutlined />,
      label: <Link to="/admin/categories">分类</Link>,
    },
    {
      key: '/admin/links',
      icon: <LinkOutlined />,
      label: <Link to="/admin/links">链接</Link>,
    },
    {
      key: '/admin/kb',
      icon: <BookOutlined />,
      label: <Link to="/admin/kb">知识库</Link>,
    },
    {
      key: '/admin/password',
      icon: <KeyOutlined />,
      label: <Link to="/admin/password">修改密码</Link>,
    },
  ]

  if (auth.user?.canManageSystemConfig) {
    items.splice(2, 0, {
      key: '/admin/configs',
      icon: <SettingOutlined />,
      label: <Link to="/admin/configs">系统配置</Link>,
    })
  }

  if (
    !auth.profileLoading &&
    !auth.user?.canManageSystemConfig &&
    location.pathname.startsWith('/admin/configs')
  ) {
    return <Navigate to="/admin/categories" replace />
  }

  const selectedKey =
    items.find((item) => location.pathname.startsWith(item.key))?.key ?? '/admin/categories'

  const doLogout = () => {
    auth.logout()
    navigate('/', { replace: true })
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#e11d48',
          borderRadius: 8,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
        },
        components: {
          Layout: {
            headerBg: mode === 'dark' ? '#181315' : '#ffffff',
            siderBg: mode === 'dark' ? '#181315' : '#ffffff',
          },
          Menu: {
            itemBg: 'transparent',
          },
        },
      }}
    >
      <LayoutContent
        mode={mode}
        selectedKey={selectedKey}
        items={items}
        auth={auth}
        doLogout={doLogout}
      />
    </ConfigProvider>
  )
}

function LayoutContent({
  mode,
  selectedKey,
  items,
  auth,
  doLogout,
}: {
  mode: string
  selectedKey: string
  items: any[]
  auth: any
  doLogout: () => void
}) {
  const { token } = antdTheme.useToken()

  return (
    <Layout hasSider style={{ minHeight: '100vh', background: token.colorBgLayout }}>
      <Sider
        theme={mode === 'dark' ? 'dark' : 'light'}
        breakpoint="lg"
        collapsedWidth="0"
        width={240}
        style={{
          borderRight: `1px solid ${token.colorBorderSecondary}`,
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 100,
          overflow: 'auto',
        }}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            padding: '0 24px',
            fontSize: 18,
            fontWeight: 700,
            color: token.colorPrimary,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: token.colorPrimary,
              marginRight: 10,
            }}
          />
          管理后台
        </div>
        <Menu
          theme={mode === 'dark' ? 'dark' : 'light'}
          mode="inline"
          selectedKeys={[selectedKey]}
          items={items}
          style={{ borderRight: 0, marginTop: 16 }}
        />
      </Sider>

      <Layout style={{ marginLeft: 240, transition: 'all 0.2s', minWidth: 0, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 20,
            background: token.colorBgContainer,
            padding: '0 32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            height: 64,
            flexShrink: 0,
          }}
        >
          <Typography.Title level={5} style={{ margin: 0, fontWeight: 500 }}>
            {items.find((item) => item.key === selectedKey)?.label?.props?.children || '管理'}
          </Typography.Title>
          <div
            style={{
              display: 'flex',
              gap: 16,
              alignItems: 'center',
            }}
          >
            <Typography.Text type="secondary" style={{ marginRight: 8 }}>
              {auth.username ? `欢迎，${auth.username}` : ''}
            </Typography.Text>
            <Space size={8}>
              <Link to="/">
                <Button variant="text" color="default" icon={<HomeOutlined />}>
                  首页
                </Button>
              </Link>
              <Button variant="text" color="danger" icon={<LogoutOutlined />} onClick={doLogout}>
                退出
              </Button>
              <ThemeToggle bare />
            </Space>
          </div>
        </Header>
        <Content
          style={{
            padding: '32px',
            minHeight: 'calc(100vh - 64px)',
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
