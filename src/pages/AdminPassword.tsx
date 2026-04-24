import { useState } from 'react'
import { Card, Form, Input, Button, App as AntApp } from 'antd'
import { useNavigate } from 'react-router-dom'
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
    <Card title="修改密码" style={{ maxWidth: 480 }}>
      <Form layout="vertical" form={form} onFinish={onFinish}>
        <Form.Item
          name="oldPassword"
          label="当前密码"
          rules={[{ required: true }]}
        >
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Form.Item
          name="newPassword"
          label="新密码"
          rules={[
            { required: true },
            { min: 6, message: '至少 6 位' },
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          name="confirmPassword"
          label="确认新密码"
          rules={[{ required: true }]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}>
            提交
          </Button>
        </Form.Item>
      </Form>
    </Card>
  )
}
