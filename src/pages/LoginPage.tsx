import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  App as AntApp,
  Button,
  Form,
  Input,
} from 'antd'
import { ArrowLeftOutlined, ArrowRightOutlined, LockOutlined, UserOutlined } from '@ant-design/icons'
import { getCurrentUser, login as apiLogin } from '../api/auth'
import ThemeToggle from '../components/ThemeToggle'
import AccountBrand from '../components/AccountBrand'
import { useAuth } from '../context/AuthContext'
import '../styles/auth.css'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const nav = useNavigate()
  const loc = useLocation()
  const auth = useAuth()
  const { message } = AntApp.useApp()

  const isAdminEntry = loc.pathname.startsWith('/admin')
  const redirectTo =
    (loc.state as { from?: string } | null)?.from ?? (isAdminEntry ? '/admin' : '/')

  const onFinish = async (values: { identifier: string; password: string }) => {
    setLoading(true)
    try {
      const data = await apiLogin(values.identifier, values.password)
      const profile = await getCurrentUser(data.token, data.tokenType)
      auth.login(data.token, data.username, data.tokenType, profile, data.refreshToken)
      message.success('登录成功')
      nav(redirectTo, { replace: true })
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="account-page">
      <AccountBrand />
      <header className="account-page__header">
        <Link to="/" className="account-page__home">
          <ArrowLeftOutlined />
          <span>返回首页</span>
        </Link>
        <ThemeToggle bare />
      </header>

      <main className="account-page__main">
        <section className="account-page__form" aria-labelledby="account-title">
          <div className="account-page__intro">
            <Link to="/" className="account-page__brand">个人导航<span> / 账号</span></Link>
            <h1 id="account-title">{isAdminEntry ? '管理后台登录' : '欢迎回来'}</h1>
            <p>登录你的账号</p>
          </div>

        <Form
          name="account-login"
          size="large"
          layout="vertical"
          requiredMark={false}
          onFinish={onFinish}
        >
          <Form.Item
            label="用户名或邮箱"
            name="identifier"
            rules={[{ required: true, message: '请输入用户名或邮箱' }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="输入用户名或邮箱"
              autoComplete="username"
            />
          </Form.Item>

          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="密码"
              autoComplete="current-password"
            />
          </Form.Item>

          {!isAdminEntry && (
            <div className="account-page__forgot">
              <Link to="/forgot-password">忘记密码？</Link>
            </div>
          )}

          <Form.Item className="account-page__submit">
            <Button type="primary" htmlType="submit" loading={loading} block>
              登录<ArrowRightOutlined />
            </Button>
          </Form.Item>
        </Form>

        {!isAdminEntry && (
          <p className="account-page__alternate">还没有账号？<Link to="/register">创建账号</Link></p>
        )}
        </section>
      </main>
      <footer className="account-page__footer"><Link to="/">751152.xyz</Link></footer>
    </div>
  )
}
