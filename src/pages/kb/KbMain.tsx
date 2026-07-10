import React, { Suspense } from 'react'
import {
  App as AntApp,
  Breadcrumb,
  Button,
  Dropdown,
  Empty,
  Input,
  Popconfirm,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  FileAddOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  HistoryOutlined,
  MoreOutlined,
  PlusOutlined,
  SaveOutlined,
  SearchOutlined,
  SettingOutlined,
  ShareAltOutlined,
  TagsOutlined,
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
  index?: number
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

function getTiptapNodeText(node: any): string {
  if (!node) return ''
  if (typeof node.text === 'string') return node.text
  if (!Array.isArray(node.content)) return ''
  return node.content.map(getTiptapNodeText).join('')
}

function buildEditorOutline(contentJson: string): OutlineItem[] {
  if (!contentJson?.trim()) return []

  try {
    const root = JSON.parse(contentJson)
    const outline: OutlineItem[] = []
    const walk = (node: any) => {
      if (!node) return
      if (node.type === 'heading') {
        const text = getTiptapNodeText(node).trim()
        const level = Number(node.attrs?.level ?? 1)
        if (text && level <= 3) {
          outline.push({
            id: `kb-editor-heading-${outline.length + 1}`,
            index: outline.length,
            text,
            level,
          })
        }
      }
      if (Array.isArray(node.content)) node.content.forEach(walk)
    }

    walk(root)
    return outline
  } catch {
    return []
  }
}

function scrollEditorHeadingIntoView(index?: number) {
  if (typeof index !== 'number') return
  const headings = document.querySelectorAll(
    '.kb-admin-edit__editor .ProseMirror h1, .kb-admin-edit__editor .ProseMirror h2, .kb-admin-edit__editor .ProseMirror h3',
  )
  headings[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function countTreeDocs(nodes: KbDocTreeNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countTreeDocs(node.children ?? []), 0)
}

function flattenTreeMeta(
  nodes: KbDocTreeNode[],
  parentTitle = '全部文档',
  result = new Map<number, { parentTitle: string; childCount: number }>(),
) {
  nodes.forEach((node) => {
    result.set(node.id, {
      parentTitle,
      childCount: node.children?.length ? countTreeDocs(node.children) : 0,
    })
    flattenTreeMeta(node.children ?? [], node.title || '未命名文档', result)
  })
  return result
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
    editContentJson,
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
    inlineDocSaving,
  } = useKbContext()

  const activeSpace = spaces.find((space) => space.id === activeSpaceId)
  const articleContent = React.useMemo(() => buildArticleContent(selectedDoc), [selectedDoc])
  const editorOutline = React.useMemo(() => buildEditorOutline(editContentJson), [editContentJson])
  const totalTreeDocs = React.useMemo(() => countTreeDocs(tree), [tree])
  const treeMeta = React.useMemo(() => flattenTreeMeta(tree), [tree])
  const publishedInPage = docs.filter((doc) => doc.status === 'published').length
  const draftInPage = docs.filter((doc) => doc.status !== 'published').length
  const isEditing = selectedDoc ? inlineEditingDocId === selectedDoc.id : false
  const hasActiveFilters = Boolean(keyword.trim() || tagFilterId)
  const activeTagName = tags.find((tag) => tag.id === tagFilterId)?.name

  const docColumns = React.useMemo(
    () => [
      {
        title: '名称',
        dataIndex: 'title',
        key: 'title',
        render: (_: string, row: KbDocSummary) => (
          <div className="kb-admin-file-title">
            <button
              type="button"
              className="kb-admin-file-title__open"
              onClick={() => setSelectedParentId(row.id)}
            >
              <span className={`kb-admin-file-title__icon${treeMeta.get(row.id)?.childCount ? ' is-folder' : ''}`}>
                {treeMeta.get(row.id)?.childCount ? <FolderOpenOutlined /> : <FileTextOutlined />}
              </span>
              <span className="kb-admin-file-title__copy">
                <span>{row.title || '未命名文档'}</span>
                <small>{row.summary || '暂无摘要'}</small>
              </span>
            </button>
          </div>
        ),
      },
      {
        title: '所属目录',
        key: 'parent',
        width: 150,
        render: (_: unknown, row: KbDocSummary) => (
          <span className="kb-admin-file-path">{treeMeta.get(row.id)?.parentTitle || '全部文档'}</span>
        ),
      },
      {
        title: '子级',
        key: 'children',
        width: 82,
        align: 'right' as const,
        render: (_: unknown, row: KbDocSummary) => {
          const childCount = treeMeta.get(row.id)?.childCount ?? 0
          return <span className="kb-admin-file-count">{childCount || '-'}</span>
        },
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
        width: 168,
        render: (value: string) => formatDateTime(value),
      },
      {
        title: '操作',
        key: 'action',
        width: 148,
        render: (_: unknown, row: KbDocSummary) => (
          <Space size={2} className="kb-admin-file-actions">
            <Tooltip title="编辑">
              <Button size="small" type="text" icon={<EditOutlined />} onClick={() => void openEditDoc(row)} />
            </Tooltip>
            <Tooltip title="分享">
              <Button size="small" type="text" icon={<ShareAltOutlined />} onClick={() => void openShareModal(row)} />
            </Tooltip>
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  { key: 'version', icon: <HistoryOutlined />, label: '版本历史' },
                ],
                onClick: ({ key }) => {
                  if (key === 'version') void openVersionsDrawer(row)
                },
              }}
            >
              <Button size="small" type="text" icon={<MoreOutlined />} aria-label="更多操作" />
            </Dropdown>
            <Popconfirm title="删除文档后不可恢复" onConfirm={() => void handleDeleteDoc(row.id)}>
              <Button className="kb-admin-file-actions__delete" size="small" type="text" danger icon={<DeleteOutlined />} aria-label="删除文档" />
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [handleDeleteDoc, openEditDoc, openShareModal, openVersionsDrawer, setSelectedParentId, treeMeta],
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
              {isEditing ? (
                <Button size="small" onClick={exitInlineEdit}>
                  预览
                </Button>
              ) : (
                <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => enterInlineEdit(selectedDoc)}>
                  编辑
                </Button>
              )}
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
                  <div className="kb-admin-editor-toolbar">
                    <div ref={setToolbarContainer} className="kb-admin-edit__tiptap-toolbar-wrapper" />
                  </div>

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
                <aside className="kb-admin-editor-actionbar" aria-label={'\u7f16\u8f91\u64cd\u4f5c'}>
                  <div className="kb-admin-editor-actionbar__context">
                    <span className="kb-admin-editor-actionbar__icon">
                      <FileTextOutlined />
                    </span>
                    <span className="kb-admin-editor-actionbar__copy">
                      <small>{activeSpace?.name || '个人空间'} / 编辑文档</small>
                      <strong>{editTitle.trim() || selectedDoc.title || '未命名文档'}</strong>
                    </span>
                    <span className={`kb-admin-editor-save-state${isDirty ? ' is-dirty' : ''}`}>
                      {inlineDocSaving ? '\u6b63\u5728\u4fdd\u5b58' : isDirty ? '\u672a\u4fdd\u5b58' : '\u5df2\u4fdd\u5b58'}
                    </span>
                  </div>
                  <div className="kb-admin-editor-actionbar__actions">
                    <Tooltip title={'\u6587\u6863\u5c5e\u6027'}>
                      <Button
                        type="text"
                        icon={<SettingOutlined />}
                        onClick={() => setPropertyDrawerOpen(true)}
                        aria-label={'\u6587\u6863\u5c5e\u6027'}
                      />
                    </Tooltip>
                    {isDirty ? (
                      <Popconfirm title={'\u6709\u672a\u4fdd\u5b58\u4fee\u6539\uff0c\u786e\u5b9a\u9000\u51fa\u7f16\u8f91\u5417\uff1f'} onConfirm={exitInlineEdit}>
                        <Button type="text" icon={<CloseOutlined />}>
                          {'\u9000\u51fa'}
                        </Button>
                      </Popconfirm>
                    ) : (
                      <Button type="text" icon={<CloseOutlined />} onClick={exitInlineEdit}>
                        {'\u9000\u51fa'}
                      </Button>
                    )}
                    <Button
                      type="primary"
                      icon={<SaveOutlined />}
                      onClick={() => void handleSaveInlineDoc()}
                      loading={inlineDocSaving}
                    >
                      {'\u4fdd\u5b58'}
                    </Button>
                  </div>
                </aside>
                <aside className="kb-admin-inspector kb-admin-inspector--editor">
                  <div className="kb-admin-inspector__section">
                    <span className="kb-admin-inspector__label">编辑状态</span>
                    <strong>{inlineDocSaving ? '正在保存' : isDirty ? '有未保存改动' : '已同步'}</strong>
                    <small>内容只会在手动点击保存时提交</small>
                  </div>
                  <Button block type="primary" onClick={() => void handleSaveInlineDoc()} loading={inlineDocSaving}>
                    保存并退出编辑
                  </Button>
                  <Button block icon={<SettingOutlined />} onClick={() => setPropertyDrawerOpen(true)}>
                    状态、排序与标签
                  </Button>
                </aside>
                <aside className="kb-admin-editor-outline" aria-label="文档大纲">
                  <div className="kb-admin-editor-outline__head">
                    <span>文档大纲</span>
                    <small>{editorOutline.length || '无'}</small>
                  </div>
                  {editorOutline.length ? (
                    <nav className="kb-admin-editor-outline__nav">
                      {editorOutline.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`is-level-${item.level}`}
                          onClick={() => scrollEditorHeadingIntoView(item.index)}
                        >
                          {item.text}
                        </button>
                      ))}
                    </nav>
                  ) : (
                    <p>输入标题后自动生成目录</p>
                  )}
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
            <div className="kb-admin-filebar">
              <div className="kb-admin-listmode__filter-head">
                <strong>{activeSpace?.name || '个人空间'}</strong>
                <span>
                  {hasActiveFilters
                    ? [keyword.trim() ? `关键词：${keyword.trim()}` : '', activeTagName ? `标签：${activeTagName}` : '']
                        .filter(Boolean)
                        .join(' · ')
                    : `${docsLoading ? '正在更新' : `共 ${docTotal || totalTreeDocs} 篇文档`} · 本页已发布 ${publishedInPage} · 本页草稿 ${draftInPage} · 标签 ${tags.length}`}
                </span>
              </div>
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
              <Button
                disabled={!hasActiveFilters}
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

            <Table<KbDocSummary>
              rowKey="id"
              loading={docsLoading}
              dataSource={docs}
              columns={docColumns}
              rowSelection={{
                selectedRowKeys,
                onChange: (keys) => setSelectedRowKeys(keys),
                preserveSelectedRowKeys: true,
              }}
              rowClassName={(row) => (row.id === selectedParentId ? 'is-active-file' : '')}
              scroll={{ x: 980 }}
              pagination={{
                current: docPage,
                pageSize: docPageSize,
                total: docTotal,
                showTotal: (total) => `共 ${total} 篇`,
                showLessItems: true,
                onChange: (page, pageSize) => {
                  setDocPage(page)
                  setDocPageSize(pageSize)
                },
                showSizeChanger: true,
              }}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={activeSpaceId ? '当前筛选条件下没有文档' : '请先创建个人空间'}
                  >
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => void openCreateDoc(null)}>
                      新建文档
                    </Button>
                  </Empty>
                ),
              }}
            />
          </div>
        )}
      </div>
    </section>
  )
}

export default React.memo(KbMain)
