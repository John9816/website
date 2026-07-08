import { useEffect, useState } from 'react'
import {
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Popconfirm,
  App as AntApp,
  Card,
  Typography,
  Skeleton,
  Tag,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons'
import {
  adminListConfigs,
  adminCreateConfig,
  adminUpdateConfig,
  adminDeleteConfig,
} from '../api/admin'
import type { SysConfig } from '../types'

const sortConfigs = (items: SysConfig[]) =>
  [...items].sort((a, b) => a.configKey.localeCompare(b.configKey) || a.id - b.id)

export default function AdminConfigs() {
  const [rows, setRows] = useState<SysConfig[]>([])
  const [loading, setLoading] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<SysConfig | null>(null)
  const [form] = Form.useForm()
  const { message } = AntApp.useApp()

  const load = async () => {
    setLoading(true)
    try {
      setRows(sortConfigs(await adminListConfigs()))
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    setOpen(true)
  }
  const openEdit = (row: SysConfig) => {
    setEditing(row)
    form.setFieldsValue(row)
    setOpen(true)
  }

  const submit = async () => {
    const values = await form.validateFields()
    setSubmitLoading(true)
    try {
      const saved = editing ? await adminUpdateConfig(editing.id, values) : await adminCreateConfig(values)
      setRows((previous) =>
        sortConfigs([saved, ...previous.filter((item) => item.id !== saved.id)]),
      )
      if (editing) {
        message.success('更新成功')
      } else {
        message.success('创建成功')
      }
      setOpen(false)
      setEditing(null)
      void load()
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setSubmitLoading(false)
    }
  }

  const del = async (id: number) => {
    try {
      await adminDeleteConfig(id)
      setRows((previous) => previous.filter((item) => item.id !== id))
      message.success('删除成功')
      void load()
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>系统配置</h2>
          <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0', maxWidth: 600 }}>
            运行时集成配置（如图片生成 API 等），修改后立即生效，无需重启服务。
          </Typography.Paragraph>
        </div>
        <Space size="middle">
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading} size="large">
            刷新
          </Button>
          <Button type="primary" size="large" icon={<PlusOutlined />} onClick={openCreate}>
            新建配置
          </Button>
        </Space>
      </div>

      <Card styles={{ body: { padding: 0 } }} style={{ overflow: 'hidden', border: 'none', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02)' }}>
        {loading && rows.length === 0 ? (
          <div style={{ padding: 24 }}>
            <Skeleton active paragraph={{ rows: 6 }} />
          </div>
        ) : (
          <Table
            rowKey="id"
            dataSource={rows}
            loading={loading}
            pagination={false}
            scroll={{ x: 'max-content' }}
            columns={[
              {
                title: '配置项 Key',
                dataIndex: 'configKey',
                width: 250,
                render: (v) => (
                  <Space>
                    <SettingOutlined style={{ color: 'rgba(0,0,0,0.25)' }} />
                    <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{v}</span>
                  </Space>
                ),
              },
              {
                title: '配置内容 Value',
                dataIndex: 'configValue',
                ellipsis: true,
                render: (v: string) => (
                  <Tag style={{ border: 'none', background: 'rgba(0,0,0,0.04)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {v && v.length > 50 ? `${v.slice(0, 50)}…` : v}
                  </Tag>
                ),
              },
              {
                title: '说明',
                dataIndex: 'description',
                render: (v) => <span style={{ color: 'rgba(0,0,0,0.45)', fontSize: 13 }}>{v || '-'}</span>,
              },
              {
                title: '操作',
                width: 160,
                fixed: 'right',
                align: 'center',
                render: (_, row) => (
                  <Space size="middle">
                    <Button
                      type="text"
                      icon={<EditOutlined />}
                      onClick={() => openEdit(row)}
                      style={{ color: '#1677ff' }}
                    >
                      编辑
                    </Button>
                    <Popconfirm
                      title="确认删除该配置？"
                      onConfirm={() => del(row.id)}
                      okText="确认删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                    >
                      <Button type="text" danger icon={<DeleteOutlined />}>
                        删除
                      </Button>
                    </Popconfirm>
                  </Space>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Modal
        title={editing ? '编辑配置' : '新建配置'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => void submit()}
        confirmLoading={submitLoading}
        destroyOnClose
        centered
        width={560}
      >
        <Form layout="vertical" form={form} style={{ marginTop: 24 }}>
          <Form.Item
            name="configKey"
            label="配置项 Key"
            rules={[{ required: true, message: '请输入配置 Key' }]}
            tooltip="建议使用小写字母和点号分隔，如 image.api.key"
          >
            <Input placeholder="例如：image.api.key" maxLength={100} size="large" />
          </Form.Item>
          <Form.Item
            name="configValue"
            label="配置内容 Value"
            rules={[{ required: true, message: '请输入配置 Value' }]}
          >
            <Input.TextArea rows={4} placeholder="请输入配置内容，支持多行文本或 JSON" size="large" />
          </Form.Item>
          <Form.Item name="description" label="备注说明">
            <Input placeholder="简要说明该配置的用途" maxLength={255} size="large" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
