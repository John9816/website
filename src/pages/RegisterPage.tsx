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
import { getCurrentUser, register as apiRegister } from '../api/auth'
import ThemeToggle from '../components/ThemeToggle'
import { useAuth } from '../context/AuthContext'
import { useTheme, type ThemeMode } from '../context/ThemeContext'
import { ACCOUNT_EMAIL_HINT, ACCOUNT_EMAIL_PATTERN } from '../utils/email'

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
      const profile = await getCurrentUser(result.token, result.tokenType)
      auth.login(result.token, result.username, result.tokenType, profile)
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
      className="auth-page"
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
      <div className="auth-page__theme">
        <ThemeToggle bare />
      </div>

      <Card
        className="auth-page__card auth-page__card--register"
        style={{
          width: 'min(100%, 420px)',
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
          使用 QQ 邮箱或 @751152.xyz 邮箱创建普通用户账号
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
              { required: true, message: '请输入邮箱' },
              {
                pattern: ACCOUNT_EMAIL_PATTERN,
                message: ACCOUNT_EMAIL_HINT,
              },
            ]}
          >
            <Input
              prefix={<MailOutlined />}
              placeholder="QQ 邮箱或 name@751152.xyz"
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
