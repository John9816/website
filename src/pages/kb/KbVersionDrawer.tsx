import React from 'react'
import { Button, Card, Divider, Drawer, Empty, Space, Table, Tooltip, Typography } from 'antd'
import { useKbContext } from './context'
import type { KbDocVersion } from '../../types'

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN')
}

function stripHtml(html?: string | null) {
  if (!html) return ''
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const VERSION_PAGE_SIZE = 20

const KbVersionDrawer: React.FC = () => {
  const {
    versionDrawerDoc,
    setVersionDrawerDoc,
    versionsLoading,
    versionItems,
    versionPage,
    versionTotal,
    loadVersions,
    selectedVersionId,
    loadVersionDetail,
    versionDetail,
    versionDetailLoading,
    handleRestoreVersion,
  } = useKbContext()

  return (
    <Drawer
      title={versionDrawerDoc ? `版本历史 · ${versionDrawerDoc.title}` : '版本历史'}
      open={!!versionDrawerDoc}
      onClose={() => setVersionDrawerDoc(null)}
      width={860}
    >
      {versionDrawerDoc && (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Table<KbDocVersion>
            rowKey="id"
            size="small"
            loading={versionsLoading}
            dataSource={versionItems}
            pagination={{
              current: versionPage,
              pageSize: VERSION_PAGE_SIZE,
              total: versionTotal,
              onChange: (page) => void loadVersions(versionDrawerDoc.id, page),
            }}
            rowClassName={(record) => (record.id === selectedVersionId ? 'ant-table-row-selected' : '')}
            onRow={(record) => ({
              onClick: () => void loadVersionDetail(versionDrawerDoc.id, record.id),
            })}
            columns={[
              {
                title: '版本',
                dataIndex: 'versionNo',
                width: 90,
                render: (value: number) => `v${value}`,
              },
              { title: '标题', dataIndex: 'title' },
              {
                title: '备注',
                dataIndex: 'changeNote',
                render: (value: string | null) =>
                  value ? (
                    <Tooltip title={value}>
                      <span>{value}</span>
                    </Tooltip>
                  ) : (
                    '-'
                  ),
              },
              {
                title: '时间',
                dataIndex: 'createdAt',
                width: 180,
                render: (value: string) => formatDateTime(value),
              },
            ]}
          />

          <Card
            size="small"
            title={versionDetail ? `版本预览 · v${versionDetail.versionNo}` : '版本预览'}
            extra={
              <Button
                type="primary"
                disabled={!selectedVersionId}
                onClick={() => void handleRestoreVersion()}
              >
                恢复到此版本
              </Button>
            }
          >
            {versionDetailLoading ? (
              <Typography.Text type="secondary">正在加载版本内容...</Typography.Text>
            ) : versionDetail ? (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <div>
                  <Typography.Title level={5} style={{ marginBottom: 0 }}>
                    {versionDetail.title}
                  </Typography.Title>
                  {versionDetail.summary && (
                    <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                      {versionDetail.summary}
                    </Typography.Paragraph>
                  )}
                </div>
                <Typography.Text type="secondary">
                  版本说明：{versionDetail.changeNote || '无'} · 更新时间：{formatDateTime(versionDetail.createdAt)}
                </Typography.Text>
                <Divider style={{ margin: '8px 0' }} />
                <div
                  style={{ minHeight: 120 }}
                  dangerouslySetInnerHTML={{
                    __html:
                      versionDetail.contentHtml ||
                      `<p>${stripHtml(versionDetail.contentJson) || '这个版本没有可预览内容。'}</p>`,
                  }}
                />
              </Space>
            ) : (
              <Empty description="请选择一个版本查看详情" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </Space>
      )}
    </Drawer>
  )
}

export default React.memo(KbVersionDrawer)
