import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button, Input, Result, Spin, Typography } from 'antd'
import { ChevronDown, ChevronRight, FileText, FolderTree } from 'lucide-react'
import { getPublicKbShare } from '../api/kb'
import ThemeToggle from '../components/ThemeToggle'
import type { KbPublicDoc, KbPublicDocItem } from '../types'
import '../styles/kb-share.css'

type PublicTreeNode = KbPublicDocItem & {
  children: PublicTreeNode[]
}

const SIDEBAR_STORAGE_KEY = 'kb.share.sidebar-width'
const SIDEBAR_MIN_WIDTH = 248
const SIDEBAR_MAX_WIDTH = 520
const SIDEBAR_DEFAULT_WIDTH = 312
const MAIN_MIN_WIDTH = 420

function getMaxSidebarWidth(viewportWidth: number) {
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, viewportWidth - MAIN_MIN_WIDTH))
}

function clampSidebarWidth(width: number, viewportWidth: number) {
  return Math.min(Math.max(width, SIDEBAR_MIN_WIDTH), getMaxSidebarWidth(viewportWidth))
}

function getInitialSidebarWidth() {
  if (typeof window === 'undefined') return SIDEBAR_DEFAULT_WIDTH
  const saved = Number(window.localStorage.getItem(SIDEBAR_STORAGE_KEY))
  const fallback = Number.isFinite(saved) ? saved : SIDEBAR_DEFAULT_WIDTH
  return clampSidebarWidth(fallback, window.innerWidth)
}

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN')
}

function fallbackHtml(doc: KbPublicDoc | null) {
  const text = doc?.contentJson?.trim()
  if (!text) return '<p>这份分享文档还没有正文内容。</p>'
  return `<pre style="white-space: pre-wrap; word-break: break-word;">${text}</pre>`
}

function normalizeDocuments(doc: KbPublicDoc | null): KbPublicDocItem[] {
  if (!doc) return []
  if (doc.documents?.length) return doc.documents
  return [
    {
      id: doc.id,
      token: doc.token,
      parentId: null,
      title: doc.title,
      summary: doc.summary ?? null,
      sortOrder: 0,
      updatedAt: doc.updatedAt,
    },
  ]
}

function compareDocOrder(a: KbPublicDocItem, b: KbPublicDocItem) {
  const sortDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
  if (sortDiff !== 0) return sortDiff

  const titleDiff = (a.title || '').localeCompare(b.title || '', 'zh-CN')
  if (titleDiff !== 0) return titleDiff

  return a.id - b.id
}

function buildDocumentTree(items: KbPublicDocItem[]): PublicTreeNode[] {
  const nodes = new Map<number, PublicTreeNode>()
  items.forEach((item) => {
    nodes.set(item.id, {
      ...item,
      children: [],
    })
  })

  const roots: PublicTreeNode[] = []
  nodes.forEach((node) => {
    if (node.parentId != null && nodes.has(node.parentId)) {
      nodes.get(node.parentId)?.children.push(node)
      return
    }
    roots.push(node)
  })

  const sortNodes = (list: PublicTreeNode[]) => {
    list.sort(compareDocOrder)
    list.forEach((node) => sortNodes(node.children))
  }

  sortNodes(roots)
  return roots
}

function filterDocumentTree(nodes: PublicTreeNode[], keyword: string): PublicTreeNode[] {
  const normalizedKeyword = keyword.trim().toLowerCase()
  if (!normalizedKeyword) return nodes

  return nodes.flatMap((node) => {
    const children = filterDocumentTree(node.children, normalizedKeyword)
    const matched = [node.title, node.summary].some((value) =>
      (value || '').toLowerCase().includes(normalizedKeyword),
    )
    if (!matched && !children.length) return []
    return [{ ...node, children }]
  })
}

function collectRequiredExpandedKeys(items: KbPublicDocItem[], activeId: number | null): string[] {
  const itemMap = new Map(items.map((item) => [item.id, item]))
  const expanded = new Set<string>()

  items.forEach((item) => {
    if (item.parentId == null || !itemMap.has(item.parentId)) {
      expanded.add(String(item.id))
    }
  })

  let cursor = activeId != null ? itemMap.get(activeId) : undefined
  while (cursor?.parentId != null && itemMap.has(cursor.parentId)) {
    expanded.add(String(cursor.parentId))
    cursor = itemMap.get(cursor.parentId)
  }

  return Array.from(expanded)
}

function collectExpandableKeys(nodes: PublicTreeNode[]): string[] {
  const keys: string[] = []
  const walk = (node: PublicTreeNode) => {
    if (node.children.length) {
      keys.push(String(node.id))
      node.children.forEach(walk)
    }
  }
  nodes.forEach(walk)
  return keys
}

function TreeBranch({
  node,
  activeToken,
  expandedKeys,
  onToggle,
  depth = 0,
}: {
  node: PublicTreeNode
  activeToken?: string
  expandedKeys: string[]
  onToggle: (id: number) => void
  depth?: number
}) {
  const hasChildren = node.children.length > 0
  const expanded = expandedKeys.includes(String(node.id))
  const active = node.token === activeToken

  return (
    <div className="kb-share-tree__branch">
      <div
        className={`kb-share-tree__row${active ? ' is-active' : ''}`}
        style={{ paddingLeft: 8 + depth * 18 }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="kb-share-tree__toggle"
            onClick={() => onToggle(node.id)}
            aria-label={expanded ? '折叠目录' : '展开目录'}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="kb-share-tree__toggle kb-share-tree__toggle--placeholder" />
        )}

        <Link to={`/kb/share/${encodeURIComponent(node.token)}`} className="kb-share-tree__link">
          <span className={`kb-share-tree__icon${hasChildren ? ' is-folder' : ''}`}>
            {hasChildren ? <FolderTree size={16} /> : <FileText size={16} />}
          </span>
          <span className="kb-share-tree__label">{node.title || '未命名文档'}</span>
        </Link>
      </div>

      {hasChildren && expanded ? (
        <div className="kb-share-tree__children">
          {node.children.map((child) => (
            <TreeBranch
              key={child.id}
              node={child}
              activeToken={activeToken}
              expandedKeys={expandedKeys}
              onToggle={onToggle}
              depth={depth + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default function KbSharePage() {
  const { token } = useParams<{ token: string }>()
  const [loading, setLoading] = useState(true)
  const [doc, setDoc] = useState<KbPublicDoc | null>(null)
  const [documents, setDocuments] = useState<KbPublicDocItem[]>([])
  const [expandedKeys, setExpandedKeys] = useState<string[]>([])
  const [treeKeyword, setTreeKeyword] = useState('')
  const [sidebarWidth, setSidebarWidth] = useState(getInitialSidebarWidth)
  const [viewportWidth, setViewportWidth] = useState(
    typeof window === 'undefined' ? 1440 : window.innerWidth,
  )
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setDoc(null)
      setDocuments([])
      setExpandedKeys([])
      setError('分享令牌缺失')
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setDoc(null)

    getPublicKbShare(token)
      .then((data) => {
        if (cancelled) return
        setDoc(data)
        setDocuments(normalizeDocuments(data))
      })
      .catch((nextError) => {
        if (cancelled) return
        setDoc(null)
        setDocuments([])
        setExpandedKeys([])
        setError((nextError as Error).message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleResize = () => {
      const nextViewportWidth = window.innerWidth
      setViewportWidth(nextViewportWidth)
      setSidebarWidth((current) => clampSidebarWidth(current, nextViewportWidth))
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarWidth))
  }, [sidebarWidth])

  useEffect(() => {
    if (!dragging || typeof window === 'undefined') return

    const previousUserSelect = document.body.style.userSelect
    const previousCursor = document.body.style.cursor
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'

    const stopDragging = () => setDragging(false)
    const handlePointerMove = (event: PointerEvent) => {
      setSidebarWidth(clampSidebarWidth(event.clientX, window.innerWidth))
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopDragging)
    window.addEventListener('pointercancel', stopDragging)
    window.addEventListener('blur', stopDragging)

    return () => {
      document.body.style.userSelect = previousUserSelect
      document.body.style.cursor = previousCursor
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopDragging)
      window.removeEventListener('pointercancel', stopDragging)
      window.removeEventListener('blur', stopDragging)
    }
  }, [dragging])

  const sidebarDocuments = documents.length ? documents : normalizeDocuments(doc)
  const activeDocument =
    sidebarDocuments.find((item) => item.token === token) ||
    sidebarDocuments.find((item) => item.id === doc?.id) ||
    null
  const activeDocumentId = activeDocument?.id ?? doc?.id ?? null

  const fullDocumentTree = useMemo(() => buildDocumentTree(sidebarDocuments), [sidebarDocuments])
  const documentTree = useMemo(
    () => filterDocumentTree(fullDocumentTree, treeKeyword),
    [fullDocumentTree, treeKeyword],
  )
  const visibleDocumentCount = useMemo(() => {
    const count = (nodes: PublicTreeNode[]): number =>
      nodes.reduce((total, node) => total + 1 + count(node.children), 0)
    return count(documentTree)
  }, [documentTree])

  useEffect(() => {
    const requiredKeys = collectRequiredExpandedKeys(sidebarDocuments, activeDocumentId)
    setExpandedKeys((previous) => Array.from(new Set([...requiredKeys, ...previous])))
  }, [activeDocumentId, sidebarDocuments])

  useEffect(() => {
    if (!treeKeyword.trim()) return
    setExpandedKeys((previous) =>
      Array.from(new Set([...previous, ...collectExpandableKeys(documentTree)])),
    )
  }, [documentTree, treeKeyword])

  const currentTitle = doc?.title || activeDocument?.title || '未命名文档'
  const currentSummary = doc?.summary || activeDocument?.summary || ''
  const currentUpdatedAt = doc?.updatedAt || activeDocument?.updatedAt

  const shellStyle = {
    '--kb-share-sidebar-width': `${sidebarWidth}px`,
  } as CSSProperties

  const toggleExpanded = (id: number) => {
    const key = String(id)
    setExpandedKeys((previous) =>
      previous.includes(key)
        ? previous.filter((item) => item !== key)
        : [...previous, key],
    )
  }

  const startResize = (clientX: number) => {
    setSidebarWidth(clampSidebarWidth(clientX, viewportWidth))
    setDragging(true)
  }

  const handleResizerPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (viewportWidth <= 960) return
    event.preventDefault()
    startResize(event.clientX)
  }

  const handleResizerKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (viewportWidth <= 960) return
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return

    event.preventDefault()
    const delta = event.key === 'ArrowLeft' ? -24 : 24
    setSidebarWidth((current) => clampSidebarWidth(current + delta, viewportWidth))
  }

  if (loading && !doc && !sidebarDocuments.length) {
    return (
      <div className="kb-share-page kb-share-page--center">
        <Spin size="large" />
      </div>
    )
  }

  if (error && !doc && !sidebarDocuments.length) {
    return (
      <div className="kb-share-page kb-share-page--center">
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
      </div>
    )
  }

  return (
    <div className="kb-share-page">
      <div className="kb-share-shell" style={shellStyle}>
        <aside className="kb-share-sidebar">
          <div className="kb-share-sidebar__header">
            <div className="kb-share-sidebar__brand">
              <span className="brand-dot" />
              <div>
                <Typography.Title level={4} style={{ margin: 0 }}>
                  知识库公开分享
                </Typography.Title>
                <Typography.Text type="secondary">
                  左侧树形目录可拖拽调整宽度
                </Typography.Text>
              </div>
            </div>
            <div className="kb-share-sidebar__actions">
              <Link to="/">
                <Button>返回首页</Button>
              </Link>
              <ThemeToggle bare />
            </div>
          </div>

          <div className="kb-share-sidebar__meta">
            <span>{treeKeyword.trim() ? '匹配文档' : '公开文档'}</span>
            <strong>
              {treeKeyword.trim()
                ? `${visibleDocumentCount}/${sidebarDocuments.length}`
                : sidebarDocuments.length}
            </strong>
          </div>

          <div className="kb-share-sidebar__search">
            <Input.Search
              allowClear
              placeholder="搜索标题或摘要"
              value={treeKeyword}
              onChange={(event) => setTreeKeyword(event.target.value)}
            />
          </div>

          <div className="kb-share-tree" aria-label="公开文档树形目录">
            {documentTree.length ? (
              documentTree.map((node) => (
                <TreeBranch
                  key={node.id}
                  node={node}
                  activeToken={token}
                  expandedKeys={expandedKeys}
                  onToggle={toggleExpanded}
                />
              ))
            ) : (
              <div className="kb-share-tree__empty">
                {treeKeyword.trim() ? '没有匹配的公开文档' : '暂无公开文档'}
              </div>
            )}
          </div>
        </aside>

        <div
          className={`kb-share-resizer${dragging ? ' is-dragging' : ''}`}
          role="separator"
          aria-orientation="vertical"
          aria-label="调整目录宽度"
          aria-valuemin={SIDEBAR_MIN_WIDTH}
          aria-valuemax={getMaxSidebarWidth(viewportWidth)}
          aria-valuenow={sidebarWidth}
          tabIndex={0}
          onPointerDown={handleResizerPointerDown}
          onKeyDown={handleResizerKeyDown}
        >
          <span className="kb-share-resizer__grip" />
        </div>

        <main className="kb-share-main">
          <section className="kb-share-content">
            {loading && !doc ? (
              <div className="kb-share-content__loading">
                <Spin size="large" />
              </div>
            ) : doc ? (
              <article className="kb-share-article">
                <header className="kb-share-article__header">
                  <span className="kb-share-article__eyebrow">公开阅读</span>
                  <Typography.Title level={1} className="kb-share-article__title">
                    {currentTitle}
                  </Typography.Title>
                  {currentSummary ? (
                    <Typography.Paragraph className="kb-share-article__summary">
                      {currentSummary}
                    </Typography.Paragraph>
                  ) : null}
                  <div className="kb-share-article__facts">
                    <span>最近更新 {formatDateTime(currentUpdatedAt)}</span>
                    {viewportWidth > 960 ? <span>拖动左侧分栏可调整阅读宽度</span> : null}
                  </div>
                </header>
                <div
                  className="kb-share-article__body"
                  dangerouslySetInnerHTML={{
                    __html: doc.contentHtml || fallbackHtml(doc),
                  }}
                />
              </article>
            ) : (
              <Result
                status="warning"
                title="分享文档不可用"
                subTitle={error || '当前文档无法访问'}
                extra={
                  <Link to="/">
                    <Button type="primary">返回首页</Button>
                  </Link>
                }
              />
            )}
          </section>
        </main>
      </div>
    </div>
  )
}
