import { useEffect, useMemo, useState } from 'react'
import {
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Popconfirm,
  Tag,
  App as AntApp,
  Card,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import {
  adminListLinks,
  adminCreateLink,
  adminUpdateLink,
  adminDeleteLink,
  adminListCategories,
} from '../api/admin'
import type { Category, NavLink } from '../types'
import CategoryIcon from '../components/CategoryIcon'

export default function AdminLinks() {
  const [rows, setRows] = useState<NavLink[]>([])
  const [cats, setCats] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [filterCat, setFilterCat] = useState<number | undefined>()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<NavLink | null>(null)
  const [form] = Form.useForm()
  const { message } = AntApp.useApp()

  const load = async (categoryId?: number) => {
    setLoading(true)
    try {
      const [links, categories] = await Promise.all([
        adminListLinks(categoryId),
        adminListCategories(),
      ])
      setRows(links)
      setCats(categories.sort((a, b) => a.sortOrder - b.sortOrder))
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const catMap = useMemo(() => {
    const m = new Map<number, Category>()
    cats.forEach((c) => m.set(c.id, c))
    return m
  }, [cats])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({
      categoryId: filterCat ?? cats[0]?.id,
      sortOrder: (rows.at(-1)?.sortOrder ?? 0) + 1,
    })
    setOpen(true)
  }
  const openEdit = (row: NavLink) => {
    setEditing(row)
    form.setFieldsValue(row)
    setOpen(true)
  }

  const submit = async () => {
    const values = await form.validateFields()
    try {
      if (editing) {
        await adminUpdateLink(editing.id, values)
        message.success('更新成功')
      } else {
        await adminCreateLink(values)
        message.success('创建成功')
      }
      setOpen(false)
      load(filterCat)
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const del = async (id: number) => {
    try {
      await adminDeleteLink(id)
      message.success('删除成功')
      load(filterCat)
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  return (
    <Card
      title="链接管理"
      extra={
        <Space>
          <Select
            allowClear
            placeholder="按分类筛选"
            style={{ width: 180 }}
            value={filterCat}
            options={cats.map((c) => ({ value: c.id, label: c.name }))}
            onChange={(v) => {
              setFilterCat(v)
              load(v)
            }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建链接
          </Button>
        </Space>
      }
    >
      <Table
        rowKey="id"
        dataSource={rows}
        loading={loading}
        pagination={{ pageSize: 20 }}
        columns={[
          { title: 'ID', dataIndex: 'id', width: 70 },
          {
            title: '图标',
            dataIndex: 'icon',
            width: 70,
            render: (v: string | null, row) => <CategoryIcon icon={v} size={22} alt={row.name} />,
          },
          { title: '名称', dataIndex: 'name' },
          {
            title: 'URL',
            dataIndex: 'url',
            ellipsis: true,
            render: (v: string) => (
              <a href={v} target="_blank" rel="noreferrer">
                {v}
              </a>
            ),
          },
          { title: '描述', dataIndex: 'description', ellipsis: true },
          {
            title: '分类',
            dataIndex: 'categoryId',
            width: 110,
            render: (id: number) => <Tag>{catMap.get(id)?.name ?? id}</Tag>,
          },
          { title: '排序', dataIndex: 'sortOrder', width: 80 },
          {
            title: '操作',
            width: 160,
            fixed: 'right',
            render: (_, row) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>
                  编辑
                </Button>
                <Popconfirm title="删除链接？" onConfirm={() => del(row.id)}>
                  <Button size="small" danger icon={<DeleteOutlined />}>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
        scroll={{ x: 960 }}
      />

      <Modal
        title={editing ? '编辑链接' : '新建链接'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={submit}
        destroyOnClose
        width={560}
      >
        <Form layout="vertical" form={form}>
          <Form.Item name="categoryId" label="分类" rules={[{ required: true }]}>
            <Select
              options={cats.map((c) => ({ value: c.id, label: c.name }))}
              placeholder="选择分类"
            />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input placeholder="站点名称" maxLength={100} />
          </Form.Item>
          <Form.Item name="url" label="URL" rules={[{ required: true, type: 'url' }]}>
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} maxLength={255} showCount />
          </Form.Item>
          <Form.Item
            name="icon"
            label="图标"
            tooltip="支持 Lucide 图标名 或 图片 URL（favicon）"
          >
            <Input placeholder="https://site.com/favicon.ico 或 Rocket" />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}
