import React from 'react'
import { Button, Dropdown, Tooltip, Tree, Typography } from 'antd'
import {
  DeleteOutlined,
  PlusOutlined,
  ShareAltOutlined,
  TagsOutlined,
} from '@ant-design/icons'
import { useKbContext } from './context'

const ROOT_TREE_KEY = '__kb_root__'

function buildTreeData(nodes: any[]): any[] {
  return nodes.map((node) => ({
    key: node.id,
    title: node.title,
    children: buildTreeData(node.children ?? []),
  }))
}

const KbSidebar: React.FC = () => {
  const {
    tree,
    treeLoading,
    selectedParentId,
    setSelectedParentId,
    openCreateDoc,
    openShareModal,
    confirmDeleteDoc,
    setTagModalOpen,
    setTreeContextMenu,
    treeContextMenu,
  } = useKbContext()

  return (
    <aside className="kb-admin-sidebar">
      <div className="kb-admin-sidebar__header">
        <span className="kb-admin-sidebar__title">个人空间</span>
        <div className="kb-admin-sidebar__actions">
          <Tooltip title="新建顶层文档">
            <Button
              size="small"
              type="text"
              icon={<PlusOutlined />}
              onClick={() => void openCreateDoc(null)}
            />
          </Tooltip>
          <Tooltip title="管理标签">
            <Button
              size="small"
              type="text"
              icon={<TagsOutlined />}
              onClick={() => setTagModalOpen(true)}
            />
          </Tooltip>
        </div>
      </div>

      <div className="kb-admin-sidebar__tree">
        {treeLoading ? (
          <Typography.Text type="secondary" style={{ paddingLeft: 8 }}>
            加载中...
          </Typography.Text>
        ) : (
          <Tree
            blockNode
            defaultExpandAll
            selectedKeys={selectedParentId ? [selectedParentId] : []}
            treeData={[
              {
                key: ROOT_TREE_KEY,
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
                    <span style={{ fontWeight: 600 }}>个人空间</span>
                  </Dropdown>
                ),
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
            titleRender={(node: any) => {
              if (node.key === ROOT_TREE_KEY) return node.title
              const docId = Number(node.key)
              const title = node.title as string
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
                  <div style={{ width: '100%' }}>{title}</div>
                </Dropdown>
              )
            }}
          />
        )}
      </div>

      <div className="kb-admin-sidebar__hint">
        右键文档可新建子文档、分享或删除。
      </div>
    </aside>
  )
}

export default React.memo(KbSidebar)
