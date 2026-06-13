import React, { Suspense } from 'react'
import {
  App as AntApp,
  Breadcrumb,
  Button,
  Empty,
  Input,
  Popconfirm,
  Segmented,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  FileAddOutlined,
  HistoryOutlined,
  PlusOutlined,
  SearchOutlined,
  SettingOutlined,
  ShareAltOutlined,
  TagsOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import { useKbContext } from './context'
import ErrorBoundary from '../../components/ErrorBoundary'
import { uploadKbAsset } from '../../api/kb'
import type { KbDoc, KbDocSummary, KbDocTreeNode, KbTag } from '../../types'

const TiptapEditor = React.lazy(() => import('../../components/TiptapEditor'))

type OutlineItem = {
  id: string
  text: string
  level: number
}

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

function stripHtml(html: string) {
  if (!html) return ''
  if (typeof window === 'undefined') return html.replace(/<[^>]+>/g, ' ')
  const element = document.createElement('div')
  element.innerHTML = html
  return element.textContent || element.innerText || ''
}

function buildArticleContent(doc?: KbDoc | null): { html: string; outline: OutlineItem[]; wordCount: number } {
  const fallbackHtml = doc?.contentJson
    ? `<pre style="white-space: pre-wrap; word-break: break-word;">${escapeHtml(doc.contentJson)}</pre>`
    : ''
  const sourceHtml = doc?.contentHtml || fallbackHtml
  if (!sourceHtml) return { html: '', outline: [], wordCount: 0 }

  const text = stripHtml(sourceHtml).replace(/\s+/g, '')
  if (typeof window === 'undefined') return { html: sourceHtml, outline: [], wordCount: text.length }

  const parser = new DOMParser()
  const parsed = parser.parseFromString(sourceHtml, 'text/html')
  const outline: OutlineItem[] = []
  parsed.body.querySelectorAll('h1, h2, h3').forEach((heading, index) => {
    const title = heading.textContent?.trim()
    if (!title) return
    const id = `kb-heading-${index + 1}`
    heading.setAttribute('id', id)
    outline.push({
      id,
      text: title,
      level: Number(heading.tagName.slice(1)),
    })
  })

  return {
    html: parsed.body.innerHTML,
    outline,
    wordCount: text.length,
  }
}

function countTreeDocs(nodes: KbDocTreeNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countTreeDocs(node.children ?? []), 0)
}

function getStatusLabel(status: string) {
  return status === 'published' ? '已发布' : '草稿'
}

function StatusTag({ status }: { status: string }) {
  return (
    <Tag color={status === 'published' ? 'green' : 'orange'} bordered={false}>
      {getStatusLabel(status)}
    </Tag>
  )
}

function DocTags({ tags }: { tags: KbTag[] }) {
  if (!tags.length) return <Typography.Text type="secondary">暂无标签</Typography.Text>
  return (
    <Space size={[4, 4]} wrap>
      {tags.map((tag) => (
        <Tag key={tag.id} color={tag.color || 'blue'} bordered={false}>
          {tag.name}
        </Tag>
      ))}
    </Space>
  )
}

const KbMain: React.FC = () => {
  const [toolbarContainer, setToolbarContainer] = React.useState<HTMLElement | null>(null)
  const [listView, setListView] = React.useState<'table' | 'cards'>('cards')
  const { message } = AntApp.useApp()

  const {
    spaces,
    activeSpaceId,
    tree,
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
    setTagModalOpen,
    docs,
    docsLoading,
    docPage,
    setDocPage,
    docPageSize,
    setDocPageSize,
    docTotal,
    isDirty,
    autosaveStatus,
    inlineDocSaving,
  } = useKbContext()

  const activeSpace = spaces.find((space) => space.id === activeSpaceId)
  const articleContent = React.useMemo(() => buildArticleContent(selectedDoc), [selectedDoc])
  const totalTreeDocs = React.useMemo(() => countTreeDocs(tree), [tree])
  const publishedInPage = docs.filter((doc) => doc.status === 'published').length
  const draftInPage = docs.filter((doc) => doc.status !== 'published').length
  const isEditing = selectedDoc ? inlineEditingDocId === selectedDoc.id : false

  const docColumns = React.useMemo(
    () => [
      {
        title: '标题',
        dataIndex: 'title',
        key: 'title',
        render: (_: string, row: KbDocSummary) => (
          <button
            type="button"
            className="kb-admin-table-title"
            onClick={() => setSelectedParentId(row.id)}
          >
            <span>{row.title || '未命名文档'}</span>
            {row.summary ? <small>{row.summary}</small> : null}
          </button>
        ),
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 100,
        render: (value: string) => <StatusTag status={value} />,
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
        width: 248,
        render: (_: unknown, row: KbDocSummary) => (
          <Space wrap size={4}>
            <Button size="small" icon={<EditOutlined />} onClick={() => void openEditDoc(row)}>
              编辑
            </Button>
            <Button size="small" icon={<HistoryOutlined />} onClick={() => void openVersionsDrawer(row)}>
              版本
            </Button>
            <Button size="small" icon={<ShareAltOutlined />} onClick={() => void openShareModal(row)}>
              分享
            </Button>
            <Popconfirm title="删除文档后不可恢复" onConfirm={() => void handleDeleteDoc(row.id)}>
              <Button size="small" danger icon={<DeleteOutlined />} aria-label="删除文档" />
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [handleDeleteDoc, openEditDoc, openShareModal, openVersionsDrawer, setSelectedParentId],
  )

  const handleUploadEditorImage = React.useCallback(
    async (file: File) => {
      const result = await uploadKbAsset(file, selectedDoc?.id)
      return result.url
    },
    [selectedDoc?.id],
  )

  const handleBatchDelete = React.useCallback(async () => {
    try {
      await Promise.all(selectedRowKeys.map((key) => handleDeleteDoc(Number(key))))
      message.success('批量删除成功')
      setSelectedRowKeys([])
    } catch {
      message.error('部分文档删除失败')
    }
  }, [handleDeleteDoc, message, selectedRowKeys, setSelectedRowKeys])

  const renderDocCards = () => (
    <div className="kb-admin-doc-grid">
      {docs.map((doc) => (
        <article key={doc.id} className="kb-admin-doc-card">
          <button type="button" className="kb-admin-doc-card__main" onClick={() => setSelectedParentId(doc.id)}>
            <div className="kb-admin-doc-card__topline">
              <StatusTag status={doc.status} />
              <span>v{doc.versionNo}</span>
            </div>
            <h3>{doc.title || '未命名文档'}</h3>
            <p>{doc.summary || '暂无摘要，打开文档后可以补充一句话说明。'}</p>
            <span className="kb-admin-doc-card__time">更新于 {formatDateTime(doc.updatedAt)}</span>
          </button>
          <div className="kb-admin-doc-card__actions">
            <Tooltip title="编辑">
              <Button size="small" type="text" icon={<EditOutlined />} onClick={() => void openEditDoc(doc)} />
            </Tooltip>
            <Tooltip title="版本历史">
              <Button size="small" type="text" icon={<HistoryOutlined />} onClick={() => void openVersionsDrawer(doc)} />
            </Tooltip>
            <Tooltip title="分享">
              <Button size="small" type="text" icon={<ShareAltOutlined />} onClick={() => void openShareModal(doc)} />
            </Tooltip>
            <Popconfirm title="删除文档后不可恢复" onConfirm={() => void handleDeleteDoc(doc.id)}>
              <Tooltip title="删除">
                <Button size="small" type="text" danger icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          </div>
        </article>
      ))}
    </div>
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
                    个人知识库
                  </a>
                ),
              },
              ...(selectedDoc
                ? [
                    {
                      title: (
                        <a
                          onClick={(event) => {
                            event.preventDefault()
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
              {isEditing && autosaveStatus !== 'idle' ? (
                <span className={`kb-admin-edit__autosave is-${autosaveStatus}`}>
                  {autosaveStatus === 'saving' && '正在自动保存...'}
                  {autosaveStatus === 'saved' && '草稿已保存'}
                  {autosaveStatus === 'error' && '自动保存失败'}
                </span>
              ) : null}
              <Segmented
                options={['预览', '编辑']}
                value={isEditing ? '编辑' : '预览'}
                onChange={(value) => {
                  if (value === '编辑') {
                    enterInlineEdit(selectedDoc)
                    return
                  }
                  if (isDirty) {
                    handleSaveInlineDoc().then(() => exitInlineEdit())
                  } else {
                    exitInlineEdit()
                  }
                }}
              />
              <span className="kb-admin-toolbar__divider" />

              {!isEditing ? (
                <>
                  <Tooltip title="新建子文档">
                    <Button type="text" icon={<FileAddOutlined />} onClick={() => void openCreateDoc(selectedDoc.id)} />
                  </Tooltip>
                  <Tooltip title="版本历史">
                    <Button
                      type="text"
                      icon={<HistoryOutlined />}
                      onClick={() => void openVersionsDrawer({ id: selectedDoc.id, title: selectedDoc.title })}
                    />
                  </Tooltip>
                  <Tooltip title="分享">
                    <Button
                      type="text"
                      icon={<ShareAltOutlined />}
                      onClick={() => void openShareModal({ id: selectedDoc.id, title: selectedDoc.title })}
                    />
                  </Tooltip>
                </>
              ) : null}

              <Tooltip title="文档属性">
                <Button type="text" icon={<SettingOutlined />} onClick={() => setPropertyDrawerOpen(true)} />
              </Tooltip>
              <Popconfirm title="删除文档后不可恢复" onConfirm={() => void handleDeleteDoc(selectedDoc.id)}>
                <Tooltip title="删除">
                  <Button type="text" danger icon={<DeleteOutlined />} />
                </Tooltip>
              </Popconfirm>
            </>
          ) : (
            <>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => void openCreateDoc(null)}>
                新建文档
              </Button>
              <Button icon={<TagsOutlined />} onClick={() => setTagModalOpen(true)}>
                标签
              </Button>
            </>
          )}
        </div>
      </div>

      <div className={`kb-admin-canvas${isEditing ? ' kb-admin-canvas--editing' : ''}`}>
        {selectedParentId ? (
          selectedDocLoading ? (
            <div className="kb-admin-loading">
              <Skeleton active paragraph={{ rows: 10 }} />
            </div>
          ) : selectedDoc ? (
            isEditing ? (
              <div className="kb-admin-workspace kb-admin-workspace--editing">
                <div className="kb-admin-editor-shell">
                  <header className="kb-admin-editor-head">
                    <div className="kb-admin-editor-head__meta">
                      <span>{activeSpace?.name || '个人空间'}</span>
                      <span>{getStatusLabel(selectedDoc.status)}</span>
                      <span>v{selectedDoc.versionNo}</span>
                    </div>
                    <input
                      className="kb-admin-edit__title"
                      placeholder="无标题文档"
                      maxLength={200}
                      value={editTitle}
                      onChange={(event) => setEditTitle(event.target.value)}
                    />
                    <textarea
                      className="kb-admin-edit__summary"
                      placeholder="补充一句摘要，方便列表和分享页快速理解这篇文档"
                      maxLength={500}
                      rows={2}
                      value={editSummary}
                      onChange={(event) => setEditSummary(event.target.value)}
                    />
                  </header>

                  <div className="kb-admin-editor-toolbar">
                    <div ref={setToolbarContainer} className="kb-admin-edit__tiptap-toolbar-wrapper" />
                  </div>

                  <div className="kb-admin-editor-paper">
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
                            minHeight={560}
                            maxHeight="none"
                            toolbarContainer={toolbarContainer}
                          />
                        </Suspense>
                      </ErrorBoundary>
                    </div>
                  </div>
                </div>
                <aside className="kb-admin-inspector kb-admin-inspector--editor">
                  <div className="kb-admin-inspector__section">
                    <span className="kb-admin-inspector__label">编辑状态</span>
                    <strong>{inlineDocSaving ? '正在保存' : isDirty ? '有未保存改动' : '已同步'}</strong>
                    <small>{autosaveStatus === 'saving' ? '自动保存中' : autosaveStatus === 'error' ? '自动保存失败，请手动保存' : '内容会自动保存为草稿'}</small>
                  </div>
                  <Button block type="primary" onClick={() => void handleSaveInlineDoc()} loading={inlineDocSaving}>
                    保存并退出编辑
                  </Button>
                  <Button block icon={<SettingOutlined />} onClick={() => setPropertyDrawerOpen(true)}>
                    状态、排序与标签
                  </Button>
                </aside>
              </div>
            ) : (
              <div className="kb-admin-workspace">
                <article className="kb-admin-article">
                  <span className="kb-admin-article__eyebrow">{activeSpace?.name || '个人空间'}</span>
                  <Typography.Title level={1} className="kb-admin-article__title">
                    {selectedDoc.title || '未命名文档'}
                  </Typography.Title>
                  {selectedDoc.summary ? (
                    <Typography.Paragraph className="kb-admin-article__summary">
                      {selectedDoc.summary}
                    </Typography.Paragraph>
                  ) : null}
                  <div className="kb-admin-article__facts">
                    <span className={`kb-admin-article__status is-${selectedDoc.status}`}>
                      <span className="pill" />
                      {getStatusLabel(selectedDoc.status)}
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
                        <Tag key={tag.id} color={tag.color || 'blue'} bordered={false}>
                          {tag.name}
                        </Tag>
                      ))}
                    </div>
                  ) : null}
                  <div className="kb-admin-article__divider" />
                  {articleContent.html ? (
                    <div
                      className="kb-admin-article__body"
                      dangerouslySetInnerHTML={{ __html: articleContent.html }}
                    />
                  ) : (
                    <div className="kb-admin-article__empty">
                      这个文档还没有正文内容
                      <Button type="link" icon={<EditOutlined />} onClick={() => enterInlineEdit(selectedDoc)}>
                        开始编辑
                      </Button>
                    </div>
                  )}
                </article>

                <aside className="kb-admin-inspector">
                  <div className="kb-admin-inspector__section">
                    <span className="kb-admin-inspector__label">文档信息</span>
                    <div className="kb-admin-inspector__facts">
                      <span>状态</span>
                      <strong>{getStatusLabel(selectedDoc.status)}</strong>
                      <span>字数</span>
                      <strong>{articleContent.wordCount}</strong>
                      <span>创建</span>
                      <strong>{formatDateTime(selectedDoc.createdAt)}</strong>
                      <span>更新</span>
                      <strong>{formatDateTime(selectedDoc.updatedAt)}</strong>
                    </div>
                  </div>
                  <div className="kb-admin-inspector__section">
                    <span className="kb-admin-inspector__label">标签</span>
                    <DocTags tags={selectedDoc.tags} />
                  </div>
                  {articleContent.outline.length ? (
                    <div className="kb-admin-inspector__section">
                      <span className="kb-admin-inspector__label">本文目录</span>
                      <nav className="kb-admin-outline">
                        {articleContent.outline.map((item) => (
                          <a
                            key={item.id}
                            className={`is-level-${item.level}`}
                            href={`#${item.id}`}
                          >
                            {item.text}
                          </a>
                        ))}
                      </nav>
                    </div>
                  ) : null}
                  <Button block icon={<EditOutlined />} onClick={() => enterInlineEdit(selectedDoc)}>
                    编辑文档
                  </Button>
                  <Button block icon={<ShareAltOutlined />} onClick={() => void openShareModal(selectedDoc)}>
                    分享设置
                  </Button>
                </aside>
              </div>
            )
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未找到该文档，可能已被删除" />
          )
        ) : (
          <div className="kb-admin-listmode">
            <div className="kb-admin-overview">
              <div className="kb-admin-overview__copy">
                <span>{activeSpace?.name || '个人空间'}</span>
                <h1>知识库工作台</h1>
                <p>集中管理文档结构、标签、版本和公开分享，适合把零散资料整理成可维护的知识体系。</p>
              </div>
              <div className="kb-admin-overview__stats">
                <div>
                  <strong>{docTotal || totalTreeDocs}</strong>
                  <span>全部文档</span>
                </div>
                <div>
                  <strong>{publishedInPage}</strong>
                  <span>本页已发布</span>
                </div>
                <div>
                  <strong>{draftInPage}</strong>
                  <span>本页草稿</span>
                </div>
                <div>
                  <strong>{tags.length}</strong>
                  <span>标签</span>
                </div>
              </div>
            </div>

            <div className="kb-admin-listmode__filters">
              <Input.Search
                allowClear
                prefix={<SearchOutlined />}
                placeholder="搜索标题或摘要"
                value={keyword}
                onChange={(event) => {
                  setKeyword(event.target.value)
                  setDocPage(1)
                }}
              />
              <Select
                allowClear
                showSearch
                placeholder="按标签筛选"
                value={tagFilterId}
                onChange={(value) => {
                  setTagFilterId(value)
                  setDocPage(1)
                }}
                options={tags.map((tag) => ({ value: tag.id, label: tag.name }))}
                optionFilterProp="label"
              />
              <Segmented
                value={listView}
                onChange={(value) => setListView(value as 'table' | 'cards')}
                options={[
                  { label: '卡片', value: 'cards' },
                  { label: '表格', value: 'table', icon: <UnorderedListOutlined /> },
                ]}
              />
              <Button
                onClick={() => {
                  setKeyword('')
                  setTagFilterId(undefined)
                  setDocPage(1)
                }}
              >
                清空筛选
              </Button>
              {selectedRowKeys.length > 0 ? (
                <Space className="kb-admin-listmode__selection">
                  <Typography.Text type="secondary">已选 {selectedRowKeys.length} 项</Typography.Text>
                  <Popconfirm title={`确定删除这 ${selectedRowKeys.length} 个文档吗？`} onConfirm={handleBatchDelete}>
                    <Button danger size="small">
                      批量删除
                    </Button>
                  </Popconfirm>
                </Space>
              ) : null}
            </div>

            {listView === 'cards' ? (
              docsLoading ? (
                <Skeleton active paragraph={{ rows: 8 }} />
              ) : docs.length ? (
                renderDocCards()
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={activeSpaceId ? '当前筛选条件下没有文档' : '请先创建个人空间'}
                >
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => void openCreateDoc(null)}>
                    新建文档
                  </Button>
                </Empty>
              )
            ) : (
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
                  emptyText: activeSpaceId ? '当前筛选条件下没有文档' : '请先创建个人空间',
                }}
              />
            )}
          </div>
        )}
      </div>
    </section>
  )
}

export default React.memo(KbMain)
