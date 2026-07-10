import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  App as AntApp,
  Button,
  Card,
  Form,
  Input,
  Typography,
  theme as antdTheme,
} from 'antd'
import { LockOutlined, MailOutlined, UserOutlined } from '@ant-design/icons'
import { register as apiRegister } from '../api/auth'
import ThemeToggle from '../components/ThemeToggle'
import { useAuth } from '../context/AuthContext'
import { useTheme, type ThemeMode } from '../context/ThemeContext'

function authBackground(mode: ThemeMode) {
  if (mode === 'light') return '#ffffff'
  if (mode === 'dark') return '#000000'
  return `linear-gradient(180deg, rgba(9,23,45,0.62), rgba(10,18,33,0.38)), url('/bank-nav/static/img/background-20260710.webp') center / cover fixed no-repeat`
}

type RegisterValues = {
  username: string
  email: string
  password: string
  confirmPassword: string
}

const QQ_EMAIL_PATTERN = /^[1-9]\d{4,10}@qq\.com$/i

export default function RegisterPage() {
  const [loading, setLoading] = useState(false)
  const nav = useNavigate()
  const { message } = AntApp.useApp()
  const auth = useAuth()
  const { mode } = useTheme()
  const { token } = antdTheme.useToken()

  const onFinish = async (values: RegisterValues) => {
    setLoading(true)
    try {
      const result = await apiRegister(
        values.username.trim(),
        values.password,
        values.email.trim().toLowerCase(),
      )
      auth.login(result.token, result.username, result.tokenType)
      message.success('注册成功，已自动登录')
      nav('/', { replace: true })
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
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

      <Card
        style={{
          width: 420,
          background: token.colorBgContainer,
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.12)',
          backdropFilter: 'blur(16px)',
          boxShadow: token.boxShadow,
        }}
        bordered={false}
      >
        <Typography.Title level={3} style={{ textAlign: 'center', marginBottom: 8 }}>
          用户注册
        </Typography.Title>
        <Typography.Paragraph
          type="secondary"
          style={{ textAlign: 'center', marginBottom: 28 }}
        >
          使用 QQ 邮箱创建普通用户账号
        </Typography.Paragraph>

        <Form<RegisterValues> size="large" layout="vertical" onFinish={onFinish}>
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
            name="email"
            rules={[
              { required: true, message: '请输入 QQ 邮箱' },
              {
                pattern: QQ_EMAIL_PATTERN,
                message: '请输入有效的 QQ 邮箱，例如 123456@qq.com',
              },
            ]}
          >
            <Input
              prefix={<MailOutlined />}
              placeholder="QQ 邮箱"
              autoComplete="email"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="密码"
              autoComplete="new-password"
            />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            dependencies={['password']}
            rules={[
              { required: true, message: '请再次输入密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'))
                },
              }),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="确认密码"
              autoComplete="new-password"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 12 }}>
            <Button type="primary" htmlType="submit" loading={loading} block>
              注册
            </Button>
          </Form.Item>
        </Form>

        <Typography.Paragraph style={{ textAlign: 'center', marginBottom: 0 }}>
          已有账号？<Link to="/login">去登录</Link>
        </Typography.Paragraph>
      </Card>
    </div>
  )
}
