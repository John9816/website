import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Dropdown, Input, Tooltip, Tree, Typography } from 'antd'
import {
  AppstoreOutlined,
  DeleteOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  HomeOutlined,
  LogoutOutlined,
  PlusOutlined,
  ShareAltOutlined,
  TagsOutlined,
  UserOutlined,
} from '@ant-design/icons'
import ThemeToggle from '../../components/ThemeToggle'
import { useAuth } from '../../context/AuthContext'
import { useKbContext } from './context'
import type { KbDocTreeNode } from '../../types'
import type { TreeProps } from 'antd'

const ROOT_TREE_KEY = '__kb_root__'

type KbTreeDataNode = {
  key: string | number
  title: React.ReactNode
  rawTitle?: string
  children?: KbTreeDataNode[]
}

function countDocs(nodes: KbDocTreeNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countDocs(node.children ?? []), 0)
}

function filterTree(nodes: KbDocTreeNode[], keyword: string): KbDocTreeNode[] {
  if (!keyword) return nodes
  const normalizedKeyword = keyword.trim().toLowerCase()

  return nodes.flatMap((node) => {
    const children = filterTree(node.children ?? [], normalizedKeyword)
    const matched = node.title.toLowerCase().includes(normalizedKeyword)
    if (!matched && !children.length) return []
    return [{ ...node, children }]
  })
}

function sortTreeNodes(nodes: KbDocTreeNode[]): KbDocTreeNode[] {
  return [...nodes].sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id)
}

function findTreeNode(nodes: KbDocTreeNode[], docId: number): KbDocTreeNode | null {
  for (const node of nodes) {
    if (node.id === docId) return node
    const child = findTreeNode(node.children ?? [], docId)
    if (child) return child
  }
  return null
}

function getChildrenForParent(nodes: KbDocTreeNode[], parentId: number | null): KbDocTreeNode[] {
  if (parentId === null) return nodes
  return findTreeNode(nodes, parentId)?.children ?? []
}

function getAppendSortOrder(nodes: KbDocTreeNode[], dragId: number): number {
  const siblings = sortTreeNodes(nodes.filter((node) => node.id !== dragId))
  return (siblings.at(-1)?.sortOrder ?? 0) + 1
}

function getGapSortOrder(
  nodes: KbDocTreeNode[],
  dragId: number,
  targetId: number,
  placement: 'before' | 'after',
): number | undefined {
  const siblings = sortTreeNodes(nodes.filter((node) => node.id !== dragId))
  const targetIndex = siblings.findIndex((node) => node.id === targetId)
  if (targetIndex < 0) return undefined

  const target = siblings[targetIndex]
  if (placement === 'before') {
    const previous = siblings[targetIndex - 1]
    return previous ? (previous.sortOrder + target.sortOrder) / 2 : target.sortOrder - 1
  }

  const next = siblings[targetIndex + 1]
  return next ? (target.sortOrder + next.sortOrder) / 2 : target.sortOrder + 1
}

function getDocIdFromTreeKey(key: React.Key | undefined): number | null {
  if (key === undefined || key === ROOT_TREE_KEY) return null
  const docId = Number(key)
  return Number.isFinite(docId) ? docId : null
}

function buildTreeData(nodes: KbDocTreeNode[]): KbTreeDataNode[] {
  return nodes.map((node) => {
    const childCount = countDocs(node.children ?? [])
    const hasChildren = childCount > 0
    return {
      key: node.id,
      rawTitle: node.title,
      title: (
        <div className="kb-admin-tree-node">
          <span className={`kb-admin-tree-node__status is-${node.status}`} />
          {hasChildren ? (
            <FolderOpenOutlined className="kb-admin-tree-node__icon is-folder" />
          ) : (
            <FileTextOutlined className="kb-admin-tree-node__icon" />
          )}
          <span className="kb-admin-tree-node__title">{node.title || '未命名文档'}</span>
          {childCount > 0 ? <span className="kb-admin-tree-node__count">{childCount}</span> : null}
        </div>
      ),
      children: buildTreeData(node.children ?? []),
    }
  })
}

type KbSidebarProps = {
  onNavigate?: () => void
}

const KbSidebar: React.FC<KbSidebarProps> = ({ onNavigate }) => {
  const [treeKeyword, setTreeKeyword] = React.useState('')
  const auth = useAuth()
  const navigate = useNavigate()
  const {
    tree,
    treeLoading,
    selectedParentId,
    setSelectedParentId,
    openCreateDoc,
    openShareModal,
    confirmDeleteDoc,
    handleMoveDoc,
    setTagModalOpen,
  } = useKbContext()

  const filteredTree = React.useMemo(() => filterTree(tree, treeKeyword), [tree, treeKeyword])
  const totalDocs = React.useMemo(() => countDocs(tree), [tree])
  const visibleDocs = React.useMemo(() => countDocs(filteredTree), [filteredTree])

  const treeData: KbTreeDataNode[] = React.useMemo(
    () => [
      {
        key: ROOT_TREE_KEY,
        rawTitle: '个人空间',
        title: (
          <Dropdown
            menu={{
              items: [
                {
                  key: 'add',
                  label: '新建顶层文档',
                  icon: <PlusOutlined />,
                  onClick: () => openCreateDoc(null),
                },
              ],
            }}
            trigger={['contextMenu']}
          >
            <div className="kb-admin-tree-node kb-admin-tree-node--root">
              <FolderOpenOutlined className="kb-admin-tree-node__icon" />
              <span className="kb-admin-tree-node__title">全部文档</span>
              <span className="kb-admin-tree-node__count">{totalDocs}</span>
            </div>
          </Dropdown>
        ),
        children: buildTreeData(filteredTree),
      },
    ],
    [filteredTree, openCreateDoc, totalDocs],
  )

  const handleLogout = React.useCallback(() => {
    auth.logout()
    navigate('/', { replace: true })
  }, [auth, navigate])

  const handleTreeDrop = React.useCallback<NonNullable<TreeProps['onDrop']>>(
    (info) => {
      if (treeKeyword.trim()) return

      const dragId = getDocIdFromTreeKey(info.dragNode.key)
      const dropId = getDocIdFromTreeKey(info.node.key)
      if (!dragId) return

      if (!info.dropToGap) {
        const parentId = dropId
        const sortOrder = getAppendSortOrder(getChildrenForParent(tree, parentId), dragId)
        void handleMoveDoc(dragId, { parentId, sortOrder })
        return
      }

      if (!dropId) {
        const sortOrder = getAppendSortOrder(tree, dragId)
        void handleMoveDoc(dragId, { parentId: null, sortOrder })
        return
      }

      const dropNode = findTreeNode(tree, dropId)
      if (!dropNode) return

      const dropPos = String((info.node as any).pos ?? '').split('-')
      const dropIndex = Number(dropPos[dropPos.length - 1] ?? 0)
      const placement = info.dropPosition - dropIndex < 0 ? 'before' : 'after'
      const parentId = dropNode.parentId ?? null
      const sortOrder = getGapSortOrder(getChildrenForParent(tree, parentId), dragId, dropId, placement)
      void handleMoveDoc(dragId, { parentId, sortOrder })
    },
    [handleMoveDoc, tree, treeKeyword],
  )

  return (
    <aside className="kb-admin-sidebar">
      <div className="kb-admin-sidebar__header">
        <button
          type="button"
          className="kb-admin-sidebar__title-button"
          onClick={() => {
            setSelectedParentId(null)
            onNavigate?.()
          }}
        >
          <span className="kb-admin-sidebar__logo-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="kb-admin-sidebar__title">我的学城</span>
          <span className="kb-admin-sidebar__subtitle">{totalDocs} 篇文档</span>
        </button>
        <div className="kb-admin-sidebar__actions">
          <Tooltip title="新建顶层文档">
            <Button
              size="small"
              type="text"
              icon={<PlusOutlined />}
              onClick={() => void openCreateDoc(null)}
              aria-label="新建顶层文档"
            />
          </Tooltip>
          <Tooltip title="管理标签">
            <Button
              size="small"
              type="text"
              icon={<TagsOutlined />}
              onClick={() => setTagModalOpen(true)}
              aria-label="管理标签"
            />
          </Tooltip>
        </div>
      </div>

      <nav className="kb-admin-sidebar__nav" aria-label="学城导航">
        <button
          type="button"
          className={!selectedParentId ? 'is-active' : undefined}
          onClick={() => {
            setSelectedParentId(null)
            onNavigate?.()
          }}
        >
          <HomeOutlined />
          <span>主页</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setTagModalOpen(true)
            onNavigate?.()
          }}
        >
          <TagsOutlined />
          <span>标签管理</span>
        </button>
      </nav>

      <div className="kb-admin-sidebar__workspace" aria-label="工作台访问">
        <Link to="/" className="kb-admin-sidebar__workspace-link" aria-label="回到站点首页">
          <HomeOutlined />
          <span>首页</span>
        </Link>
        <Link to="/admin/categories" className="kb-admin-sidebar__workspace-link" aria-label="回到管理后台">
          <AppstoreOutlined />
          <span>后台</span>
        </Link>
        <ThemeToggle bare />
        <Button type="text" danger icon={<LogoutOutlined />} onClick={handleLogout} aria-label="退出登录" />
      </div>

      <div className="kb-admin-sidebar__search">
        <Input.Search
          allowClear
          size="middle"
          placeholder="搜索目录"
          value={treeKeyword}
          onChange={(event) => setTreeKeyword(event.target.value)}
        />
      </div>

      <div className="kb-admin-sidebar__meta">
        <span className="kb-admin-sidebar__meta-title">
          <UserOutlined />
          {treeKeyword ? `匹配 ${visibleDocs} 篇` : '我的空间'}
        </span>
        <button
          type="button"
          onClick={() => {
            setSelectedParentId(null)
            onNavigate?.()
          }}
        >
          打开列表
        </button>
      </div>

      <div className="kb-admin-sidebar__tree">
        {treeLoading ? (
          <Typography.Text type="secondary" className="kb-admin-sidebar__loading">
            正在加载目录...
          </Typography.Text>
        ) : (
          <Tree
            blockNode
            defaultExpandAll
            draggable={treeKeyword.trim() ? false : { icon: false }}
            onDrop={handleTreeDrop}
            selectedKeys={selectedParentId ? [selectedParentId] : [ROOT_TREE_KEY]}
            treeData={treeData}
            onSelect={(keys) => {
              const key = keys[0]
              if (key === undefined || key === ROOT_TREE_KEY) {
                setSelectedParentId(null)
                onNavigate?.()
                return
              }
              setSelectedParentId(typeof key === 'number' ? key : Number(key))
              onNavigate?.()
            }}
            titleRender={(node: any) => {
              if (node.key === ROOT_TREE_KEY) return node.title
              const docId = Number(node.key)
              const title = node.rawTitle || '未命名文档'
              return (
                <Dropdown
                  menu={{
                    items: [
                      {
                        key: 'add-child',
                        label: '新增子文档',
                        icon: <PlusOutlined />,
                        onClick: () => openCreateDoc(docId),
                      },
                      {
                        key: 'share',
                        label: '分享文档',
                        icon: <ShareAltOutlined />,
                        onClick: () => openShareModal({ id: docId, title }),
                      },
                      { type: 'divider' },
                      {
                        key: 'delete',
                        label: '删除文档',
                        icon: <DeleteOutlined />,
                        danger: true,
                        onClick: () => confirmDeleteDoc(docId, title),
                      },
                    ],
                  }}
                  trigger={['contextMenu']}
                >
                  <div className="kb-admin-tree-node-wrap">{node.title}</div>
                </Dropdown>
              )
            }}
          />
        )}
      </div>
    </aside>
  )
}

export default React.memo(KbSidebar)
