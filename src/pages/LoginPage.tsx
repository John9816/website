import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  App as AntApp,
  Button,
  Card,
  Form,
  Input,
  Typography,
  theme as antdTheme,
} from 'antd'
import { LockOutlined, UserOutlined } from '@ant-design/icons'
import { login as apiLogin } from '../api/auth'
import ThemeToggle from '../components/ThemeToggle'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

function authBackground(mode: 'light' | 'dark') {
  return mode === 'dark'
    ? 'linear-gradient(135deg, #140f11 0%, #261517 52%, #100d0e 100%)'
    : 'linear-gradient(135deg, #fff3f1 0%, #fdf8f7 50%, #f8eded 100%)'
}

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const nav = useNavigate()
  const loc = useLocation()
  const auth = useAuth()
  const { message } = AntApp.useApp()
  const { mode } = useTheme()
  const { token } = antdTheme.useToken()

  const isAdminEntry = loc.pathname.startsWith('/admin')
  const redirectTo =
    (loc.state as { from?: string } | null)?.from ?? (isAdminEntry ? '/admin' : '/')

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true)
    try {
      const data = await apiLogin(values.username, values.password)
      auth.login(data.token, data.username)
      message.success('登录成功')
      nav(redirectTo, { replace: true })
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: authBackground(mode),
        padding: 20,
        position: 'relative',
      }}
    >
      <div style={{ position: 'absolute', top: 16, right: 20 }}>
        <ThemeToggle bare />
      </div>

      <Card style={{ width: 380, background: token.colorBgContainer }} bordered={false}>
        <Typography.Title level={3} style={{ textAlign: 'center', marginBottom: 8 }}>
          {isAdminEntry ? '后台登录' : '账号登录'}
        </Typography.Title>
        <Typography.Paragraph
          type="secondary"
          style={{ textAlign: 'center', marginBottom: 28 }}
        >
          {isAdminEntry ? '管理员登录后进入后台管理' : '登录后可继续使用你的账号'}
        </Typography.Paragraph>

        <Form
          size="large"
          layout="vertical"
          initialValues={isAdminEntry ? { username: 'admin' } : undefined}
          onFinish={onFinish}
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="用户名"
              autoComplete="username"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="密码"
              autoComplete="current-password"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 12 }}>
            <Button type="primary" htmlType="submit" loading={loading} block>
              登录
            </Button>
          </Form.Item>
        </Form>

        {!isAdminEntry && (
          <Typography.Paragraph style={{ textAlign: 'center', marginBottom: 0 }}>
            没有账号？<Link to="/register">立即注册</Link>
          </Typography.Paragraph>
        )}
      </Card>
    </div>
  )
}
