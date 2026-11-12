import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  App as AntApp,
  Button,
  Form,
  Input,
} from 'antd'
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  LockOutlined,
  MailOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons'
import {
  getCurrentUser,
  register as apiRegister,
  sendRegistrationEmailCode,
} from '../api/auth'
import ThemeToggle from '../components/ThemeToggle'
import AccountBrand from '../components/AccountBrand'
import { useAuth } from '../context/AuthContext'
import { ACCOUNT_EMAIL_HINT, ACCOUNT_EMAIL_PATTERN } from '../utils/email'
import '../styles/auth.css'

type RegisterValues = {
  username: string
  email: string
  verificationCode: string
  password: string
  confirmPassword: string
}

export default function RegisterPage() {
  const [loading, setLoading] = useState(false)
  const [codeLoading, setCodeLoading] = useState(false)
  const [codeCooldown, setCodeCooldown] = useState(0)
  const [codeEmail, setCodeEmail] = useState('')
  const [form] = Form.useForm<RegisterValues>()
  const nav = useNavigate()
  const { message } = AntApp.useApp()
  const auth = useAuth()
  const emailValue = Form.useWatch('email', form)
  const normalizedEmail = emailValue?.trim().toLowerCase() ?? ''
  const isCurrentEmailCoolingDown = normalizedEmail === codeEmail && codeCooldown > 0

  useEffect(() => {
    if (codeCooldown <= 0) return
    const timer = window.setTimeout(() => {
      setCodeCooldown((value) => Math.max(0, value - 1))
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [codeCooldown])

  const sendEmailCode = async () => {
    try {
      await form.validateFields(['email'])
      const email = form.getFieldValue('email').trim().toLowerCase()
      setCodeLoading(true)
      const delivery = await sendRegistrationEmailCode(email)
      setCodeEmail(email)
      setCodeCooldown(Math.max(1, Math.ceil(delivery.resendAfterSeconds || 60)))
      form.setFieldValue('verificationCode', '')
      const expiresInMinutes = Math.max(1, Math.ceil((delivery.expiresInSeconds || 600) / 60))
      message.success(`验证码请求已提交，有效期 ${expiresInMinutes} 分钟`)
    } catch (error) {
      if (error instanceof Error) message.error(error.message)
    } finally {
      setCodeLoading(false)
    }
  }

  const onFinish = async (values: RegisterValues) => {
    setLoading(true)
    try {
      const result = await apiRegister(
        values.username.trim(),
        values.password,
        values.email.trim().toLowerCase(),
        values.verificationCode,
      )
      const profile = await getCurrentUser(result.token, result.tokenType)
      auth.login(result.token, result.username, result.tokenType, profile, result.refreshToken)
      message.success('注册成功，已自动登录')
      nav('/', { replace: true })
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="account-page account-page--register">
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
            <h1 id="account-title">创建账号</h1>
            <p>支持 QQ 邮箱和 @751152.xyz 邮箱</p>
          </div>

        <Form<RegisterValues>
          name="account-register"
          form={form}
          size="large"
          layout="vertical"
          requiredMark={false}
          onFinish={onFinish}
        >
          <Form.Item
            label="用户名"
            name="username"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, max: 50, message: '用户名长度为 3-50 个字符' },
            ]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="用户名"
              autoComplete="username"
            />
          </Form.Item>

          <Form.Item
            label="邮箱"
            name="email"
            validateFirst
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
              inputMode="email"
            />
          </Form.Item>

          <Form.Item
            label="邮箱验证码"
            name="verificationCode"
            getValueFromEvent={(event) => event.target.value.replace(/\D/g, '').slice(0, 6)}
            rules={[
              { required: true, message: '请输入邮箱验证码' },
              { pattern: /^\d{6}$/, message: '请输入 6 位数字验证码' },
            ]}
          >
            <Input
              prefix={<SafetyCertificateOutlined />}
              placeholder="6 位数字"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              suffix={
                <Button
                  type="link"
                  size="small"
                  loading={codeLoading}
                  disabled={loading || isCurrentEmailCoolingDown}
                  onClick={() => void sendEmailCode()}
                  className="account-page__code-button"
                >
                  {isCurrentEmailCoolingDown ? `${codeCooldown} 秒后重发` : '获取验证码'}
                </Button>
              }
            />
          </Form.Item>

          <Form.Item
            label="密码"
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, max: 64, message: '密码长度为 6-64 个字符' },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="6-64 个字符"
              autoComplete="new-password"
            />
          </Form.Item>

          <Form.Item
            label="确认密码"
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
              placeholder="再次输入密码"
              autoComplete="new-password"
            />
          </Form.Item>

          <Form.Item className="account-page__submit">
            <Button type="primary" htmlType="submit" loading={loading} block>
              创建账号<ArrowRightOutlined />
            </Button>
          </Form.Item>
        </Form>

          <p className="account-page__alternate">已有账号？<Link to="/login">登录账号</Link></p>
        </section>
      </main>
      <footer className="account-page__footer"><Link to="/">751152.xyz</Link></footer>
    </div>
  )
}
