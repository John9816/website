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
  Skeleton,
  Typography,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, GlobalOutlined } from '@ant-design/icons'
import {
  adminListLinks,
  adminCreateLink,
  adminUpdateLink,
  adminDeleteLink,
  adminListCategories,
} from '../api/admin'
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '../constants/pagination'
import type { Category, NavLink } from '../types'
import CategoryIcon from '../components/CategoryIcon'

export default function AdminLinks() {
  const [rows, setRows] = useState<NavLink[]>([])
  const [cats, setCats] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
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
    setSubmitLoading(true)
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
    } finally {
      setSubmitLoading(false)
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>链接管理</h2>
          <p style={{ margin: '4px 0 0', color: 'rgba(0,0,0,0.45)' }}>管理导航站的所有链接条目</p>
        </div>
        <Space size="middle">
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
            size="large"
          />
          <Button icon={<ReloadOutlined />} onClick={() => load(filterCat)} loading={loading} size="large">
            刷新
          </Button>
          <Button type="primary" size="large" icon={<PlusOutlined />} onClick={openCreate}>
            新建链接
          </Button>
        </Space>
      </div>

      <Card styles={{ body: { padding: 0 } }} style={{ overflow: 'hidden', border: 'none', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02)' }}>
        {loading && rows.length === 0 ? (
          <div style={{ padding: 24 }}>
            <Skeleton active paragraph={{ rows: 10 }} />
          </div>
        ) : (
          <Table
            rowKey="id"
            dataSource={rows}
            loading={loading}
            pagination={{
              defaultPageSize: DEFAULT_PAGE_SIZE,
              showSizeChanger: true,
              showQuickJumper: false,
              pageSizeOptions: PAGE_SIZE_OPTIONS,
              position: ['bottomRight'],
              style: { padding: '16px 24px' }
            }}
            scroll={{ x: 'max-content' }}
            style={{ width: '100%' }}
            columns={[
              {
                title: '图标',
                dataIndex: 'icon',
                width: 64,
                align: 'center',
                render: (v: string | null, row) => (
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 8,
                      background: 'rgba(0,0,0,0.02)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid rgba(0,0,0,0.05)'
                    }}
                  >
                    <CategoryIcon icon={v} size={20} alt={row.name} />
                  </div>
                ),
              },
              {
                title: '站点名称',
                dataIndex: 'name',
                width: 140,
                ellipsis: true,
                render: (v) => <span style={{ fontWeight: 600 }}>{v}</span>,
              },
              {
                title: '分类',
                dataIndex: 'categoryId',
                width: 100,
                render: (id: number) => {
                  const cat = catMap.get(id)
                  return (
                    <Tag color="blue" style={{ borderRadius: 4, padding: '2px 8px' }}>
                      {cat?.name ?? id}
                    </Tag>
                  )
                },
              },
              {
                title: 'URL 地址',
                dataIndex: 'url',
                width: 150,
                ellipsis: true,
                render: (v: string) => (
                  <Space size={4}>
                    <GlobalOutlined style={{ color: 'rgba(0,0,0,0.25)' }} />
                    <a href={v} target="_blank" rel="noreferrer" style={{ color: '#1677ff' }}>
                      {v}
                    </a>
                  </Space>
                ),
              },
              {
                title: '描述',
                dataIndex: 'description',
                width: 250,
                render: (v) => (
                  <div style={{ maxWidth: 250 }}>
                    <Typography.Paragraph
                      ellipsis={{ rows: 1, tooltip: v }}
                      style={{ color: 'rgba(0,0,0,0.45)', fontSize: 13, marginBottom: 0 }}
                    >
                      {v || '-'}
                    </Typography.Paragraph>
                  </div>
                ),
              },
              {
                title: '排序',
                dataIndex: 'sortOrder',
                width: 80,
                align: 'center',
                render: (v) => <Tag style={{ border: 'none', background: 'rgba(0,0,0,0.04)', fontWeight: 500 }}>{v}</Tag>,
              },
              {
                title: '操作',
                width: 140,
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
                      title="确认删除该链接？"
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
        title={editing ? '编辑链接' : '新建链接'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={submit}
        confirmLoading={submitLoading}
        destroyOnClose
        centered
        width={600}
      >
        <Form layout="vertical" form={form} style={{ marginTop: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="name" label="站点名称" rules={[{ required: true, message: '请输入站点名称' }]}>
              <Input placeholder="例如：GitHub" maxLength={100} size="large" />
            </Form.Item>
            <Form.Item name="categoryId" label="所属分类" rules={[{ required: true, message: '请选择分类' }]}>
              <Select
                options={cats.map((c) => ({ value: c.id, label: c.name }))}
                placeholder="选择分类"
                size="large"
              />
            </Form.Item>
          </div>
          <Form.Item name="url" label="URL 地址" rules={[{ required: true, type: 'url', message: '请输入有效的 URL' }]}>
            <Input placeholder="https://..." size="large" />
          </Form.Item>
          <Form.Item name="description" label="描述说明">
            <Input.TextArea rows={3} placeholder="简要描述该站点的功能或用途" maxLength={255} showCount />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item
              name="icon"
              label="图标/Favicon"
              tooltip="支持 Lucide 图标名 或 图片 URL（favicon）"
            >
              <Input placeholder="Rocket 或 https://..." size="large" />
            </Form.Item>
            <Form.Item name="sortOrder" label="排序权重" rules={[{ required: true, message: '请输入排序权重' }]}>
              <InputNumber min={0} style={{ width: '100%' }} size="large" />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  )
}
