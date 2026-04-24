import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Form, Input, Button, Card, Typography, App as AntApp, theme as antdTheme } from 'antd'
import { LockOutlined, UserOutlined } from '@ant-design/icons'
import { login as apiLogin } from '../api/auth'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import ThemeToggle from '../components/ThemeToggle'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const nav = useNavigate()
  const loc = useLocation()
  const auth = useAuth()
  const { message } = AntApp.useApp()
  const { mode } = useTheme()
  const { token } = antdTheme.useToken()

  const redirectTo = (loc.state as { from?: string } | null)?.from ?? '/admin'

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true)
    try {
      const data = await apiLogin(values.username, values.password)
      auth.login(data.token, data.username)
      message.success('登录成功')
      nav(redirectTo, { replace: true })
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const bg =
    mode === 'dark'
      ? 'linear-gradient(135deg, #0b1220 0%, #0f172a 50%, #0b1220 100%)'
      : 'linear-gradient(135deg, #eef2ff 0%, #f8fafc 50%, #ecfeff 100%)'

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: bg,
        padding: 20,
        position: 'relative',
      }}
    >
      <div style={{ position: 'absolute', top: 16, right: 20 }}>
        <ThemeToggle bare />
      </div>
      <Card style={{ width: 380, background: token.colorBgContainer }} bordered={false}>
        <Typography.Title level={3} style={{ textAlign: 'center', marginBottom: 28 }}>
          后台登录
        </Typography.Title>
        <Form
          size="large"
          layout="vertical"
          initialValues={{ username: 'admin' }}
          onFinish={onFinish}
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="用户名" autoComplete="username" />
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
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
            >
              登录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
