import { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue } from 'react'
import { App as AntApp, Form } from 'antd'
import {
  createKbDoc,
  deleteKbDoc,
  getKbDoc,
  getKbDocVersion,
  getKbSpaceTree,
  listKbDocVersions,
  moveKbDoc,
  replaceKbDocTags,
  searchKbDocs,
  updateKbDoc,
} from '../../../api/kb'
import type {
  KbDoc,
  KbDocSummary,
  KbDocTreeNode,
} from '../../../types'
import type { DocFormValues, TreeContextMenuState } from '../context'

type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'draft'

type KbLocalDraft = {
  docId: number
  title: string
  summary: string
  contentHtml: string
  contentJson: string
  formValues: Partial<DocFormValues>
  updatedAt: number
  baseUpdatedAt?: string
  baseVersionNo?: number
}

type EditorSnapshot = {
  docId: number | null
  title: string
  summary: string
  contentHtml: string
  contentJson: string
  formValues: Partial<DocFormValues>
}

const AUTOSAVE_DELAY_MS = 6500
const LOCAL_DRAFT_DELAY_MS = 600

function editorInitialContent(doc: KbDoc) {
  return doc.contentHtml || doc.contentJson || ''
}

function draftStorageKey(docId: number) {
  return `kb:draft:v1:${docId}`
}

function readLocalDraft(docId: number): KbLocalDraft | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(draftStorageKey(docId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as KbLocalDraft
    return parsed?.docId === docId && parsed.updatedAt ? parsed : null
  } catch {
    return null
  }
}

function parseDocTime(value?: string | null) {
  if (!value) return 0
  const parsed = new Date(value.replace(' ', 'T')).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

function draftDiffersFromDoc(draft: KbLocalDraft, doc: KbDoc) {
  if (draft.title !== doc.title) return true
  if (draft.summary !== (doc.summary ?? '')) return true
  if (draft.contentHtml !== (doc.contentHtml ?? '')) return true
  if (draft.contentJson !== (doc.contentJson ?? '')) return true
  return formValuesChanged(draft.formValues, {
    spaceId: doc.spaceId,
    parentId: doc.parentId ?? undefined,
    status: doc.status,
    sortOrder: doc.sortOrder,
    tagIds: doc.tags.map((item) => item.id),
    changeNote: '',
  })
}

function shouldOfferLocalDraft(draft: KbLocalDraft | null, doc: KbDoc) {
  if (!draft || !draftDiffersFromDoc(draft, doc)) return false
  if (draft.baseVersionNo === doc.versionNo) return true
  const serverUpdatedAt = parseDocTime(doc.updatedAt)
  return !serverUpdatedAt || draft.updatedAt > serverUpdatedAt
}

function writeLocalDraft(draft: KbLocalDraft) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(draftStorageKey(draft.docId), JSON.stringify(draft))
  } catch {
    // Browsers may block or evict localStorage; remote autosave is still the source of truth.
  }
}

function removeLocalDraft(docId: number) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(draftStorageKey(docId))
  } catch {
    // Best-effort cleanup only.
  }
}

function normalizeFormValues(values: Partial<DocFormValues>): Partial<DocFormValues> {
  return {
    ...values,
    parentId: values.parentId ?? undefined,
    tagIds: [...(values.tagIds ?? [])].sort((a, b) => a - b),
    changeNote: values.changeNote ?? '',
  }
}

function formValuesChanged(current: Partial<DocFormValues>, saved: Partial<DocFormValues>) {
  const next = normalizeFormValues(current)
  const previous = normalizeFormValues(saved)
  return (
    next.parentId !== previous.parentId ||
    next.status !== previous.status ||
    next.sortOrder !== previous.sortOrder ||
    JSON.stringify(next.tagIds ?? []) !== JSON.stringify(previous.tagIds ?? [])
  )
}

function editorSnapshotsEqual(current: EditorSnapshot, saved: EditorSnapshot) {
  return (
    current.docId === saved.docId &&
    current.title === saved.title &&
    current.summary === saved.summary &&
    current.contentHtml === saved.contentHtml &&
    current.contentJson === saved.contentJson &&
    !formValuesChanged(current.formValues, saved.formValues)
  )
}

function docToFormValues(doc: KbDoc): Partial<DocFormValues> {
  return {
    spaceId: doc.spaceId,
    parentId: doc.parentId ?? undefined,
    status: doc.status,
    sortOrder: doc.sortOrder,
    tagIds: doc.tags.map((item) => item.id),
    changeNote: '',
  }
}

function mergeSavedDoc(
  current: KbDoc,
  saved: KbDoc,
  fallback: {
    title: string
    summary: string
    contentHtml: string
    contentJson: string
    parentId: number | null
    status: KbDoc['status']
    sortOrder?: number
  },
): KbDoc {
  return {
    ...current,
    ...saved,
    title: saved.title ?? fallback.title,
    summary: saved.summary ?? fallback.summary,
    contentHtml: saved.contentHtml ?? fallback.contentHtml,
    contentJson: saved.contentJson ?? fallback.contentJson,
    parentId: saved.parentId ?? fallback.parentId,
    status: saved.status ?? fallback.status,
    sortOrder: saved.sortOrder ?? fallback.sortOrder ?? current.sortOrder,
    tags: Array.isArray(saved.tags) ? saved.tags : current.tags,
    share: saved.share ?? current.share,
    updatedAt: saved.updatedAt ?? new Date().toISOString(),
  }
}

function patchTreeDoc(nodes: KbDocTreeNode[], doc: Pick<KbDoc, 'id' | 'title' | 'status' | 'sortOrder'>): KbDocTreeNode[] {
  return nodes.map((node) => {
    const nextNode =
      node.id === doc.id
        ? { ...node, title: doc.title, status: doc.status, sortOrder: doc.sortOrder }
        : node

    return {
      ...nextNode,
      children: nextNode.children?.length ? patchTreeDoc(nextNode.children, doc) : nextNode.children,
    }
  })
}

async function hydrateDocContent(doc: KbDoc, signal?: AbortSignal) {
  if (doc.contentHtml || doc.contentJson) return doc

  const versions = await listKbDocVersions(doc.id, 0, 1, signal)
  const latestVersionId = versions.items[0]?.id
  if (!latestVersionId) return doc

  const detail = await getKbDocVersion(doc.id, latestVersionId, signal)
  return {
    ...doc,
    contentHtml: detail.contentHtml ?? doc.contentHtml,
    contentJson: detail.contentJson ?? doc.contentJson,
  }
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

export function useKbDocs(activeSpaceId: number | null) {
  const { message, modal } = AntApp.useApp()
  const [keyword, setKeyword] = useState('')
  const deferredKeyword = useDeferredValue(keyword.trim())
  const [tree, setTree] = useState<KbDocTreeNode[]>([])
  const [treeLoading, setTreeLoading] = useState(false)
  const [selectedParentId, setSelectedParentId] = useState<number | null>(null)
  const [selectedDoc, setSelectedDoc] = useState<KbDoc | null>(null)
  const [selectedDocLoading, setSelectedDocLoading] = useState(false)
  const [treeContextMenu, setTreeContextMenu] = useState<TreeContextMenuState | null>(null)

  const [docs, setDocs] = useState<KbDocSummary[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [docTotal, setDocTotal] = useState(0)
  const [docPage, setDocPage] = useState(1)
  const [docPageSize, setDocPageSize] = useState(20)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  const [inlineEditingDocId, setInlineEditingDocId] = useState<number | null>(null)
  const [inlineDocSaving, setInlineDocSaving] = useState(false)
  const [inlineDocForm] = Form.useForm<DocFormValues>()
  const [propertyDrawerOpen, setPropertyDrawerOpen] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editSummary, setEditSummary] = useState('')
  const [editContentHtml, setEditContentHtml] = useState('')
  const [editContentJson, setEditContentJson] = useState('')
  const [editInitialContent, setEditInitialContent] = useState('')
  const [inlineDocFormRevision, setInlineDocFormRevision] = useState(0)
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle')
  const [lastAutosavedAt, setLastAutosavedAt] = useState<string | null>(null)
  const [autosaveError, setAutosaveError] = useState('')
  const [localDraft, setLocalDraft] = useState<KbLocalDraft | null>(null)

  const lastSavedValuesRef = useRef<any>(null)
  const inlineEditingDocIdRef = useRef<number | null>(null)
  const selectedParentIdRef = useRef<number | null>(null)
  const latestEditorSnapshotRef = useRef<EditorSnapshot>({
    docId: null,
    title: '',
    summary: '',
    contentHtml: '',
    contentJson: '',
    formValues: {},
  })

  const loadTree = useCallback(
    async (spaceId: number, signal?: AbortSignal) => {
      setTreeLoading(true)
      try {
        setTree(await getKbSpaceTree(spaceId, signal))
      } catch (error) {
        if ((error as any).code === -2) return
        message.error((error as Error).message)
      } finally {
        setTreeLoading(false)
      }
    },
    [message],
  )

  const loadDocs = useCallback(
    async (params?: any) => {
      const spaceId = params?.spaceId ?? activeSpaceId
      if (!spaceId) {
        setDocs([])
        setDocTotal(0)
        return
      }

      const page = params?.page ?? docPage
      const pageSize = params?.pageSize ?? docPageSize
      const parentId = params?.parentId !== undefined ? params.parentId : undefined
      const nextKeyword = params?.keyword !== undefined ? params.keyword : deferredKeyword || undefined
      const nextTagId = params?.tagId
      const signal = params?.signal

      setDocsLoading(true)
      try {
        const data = await searchKbDocs({
          spaceId,
          parentId: parentId ?? undefined,
          keyword: nextKeyword,
          tagId: nextTagId,
          page: page - 1,
          size: pageSize,
        }, signal)
        setDocs(data.items)
        setDocTotal(data.total)
      } catch (error) {
        if ((error as any).code === -2) return
        message.error((error as Error).message)
      } finally {
        setDocsLoading(false)
      }
    },
    [activeSpaceId, deferredKeyword, docPage, docPageSize, message],
  )

  const loadSelectedDoc = useCallback(
    async (docId: number, signal?: AbortSignal) => {
      setSelectedDocLoading(true)
      try {
        const doc = await getKbDoc(docId, signal)
        setSelectedDoc(await hydrateDocContent(doc, signal))
      } catch (error) {
        if ((error as any).code === -2) return
        setSelectedDoc(null)
        message.error((error as Error).message)
      } finally {
        setSelectedDocLoading(false)
      }
    },
    [message],
  )

  const enterInlineEdit = useCallback(
    (doc: KbDoc) => {
      setInlineEditingDocId(doc.id)
      setEditTitle(doc.title)
      setEditSummary(doc.summary ?? '')
      setEditContentHtml(doc.contentHtml ?? '')
      setEditContentJson(doc.contentJson ?? '')
      setEditInitialContent(editorInitialContent(doc))
      const formValues = docToFormValues(doc)
      inlineDocForm.setFieldsValue(formValues)
      lastSavedValuesRef.current = formValues
      setInlineDocFormRevision((revision) => revision + 1)
      setAutosaveStatus('idle')
      setAutosaveError('')
      setLastAutosavedAt(null)
      const draft = readLocalDraft(doc.id)
      setLocalDraft(draft && shouldOfferLocalDraft(draft, doc) ? draft : null)
    },
    [inlineDocForm],
  )

  const exitInlineEdit = useCallback(() => {
    setInlineEditingDocId(null)
    setEditTitle('')
    setEditSummary('')
    setEditContentHtml('')
    setEditContentJson('')
    setEditInitialContent('')
    setInlineDocFormRevision(0)
    setAutosaveStatus('idle')
    setAutosaveError('')
    setLastAutosavedAt(null)
    setLocalDraft(null)
    inlineDocForm.resetFields()
    lastSavedValuesRef.current = null
  }, [inlineDocForm])

  const openCreateDoc = useCallback(async (parentIdOverride?: number | null, loadSpaces?: any) => {
    if (!activeSpaceId) {
      message.warning('请先创建个人空间')
      return
    }
    const parentId = parentIdOverride !== undefined ? parentIdOverride : selectedParentId ?? null
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
      const fullDoc = await hydrateDocContent(await getKbDoc(created.id))
      setSelectedDoc(fullDoc)
      setSelectedParentId(fullDoc.id)
      enterInlineEdit(fullDoc)
      if (loadSpaces) await loadSpaces(activeSpaceId)
      await loadTree(activeSpaceId)
      await loadDocs({ spaceId: activeSpaceId, page: 1 })
    } catch (error) {
      message.error((error as Error).message)
    }
  }, [activeSpaceId, docs, enterInlineEdit, loadDocs, loadTree, message, selectedParentId])

  const openEditDoc = useCallback(async (doc: { id: number }) => {
    try {
      const fullDoc = await hydrateDocContent(await getKbDoc(doc.id))
      setSelectedDoc(fullDoc)
      setSelectedParentId(fullDoc.id)
      enterInlineEdit(fullDoc)
    } catch (error) {
      message.error((error as Error).message)
    }
  }, [enterInlineEdit])

  const buildLocalDraft = useCallback((): KbLocalDraft | null => {
    if (!selectedDoc || inlineEditingDocId !== selectedDoc.id) return null
    return {
      docId: selectedDoc.id,
      title: editTitle,
      summary: editSummary,
      contentHtml: editContentHtml,
      contentJson: editContentJson,
      formValues: normalizeFormValues(inlineDocForm.getFieldsValue()),
      updatedAt: Date.now(),
      baseUpdatedAt: selectedDoc.updatedAt,
      baseVersionNo: selectedDoc.versionNo,
    }
  }, [editContentHtml, editContentJson, editSummary, editTitle, inlineDocForm, inlineEditingDocId, selectedDoc])

  const restoreLocalDraft = useCallback(() => {
    if (!localDraft || !selectedDoc || localDraft.docId !== selectedDoc.id) return
    setEditTitle(localDraft.title)
    setEditSummary(localDraft.summary)
    setEditContentHtml(localDraft.contentHtml)
    setEditContentJson(localDraft.contentJson)
    setEditInitialContent(localDraft.contentHtml || localDraft.contentJson || '')
    inlineDocForm.setFieldsValue(localDraft.formValues)
    setInlineDocFormRevision((revision) => revision + 1)
    setLocalDraft(null)
    setAutosaveStatus('draft')
  }, [inlineDocForm, localDraft, selectedDoc])

  const discardLocalDraft = useCallback(() => {
    if (!selectedDoc) return
    removeLocalDraft(selectedDoc.id)
    setLocalDraft(null)
    if (autosaveStatus === 'draft') setAutosaveStatus('idle')
  }, [autosaveStatus, selectedDoc])

  const handleInlineDocFormValuesChange = useCallback(() => {
    setInlineDocFormRevision((revision) => revision + 1)
  }, [])

  const saveInlineDoc = useCallback(async (
    options: {
      exitAfterSave?: boolean
      silent?: boolean
      loadSpaces?: any
      loadTags?: any
    } = {},
  ) => {
    if (!selectedDoc || inlineEditingDocId !== selectedDoc.id) return
    const trimmedTitle = editTitle.trim()
    if (!trimmedTitle) {
      if (!options.silent) message.error('请输入标题')
      setAutosaveStatus('draft')
      return
    }
    const values = options.silent
      ? normalizeFormValues(inlineDocForm.getFieldsValue()) as DocFormValues
      : await inlineDocForm.validateFields()
    if (!values.status) {
      setAutosaveStatus('draft')
      return
    }
    const nextParentId = values.parentId ?? null
    const nextTagIds = [...(values.tagIds ?? [])].sort((a, b) => a - b)
    const savedSnapshot: EditorSnapshot = {
      docId: selectedDoc.id,
      title: trimmedTitle,
      summary: editSummary,
      contentHtml: editContentHtml,
      contentJson: editContentJson,
      formValues: normalizeFormValues({
        ...values,
        parentId: values.parentId ?? undefined,
        tagIds: nextTagIds,
        changeNote: '',
      }),
    }
    const hasEditorChanges =
      trimmedTitle !== selectedDoc.title ||
      editSummary !== (selectedDoc.summary ?? '') ||
      editContentHtml !== (selectedDoc.contentHtml ?? '') ||
      editContentJson !== (selectedDoc.contentJson ?? '') ||
      formValuesChanged(savedSnapshot.formValues, lastSavedValuesRef.current ?? docToFormValues(selectedDoc))
    const hasChangeNote = Boolean(values.changeNote?.trim())

    if (!hasEditorChanges && !hasChangeNote) {
      setAutosaveStatus('saved')
      if (options.exitAfterSave) exitInlineEdit()
      return
    }
    latestEditorSnapshotRef.current = savedSnapshot

    setInlineDocSaving(true)
    setAutosaveStatus(options.silent ? 'saving' : 'pending')
    setAutosaveError('')
    try {
      let savedDoc = await updateKbDoc(selectedDoc.id, {
        title: trimmedTitle,
        summary: editSummary,
        contentJson: editContentJson,
        contentHtml: editContentHtml,
        status: values.status,
        sortOrder: values.sortOrder,
        changeNote: values.changeNote,
      })

      if ((selectedDoc.parentId ?? null) !== nextParentId || selectedDoc.sortOrder !== values.sortOrder) {
        savedDoc = await moveKbDoc(selectedDoc.id, {
          spaceId: selectedDoc.spaceId,
          parentId: nextParentId,
          sortOrder: values.sortOrder,
        })
      }

      const currentTagIds = selectedDoc.tags.map((item) => item.id).sort((a, b) => a - b)
      if (currentTagIds.join(',') !== nextTagIds.join(',')) {
        savedDoc = await replaceKbDocTags(selectedDoc.id, nextTagIds)
      }

      const updatedDoc = mergeSavedDoc(selectedDoc, savedDoc, {
        title: trimmedTitle,
        summary: editSummary,
        contentHtml: editContentHtml,
        contentJson: editContentJson,
        parentId: nextParentId,
        status: values.status,
        sortOrder: values.sortOrder,
      })
      const currentEditorStillMatchesSave = editorSnapshotsEqual(latestEditorSnapshotRef.current, savedSnapshot)
      const stillEditingThisDoc = inlineEditingDocIdRef.current === selectedDoc.id
      const stillViewingThisDoc = selectedParentIdRef.current === selectedDoc.id

      if (stillViewingThisDoc) setSelectedDoc(updatedDoc)
      setDocs((items) =>
        items.map((item) =>
          item.id === selectedDoc.id
            ? {
                ...item,
                title: trimmedTitle,
                summary: editSummary,
                status: values.status,
                sortOrder: values.sortOrder ?? item.sortOrder,
                updatedAt: updatedDoc.updatedAt,
              }
            : item,
        ),
      )
      setTree((nodes) => patchTreeDoc(nodes, updatedDoc))
      if (stillEditingThisDoc) {
        lastSavedValuesRef.current = savedSnapshot.formValues
      }
      if (stillEditingThisDoc && currentEditorStillMatchesSave) {
        inlineDocForm.setFieldValue('changeNote', '')
        removeLocalDraft(selectedDoc.id)
        setLocalDraft(null)
        setLastAutosavedAt(updatedDoc.updatedAt ?? new Date().toISOString())
        setAutosaveStatus('saved')
      } else if (stillEditingThisDoc) {
        setAutosaveStatus('pending')
      }
      if (!options.silent) message.success('文档已更新')
      const targetSpaceId = selectedDoc.spaceId
      if (options.exitAfterSave) {
        exitInlineEdit()
        await Promise.all([
          options.loadSpaces?.(targetSpaceId),
          options.loadTags?.(),
          loadTree(targetSpaceId),
          loadDocs({ spaceId: targetSpaceId }),
          loadSelectedDoc(selectedDoc.id),
        ])
      } else if ((selectedDoc.parentId ?? null) !== nextParentId || selectedDoc.sortOrder !== values.sortOrder) {
        await Promise.all([
          loadTree(targetSpaceId),
          loadDocs({ spaceId: targetSpaceId }),
        ])
      }
    } catch (error) {
      setAutosaveStatus('error')
      setAutosaveError((error as Error).message)
      if (!options.silent) message.error((error as Error).message)
    } finally {
      setInlineDocSaving(false)
    }
  }, [editContentHtml, editContentJson, editSummary, editTitle, exitInlineEdit, inlineDocForm, inlineEditingDocId, loadDocs, loadSelectedDoc, loadTree, message, selectedDoc])

  const handleSaveInlineDoc = useCallback(async (loadSpaces: any, loadTags: any) => {
    await saveInlineDoc({
      exitAfterSave: true,
      silent: false,
      loadSpaces,
      loadTags,
    })
  }, [saveInlineDoc])

  const handleDeleteDoc = useCallback(async (docId: number, loadSpaces: any) => {
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
  }, [activeSpaceId, loadDocs, loadTree, message, selectedParentId])

  const confirmDeleteDoc = useCallback((docId: number, title: string, loadSpaces: any) => {
    modal.confirm({
      title: `确认删除“${title}”？`,
      content: '删除后不可恢复。',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => handleDeleteDoc(docId, loadSpaces),
    })
  }, [handleDeleteDoc, modal])

  const isDirty = useMemo(() => {
    if (!inlineEditingDocId || !selectedDoc) return false
    if (editTitle !== selectedDoc.title) return true
    if (editSummary !== (selectedDoc.summary ?? '')) return true
    if (editContentHtml !== (selectedDoc.contentHtml ?? '')) return true
    if (editContentJson !== (selectedDoc.contentJson ?? '')) return true

    if (lastSavedValuesRef.current) {
      const currentValues = inlineDocForm.getFieldsValue()
      const saved = lastSavedValuesRef.current
      if (formValuesChanged(currentValues, saved)) return true
    }

    return false
  }, [editContentHtml, editContentJson, editSummary, editTitle, inlineDocForm, inlineDocFormRevision, inlineEditingDocId, selectedDoc])

  const inlineDocParentOptions = useMemo(
    () => flattenTreeOptions(tree, '', inlineEditingDocId ?? undefined),
    [inlineEditingDocId, tree],
  )

  useEffect(() => {
    inlineEditingDocIdRef.current = inlineEditingDocId
  }, [inlineEditingDocId])

  useEffect(() => {
    selectedParentIdRef.current = selectedParentId
  }, [selectedParentId])

  useEffect(() => {
    latestEditorSnapshotRef.current = {
      docId: inlineEditingDocId,
      title: editTitle.trim(),
      summary: editSummary,
      contentHtml: editContentHtml,
      contentJson: editContentJson,
      formValues: normalizeFormValues(inlineDocForm.getFieldsValue()),
    }
  }, [editContentHtml, editContentJson, editSummary, editTitle, inlineDocForm, inlineDocFormRevision, inlineEditingDocId])

  useEffect(() => {
    if (!inlineEditingDocId || !isDirty) return
    const timer = window.setTimeout(() => {
      const draft = buildLocalDraft()
      if (!draft) return
      writeLocalDraft(draft)
      setAutosaveStatus((status) => (status === 'saving' || status === 'pending' ? status : 'draft'))
    }, LOCAL_DRAFT_DELAY_MS)

    return () => window.clearTimeout(timer)
  }, [buildLocalDraft, inlineDocFormRevision, inlineEditingDocId, isDirty])

  useEffect(() => {
    if (!inlineEditingDocId || !selectedDoc || !isDirty || inlineDocSaving) return
    setAutosaveStatus('pending')
    const timer = window.setTimeout(() => {
      void saveInlineDoc({ exitAfterSave: false, silent: true })
    }, AUTOSAVE_DELAY_MS)

    return () => window.clearTimeout(timer)
  }, [inlineDocFormRevision, inlineDocSaving, inlineEditingDocId, isDirty, saveInlineDoc, selectedDoc])

  useEffect(() => {
    if (selectedParentId) {
      void loadSelectedDoc(selectedParentId)
    } else {
      setSelectedDoc(null)
    }
  }, [selectedParentId, loadSelectedDoc])

  return {
    tree, treeLoading, selectedParentId, setSelectedParentId,
    selectedDoc, selectedDocLoading, treeContextMenu, setTreeContextMenu,
    docs, docsLoading, docTotal, docPage, setDocPage, docPageSize, setDocPageSize,
    selectedRowKeys, setSelectedRowKeys, inlineEditingDocId, inlineDocSaving,
    inlineDocForm, propertyDrawerOpen, setPropertyDrawerOpen,
    editTitle, setEditTitle, editSummary, setEditSummary,
    editContentHtml, setEditContentHtml, editContentJson, setEditContentJson,
    editInitialContent,
    autosaveStatus, lastAutosavedAt, autosaveError, localDraft,
    isDirty, inlineDocParentOptions,
    keyword, setKeyword, deferredKeyword,
    loadTree, loadDocs, loadSelectedDoc, openCreateDoc, openEditDoc,
    handleSaveInlineDoc, handleDeleteDoc, confirmDeleteDoc, enterInlineEdit, exitInlineEdit,
    restoreLocalDraft, discardLocalDraft, handleInlineDocFormValuesChange,
  }
}
