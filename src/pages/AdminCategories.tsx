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
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
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
    <Card
      title="分类管理"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新建分类
        </Button>
      }
    >
      <Table
        rowKey="id"
        dataSource={rows}
        loading={loading}
        pagination={false}
        columns={[
          { title: 'ID', dataIndex: 'id', width: 70 },
          {
            title: '图标',
            dataIndex: 'icon',
            width: 80,
            render: (v: string | null) => <CategoryIcon icon={v} size={22} />,
          },
          { title: '名称', dataIndex: 'name' },
          { title: '图标标识', dataIndex: 'icon', render: (v) => v || '-' },
          { title: '排序', dataIndex: 'sortOrder', width: 100 },
          {
            title: '操作',
            width: 160,
            render: (_, row) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>
                  编辑
                </Button>
                <Popconfirm
                  title="删除分类？"
                  description="该分类下的所有链接也会被删除"
                  onConfirm={() => del(row.id)}
                >
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
        title={editing ? '编辑分类' : '新建分类'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={submit}
        destroyOnClose
      >
        <Form layout="vertical" form={form}>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input placeholder="例如：开发工具" maxLength={50} />
          </Form.Item>
          <Form.Item
            name="icon"
            label="图标"
            tooltip="可填 Lucide 图标名（如 Navigation、Wrench），或一张图片 URL"
          >
            <Input placeholder="Navigation 或 https://..." />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}
