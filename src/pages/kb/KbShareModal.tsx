import React from 'react'
import { App as AntApp, Button, Card, Input, Modal, Popconfirm, Space, Typography } from 'antd'
import { CopyOutlined, LinkOutlined, SyncOutlined } from '@ant-design/icons'
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
  const { message } = AntApp.useApp()
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

  const handleCopy = (text: string) => copyText(text, message.success, message.error)

  const handleOpenShare = () => {
    if (!shareUrl) return
    window.open(shareUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <Modal
      title={shareDoc ? `公开分享 · ${shareDoc.title}` : '公开分享'}
      open={shareModalOpen}
      onCancel={() => setShareModalOpen(false)}
      footer={null}
      destroyOnClose
      className="kb-share-modal"
    >
      {shareLoading ? (
        <Typography.Text type="secondary">正在读取分享状态...</Typography.Text>
      ) : (
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <Typography.Paragraph type="secondary" className="kb-share-modal__hint">
            启用后，拥有链接的人可以阅读这篇文档及其公开目录。需要停止访问时，可以随时关闭分享。
          </Typography.Paragraph>

          <Input
            addonBefore="过期时间"
            type="datetime-local"
            value={shareExpiresAt}
            onChange={(event) => setShareExpiresAt(event.target.value)}
          />

          {shareInfo ? (
            <>
              <Card size="small" className="kb-share-modal__card">
                <div className="kb-share-modal__facts">
                  <span>访问量</span>
                  <strong>{shareInfo.viewCount}</strong>
                  <span>更新时间</span>
                  <strong>{formatDateTime(shareInfo.updatedAt)}</strong>
                </div>
                <Input
                  className="kb-share-modal__url"
                  value={shareUrl}
                  readOnly
                  addonAfter={
                    <Button
                      type="text"
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={() => void handleCopy(shareUrl)}
                    >
                      复制
                    </Button>
                  }
                />
              </Card>

              <Space wrap className="kb-share-modal__actions">
                <Button type="primary" loading={shareSaving} onClick={() => void handleSaveShare(false)}>
                  保存分享设置
                </Button>
                <Button icon={<LinkOutlined />} onClick={handleOpenShare}>
                  打开链接
                </Button>
                <Button icon={<CopyOutlined />} onClick={() => void handleCopy(shareUrl)}>
                  复制链接
                </Button>
                <Button icon={<SyncOutlined />} loading={shareSaving} onClick={() => void handleSaveShare(true)}>
                  轮换 Token
                </Button>
                <Popconfirm title="确定关闭当前公开分享吗？" onConfirm={() => void handleDisableShare()}>
                  <Button danger loading={shareSaving}>
                    关闭分享
                  </Button>
                </Popconfirm>
              </Space>
            </>
          ) : (
            <Space direction="vertical" size={10}>
              <Typography.Text type="secondary">当前文档还没有公开链接。</Typography.Text>
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
