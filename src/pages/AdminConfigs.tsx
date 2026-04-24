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
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import {
  adminListConfigs,
  adminCreateConfig,
  adminUpdateConfig,
  adminDeleteConfig,
} from '../api/admin'
import type { SysConfig } from '../types'

export default function AdminConfigs() {
  const [rows, setRows] = useState<SysConfig[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<SysConfig | null>(null)
  const [form] = Form.useForm()
  const { message } = AntApp.useApp()

  const load = async () => {
    setLoading(true)
    try {
      setRows(await adminListConfigs())
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
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
    try {
      if (editing) {
        await adminUpdateConfig(editing.id, values)
        message.success('更新成功')
      } else {
        await adminCreateConfig(values)
        message.success('创建成功')
      }
      setOpen(false)
      load()
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const del = async (id: number) => {
    try {
      await adminDeleteConfig(id)
      message.success('删除成功')
      load()
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  return (
    <Card
      title="系统配置"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新建配置
        </Button>
      }
    >
      <Typography.Paragraph type="secondary">
        图片生成等运行时集成从此处读取配置（如 <code>image.api.baseUrl</code>、
        <code>image.api.key</code>、<code>image.api.model</code>），可在不重启的情况下调整。
      </Typography.Paragraph>
      <Table
        rowKey="id"
        dataSource={rows}
        loading={loading}
        pagination={false}
        columns={[
          { title: 'ID', dataIndex: 'id', width: 70 },
          { title: 'Key', dataIndex: 'configKey' },
          {
            title: 'Value',
            dataIndex: 'configValue',
            ellipsis: true,
            render: (v: string) =>
              v && v.length > 40 ? `${v.slice(0, 40)}…` : v,
          },
          { title: '说明', dataIndex: 'description', ellipsis: true },
          {
            title: '操作',
            width: 160,
            render: (_, row) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>
                  编辑
                </Button>
                <Popconfirm title="删除配置？" onConfirm={() => del(row.id)}>
                  <Button size="small" danger icon={<DeleteOutlined />}>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editing ? '编辑配置' : '新建配置'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={submit}
        destroyOnClose
      >
        <Form layout="vertical" form={form}>
          <Form.Item name="configKey" label="Key" rules={[{ required: true }]}>
            <Input placeholder="image.api.key" maxLength={100} />
          </Form.Item>
          <Form.Item name="configValue" label="Value" rules={[{ required: true }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input maxLength={255} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}
