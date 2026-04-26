import { Layout, Menu, Button, Typography, theme as antdTheme } from 'antd'
import {
  AppstoreOutlined,
  CustomerServiceOutlined,
  HomeOutlined,
  KeyOutlined,
  LinkOutlined,
  LogoutOutlined,
  PictureOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import ThemeToggle from '../components/ThemeToggle'

const { Header, Sider, Content } = Layout

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
    key: '/admin/configs',
    icon: <SettingOutlined />,
    label: <Link to="/admin/configs">系统配置</Link>,
  },
  {
    key: '/admin/image',
    icon: <PictureOutlined />,
    label: <Link to="/admin/image">图片生成</Link>,
  },
  {
    key: '/admin/password',
    icon: <KeyOutlined />,
    label: <Link to="/admin/password">修改密码</Link>,
  },
]

export default function AdminLayout() {
  const auth = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const { mode } = useTheme()
  const { token } = antdTheme.useToken()

  if (!auth.token) {
    return <Navigate to="/admin/login" state={{ from: location.pathname }} replace />
  }

  const selectedKey =
    items.find((item) => location.pathname.startsWith(item.key))?.key ?? '/admin/categories'

  const doLogout = () => {
    auth.logout()
    navigate('/admin/login', { replace: true })
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        theme={mode === 'dark' ? 'dark' : 'light'}
        breakpoint="lg"
        collapsedWidth="0"
        width={220}
      >
        <div
          style={{
            padding: '20px 16px',
            fontSize: 18,
            fontWeight: 700,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            color: token.colorText,
          }}
        >
          导航后台
        </div>
        <Menu
          theme={mode === 'dark' ? 'dark' : 'light'}
          mode="inline"
          selectedKeys={[selectedKey]}
          items={items}
          style={{ borderRight: 0 }}
        />
      </Sider>

      <Layout>
        <Header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 20,
            background: token.colorBgContainer,
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <Typography.Text type="secondary">
            {auth.username ? `欢迎，${auth.username}` : ''}
          </Typography.Text>
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
            }}
          >
            <Link to="/">
              <Button icon={<HomeOutlined />}>首页</Button>
            </Link>
            <Link to="/music">
              <Button icon={<CustomerServiceOutlined />}>音乐</Button>
            </Link>
            <Button icon={<LogoutOutlined />} onClick={doLogout}>
              退出
            </Button>
            <ThemeToggle bare />
          </div>
        </Header>
        <Content style={{ padding: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
