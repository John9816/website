import { createContext, useContext } from 'react'
import type { FormInstance } from 'antd'
import type {
  KbDoc,
  KbDocShare,
  KbDocSummary,
  KbDocTreeNode,
  KbDocVersion,
  KbDocVersionDetail,
  KbSpace,
  KbTag,
} from '../../types'

export type DocFormValues = {
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

export type TreeContextMenuState =
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

export type DocRef = {
  id: number
  title: string
}

export interface KbContextState {
  // State
  spaces: KbSpace[]
  spacesLoading: boolean
  creatingPersonalSpace: boolean
  activeSpaceId: number | null
  tree: KbDocTreeNode[]
  treeLoading: boolean
  selectedParentId: number | null
  selectedDoc: KbDoc | null
  selectedDocLoading: boolean
  treeContextMenu: TreeContextMenuState | null
  tags: KbTag[]
  tagsLoading: boolean
  tagModalOpen: boolean
  tagSaving: boolean
  editingTag: KbTag | null
  docs: KbDocSummary[]
  docsLoading: boolean
  docTotal: number
  docPage: number
  docPageSize: number
  keyword: string
  deferredKeyword: string
  tagFilterId: number | undefined
  inlineEditingDocId: number | null
  inlineDocSaving: boolean
  propertyDrawerOpen: boolean
  editTitle: string
  editSummary: string
  editContentHtml: string
  editContentJson: string
  editInitialContent: string
  shareModalOpen: boolean
  shareLoading: boolean
  shareSaving: boolean
  shareDoc: DocRef | null
  shareInfo: KbDocShare | null
  shareExpiresAt: string
  setShareExpiresAt: (expiresAt: string) => void
  versionDrawerDoc: DocRef | null
  versionsLoading: boolean
  versionItems: KbDocVersion[]
  versionPage: number
  versionTotal: number
  versionDetail: KbDocVersionDetail | null
  selectedVersionId: number | null
  versionDetailLoading: boolean
  selectedRowKeys: React.Key[]
  isDirty: boolean

  // Computed
  inlineDocParentOptions: Array<{ value: number; label: string }>
  shareUrl: string

  // Form
  tagForm: FormInstance
  inlineDocForm: FormInstance

  // Actions
  setActiveSpaceId: (id: number | null) => void
  setSelectedParentId: (id: number | null) => void
  setKeyword: (keyword: string) => void
  setTagFilterId: (id: number | undefined) => void
  setDocPage: (page: number) => void
  setDocPageSize: (size: number) => void
  setSelectedRowKeys: (keys: React.Key[]) => void
  setTagModalOpen: (open: boolean) => void
  setPropertyDrawerOpen: (open: boolean) => void
  setShareModalOpen: (open: boolean) => void
  setVersionDrawerDoc: (doc: DocRef | null) => void
  setEditTitle: (title: string) => void
  setEditSummary: (summary: string) => void
  setEditContentHtml: (html: string) => void
  setEditContentJson: (json: string) => void
  setTreeContextMenu: (state: TreeContextMenuState | null) => void

  // Async Actions
  loadSpaces: (preferredSpaceId?: number, signal?: AbortSignal) => Promise<void>
  loadTags: (signal?: AbortSignal) => Promise<void>
  loadTree: (spaceId: number, signal?: AbortSignal) => Promise<void>
  loadDocs: (params?: any) => Promise<void>
  loadSelectedDoc: (docId: number, signal?: AbortSignal) => Promise<void>
  loadVersionDetail: (docId: number, versionId: number, signal?: AbortSignal) => Promise<void>
  loadVersions: (docId: number, page?: number, signal?: AbortSignal) => Promise<void>
  handleCreatePersonalSpace: () => Promise<void>
  handleSaveTag: () => Promise<void>
  handleEditTag: (tag: KbTag) => void
  handleDeleteTag: (id: number) => Promise<void>
  openCreateDoc: (parentIdOverride?: number | null) => Promise<void>
  openEditDoc: (doc: { id: number }) => Promise<void>
  handleSaveInlineDoc: () => Promise<void>
  handleDeleteDoc: (docId: number) => Promise<void>
  confirmDeleteDoc: (docId: number, title: string) => void
  openShareModal: (doc: { id: number; title: string }) => Promise<void>
  handleSaveShare: (rotateToken?: boolean) => Promise<void>
  handleDisableShare: () => Promise<void>
  openVersionsDrawer: (doc: { id: number; title: string }) => Promise<void>
  handleRestoreVersion: () => Promise<void>
  enterInlineEdit: (doc: KbDoc) => void
  exitInlineEdit: () => void
}

export const KbContext = createContext<KbContextState | undefined>(undefined)

export function useKbContext() {
  const context = useContext(KbContext)
  if (!context) {
    throw new Error('useKbContext must be used within a KbContextProvider')
  }
  return context
}
