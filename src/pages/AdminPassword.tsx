import { useState } from 'react'
import { Card, Form, Input, Button, App as AntApp, Typography } from 'antd'
import { useNavigate } from 'react-router-dom'
import { KeyOutlined, SaveOutlined } from '@ant-design/icons'
import { changePassword } from '../api/auth'
import { useAuth } from '../context/AuthContext'

export default function AdminPassword() {
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm()
  const { message } = AntApp.useApp()
  const auth = useAuth()
  const nav = useNavigate()

  const onFinish = async (values: {
    oldPassword: string
    newPassword: string
    confirmPassword: string
  }) => {
    if (values.newPassword !== values.confirmPassword) {
      message.error('两次输入的新密码不一致')
      return
    }
    setLoading(true)
    try {
      await changePassword(values.oldPassword, values.newPassword)
      message.success('密码修改成功，请重新登录')
      auth.logout()
      nav('/admin/login', { replace: true })
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-page admin-password">
      <div className="admin-password__intro">
        <div className="admin-password__icon">
          <KeyOutlined />
        </div>
        <h2>修改登录密码</h2>
        <Typography.Paragraph type="secondary">
          为了您的账户安全，请定期更换复杂的密码。
        </Typography.Paragraph>
      </div>

      <Card className="admin-page__panel admin-password__card">
        <Form layout="vertical" form={form} onFinish={onFinish} size="large" style={{ marginTop: 8 }}>
          <Form.Item
            name="oldPassword"
            label="当前使用的密码"
            rules={[{ required: true, message: '请输入当前密码' }]}
          >
            <Input.Password placeholder="请输入您当前的登录密码" autoComplete="current-password" />
          </Form.Item>

          <div className="admin-password__divider" />

          <Form.Item
            name="newPassword"
            label="设置新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '新密码长度至少 6 位' },
            ]}
          >
            <Input.Password placeholder="设置 6 位以上的新密码" autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="确认新密码"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请再次确认新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('两次输入的新密码不一致'))
                },
              }),
            ]}
          >
            <Input.Password placeholder="再次输入新密码以确认" autoComplete="new-password" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, marginTop: 32 }}>
            <Button type="primary" htmlType="submit" loading={loading} block icon={<SaveOutlined />}>
              确认修改密码
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Typography.Text type="secondary" className="admin-password__hint">
        密码修改成功后将自动退出登录，需使用新密码重新进入。
      </Typography.Text>
    </div>
  )
}
