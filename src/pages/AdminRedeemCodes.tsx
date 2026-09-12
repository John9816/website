import { useCallback, useEffect, useState } from 'react'
import {
  App as AntApp,
  Button,
  Card,
  Form,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import { GiftOutlined, ReloadOutlined, UndoOutlined } from '@ant-design/icons'
import {
  adminGenerateRedeemCodes,
  adminListRedeemCodes,
  adminRevokeRedeemCode,
} from '../api/membership'
import type {
  RedeemCodeAdminView,
  RedeemCodeBatchView,
  RedeemCodeStatus,
  RedeemCodeType,
} from '../types'
import { writeClipboardText } from '../utils/clipboard'
import '../styles/admin-redeem-codes.css'

const PAGE_SIZE = 20

const TYPE_OPTIONS: Array<{ label: string; value: RedeemCodeType }> = [
  { label: '日卡', value: 'DAY' },
  { label: '周卡', value: 'WEEK' },
  { label: '月卡', value: 'MONTH' },
  { label: '年卡', value: 'YEAR' },
  { label: '永久卡', value: 'LIFETIME' },
]

const STATUS_META: Record<RedeemCodeStatus, { label: string; color: string }> = {
  UNUSED: { label: '未使用', color: 'blue' },
  REDEEMED: { label: '已使用', color: 'green' },
  REVOKED: { label: '已撤销', color: 'red' },
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value.replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

export default function AdminRedeemCodes() {
  const { message } = AntApp.useApp()
  const [rows, setRows] = useState<RedeemCodeAdminView[]>([])
  const [loading, setLoading] = useState(false)
  const [revokingId, setRevokingId] = useState<number | null>(null)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [filters, setFilters] = useState<{ type?: RedeemCodeType; status?: RedeemCodeStatus }>({})
  const [generateOpen, setGenerateOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [batch, setBatch] = useState<RedeemCodeBatchView | null>(null)
  const [generateForm] = Form.useForm<{ type: RedeemCodeType; quantity: number }>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await adminListRedeemCodes({
        page,
        size: PAGE_SIZE,
        type: filters.type,
        status: filters.status,
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

  const copyText = async (text: string) => {
    try {
      await writeClipboardText(text)
      message.success('已复制')
    } catch {
      message.error('复制失败，请手动选择文本')
    }
  }

  const generate = async () => {
    const values = await generateForm.validateFields()
    setGenerating(true)
    try {
      const result = await adminGenerateRedeemCodes(values.type, values.quantity)
      setBatch(result)
      setGenerateOpen(false)
      generateForm.resetFields()
      if (page === 0) {
        await load()
      } else {
        setPage(0)
      }
      message.success(`已生成 ${result.quantity} 个${result.typeName}兑换码`)
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  const revoke = async (row: RedeemCodeAdminView) => {
    setRevokingId(row.id)
    try {
      const updated = await adminRevokeRedeemCode(row.id)
      setRows((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      message.success('兑换码已撤销')
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <div className="admin-redeem-codes admin-page">
      <div className="admin-redeem-codes__header admin-page__header">
        <div>
          <Typography.Title level={2}>兑换码管理</Typography.Title>
          <Typography.Paragraph>
            生成、查看与撤销会员兑换码，共 {total} 条
          </Typography.Paragraph>
        </div>
        <Space className="admin-page__actions" wrap>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
            刷新
          </Button>
          <Button
            type="primary"
            icon={<GiftOutlined />}
            onClick={() => {
              generateForm.resetFields()
              generateForm.setFieldsValue({ type: 'MONTH', quantity: 1 })
              setGenerateOpen(true)
            }}
          >
            生成兑换码
          </Button>
        </Space>
      </div>

      <div className="admin-redeem-codes__filters">
        <Select
          allowClear
          placeholder="全部类型"
          options={TYPE_OPTIONS}
          onChange={(type) => {
            setPage(0)
            setFilters((previous) => ({ ...previous, type }))
          }}
        />
        <Select
          allowClear
          placeholder="全部状态"
          options={[
            { label: '未使用', value: 'UNUSED' },
            { label: '已使用', value: 'REDEEMED' },
            { label: '已撤销', value: 'REVOKED' },
          ]}
          onChange={(status) => {
            setPage(0)
            setFilters((previous) => ({ ...previous, status }))
          }}
        />
      </div>

      <Card className="admin-redeem-codes__table-card admin-page__panel" styles={{ body: { padding: 0 } }}>
        <Table<RedeemCodeAdminView>
          rowKey="id"
          dataSource={rows}
          loading={loading}
          scroll={{ x: 1120 }}
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
              render: (id: number) => <span className="admin-redeem-codes__id">#{id}</span>,
            },
            {
              title: '兑换码',
              dataIndex: 'codePreview',
              width: 240,
              render: (code: string) => <code className="admin-redeem-codes__code">{code}</code>,
            },
            {
              title: '类型',
              dataIndex: 'typeName',
              width: 110,
              render: (_, row) => <Tag color="gold">{row.typeName}</Tag>,
            },
            {
              title: '状态',
              dataIndex: 'status',
              width: 110,
              render: (status: RedeemCodeStatus) => (
                <Tag color={STATUS_META[status].color}>{STATUS_META[status].label}</Tag>
              ),
            },
            {
              title: '兑换用户',
              dataIndex: 'redeemedByUserId',
              width: 120,
              render: (userId?: number | null) =>
                userId ? (
                  <span className="admin-redeem-codes__user">#{userId}</span>
                ) : (
                  <span className="admin-redeem-codes__empty">-</span>
                ),
            },
            {
              title: '兑换时间',
              dataIndex: 'redeemedAt',
              width: 170,
              render: (value?: string | null) => formatDate(value),
            },
            {
              title: '撤销时间',
              dataIndex: 'revokedAt',
              width: 170,
              render: (value?: string | null) => formatDate(value),
            },
            {
              title: '创建时间',
              dataIndex: 'createdAt',
              width: 170,
              render: (value?: string | null) => formatDate(value),
            },
            {
              title: '操作',
              key: 'actions',
              width: 100,
              fixed: 'right',
              render: (_, row) =>
                row.status === 'UNUSED' ? (
                  <Popconfirm
                    title="撤销后该兑换码将无法使用，确定撤销？"
                    okText="撤销"
                    okButtonProps={{ danger: true }}
                    cancelText="取消"
                    onConfirm={() => void revoke(row)}
                  >
                    <Button
                      danger
                      type="link"
                      size="small"
                      icon={<UndoOutlined />}
                      loading={revokingId === row.id}
                    >
                      撤销
                    </Button>
                  </Popconfirm>
                ) : (
                  <span className="admin-redeem-codes__empty">-</span>
                ),
            },
          ]}
        />
      </Card>

      <Modal
        title="生成兑换码"
        open={generateOpen}
        confirmLoading={generating}
        okText="生成"
        onCancel={() => setGenerateOpen(false)}
        onOk={() => void generate()}
        destroyOnHidden
      >
        <Form form={generateForm} layout="vertical">
          <Form.Item
            name="type"
            label="会员类型"
            rules={[{ required: true, message: '请选择会员类型' }]}
          >
            <Select options={TYPE_OPTIONS} placeholder="选择会员类型" />
          </Form.Item>
          <Form.Item
            name="quantity"
            label="生成数量"
            rules={[{ required: true, message: '请输入生成数量' }]}
          >
            <InputNumber min={1} max={100} precision={0} style={{ width: '100%' }} placeholder="1-100" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`生成成功 · ${batch?.typeName ?? ''}兑换码`}
        open={!!batch}
        footer={null}
        onCancel={() => setBatch(null)}
        destroyOnHidden
      >
        <div className="admin-redeem-codes__batch-warn">
          兑换码仅显示这一次，请立即复制保存；已使用过的兑换码无法再次查看完整内容。
          <br />
          <strong>注意：</strong>生成的码通常有使用期限，请根据后端配置检查过期时间。
        </div>
        <div className="admin-redeem-codes__batch-actions">
          <Button
            type="primary"
            onClick={() => void copyText(batch?.codes.join('\n') ?? '')}
          >
            一键复制全部（{batch?.quantity ?? 0} 个）
          </Button>
        </div>
        <div className="admin-redeem-codes__batch-list">
          {batch?.codes.map((code) => (
            <div key={code} className="admin-redeem-codes__batch-item">
              <code>{code}</code>
              <Button type="link" size="small" onClick={() => void copyText(code)}>
                复制
              </Button>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  )
}
