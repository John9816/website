import { useCallback, useEffect, useState } from 'react'
import {
  App as AntApp,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd'
import {
  KeyOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons'
import {
  adminCreateUser,
  adminListUsers,
  adminResetUserPassword,
  adminUpdateUser,
} from '../api/admin'
import { useAuth } from '../context/AuthContext'
import type { AdminUserView } from '../types'
import { ACCOUNT_EMAIL_HINT, ACCOUNT_EMAIL_PATTERN } from '../utils/email'
import '../styles/admin-users.css'

const PAGE_SIZE = 20

type UserFilters = {
  keyword: string
  role?: 'ADMIN' | 'USER'
  enabled?: boolean
}

function formatDate(value?: string) {
  if (!value) return '-'
  const date = new Date(value.replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

export default function AdminUsers() {
  const auth = useAuth()
  const { message } = AntApp.useApp()
  const [rows, setRows] = useState<AdminUserView[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [keywordInput, setKeywordInput] = useState('')
  const [filters, setFilters] = useState<UserFilters>({ keyword: '' })
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<AdminUserView | null>(null)
  const [resetting, setResetting] = useState<AdminUserView | null>(null)
  const [createForm] = Form.useForm()
  const [editForm] = Form.useForm()
  const [passwordForm] = Form.useForm()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await adminListUsers({
        page,
        size: PAGE_SIZE,
        keyword: filters.keyword || undefined,
        role: filters.role,
        enabled: filters.enabled,
      })
      setRows(result.items)
      setTotal(result.total)
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setLoading(false)
    }
  }, [filters, message, page])

  useEffect(() => {
    void load()
  }, [load])

  const search = () => {
    setPage(0)
    setFilters((previous) => ({ ...previous, keyword: keywordInput.trim() }))
  }

  const createUser = async () => {
    const values = await createForm.validateFields()
    setSaving(true)
    try {
      await adminCreateUser(values)
      message.success('用户创建成功')
      setCreateOpen(false)
      createForm.resetFields()
      setPage(0)
      await load()
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const openEdit = (user: AdminUserView) => {
    setEditing(user)
    editForm.setFieldsValue({ role: user.role, enabled: user.enabled })
  }

  const updateUser = async () => {
    if (!editing) return
    const values = await editForm.validateFields()
    setSaving(true)
    try {
      const updated = await adminUpdateUser(editing.id, values)
      setRows((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      message.success('用户状态已更新，原登录会话已失效')
      setEditing(null)
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const resetPassword = async () => {
    if (!resetting) return
    const values = await passwordForm.validateFields()
    setSaving(true)
    try {
      await adminResetUserPassword(resetting.id, values.password)
      message.success('密码已重置，用户需要重新登录')
      setResetting(null)
      passwordForm.resetFields()
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-users admin-page">
      <div className="admin-users__header admin-page__header">
        <div>
          <Typography.Title level={2}>用户管理</Typography.Title>
          <Typography.Paragraph>管理账户角色、访问状态与登录凭据，共 {total} 个用户</Typography.Paragraph>
        </div>
        <Space className="admin-page__actions" wrap>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
            刷新
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              createForm.resetFields()
              createForm.setFieldsValue({ role: 'USER' })
              setCreateOpen(true)
            }}
          >
            新建用户
          </Button>
        </Space>
      </div>

      <div className="admin-users__filters">
        <Input
          allowClear
          value={keywordInput}
          prefix={<SearchOutlined />}
          placeholder="搜索用户名或邮箱"
          onChange={(event) => setKeywordInput(event.target.value)}
          onPressEnter={search}
        />
        <Select
          allowClear
          placeholder="全部角色"
          options={[
            { label: '管理员', value: 'ADMIN' },
            { label: '普通用户', value: 'USER' },
          ]}
          onChange={(role) => {
            setPage(0)
            setFilters((previous) => ({ ...previous, role }))
          }}
        />
        <Select
          allowClear
          placeholder="全部状态"
          options={[
            { label: '已启用', value: true },
            { label: '已停用', value: false },
          ]}
          onChange={(enabled) => {
            setPage(0)
            setFilters((previous) => ({ ...previous, enabled }))
          }}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={search}>
          查询
        </Button>
      </div>

      <Card className="admin-users__table-card admin-page__panel" styles={{ body: { padding: 0 } }}>
        <Table<AdminUserView>
          rowKey="id"
          dataSource={rows}
          loading={loading}
          scroll={{ x: 1480 }}
          pagination={{
            current: page + 1,
            pageSize: PAGE_SIZE,
            total,
            showSizeChanger: false,
            showTotal: (count) => `共 ${count} 条`,
            onChange: (nextPage) => setPage(nextPage - 1),
          }}
          columns={[
            {
              title: 'ID',
              dataIndex: 'id',
              width: 80,
              fixed: 'left',
              render: (id: number) => <span className="admin-users__id">#{id}</span>,
            },
            {
              title: '用户名',
              dataIndex: 'username',
              width: 180,
              fixed: 'left',
              render: (_, row) => (
                <div className="admin-users__identity">
                  {row.avatarUrl ? (
                    <img
                      className="admin-users__avatar"
                      src={row.avatarUrl}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="admin-users__avatar">{row.username.slice(0, 1).toUpperCase()}</span>
                  )}
                  <strong>{row.username}</strong>
                </div>
              ),
            },
            {
              title: '邮箱',
              dataIndex: 'email',
              width: 220,
              render: (email?: string | null) => email || '未设置',
            },
            {
              title: '头像地址',
              dataIndex: 'avatarUrl',
              width: 260,
              ellipsis: true,
              render: (avatarUrl?: string | null) =>
                avatarUrl ? (
                  <a href={avatarUrl} target="_blank" rel="noreferrer" title={avatarUrl}>
                    {avatarUrl}
                  </a>
                ) : (
                  <span className="admin-users__empty">未上传</span>
                ),
            },
            {
              title: '角色',
              dataIndex: 'role',
              width: 110,
              render: (role: AdminUserView['role']) => (
                <Tag color={role === 'ADMIN' ? 'blue' : 'default'}>
                  {role === 'ADMIN' ? '管理员' : '普通用户'}
                </Tag>
              ),
            },
            {
              title: '状态',
              dataIndex: 'enabled',
              width: 110,
              render: (enabled: boolean) => (
                <span className={`admin-users__status ${enabled ? 'is-enabled' : 'is-disabled'}`}>
                  <i />{enabled ? '已启用' : '已停用'}
                </span>
              ),
            },
            {
              title: '注册时间',
              dataIndex: 'createdAt',
              width: 190,
              render: formatDate,
            },
            {
              title: '最后更新',
              dataIndex: 'updatedAt',
              width: 190,
              render: formatDate,
            },
            {
              title: '操作',
              key: 'actions',
              width: 220,
              fixed: 'right',
              render: (_, row) => (
                <Space>
                  <Button type="text" icon={<UserSwitchOutlined />} onClick={() => openEdit(row)}>
                    权限
                  </Button>
                  <Button
                    type="text"
                    icon={<KeyOutlined />}
                    onClick={() => {
                      passwordForm.resetFields()
                      setResetting(row)
                    }}
                  >
                    重置密码
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="新建用户"
        open={createOpen}
        confirmLoading={saving}
        onCancel={() => setCreateOpen(false)}
        onOk={() => void createUser()}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" className="admin-users__form">
          <Form.Item name="username" label="用户名" rules={[{ required: true }, { min: 3, max: 50 }]}>
            <Input autoComplete="off" placeholder="3-50 个字符" />
          </Form.Item>
          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { required: true },
              { pattern: ACCOUNT_EMAIL_PATTERN, message: ACCOUNT_EMAIL_HINT },
            ]}
          >
            <Input autoComplete="off" placeholder="QQ 邮箱或 name@751152.xyz" />
          </Form.Item>
          <Form.Item name="password" label="初始密码" rules={[{ required: true }, { min: 6, max: 64 }]}>
            <Input.Password autoComplete="new-password" placeholder="至少 6 个字符" />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true }]}>
            <Select options={[{ label: '普通用户', value: 'USER' }, { label: '管理员', value: 'ADMIN' }]} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`管理用户：${editing?.username || ''}`}
        open={Boolean(editing)}
        confirmLoading={saving}
        onCancel={() => setEditing(null)}
        onOk={() => void updateUser()}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" className="admin-users__form">
          <Form.Item name="role" label="角色" rules={[{ required: true }]}>
            <Select options={[{ label: '普通用户', value: 'USER' }, { label: '管理员', value: 'ADMIN' }]} />
          </Form.Item>
          <Form.Item name="enabled" label="账户状态" valuePropName="checked">
            <Switch
              checkedChildren="已启用"
              unCheckedChildren="已停用"
              disabled={editing?.id === auth.user?.id}
            />
          </Form.Item>
          {editing?.id === auth.user?.id && (
            <Typography.Text type="secondary">当前管理员不能停用或降级自己的账户。</Typography.Text>
          )}
        </Form>
      </Modal>

      <Modal
        title={`重置密码：${resetting?.username || ''}`}
        open={Boolean(resetting)}
        confirmLoading={saving}
        onCancel={() => setResetting(null)}
        onOk={() => void resetPassword()}
        destroyOnClose
      >
        <Form form={passwordForm} layout="vertical" className="admin-users__form">
          <Form.Item name="password" label="新密码" rules={[{ required: true }, { min: 6, max: 64 }]}>
            <Input.Password autoComplete="new-password" placeholder="至少 6 个字符" />
          </Form.Item>
          <Typography.Text type="secondary">保存后，该用户现有登录会话会立即失效。</Typography.Text>
        </Form>
      </Modal>
    </div>
  )
}
