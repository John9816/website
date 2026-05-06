import { useCallback, useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  App as AntApp,
  Button,
  Card,
  Col,
  Divider,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Tree,
  Typography,
} from 'antd'
import type { TablePaginationConfig } from 'antd/es/table'
import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  HistoryOutlined,
  PlusOutlined,
  ShareAltOutlined,
} from '@ant-design/icons'
import {
  createKbDoc,
  createKbSpace,
  createKbTag,
  deleteKbDoc,
  deleteKbDocShare,
  deleteKbTag,
  getKbDoc,
  getKbDocShare,
  getKbDocVersion,
  getKbSpaceTree,
  listKbDocVersions,
  listKbSpaces,
  listKbTags,
  moveKbDoc,
  replaceKbDocTags,
  restoreKbDocVersion,
  searchKbDocs,
  updateKbDoc,
  updateKbTag,
  upsertKbDocShare,
} from '../api/kb'
import TiptapEditor from '../components/TiptapEditor'
import type {
  KbDoc,
  KbDocShare,
  KbDocSummary,
  KbDocTreeNode,
  KbDocVersion,
  KbDocVersionDetail,
  KbSpace,
  KbTag,
} from '../types'

const VERSION_PAGE_SIZE = 20

const ROOT_TREE_KEY = '__kb_root__'

type TreeDataNode = {
  key: number | string
  title: ReactNode
  children: TreeDataNode[]
}

const DOC_STATUS_OPTIONS = [
  { value: 'draft', label: '草稿' },
  { value: 'published', label: '已发布' },
] as const

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN')
}

function toDatetimeLocalValue(value?: string | null) {
  if (!value) return ''
  const date = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return ''
  const pad = (num: number) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
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

function escapeHtml(text?: string | null) {
  if (!text) return ''
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function flattenTreeOptions(
  nodes: KbDocTreeNode[],
  prefix = '',
  skipId?: number,
): Array<{ value: number; label: string }> {
  const result: Array<{ value: number; label: string }> = []
  nodes.forEach((node) => {
    if (node.id !== skipId) {
      result.push({
        value: node.id,
        label: `${prefix}${node.title}`,
      })
    }
    result.push(...flattenTreeOptions(node.children ?? [], `${prefix}${node.title} / `, skipId))
  })
  return result
}

function findTreeTitle(nodes: KbDocTreeNode[], id: number | null): string {
  if (!id) return ''
  for (const node of nodes) {
    if (node.id === id) return node.title
    const child = findTreeTitle(node.children ?? [], id)
    if (child) return child
  }
  return ''
}

function buildTreeData(nodes: KbDocTreeNode[]): TreeDataNode[] {
  return nodes.map((node) => ({
    key: node.id,
    title: node.title,
    children: buildTreeData(node.children ?? []),
  }))
}

async function copyText(text: string, success: (msg: string) => void, error: (msg: string) => void) {
  try {
    await navigator.clipboard.writeText(text)
    success('已复制到剪贴板')
  } catch {
    error('复制失败，请检查浏览器权限')
  }
}

type TagFormValues = {
  name: string
  color?: string
}

type DocFormValues = {
  spaceId: number
  parentId?: number | null
  title: string
  summary?: string
  status: 'draft' | 'published'
  sortOrder?: number
  tagIds?: number[]
  changeNote?: string
  contentHtml?: string
}

type TreeContextMenuState =
  | {
      kind: 'root'
      x: number
      y: number
    }
  | {
      kind: 'doc'
      docId: number
      title: string
      x: number
      y: number
    }

type DocRef = {
  id: number
  title: string
}

export default function AdminKnowledgeBase() {
  const { message, modal } = AntApp.useApp()

  const [spaces, setSpaces] = useState<KbSpace[]>([])
  const [spacesLoading, setSpacesLoading] = useState(false)
  const [creatingPersonalSpace, setCreatingPersonalSpace] = useState(false)
  const [activeSpaceId, setActiveSpaceId] = useState<number | null>(null)

  const [tree, setTree] = useState<KbDocTreeNode[]>([])
  const [treeLoading, setTreeLoading] = useState(false)
  const [selectedParentId, setSelectedParentId] = useState<number | null>(null)
  const [selectedDoc, setSelectedDoc] = useState<KbDoc | null>(null)
  const [selectedDocLoading, setSelectedDocLoading] = useState(false)
  const [treeContextMenu, setTreeContextMenu] = useState<TreeContextMenuState | null>(null)

  const [tags, setTags] = useState<KbTag[]>([])
  const [tagsLoading, setTagsLoading] = useState(false)
  const [tagModalOpen, setTagModalOpen] = useState(false)
  const [tagSaving, setTagSaving] = useState(false)
  const [editingTag, setEditingTag] = useState<KbTag | null>(null)
  const [tagForm] = Form.useForm<TagFormValues>()

  const [docs, setDocs] = useState<KbDocSummary[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [docTotal, setDocTotal] = useState(0)
  const [docPage, setDocPage] = useState(1)
  const [docPageSize, setDocPageSize] = useState(20)
  const [keyword, setKeyword] = useState('')
  const deferredKeyword = useDeferredValue(keyword.trim())
  const [tagFilterId, setTagFilterId] = useState<number | undefined>()

  const [inlineEditingDocId, setInlineEditingDocId] = useState<number | null>(null)
  const [inlineDocSaving, setInlineDocSaving] = useState(false)
  const [inlineDocForm] = Form.useForm<DocFormValues>()

  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareLoading, setShareLoading] = useState(false)
  const [shareSaving, setShareSaving] = useState(false)
  const [shareDoc, setShareDoc] = useState<DocRef | null>(null)
  const [shareInfo, setShareInfo] = useState<KbDocShare | null>(null)
  const [shareExpiresAt, setShareExpiresAt] = useState('')

  const [versionDrawerDoc, setVersionDrawerDoc] = useState<DocRef | null>(null)
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [versionItems, setVersionItems] = useState<KbDocVersion[]>([])
  const [versionPage, setVersionPage] = useState(1)
  const [versionTotal, setVersionTotal] = useState(0)
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null)
  const [versionDetailLoading, setVersionDetailLoading] = useState(false)
  const [versionDetail, setVersionDetail] = useState<KbDocVersionDetail | null>(null)

  const inlineDocContentHtml = Form.useWatch('contentHtml', inlineDocForm) ?? ''
  const inlineDocParentOptions = useMemo(
    () => flattenTreeOptions(tree, '', inlineEditingDocId ?? undefined),
    [inlineEditingDocId, tree],
  )
  const shareUrl = useMemo(() => {
    if (!shareInfo?.token) return ''
    return new URL(`/kb/share/${shareInfo.token}`, window.location.origin).toString()
  }, [shareInfo?.token])

  const loadSpaces = useCallback(
    async (preferredSpaceId?: number) => {
      setSpacesLoading(true)
      try {
        const data = (await listKbSpaces()).sort((a, b) => a.sortOrder - b.sortOrder)
        setSpaces(data)
        setActiveSpaceId((current) => {
          if (preferredSpaceId && data.some((item) => item.id === preferredSpaceId)) {
            return preferredSpaceId
          }
          if (current && data.some((item) => item.id === current)) {
            return current
          }
          return data[0]?.id ?? null
        })
      } catch (error) {
        message.error((error as Error).message)
      } finally {
        setSpacesLoading(false)
      }
    },
    [message],
  )

  const loadTags = useCallback(async () => {
    setTagsLoading(true)
    try {
      setTags(await listKbTags())
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setTagsLoading(false)
    }
  }, [message])

  const loadTree = useCallback(
    async (spaceId: number) => {
      setTreeLoading(true)
      try {
        setTree(await getKbSpaceTree(spaceId))
      } catch (error) {
        message.error((error as Error).message)
      } finally {
        setTreeLoading(false)
      }
    },
    [message],
  )

  const loadDocs = useCallback(
    async (params?: {
      spaceId?: number | null
      parentId?: number | null
      page?: number
      pageSize?: number
      keyword?: string
      tagId?: number
    }) => {
      const spaceId = params?.spaceId ?? activeSpaceId
      if (!spaceId) {
        setDocs([])
        setDocTotal(0)
        return
      }

      const page = params?.page ?? docPage
      const pageSize = params?.pageSize ?? docPageSize
      const parentId = params?.parentId !== undefined ? params.parentId : undefined
      const nextKeyword =
        params?.keyword !== undefined ? params.keyword : deferredKeyword || undefined
      const nextTagId = params?.tagId !== undefined ? params.tagId : tagFilterId

      setDocsLoading(true)
      try {
        const data = await searchKbDocs({
          spaceId,
          parentId: parentId ?? undefined,
          keyword: nextKeyword,
          tagId: nextTagId,
          page: page - 1,
          size: pageSize,
        })
        setDocs(data.items)
        setDocTotal(data.total)
      } catch (error) {
        message.error((error as Error).message)
      } finally {
        setDocsLoading(false)
      }
    },
    [activeSpaceId, deferredKeyword, docPage, docPageSize, message, tagFilterId],
  )

  const loadSelectedDoc = useCallback(
    async (docId: number) => {
      setSelectedDocLoading(true)
      try {
        setSelectedDoc(await getKbDoc(docId))
      } catch (error) {
        setSelectedDoc(null)
        message.error((error as Error).message)
      } finally {
        setSelectedDocLoading(false)
      }
    },
    [message],
  )

  const loadVersionDetail = useCallback(
    async (docId: number, versionId: number) => {
      setVersionDetailLoading(true)
      try {
        setVersionDetail(await getKbDocVersion(docId, versionId))
        setSelectedVersionId(versionId)
      } catch (error) {
        message.error((error as Error).message)
      } finally {
        setVersionDetailLoading(false)
      }
    },
    [message],
  )

  const loadVersions = useCallback(
    async (docId: number, page = versionPage) => {
      setVersionsLoading(true)
      try {
        const data = await listKbDocVersions(docId, page - 1, VERSION_PAGE_SIZE)
        setVersionItems(data.items)
        setVersionTotal(data.total)
        setVersionPage(page)
        if (data.items.length) {
          const initialId = selectedVersionId && data.items.some((item) => item.id === selectedVersionId)
            ? selectedVersionId
            : data.items[0].id
          await loadVersionDetail(docId, initialId)
        } else {
          setSelectedVersionId(null)
          setVersionDetail(null)
        }
      } catch (error) {
        message.error((error as Error).message)
      } finally {
        setVersionsLoading(false)
      }
    },
    [loadVersionDetail, message, selectedVersionId, versionPage],
  )

  useEffect(() => {
    void Promise.all([loadSpaces(), loadTags()])
  }, [loadSpaces, loadTags])

  useEffect(() => {
    if (!activeSpaceId) {
      setTree([])
      setDocs([])
      setDocTotal(0)
      setSelectedParentId(null)
      setSelectedDoc(null)
      return
    }
    setSelectedParentId(null)
    setSelectedDoc(null)
    void loadTree(activeSpaceId)
  }, [activeSpaceId, loadTree])

  useEffect(() => {
    setDocPage(1)
  }, [activeSpaceId, deferredKeyword, tagFilterId])

  useEffect(() => {
    void loadDocs()
  }, [activeSpaceId, deferredKeyword, docPage, docPageSize, loadDocs, tagFilterId])

  useEffect(() => {
    if (!selectedParentId) {
      setSelectedDoc(null)
      setSelectedDocLoading(false)
      return
    }
    void loadSelectedDoc(selectedParentId)
  }, [loadSelectedDoc, selectedParentId])

  useEffect(() => {
    if (inlineEditingDocId && inlineEditingDocId !== selectedParentId) {
      setInlineEditingDocId(null)
      inlineDocForm.resetFields()
    }
  }, [inlineDocForm, inlineEditingDocId, selectedParentId])

  useEffect(() => {
    if (!treeContextMenu) return

    const close = () => setTreeContextMenu(null)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }

    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [treeContextMenu])

  const handleCreatePersonalSpace = async () => {
    if (spaces.length) {
      message.warning('一个账户只能创建一个空间')
      return
    }
    setCreatingPersonalSpace(true)
    try {
      const created = await createKbSpace({
        name: '个人空间',
        sortOrder: 0,
      })
      message.success('个人空间已创建')
      await loadSpaces(created.id)
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setCreatingPersonalSpace(false)
    }
  }

  const handleEditTag = (tag: KbTag) => {
    setEditingTag(tag)
    tagForm.setFieldsValue({
      name: tag.name,
      color: tag.color ?? undefined,
    })
  }

  const handleSaveTag = async () => {
    const values = await tagForm.validateFields()
    setTagSaving(true)
    try {
      if (editingTag) {
        await updateKbTag(editingTag.id, values)
        message.success('标签已更新')
      } else {
        await createKbTag(values)
        message.success('标签已创建')
      }
      setEditingTag(null)
      tagForm.resetFields()
      await loadTags()
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setTagSaving(false)
    }
  }

  const handleDeleteTag = async (id: number) => {
    try {
      await deleteKbTag(id)
      message.success('标签已删除')
      if (tagFilterId === id) {
        setTagFilterId(undefined)
      }
      await loadTags()
    } catch (error) {
      message.error((error as Error).message)
    }
  }

  const openCreateDoc = async (parentIdOverride?: number | null) => {
    if (!activeSpaceId) {
      message.warning('请先创建个人空间')
      return
    }
    const parentId =
      parentIdOverride !== undefined ? parentIdOverride : selectedParentId ?? null
    try {
      const created = await createKbDoc({
        spaceId: activeSpaceId,
        parentId,
        title: '未命名文档',
        summary: '',
        contentHtml: '',
        status: 'draft',
        sortOrder: (docs.at(-1)?.sortOrder ?? 0) + 1,
      })
      message.success('文档已创建')
      const fullDoc = await getKbDoc(created.id)
      setSelectedDoc(fullDoc)
      setSelectedParentId(fullDoc.id)
      enterInlineEdit(fullDoc)
      await Promise.all([
        loadSpaces(activeSpaceId),
        loadTree(activeSpaceId),
        loadDocs({ spaceId: activeSpaceId, page: 1 }),
      ])
    } catch (error) {
      message.error((error as Error).message)
    }
  }

  const enterInlineEdit = useCallback(
    (doc: KbDoc) => {
      setInlineEditingDocId(doc.id)
      inlineDocForm.setFieldsValue({
        spaceId: doc.spaceId,
        parentId: doc.parentId ?? undefined,
        title: doc.title,
        summary: doc.summary ?? '',
        status: doc.status,
        sortOrder: doc.sortOrder,
        tagIds: doc.tags.map((item) => item.id),
        changeNote: '',
        contentHtml: doc.contentHtml ?? '',
      })
    },
    [inlineDocForm],
  )

  const exitInlineEdit = useCallback(() => {
    setInlineEditingDocId(null)
    inlineDocForm.resetFields()
  }, [inlineDocForm])

  const openEditDoc = async (doc: { id: number }) => {
    try {
      const fullDoc = await getKbDoc(doc.id)
      setSelectedDoc(fullDoc)
      setSelectedParentId(fullDoc.id)
      enterInlineEdit(fullDoc)
    } catch (error) {
      message.error((error as Error).message)
    }
  }

  const handleSaveInlineDoc = async () => {
    if (!selectedDoc || inlineEditingDocId !== selectedDoc.id) return
    const values = await inlineDocForm.validateFields()
    const nextParentId = values.parentId ?? null
    const nextTagIds = [...(values.tagIds ?? [])].sort((a, b) => a - b)

    setInlineDocSaving(true)
    try {
      await updateKbDoc(selectedDoc.id, {
        title: values.title,
        summary: values.summary,
        contentHtml: values.contentHtml,
        status: values.status,
        sortOrder: values.sortOrder,
        changeNote: values.changeNote,
      })

      if (
        selectedDoc.spaceId !== values.spaceId ||
        (selectedDoc.parentId ?? null) !== nextParentId ||
        selectedDoc.sortOrder !== values.sortOrder
      ) {
        await moveKbDoc(selectedDoc.id, {
          spaceId: values.spaceId,
          parentId: nextParentId,
          sortOrder: values.sortOrder,
        })
      }

      const currentTagIds = selectedDoc.tags.map((item) => item.id).sort((a, b) => a - b)
      if (currentTagIds.join(',') !== nextTagIds.join(',')) {
        await replaceKbDocTags(selectedDoc.id, nextTagIds)
      }

      message.success('文档已更新')
      const targetSpaceId = values.spaceId
      exitInlineEdit()
      setActiveSpaceId(targetSpaceId)
      await Promise.all([
        loadSpaces(targetSpaceId),
        loadTags(),
        loadTree(targetSpaceId),
        loadDocs({ spaceId: targetSpaceId }),
        loadSelectedDoc(selectedDoc.id),
      ])
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setInlineDocSaving(false)
    }
  }

  const handleDeleteDoc = async (docId: number) => {
    if (!activeSpaceId) return
    try {
      await deleteKbDoc(docId)
      if (selectedParentId === docId) {
        setSelectedParentId(null)
        setSelectedDoc(null)
      }
      message.success('文档已删除')
      await Promise.all([
        loadSpaces(activeSpaceId),
        loadTree(activeSpaceId),
        loadDocs({ page: 1 }),
      ])
    } catch (error) {
      message.error((error as Error).message)
    }
  }

  const confirmDeleteDoc = (docId: number, title: string) => {
    modal.confirm({
      title: `确认删除“${title}”？`,
      content: '删除后不可恢复。',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        await handleDeleteDoc(docId)
      },
    })
  }

  const openShareModal = async (doc: { id: number; title: string }) => {
    setShareDoc(doc)
    setShareInfo(null)
    setShareExpiresAt('')
    setShareModalOpen(true)
    setShareLoading(true)
    try {
      const currentShare = await getKbDocShare(doc.id)
      setShareInfo(currentShare)
      setShareExpiresAt(toDatetimeLocalValue(currentShare?.expiresAt))
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setShareLoading(false)
    }
  }

  const handleSaveShare = async (rotateToken = false) => {
    if (!shareDoc) return
    setShareSaving(true)
    try {
      const saved = await upsertKbDocShare(shareDoc.id, {
        enabled: true,
        rotateToken,
        expiresAt: shareExpiresAt || null,
      })
      setShareInfo(saved)
      setShareExpiresAt(toDatetimeLocalValue(saved.expiresAt))
      message.success(rotateToken ? '分享令牌已轮换' : '分享设置已保存')
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setShareSaving(false)
    }
  }

  const handleDisableShare = async () => {
    if (!shareDoc) return
    setShareSaving(true)
    try {
      await deleteKbDocShare(shareDoc.id)
      setShareInfo(null)
      setShareExpiresAt('')
      message.success('公开分享已关闭')
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setShareSaving(false)
    }
  }

  const openVersionsDrawer = async (doc: { id: number; title: string }) => {
    setVersionDrawerDoc(doc)
    setVersionItems([])
    setVersionTotal(0)
    setVersionPage(1)
    setSelectedVersionId(null)
    setVersionDetail(null)
    await loadVersions(doc.id, 1)
  }

  const handleRestoreVersion = async () => {
    if (!versionDrawerDoc || !selectedVersionId || !activeSpaceId) return
    try {
      await restoreKbDocVersion(versionDrawerDoc.id, selectedVersionId)
      message.success('已恢复到选中版本')
      await Promise.all([
        loadTree(activeSpaceId),
        loadDocs(),
        loadVersions(versionDrawerDoc.id, versionPage),
      ])
    } catch (error) {
      message.error((error as Error).message)
    }
  }

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

  const tagOptions = tags.map((tag) => ({
    value: tag.id,
    label: (
      <Space size={6}>
        <Tag color={tag.color || 'blue'} bordered={false}>
          {tag.name}
        </Tag>
      </Space>
    ),
  }))

  const handleDocTableChange = (pagination: TablePaginationConfig) => {
    setDocPage(pagination.current ?? 1)
    setDocPageSize(pagination.pageSize ?? 20)
  }

  const selectedDocContentHtml =
    selectedDoc?.contentHtml ||
    (selectedDoc?.contentJson
      ? `<pre style="white-space: pre-wrap; word-break: break-word;">${escapeHtml(selectedDoc.contentJson)}</pre>`
      : '')

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card title="知识库">
        {!spaces.length && !spacesLoading ? (
          <Empty
            description="还没有知识库空间"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => void handleCreatePersonalSpace()}
              loading={creatingPersonalSpace}
            >
              创建个人空间
            </Button>
          </Empty>
        ) : (
          <Row gutter={16}>
            <Col xs={24} lg={8} xl={7}>
              {treeLoading && (
                <Typography.Text type="secondary">文档树加载中...</Typography.Text>
              )}

              <Tree
                blockNode
                defaultExpandAll
                selectedKeys={selectedParentId ? [selectedParentId] : []}
                treeData={[
                  {
                    key: ROOT_TREE_KEY,
                    title: '个人空间',
                    children: buildTreeData(tree),
                  },
                ]}
                onSelect={(keys) => {
                  const key = keys[0]
                  if (key === undefined || key === ROOT_TREE_KEY) {
                    setSelectedParentId(null)
                    return
                  }
                  setSelectedParentId(typeof key === 'number' ? key : Number(key))
                }}
                onRightClick={({ event, node }) => {
                  event.preventDefault()
                  if (node.key === ROOT_TREE_KEY) {
                    setTreeContextMenu({
                      kind: 'root',
                      x: event.clientX,
                      y: event.clientY,
                    })
                    return
                  }
                  const docId = Number(node.key)
                  setTreeContextMenu({
                    kind: 'doc',
                    docId,
                    title: findTreeTitle(tree, docId) || '文档',
                    x: event.clientX,
                    y: event.clientY,
                  })
                }}
              />
            </Col>

            <Col xs={24} lg={16} xl={17}>
              <Card
                size="small"
                title={
                  selectedParentId && selectedDoc
                    ? `个人空间 · ${selectedDoc.title}`
                    : '文档列表'
                }
                styles={{ body: { display: 'flex', flexDirection: 'column', gap: 12 } }}
              >
                {selectedParentId ? (
                  selectedDocLoading ? (
                    <Typography.Text type="secondary">正在加载文档内容...</Typography.Text>
                  ) : selectedDoc ? (
                    inlineEditingDocId === selectedDoc.id ? (
                      <Space direction="vertical" size={16} style={{ width: '100%' }}>
                        <Space wrap>
                          <Button onClick={exitInlineEdit}>预览</Button>
                          <Button
                            type="primary"
                            loading={inlineDocSaving}
                            onClick={() => void handleSaveInlineDoc()}
                          >
                            保存
                          </Button>
                          <Button
                            onClick={() => {
                              exitInlineEdit()
                              setSelectedParentId(null)
                            }}
                          >
                            返回列表
                          </Button>
                        </Space>

                        <Form form={inlineDocForm} layout="vertical">
                          <Form.Item
                            name="spaceId"
                            hidden
                            rules={[{ required: true, message: '请选择空间' }]}
                          >
                            <InputNumber min={1} style={{ display: 'none' }} />
                          </Form.Item>

                          <Row gutter={12}>
                            <Col xs={24} md={12}>
                              <Form.Item name="parentId" label="父文档">
                                <Select
                                  allowClear
                                  placeholder="顶层文档"
                                  options={inlineDocParentOptions}
                                  optionFilterProp="label"
                                  showSearch
                                />
                              </Form.Item>
                            </Col>
                            <Col xs={12} md={6}>
                              <Form.Item
                                name="status"
                                label="状态"
                                rules={[{ required: true, message: '请选择状态' }]}
                              >
                                <Select
                                  options={DOC_STATUS_OPTIONS.map((item) => ({
                                    value: item.value,
                                    label: item.label,
                                  }))}
                                />
                              </Form.Item>
                            </Col>
                            <Col xs={12} md={6}>
                              <Form.Item name="sortOrder" label="排序">
                                <InputNumber min={0} style={{ width: '100%' }} />
                              </Form.Item>
                            </Col>
                          </Row>

                          <Form.Item
                            name="title"
                            label="标题"
                            rules={[{ required: true, message: '请输入标题' }]}
                          >
                            <Input maxLength={200} />
                          </Form.Item>

                          <Form.Item name="summary" label="摘要">
                            <Input.TextArea rows={2} maxLength={500} showCount />
                          </Form.Item>

                          <Row gutter={12}>
                            <Col xs={24} md={12}>
                              <Form.Item name="tagIds" label="标签">
                                <Select
                                  mode="multiple"
                                  allowClear
                                  options={tagOptions}
                                  optionFilterProp="label"
                                  placeholder="可绑定多个标签"
                                />
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                              <Form.Item name="changeNote" label="版本备注">
                                <Input placeholder="可选，记录本次修改" maxLength={500} />
                              </Form.Item>
                            </Col>
                          </Row>

                          <Form.Item name="contentHtml" label="正文" style={{ marginBottom: 0 }}>
                            <TiptapEditor
                              content={inlineDocContentHtml}
                              onChange={(html) =>
                                inlineDocForm.setFieldValue('contentHtml', html)
                              }
                              minHeight={400}
                              maxHeight="none"
                            />
                          </Form.Item>
                        </Form>
                      </Space>
                    ) : (
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                      <Space wrap>
                        <Button onClick={() => setSelectedParentId(null)}>返回列表</Button>
                        <Button
                          type="primary"
                          icon={<PlusOutlined />}
                          onClick={() => openCreateDoc(selectedDoc.id)}
                        >
                          新建子文档
                        </Button>
                        <Button icon={<EditOutlined />} onClick={() => enterInlineEdit(selectedDoc)}>
                          编辑
                        </Button>
                        <Button
                          icon={<HistoryOutlined />}
                          onClick={() =>
                            void openVersionsDrawer({
                              id: selectedDoc.id,
                              title: selectedDoc.title,
                            })
                          }
                        >
                          版本
                        </Button>
                        <Button
                          icon={<ShareAltOutlined />}
                          onClick={() =>
                            void openShareModal({
                              id: selectedDoc.id,
                              title: selectedDoc.title,
                            })
                          }
                        >
                          分享
                        </Button>
                        <Popconfirm
                          title="删除文档后不可恢复"
                          onConfirm={() => void handleDeleteDoc(selectedDoc.id)}
                        >
                          <Button danger icon={<DeleteOutlined />}>
                            删除
                          </Button>
                        </Popconfirm>
                      </Space>

                      <div>
                        <Typography.Title level={3} style={{ marginBottom: 8 }}>
                          {selectedDoc.title}
                        </Typography.Title>
                        {selectedDoc.summary && (
                          <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                            {selectedDoc.summary}
                          </Typography.Paragraph>
                        )}
                        <Space wrap size={[8, 8]}>
                          <Tag color={selectedDoc.status === 'published' ? 'green' : 'orange'}>
                            {selectedDoc.status === 'published' ? '已发布' : '草稿'}
                          </Tag>
                          <Tag>v{selectedDoc.versionNo}</Tag>
                          <Tag>排序 {selectedDoc.sortOrder}</Tag>
                          <Tag>更新于 {formatDateTime(selectedDoc.updatedAt)}</Tag>
                          {selectedDoc.share?.token && (
                            <Tag color={selectedDoc.share.enabled ? 'blue' : 'default'}>
                              已分享
                            </Tag>
                          )}
                        </Space>
                        {!!selectedDoc.tags.length && (
                          <div style={{ marginTop: 12 }}>
                            <Space wrap>
                              {selectedDoc.tags.map((tag) => (
                                <Tag key={tag.id} color={tag.color || 'blue'}>
                                  {tag.name}
                                </Tag>
                              ))}
                            </Space>
                          </div>
                        )}
                      </div>

                      <Divider style={{ margin: 0 }} />

                      {selectedDocContentHtml ? (
                        <div
                          style={{ minHeight: 240 }}
                          dangerouslySetInnerHTML={{ __html: selectedDocContentHtml }}
                        />
                      ) : (
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          description="这个文档还没有正文内容"
                        />
                      )}
                    </Space>
                    )
                  ) : (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="未找到该文档，可能已被删除"
                    />
                  )
                ) : (
                  <>
                    <Space wrap>
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
                        options={tags.map((tag) => ({
                          value: tag.id,
                          label: tag.name,
                        }))}
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
                    </Space>

                    <Typography.Text type="secondary">
                      左侧单击文档会直接打开正文；右键个人空间可新建顶层文档，右键文档可新增、删除或分享。
                    </Typography.Text>

                    <Table<KbDocSummary>
                      rowKey="id"
                      loading={docsLoading}
                      dataSource={docs}
                      columns={docColumns}
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
                      onChange={handleDocTableChange}
                      locale={{
                        emptyText: activeSpaceId ? '当前筛选条件下没有文档' : '请先创建个人空间',
                      }}
                    />
                  </>
                )}
              </Card>
            </Col>
          </Row>
        )}
      </Card>

      {treeContextMenu && (
        <div
          style={{
            position: 'fixed',
            left: treeContextMenu.x,
            top: treeContextMenu.y,
            zIndex: 1100,
            minWidth: 180,
            background: '#fff',
            border: '1px solid rgba(5, 5, 5, 0.12)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.16)',
            padding: 8,
          }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
            {treeContextMenu.kind === 'root' ? '个人空间' : treeContextMenu.title}
          </Typography.Text>

          <Button
            type="text"
            icon={<PlusOutlined />}
            style={{ width: '100%', justifyContent: 'flex-start' }}
            onClick={() => {
              const menu = treeContextMenu
              setTreeContextMenu(null)
              openCreateDoc(menu.kind === 'doc' ? menu.docId : null)
            }}
          >
            {treeContextMenu.kind === 'doc' ? '新增子文档' : '新建文档'}
          </Button>

          {treeContextMenu.kind === 'doc' && (
            <>
              <Button
                type="text"
                icon={<ShareAltOutlined />}
                style={{ width: '100%', justifyContent: 'flex-start' }}
                onClick={() => {
                  const menu = treeContextMenu
                  if (menu.kind !== 'doc') return
                  setTreeContextMenu(null)
                  void openShareModal({
                    id: menu.docId,
                    title: menu.title,
                  })
                }}
              >
                分享文档
              </Button>
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                style={{ width: '100%', justifyContent: 'flex-start' }}
                onClick={() => {
                  const menu = treeContextMenu
                  if (menu.kind !== 'doc') return
                  setTreeContextMenu(null)
                  confirmDeleteDoc(menu.docId, menu.title)
                }}
              >
                删除文档
              </Button>
            </>
          )}
        </div>
      )}

      <Modal
        title="标签管理"
        open={tagModalOpen}
        onCancel={() => {
          setTagModalOpen(false)
          setEditingTag(null)
          tagForm.resetFields()
        }}
        footer={null}
        width={760}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Table<KbTag>
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={tags}
            loading={tagsLoading}
            columns={[
              {
                title: '标签',
                dataIndex: 'name',
                render: (_: string, row) => (
                  <Tag color={row.color || 'blue'} bordered={false}>
                    {row.name}
                  </Tag>
                ),
              },
              { title: '颜色', dataIndex: 'color', width: 120, render: (value: string) => value || '-' },
              { title: '创建时间', dataIndex: 'createdAt', width: 180, render: (value: string) => formatDateTime(value) },
              {
                title: '操作',
                width: 160,
                render: (_: unknown, row) => (
                  <Space>
                    <Button size="small" onClick={() => handleEditTag(row)} icon={<EditOutlined />}>
                      编辑
                    </Button>
                    <Popconfirm title="确定删除这个标签吗？" onConfirm={() => void handleDeleteTag(row.id)}>
                      <Button size="small" danger icon={<DeleteOutlined />}>
                        删除
                      </Button>
                    </Popconfirm>
                  </Space>
                ),
              },
            ]}
          />

          <Card
            size="small"
            title={editingTag ? '编辑标签' : '新建标签'}
            extra={
              editingTag ? (
                <Button
                  size="small"
                  onClick={() => {
                    setEditingTag(null)
                    tagForm.resetFields()
                  }}
                >
                  取消编辑
                </Button>
              ) : null
            }
          >
            <Form form={tagForm} layout="vertical">
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入标签名称' }]}>
                    <Input maxLength={50} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="color" label="颜色">
                    <Input maxLength={20} placeholder="如 #1677ff 或 volcano" />
                  </Form.Item>
                </Col>
              </Row>
              <Button type="primary" onClick={() => void handleSaveTag()} loading={tagSaving}>
                {editingTag ? '保存标签' : '创建标签'}
              </Button>
            </Form>
          </Card>
        </Space>
      </Modal>


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
                    onClick={() => void copyText(shareUrl, message.success, message.error)}
                  >
                    复制公开链接
                  </Button>
                  <Button
                    icon={<CopyOutlined />}
                    onClick={() => void copyText(shareInfo.token, message.success, message.error)}
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

      <Drawer
        title={versionDrawerDoc ? `版本历史 · ${versionDrawerDoc.title}` : '版本历史'}
        open={!!versionDrawerDoc}
        onClose={() => {
          setVersionDrawerDoc(null)
          setVersionItems([])
          setVersionDetail(null)
          setSelectedVersionId(null)
        }}
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
    </Space>
  )
}
