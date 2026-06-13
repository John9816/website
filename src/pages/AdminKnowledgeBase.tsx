import { useEffect } from 'react'
import { Button, Empty, Space } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { KbContextProvider } from './kb/KbContextProvider'
import { useKbContext } from './kb/context'
import KbSidebar from './kb/KbSidebar'
import KbMain from './kb/KbMain'
import KbPropertyDrawer from './kb/KbPropertyDrawer'
import KbTagModal from './kb/KbTagModal'
import KbShareModal from './kb/KbShareModal'
import KbVersionDrawer from './kb/KbVersionDrawer'
import '../styles/kb-admin.css'

function AdminKnowledgeBaseContent() {
  const context = useKbContext()
  const {
    spaces,
    spacesLoading,
    handleCreatePersonalSpace,
    creatingPersonalSpace,
    activeSpaceId,
    loadSpaces,
    loadTags,
    loadTree,
    loadDocs,
    deferredKeyword,
    docPage,
    docPageSize,
    tagFilterId,
    isDirty,
  } = context

  useEffect(() => {
    const controller = new AbortController()
    void Promise.all([loadSpaces(undefined, controller.signal), loadTags(controller.signal)])
    return () => controller.abort()
  }, [loadSpaces, loadTags])

  useEffect(() => {
    if (!activeSpaceId) return
    const controller = new AbortController()
    void loadTree(activeSpaceId, controller.signal)
    return () => controller.abort()
  }, [activeSpaceId, loadTree])

  useEffect(() => {
    const controller = new AbortController()
    void loadDocs({ signal: controller.signal, tagId: tagFilterId })
    return () => controller.abort()
  }, [activeSpaceId, deferredKeyword, docPage, docPageSize, loadDocs, tagFilterId])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  if (!spaces.length && !spacesLoading) {
    return (
      <div className="kb-admin-empty">
        <Empty
          description={
            <span>
              还没有知识库空间。创建个人空间后，就可以沉淀文档、标签、版本和公开分享。
            </span>
          }
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
      </div>
    )
  }

  return (
    <div className="kb-admin-shell">
      <KbSidebar />
      <KbMain />
      <KbPropertyDrawer />
      <KbTagModal />
      <KbShareModal />
      <KbVersionDrawer />
    </div>
  )
}

export default function AdminKnowledgeBase() {
  return (
    <KbContextProvider>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <AdminKnowledgeBaseContent />
      </Space>
    </KbContextProvider>
  )
}
