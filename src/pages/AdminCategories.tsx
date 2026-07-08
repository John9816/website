import { useEffect, useState } from 'react'
import {
  App as AntApp,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Skeleton,
  Space,
  Table,
} from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  adminCreateCategory,
  adminDeleteCategory,
  adminListCategories,
  adminUpdateCategory,
} from '../api/admin'
import CategoryIcon from '../components/CategoryIcon'
import type { Category } from '../types'
import '../styles/admin-categories.css'

const BUILT_IN_CATEGORY_ICONS = [
  { value: 'folder', label: '文件夹' },
  { value: 'navigation', label: '导航' },
  { value: 'code', label: '代码' },
  { value: 'terminal', label: '终端' },
  { value: 'tool', label: '工具' },
  { value: 'book-open', label: '学习' },
  { value: 'briefcase', label: '职场' },
  { value: 'newspaper', label: '资讯' },
  { value: 'sparkles', label: 'AI' },
  { value: 'database', label: '数据' },
  { value: 'cloud', label: '云服务' },
  { value: 'globe', label: '网站' },
  { value: 'rocket', label: '产品' },
  { value: 'image', label: '图片' },
  { value: 'music', label: '音乐' },
  { value: 'gamepad-2', label: '游戏' },
  { value: 'shopping-bag', label: '购物' },
  { value: 'heart', label: '收藏' },
  { value: 'star', label: '推荐' },
  { value: 'settings', label: '设置' },
]

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
    void load()
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
      void load()
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
      void load()
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  return (
    <div className="admin-categories">
      <div className="admin-categories__header">
        <div>
          <h2>分类管理</h2>
          <p>管理导航站的分类目录和排序</p>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
            刷新
          </Button>
          <Button type="primary" size="large" icon={<PlusOutlined />} onClick={openCreate}>
            新建分类
          </Button>
        </Space>
      </div>

      <Card className="admin-categories__card" styles={{ body: { padding: 0 } }}>
        {loading && rows.length === 0 ? (
          <div className="admin-categories__skeleton">
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
                render: (v) => <span className="admin-categories__sort">{v}</span>,
              },
              {
                title: '图标',
                dataIndex: 'icon',
                width: 80,
                align: 'center',
                render: (v: string | null) => (
                  <div className="admin-categories__icon-preview">
                    <CategoryIcon icon={v} size={20} />
                  </div>
                ),
              },
              {
                title: '名称',
                dataIndex: 'name',
                render: (v) => <span className="admin-categories__name">{v}</span>,
              },
              {
                title: '图标标识',
                dataIndex: 'icon',
                render: (v) => (v ? <code className="admin-categories__code">{v}</code> : '-'),
              },
              {
                title: '操作',
                width: 180,
                fixed: 'right',
                align: 'center',
                render: (_, row) => (
                  <Space size="middle">
                    <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(row)}>
                      编辑
                    </Button>
                    <Popconfirm
                      title="确认删除？"
                      description="该分类下的所有链接也会同步删除，此操作不可恢复。"
                      onConfirm={() => void del(row.id)}
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
        onOk={() => void submit()}
        confirmLoading={submitLoading}
        destroyOnClose
        centered
        width={560}
      >
        <Form layout="vertical" form={form} className="admin-categories__form">
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
            tooltip="支持内置图标标识、Lucide 图标名或图片 URL"
          >
            <Input placeholder="例如：navigation 或 https://..." size="large" />
          </Form.Item>
          <Form.Item label="内置图标">
            <div className="admin-category-icons">
              {BUILT_IN_CATEGORY_ICONS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className="admin-category-icons__item"
                  onClick={() => form.setFieldValue('icon', item.value)}
                  title={item.label}
                >
                  <CategoryIcon icon={item.value} size={20} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
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
