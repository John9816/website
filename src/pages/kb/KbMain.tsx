import React, { Suspense } from 'react'
import { Breadcrumb, Button, Empty, Input, Popconfirm, Select, Skeleton, Space, Table, Tag, Tooltip, Typography, App as AntApp, Segmented } from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  FileAddOutlined,
  HistoryOutlined,
  SettingOutlined,
  ShareAltOutlined,
} from '@ant-design/icons'
import { useKbContext } from './context'
import ErrorBoundary from '../../components/ErrorBoundary'
import { uploadKbAsset } from '../../api/kb'
import type { KbDocSummary } from '../../types'

const TiptapEditor = React.lazy(() => import('../../components/TiptapEditor'))

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN')
}

function escapeHtml(text?: string | null) {
  if (!text) return ''
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

const KbMain: React.FC = () => {
  const [toolbarContainer, setToolbarContainer] = React.useState<HTMLElement | null>(null)
  
  const {
    activeSpaceId,
    selectedParentId,
    setSelectedParentId,
    selectedDoc,
    selectedDocLoading,
    inlineEditingDocId,
    exitInlineEdit,
    setPropertyDrawerOpen,
    handleDeleteDoc,
    handleSaveInlineDoc,
    enterInlineEdit,
    openCreateDoc,
    openVersionsDrawer,
    openShareModal,
    openEditDoc,
    editTitle,
    setEditTitle,
    editSummary,
    setEditSummary,
    editInitialContent,
    setEditContentHtml,
    setEditContentJson,
    keyword,
    setKeyword,
    tagFilterId,
    setTagFilterId,
    tags,
    selectedRowKeys,
    setSelectedRowKeys,
    docs,
    docsLoading,
    docPage,
    setDocPage,
    docPageSize,
    setDocPageSize,
    docTotal,
    isDirty,
    autosaveStatus,
  } = useKbContext()

  const docColumns = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      render: (_: string, row: KbDocSummary) => (
        <Space direction="vertical" size={0}>
          <Button
            type="link"
            style={{ paddingInline: 0 }}
            onClick={() => setSelectedParentId(row.id)}
          >
            {row.title}
          </Button>
          {row.summary && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.summary}
            </Typography.Text>
          )}
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (value: string) => (
        <Tag color={value === 'published' ? 'green' : 'orange'}>
          {value === 'published' ? '已发布' : '草稿'}
        </Tag>
      ),
    },
    {
      title: '版本',
      dataIndex: 'versionNo',
      key: 'versionNo',
      width: 90,
      render: (value: number) => `v${value}`,
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 180,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '操作',
      key: 'action',
      width: 280,
      render: (_: unknown, row: KbDocSummary) => (
        <Space wrap size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => void openEditDoc(row)}>
            编辑
          </Button>
          <Button
            size="small"
            icon={<HistoryOutlined />}
            onClick={() => void openVersionsDrawer(row)}
          >
            版本
          </Button>
          <Button
            size="small"
            icon={<ShareAltOutlined />}
            onClick={() => void openShareModal(row)}
          >
            分享
          </Button>
          <Popconfirm
            title="删除文档后不可恢复"
            onConfirm={() => void handleDeleteDoc(row.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const selectedDocContentHtml =
    selectedDoc?.contentHtml ||
    (selectedDoc?.contentJson
      ? `<pre style="white-space: pre-wrap; word-break: break-word;">${escapeHtml(selectedDoc.contentJson)}</pre>`
      : '')

  const handleUploadEditorImage = React.useCallback(
    async (file: File) => {
      const result = await uploadKbAsset(file, selectedDoc?.id)
      return result.url
    },
    [selectedDoc?.id],
  )

  return (
    <section className="kb-admin-main">
      <div className="kb-admin-toolbar">
        <div className="kb-admin-toolbar__crumbs">
          <Breadcrumb
            items={[
              {
                title: (
                  <a
                    onClick={(event) => {
                      event.preventDefault()
                      exitInlineEdit()
                      setSelectedParentId(null)
                    }}
                  >
                    个人空间
                  </a>
                ),
              },
              ...(selectedDoc
                ? [
                    {
                      title: (
                        <a
                          onClick={(e) => {
                            e.preventDefault()
                            setSelectedParentId(null)
                          }}
                        >
                          文档列表
                        </a>
                      ),
                    },
                    { title: selectedDoc.title || '未命名文档' },
                  ]
                : [{ title: '文档列表' }]),
            ]}
          />
        </div>

        <div className="kb-admin-toolbar__actions">
          {selectedDoc ? (
            <>
              {inlineEditingDocId === selectedDoc.id && autosaveStatus !== 'idle' && (
                <span className="kb-admin-edit__autosave" style={{ marginRight: 8 }}>
                  {autosaveStatus === 'saving' && '正在自动保存...'}
                  {autosaveStatus === 'saved' && '草稿已保存'}
                  {autosaveStatus === 'error' && '自动保存失败'}
                </span>
              )}
              <Segmented
                options={['预览', '编辑']}
                value={inlineEditingDocId === selectedDoc.id ? '编辑' : '预览'}
                onChange={(value) => {
                  if (value === '编辑') {
                    enterInlineEdit(selectedDoc)
                  } else {
                    if (isDirty) {
                      handleSaveInlineDoc().then(() => exitInlineEdit())
                    } else {
                      exitInlineEdit()
                    }
                  }
                }}
              />
              <span className="kb-admin-toolbar__divider" />
              
              {inlineEditingDocId !== selectedDoc.id && (
                <>
                  <Tooltip title="新建子文档">
                    <Button
                      type="text"
                      icon={<FileAddOutlined />}
                      onClick={() => void openCreateDoc(selectedDoc.id)}
                    />
                  </Tooltip>
                  <Tooltip title="版本历史">
                    <Button
                      type="text"
                      icon={<HistoryOutlined />}
                      onClick={() =>
                        void openVersionsDrawer({
                          id: selectedDoc.id,
                          title: selectedDoc.title,
                        })
                      }
                    />
                  </Tooltip>
                  <Tooltip title="分享">
                    <Button
                      type="text"
                      icon={<ShareAltOutlined />}
                      onClick={() =>
                        void openShareModal({
                          id: selectedDoc.id,
                          title: selectedDoc.title,
                        })
                      }
                    />
                  </Tooltip>
                </>
              )}
              
              <Tooltip title="文档属性">
                <Button
                  type="text"
                  icon={<SettingOutlined />}
                  onClick={() => setPropertyDrawerOpen(true)}
                />
              </Tooltip>
              <Popconfirm
                title="删除文档后不可恢复"
                onConfirm={() => void handleDeleteDoc(selectedDoc.id)}
              >
                <Tooltip title="删除">
                  <Button type="text" danger icon={<DeleteOutlined />} />
                </Tooltip>
              </Popconfirm>
            </>
          ) : null}
        </div>
      </div>

      <div className="kb-admin-canvas">
        {selectedParentId ? (
          selectedDocLoading ? (
            <Typography.Text type="secondary">正在加载文档内容...</Typography.Text>
          ) : selectedDoc ? (
            inlineEditingDocId === selectedDoc.id ? (
              <div className="kb-admin-article">
                <div className="kb-admin-edit__title-group">
                  <div ref={setToolbarContainer} className="kb-admin-edit__tiptap-toolbar-wrapper"></div>
                  <input
                    className="kb-admin-edit__title"
                    placeholder="无标题文档"
                    maxLength={200}
                    value={editTitle}
                    onChange={(event) => setEditTitle(event.target.value)}
                  />
                </div>
                <textarea
                  className="kb-admin-edit__summary"
                  placeholder="补充一句摘要…"
                  maxLength={500}
                  rows={1}
                  value={editSummary}
                  onChange={(event) => setEditSummary(event.target.value)}
                />
                <div className="kb-admin-edit__editor">
                  <ErrorBoundary message="编辑器加载失败">
                    <Suspense fallback={<Skeleton active paragraph={{ rows: 10 }} />}>
                      <TiptapEditor
                        key={selectedDoc.id}
                        content={editInitialContent}
                        onChange={(html, json) => {
                          setEditContentHtml(html)
                          setEditContentJson(json ?? '')
                        }}
                        uploadImage={handleUploadEditorImage}
                        minHeight={400}
                        maxHeight="none"
                        toolbarContainer={toolbarContainer}
                      />
                    </Suspense>
                  </ErrorBoundary>
                </div>
              </div>
            ) : (
              <article className="kb-admin-article">
                <span className="kb-admin-article__eyebrow">个人空间</span>
                <Typography.Title level={1} className="kb-admin-article__title">
                  {selectedDoc.title}
                </Typography.Title>
                {selectedDoc.summary ? (
                  <Typography.Paragraph className="kb-admin-article__summary">
                    {selectedDoc.summary}
                  </Typography.Paragraph>
                ) : null}
                <div className="kb-admin-article__facts">
                  <span
                    className={`kb-admin-article__status is-${selectedDoc.status}`}
                  >
                    <span className="pill" />
                    {selectedDoc.status === 'published' ? '已发布' : '草稿'}
                  </span>
                  <span className="dot" />
                  <span>v{selectedDoc.versionNo}</span>
                  <span className="dot" />
                  <span>更新于 {formatDateTime(selectedDoc.updatedAt)}</span>
                  {selectedDoc.share?.token ? (
                    <>
                      <span className="dot" />
                      <span>已公开分享</span>
                    </>
                  ) : null}
                </div>
                {selectedDoc.tags.length ? (
                  <div className="kb-admin-article__tags">
                    {selectedDoc.tags.map((tag) => (
                      <Tag key={tag.id} color={tag.color || 'blue'}>
                        {tag.name}
                      </Tag>
                    ))}
                  </div>
                ) : null}
                <div className="kb-admin-article__divider" />
                {selectedDocContentHtml ? (
                  <div
                    className="kb-admin-article__body"
                    dangerouslySetInnerHTML={{ __html: selectedDocContentHtml }}
                  />
                ) : (
                  <div className="kb-admin-article__empty">
                    这个文档还没有正文内容
                  </div>
                )}
              </article>
            )
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="未找到该文档，可能已被删除"
            />
          )
        ) : (
          <div className="kb-admin-listmode">
            <div className="kb-admin-listmode__filters">
              <Input.Search
                allowClear
                placeholder="搜索标题或摘要"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                style={{ width: 260 }}
              />
              <Select
                allowClear
                showSearch
                placeholder="按标签筛选"
                value={tagFilterId}
                onChange={(value) => setTagFilterId(value)}
                options={tags.map((tag) => ({ value: tag.id, label: tag.name }))}
                style={{ width: 200 }}
                optionFilterProp="label"
              />
              <Button
                onClick={() => {
                  setKeyword('')
                  setTagFilterId(undefined)
                }}
              >
                清空筛选
              </Button>
              {selectedRowKeys.length > 0 && (
                <Space style={{ marginLeft: 'auto' }}>
                  <Typography.Text type="secondary">
                    已选 {selectedRowKeys.length} 项
                  </Typography.Text>
                  <Popconfirm
                    title={`确定删除这 ${selectedRowKeys.length} 个文档吗？`}
                    onConfirm={async () => {
                      try {
                        await Promise.all(
                          selectedRowKeys.map((key) => handleDeleteDoc(Number(key))),
                        )
                        const { message } = AntApp.useApp()
                        message.success('批量删除成功')
                        setSelectedRowKeys([])
                        // These will be refreshed by useEffects in Context
                      } catch (error) {
                        const { message } = AntApp.useApp()
                        message.error('部分文档删除失败')
                      }
                    }}
                  >
                    <Button danger size="small">
                      批量删除
                    </Button>
                  </Popconfirm>
                </Space>
              )}
            </div>

            <Table<KbDocSummary>
              rowKey="id"
              loading={docsLoading}
              dataSource={docs}
              columns={docColumns}
              rowSelection={{
                selectedRowKeys,
                onChange: (keys) => setSelectedRowKeys(keys),
              }}
              pagination={{
                current: docPage,
                pageSize: docPageSize,
                total: docTotal,
                onChange: (page, pageSize) => {
                  setDocPage(page)
                  setDocPageSize(pageSize)
                },
                showSizeChanger: true,
              }}
              locale={{
                emptyText: activeSpaceId
                  ? '当前筛选条件下没有文档'
                  : '请先创建个人空间',
              }}
            />
          </div>
        )}
      </div>
    </section>
  )
}

export default React.memo(KbMain)
