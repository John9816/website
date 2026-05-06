import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button, Card, Result, Space, Spin, Typography } from 'antd'
import { getPublicKbShare } from '../api/kb'
import ThemeToggle from '../components/ThemeToggle'
import type { KbPublicDoc } from '../types'

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN')
}

function fallbackHtml(doc: KbPublicDoc | null) {
  const text = doc?.contentJson?.trim()
  if (!text) return '<p>这份分享文档没有正文内容。</p>'
  return `<pre style="white-space: pre-wrap; word-break: break-word;">${text}</pre>`
}

export default function KbSharePage() {
  const { token } = useParams<{ token: string }>()
  const [loading, setLoading] = useState(true)
  const [doc, setDoc] = useState<KbPublicDoc | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setError('分享令牌缺失')
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    getPublicKbShare(token)
      .then((data) => {
        if (!cancelled) setDoc(data)
      })
      .catch((nextError) => {
        if (!cancelled) setError((nextError as Error).message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [token])

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'linear-gradient(180deg, rgba(245, 247, 250, 0.95) 0%, rgba(235, 240, 246, 0.9) 100%)',
        padding: '24px 16px 48px',
      }}
    >
      <div
        style={{
          maxWidth: 960,
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <Space wrap>
          <Typography.Title level={4} style={{ margin: 0 }}>
            知识库公开分享
          </Typography.Title>
          <Typography.Text type="secondary">
            免登录访问
          </Typography.Text>
        </Space>
        <Space wrap>
          <Link to="/">
            <Button>返回首页</Button>
          </Link>
          <ThemeToggle bare />
        </Space>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        {loading ? (
          <Card>
            <div style={{ minHeight: 240, display: 'grid', placeItems: 'center' }}>
              <Spin size="large" />
            </div>
          </Card>
        ) : error ? (
          <Result
            status="warning"
            title="分享文档不可用"
            subTitle={error}
            extra={
              <Link to="/">
                <Button type="primary">返回首页</Button>
              </Link>
            }
          />
        ) : (
          <Card>
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <div>
                <Typography.Title level={2} style={{ marginBottom: 8 }}>
                  {doc?.title || '未命名文档'}
                </Typography.Title>
                {doc?.summary && (
                  <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                    {doc.summary}
                  </Typography.Paragraph>
                )}
                <Typography.Text type="secondary">
                  最近更新：{formatDateTime(doc?.updatedAt)}
                </Typography.Text>
              </div>

              <div
                style={{ minHeight: 200 }}
                dangerouslySetInnerHTML={{
                  __html: doc?.contentHtml || fallbackHtml(doc),
                }}
              />
            </Space>
          </Card>
        )}
      </div>
    </div>
  )
}
