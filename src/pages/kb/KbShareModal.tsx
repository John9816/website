import React from 'react'
import { Button, Card, Input, Modal, Popconfirm, Space, Typography } from 'antd'
import { CopyOutlined } from '@ant-design/icons'
import { useKbContext } from './context'

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN')
}

async function copyText(text: string, success: (msg: string) => void, error: (msg: string) => void) {
  try {
    await navigator.clipboard.writeText(text)
    success('已复制到剪贴板')
  } catch {
    error('复制失败，请检查浏览器权限')
  }
}

const KbShareModal: React.FC = () => {
  const {
    shareModalOpen,
    setShareModalOpen,
    shareDoc,
    shareLoading,
    shareInfo,
    shareSaving,
    shareExpiresAt,
    setShareExpiresAt,
    shareUrl,
    handleSaveShare,
    handleDisableShare,
  } = useKbContext()

  return (
    <Modal
      title={shareDoc ? `公开分享 · ${shareDoc.title}` : '公开分享'}
      open={shareModalOpen}
      onCancel={() => setShareModalOpen(false)}
      footer={null}
      destroyOnClose
    >
      {shareLoading ? (
        <Typography.Text type="secondary">正在读取分享状态...</Typography.Text>
      ) : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            公开链接会走当前前端路由 `/kb/share/:token`，页面内部再请求后端公开接口。
          </Typography.Paragraph>

          <Input
            addonBefore="过期时间"
            type="datetime-local"
            value={shareExpiresAt}
            onChange={(event) => setShareExpiresAt(event.target.value)}
          />

          {shareInfo ? (
            <>
              <Card size="small">
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <div>
                    <Typography.Text type="secondary">Token：</Typography.Text>
                    <Typography.Text code>{shareInfo.token}</Typography.Text>
                  </div>
                  <div>
                    <Typography.Text type="secondary">访问量：</Typography.Text>
                    <Typography.Text>{shareInfo.viewCount}</Typography.Text>
                  </div>
                  <div>
                    <Typography.Text type="secondary">更新时间：</Typography.Text>
                    <Typography.Text>{formatDateTime(shareInfo.updatedAt)}</Typography.Text>
                  </div>
                  <Input value={shareUrl} readOnly />
                </Space>
              </Card>

              <Space wrap>
                <Button type="primary" loading={shareSaving} onClick={() => void handleSaveShare(false)}>
                  保存分享设置
                </Button>
                <Button loading={shareSaving} onClick={() => void handleSaveShare(true)}>
                  轮换 Token
                </Button>
                <Button
                  icon={<CopyOutlined />}
                  onClick={() => void copyText(shareUrl, (m) => console.log(m), (e) => console.error(e))}
                >
                  复制公开链接
                </Button>
                <Button
                  icon={<CopyOutlined />}
                  onClick={() => void copyText(shareInfo.token, (m) => console.log(m), (e) => console.error(e))}
                >
                  复制 Token
                </Button>
                <Popconfirm title="确定关闭当前公开分享吗？" onConfirm={() => void handleDisableShare()}>
                  <Button danger loading={shareSaving}>
                    关闭分享
                  </Button>
                </Popconfirm>
              </Space>
            </>
          ) : (
            <Space>
              <Button type="primary" loading={shareSaving} onClick={() => void handleSaveShare(false)}>
                启用公开分享
              </Button>
            </Space>
          )}
        </Space>
      )}
    </Modal>
  )
}

export default React.memo(KbShareModal)
