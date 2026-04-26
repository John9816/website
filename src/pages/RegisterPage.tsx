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
import { LockOutlined, UserOutlined } from '@ant-design/icons'
import { register as apiRegister } from '../api/auth'
import ThemeToggle from '../components/ThemeToggle'
import { useTheme } from '../context/ThemeContext'

function authBackground(mode: 'light' | 'dark') {
  return mode === 'dark'
    ? 'linear-gradient(135deg, #140f11 0%, #261517 52%, #100d0e 100%)'
    : 'linear-gradient(135deg, #fff3f1 0%, #fdf8f7 50%, #f8eded 100%)'
}

type RegisterValues = {
  username: string
  password: string
  confirmPassword: string
}

export default function RegisterPage() {
  const [loading, setLoading] = useState(false)
  const nav = useNavigate()
  const { message } = AntApp.useApp()
  const { mode } = useTheme()
  const { token } = antdTheme.useToken()

  const onFinish = async (values: RegisterValues) => {
    setLoading(true)
    try {
      const result = await apiRegister(values.username, values.password)
      const successMessage =
        typeof result === 'string'
          ? result
          : result?.message || '注册成功，请登录'

      message.success(successMessage)
      nav('/login', { replace: true })
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

      <Card style={{ width: 420, background: token.colorBgContainer }} bordered={false}>
        <Typography.Title level={3} style={{ textAlign: 'center', marginBottom: 8 }}>
          用户注册
        </Typography.Title>
        <Typography.Paragraph
          type="secondary"
          style={{ textAlign: 'center', marginBottom: 28 }}
        >
          创建普通用户账号，注册完成后可前往登录
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
