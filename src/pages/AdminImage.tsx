import { useEffect, useRef, useState } from 'react'
import {
  App as AntApp,
  Button,
  Card,
  Form,
  Image,
  Input,
  Popconfirm,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { CopyOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  adminDeleteImageHistory,
  adminGenerateImage,
  adminListImageHistory,
} from '../api/admin'
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '../constants/pagination'
import type { GeneratedImageView, ImageGenerateResult } from '../types'

export default function AdminImage() {
  const [form] = Form.useForm<{ prompt: string }>()
  const [loading, setLoading] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<ImageGenerateResult | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const { message } = AntApp.useApp()

  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyItems, setHistoryItems] = useState<GeneratedImageView[]>([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyPage, setHistoryPage] = useState(1)
  const [historyPageSize, setHistoryPageSize] = useState(DEFAULT_PAGE_SIZE)

  const loadHistory = async (page = historyPage, pageSize = historyPageSize) => {
    setHistoryLoading(true)
    try {
      const data = await adminListImageHistory(page - 1, pageSize)
      setHistoryItems(data.items)
      setHistoryTotal(data.total)
      setHistoryPage(page)
      setHistoryPageSize(pageSize)
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    loadHistory(1, DEFAULT_PAGE_SIZE)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!loading) return
    setElapsed(0)
    const started = Date.now()
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000))
    }, 500)
    return () => window.clearInterval(id)
  }, [loading])

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const onFinish = async (values: { prompt: string }) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)
    setResult(null)
    try {
      const data = await adminGenerateImage(values.prompt, ctrl.signal)
      setResult(data)
      message.success('生成成功')
      loadHistory(1, historyPageSize)
    } catch (e) {
      const err = e as Error & { code?: number }
      if (err.code === -2) {
        message.info('已取消生成')
      } else {
        message.error(err.message)
      }
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }

  const onCancel = () => {
    abortRef.current?.abort()
  }

  const onReusePrompt = (prompt: string) => {
    form.setFieldsValue({ prompt })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const onCopyPrompt = async (prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt)
      message.success('已复制提示词')
    } catch {
      message.error('复制失败')
    }
  }

  const onDeleteHistory = async (id: number) => {
    try {
      await adminDeleteImageHistory(id)
      message.success('已删除')
      const remainOnPage = historyItems.length - 1
      const nextPage =
        remainOnPage === 0 && historyPage > 1 ? historyPage - 1 : historyPage
      loadHistory(nextPage, historyPageSize)
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card title="图片生成">
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          通过后端代理的上游接口生成图片。上游生成耗时通常 <strong>30 秒 – 3 分钟</strong>
          （最长约 3.5 分钟）。生成过程中请保持本页打开；如需放弃，请点击取消。
        </Typography.Paragraph>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item
            name="prompt"
            label="提示词"
            rules={[{ required: true, message: '请输入提示词' }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="例：a beautiful sunset over the ocean, cinematic lighting"
              maxLength={2000}
              showCount
              disabled={loading}
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space>
              <Button type="primary" htmlType="submit" loading={loading}>
                {loading ? `生成中 ${elapsed}s` : '生成'}
              </Button>
              {loading && (
                <Button danger onClick={onCancel}>
                  取消
                </Button>
              )}
            </Space>
          </Form.Item>
        </Form>
      </Card>

      {result && (
        <Card title="生成结果">
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div>
              <Typography.Text type="secondary">模型：</Typography.Text>
              <Typography.Text>{result.model}</Typography.Text>
            </div>
            {result.imageUrl ? (
              <Image
                src={result.imageUrl}
                alt="generated"
                style={{ maxWidth: '100%', borderRadius: 8 }}
              />
            ) : (
              <Typography.Text type="warning">未返回图片 URL</Typography.Text>
            )}
            {result.content && (
              <details>
                <summary style={{ cursor: 'pointer', color: 'var(--text-dim)' }}>
                  查看完整响应文本
                </summary>
                <pre
                  style={{
                    background: 'var(--panel-alt)',
                    padding: 12,
                    borderRadius: 6,
                    maxHeight: 280,
                    overflow: 'auto',
                    marginTop: 8,
                    fontSize: 12,
                  }}
                >
                  {result.content}
                </pre>
              </details>
            )}
          </Space>
        </Card>
      )}

      <Card
        title="生成历史"
        extra={
          <Button
            icon={<ReloadOutlined />}
            onClick={() => loadHistory(historyPage, historyPageSize)}
            loading={historyLoading}
          >
            刷新
          </Button>
        }
      >
        <Table<GeneratedImageView>
          rowKey="id"
          dataSource={historyItems}
          loading={historyLoading}
          size="middle"
          pagination={{
            current: historyPage,
            pageSize: historyPageSize,
            total: historyTotal,
            showSizeChanger: true,
            showQuickJumper: false,
            pageSizeOptions: PAGE_SIZE_OPTIONS,
            onChange: (page, pageSize) => loadHistory(page, pageSize),
          }}
          scroll={{ x: 820 }}
          columns={[
            { title: 'ID', dataIndex: 'id', width: 70 },
            {
              title: '图片',
              dataIndex: 'imageUrl',
              width: 100,
              render: (v: string) =>
                v ? (
                  <Image
                    src={v}
                    alt=""
                    width={64}
                    height={64}
                    style={{ borderRadius: 6, objectFit: 'cover' }}
                    preview={{ mask: '预览' }}
                  />
                ) : null,
            },
            {
              title: '提示词',
              dataIndex: 'prompt',
              ellipsis: true,
              render: (v: string) => (
                <Tooltip title={v} placement="topLeft">
                  <span>{v}</span>
                </Tooltip>
              ),
            },
            {
              title: '模型',
              dataIndex: 'model',
              width: 180,
              render: (v: string) => <Tag>{v}</Tag>,
            },
            {
              title: '创建时间',
              dataIndex: 'createdAt',
              width: 160,
            },
            {
              title: '操作',
              width: 200,
              fixed: 'right',
              render: (_v, row) => (
                <Space size={4}>
                  <Button
                    size="small"
                    icon={<ReloadOutlined />}
                    onClick={() => onReusePrompt(row.prompt)}
                  >
                    复用
                  </Button>
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => onCopyPrompt(row.prompt)}
                  />
                  <Popconfirm
                    title="删除这条记录？"
                    onConfirm={() => onDeleteHistory(row.id)}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>
    </Space>
  )
}
