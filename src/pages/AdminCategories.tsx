import { useEffect, useState } from 'react'
import {
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  App as AntApp,
  Card,
  Skeleton,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  adminListCategories,
  adminCreateCategory,
  adminUpdateCategory,
  adminDeleteCategory,
} from '../api/admin'
import type { Category } from '../types'
import CategoryIcon from '../components/CategoryIcon'

export default function AdminCategories() {
  const [rows, setRows] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [form] = Form.useForm()
  const { message } = AntApp.useApp()

  const load = async () => {
    setLoading(true)
    try {
      const data = await adminListCategories()
      setRows(data.sort((a, b) => a.sortOrder - b.sortOrder))
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
    form.setFieldsValue({ sortOrder: (rows.at(-1)?.sortOrder ?? 0) + 1 })
    setOpen(true)
  }
  const openEdit = (row: Category) => {
    setEditing(row)
    form.setFieldsValue(row)
    setOpen(true)
  }

  const submit = async () => {
    const values = await form.validateFields()
    setSubmitLoading(true)
    try {
      if (editing) {
        await adminUpdateCategory(editing.id, values)
        message.success('更新成功')
      } else {
        await adminCreateCategory(values)
        message.success('创建成功')
      }
      setOpen(false)
      load()
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setSubmitLoading(false)
    }
  }

  const del = async (id: number) => {
    try {
      await adminDeleteCategory(id)
      message.success('删除成功')
      load()
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>分类管理</h2>
          <p style={{ margin: '4px 0 0', color: 'rgba(0,0,0,0.45)' }}>管理导航站的分类目录和排序</p>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
            刷新
          </Button>
          <Button type="primary" size="large" icon={<PlusOutlined />} onClick={openCreate}>
            新建分类
          </Button>
        </Space>
      </div>

      <Card styles={{ body: { padding: 0 } }} style={{ overflow: 'hidden', border: 'none', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02)' }}>
        {loading && rows.length === 0 ? (
          <div style={{ padding: 24 }}>
            <Skeleton active paragraph={{ rows: 8 }} />
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
                title: '排序',
                dataIndex: 'sortOrder',
                width: 80,
                align: 'center',
                render: (v) => <span style={{ fontWeight: 600, color: '#e11d48' }}>{v}</span>,
              },
              {
                title: '图标',
                dataIndex: 'icon',
                width: 80,
                align: 'center',
                render: (v: string | null) => (
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 8,
                      background: 'rgba(225, 29, 72, 0.05)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <CategoryIcon icon={v} size={20} />
                  </div>
                ),
              },
              {
                title: '名称',
                dataIndex: 'name',
                render: (v) => <span style={{ fontWeight: 500 }}>{v}</span>,
              },
              {
                title: '图标标识',
                dataIndex: 'icon',
                render: (v) => (v ? <code style={{ fontSize: 12, background: 'rgba(0,0,0,0.04)', padding: '2px 6px', borderRadius: 4 }}>{v}</code> : '-'),
              },
              {
                title: '操作',
                width: 180,
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
                      title="确认删除？"
                      description="该分类下的所有链接也将同步删除，此操作不可恢复。"
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
        title={editing ? '编辑分类' : '新建分类'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={submit}
        confirmLoading={submitLoading}
        destroyOnClose
        centered
        width={480}
      >
        <Form layout="vertical" form={form} style={{ marginTop: 24 }}>
          <Form.Item
            name="name"
            label="分类名称"
            rules={[{ required: true, message: '请输入分类名称' }]}
          >
            <Input placeholder="例如：开发工具" maxLength={50} size="large" />
          </Form.Item>
          <Form.Item
            name="icon"
            label="图标/图片"
            tooltip="支持 Lucide 图标名（如 Navigation）或图片 URL"
          >
            <Input placeholder="如：Navigation 或 https://..." size="large" />
          </Form.Item>
          <Form.Item
            name="sortOrder"
            label="排序权重"
            rules={[{ required: true, message: '请输入排序权重' }]}
            initialValue={0}
          >
            <InputNumber min={0} style={{ width: '100%' }} size="large" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
