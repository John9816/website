import { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue } from 'react'
import { App as AntApp, Form } from 'antd'
import {
  createKbDoc,
  deleteKbDoc,
  getKbDoc,
  getKbSpaceTree,
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
  const [editInitialContent, setEditInitialContent] = useState('')
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const lastSavedValuesRef = useRef<any>(null)

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
        setSelectedDoc(await getKbDoc(docId, signal))
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
      setEditInitialContent(doc.contentHtml ?? '')
      const formValues = {
        spaceId: doc.spaceId,
        parentId: doc.parentId ?? undefined,
        status: doc.status,
        sortOrder: doc.sortOrder,
        tagIds: doc.tags.map((item) => item.id),
        changeNote: '',
      }
      inlineDocForm.setFieldsValue(formValues)
      lastSavedValuesRef.current = formValues
    },
    [inlineDocForm],
  )

  const exitInlineEdit = useCallback(() => {
    setInlineEditingDocId(null)
    setEditTitle('')
    setEditSummary('')
    setEditContentHtml('')
    setEditInitialContent('')
    inlineDocForm.resetFields()
    lastSavedValuesRef.current = null
    setAutosaveStatus('idle')
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
      const fullDoc = await getKbDoc(created.id)
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
      const fullDoc = await getKbDoc(doc.id)
      setSelectedDoc(fullDoc)
      setSelectedParentId(fullDoc.id)
      enterInlineEdit(fullDoc)
    } catch (error) {
      message.error((error as Error).message)
    }
  }, [enterInlineEdit])

  const handleSaveInlineDoc = useCallback(async (loadSpaces: any, loadTags: any) => {
    if (!selectedDoc || inlineEditingDocId !== selectedDoc.id) return
    const trimmedTitle = editTitle.trim()
    if (!trimmedTitle) {
      message.error('请输入标题')
      return
    }
    const values = await inlineDocForm.validateFields()
    const nextParentId = values.parentId ?? null
    const nextTagIds = [...(values.tagIds ?? [])].sort((a, b) => a - b)

    setInlineDocSaving(true)
    setAutosaveStatus('idle')
    try {
      await updateKbDoc(selectedDoc.id, {
        title: trimmedTitle,
        summary: editSummary,
        contentHtml: editContentHtml,
        status: values.status,
        sortOrder: values.sortOrder,
        changeNote: values.changeNote,
      })

      if ((selectedDoc.parentId ?? null) !== nextParentId || selectedDoc.sortOrder !== values.sortOrder) {
        await moveKbDoc(selectedDoc.id, {
          spaceId: selectedDoc.spaceId,
          parentId: nextParentId,
          sortOrder: values.sortOrder,
        })
      }

      const currentTagIds = selectedDoc.tags.map((item) => item.id).sort((a, b) => a - b)
      if (currentTagIds.join(',') !== nextTagIds.join(',')) {
        await replaceKbDocTags(selectedDoc.id, nextTagIds)
      }

      message.success('文档已更新')
      const targetSpaceId = selectedDoc.spaceId
      exitInlineEdit()
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
  }, [editContentHtml, editSummary, editTitle, exitInlineEdit, inlineDocForm, inlineEditingDocId, loadDocs, loadSelectedDoc, loadTree, message, selectedDoc])

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

    if (lastSavedValuesRef.current) {
      const currentValues = inlineDocForm.getFieldsValue()
      const saved = lastSavedValuesRef.current
      if (currentValues.parentId !== saved.parentId) return true
      if (currentValues.status !== saved.status) return true
      if (currentValues.sortOrder !== saved.sortOrder) return true
      if (JSON.stringify([...(currentValues.tagIds ?? [])].sort()) !==
          JSON.stringify([...(saved.tagIds ?? [])].sort())) return true
    }

    return false
  }, [editContentHtml, editSummary, editTitle, inlineDocForm, inlineEditingDocId, selectedDoc])

  const inlineDocParentOptions = useMemo(
    () => flattenTreeOptions(tree, '', inlineEditingDocId ?? undefined),
    [inlineEditingDocId, tree],
  )

  useEffect(() => {
    if (!isDirty || !selectedDoc || inlineDocSaving) {
      if (autosaveStatus === 'saved') {
        const timer = setTimeout(() => setAutosaveStatus('idle'), 3000)
        return () => clearTimeout(timer)
      }
      return
    }

    const timer = setTimeout(async () => {
      setAutosaveStatus('saving')
      try {
        await updateKbDoc(selectedDoc.id, {
          title: editTitle.trim() || '未命名文档',
          summary: editSummary,
          contentHtml: editContentHtml,
        })
        setAutosaveStatus('saved')
        selectedDoc.title = editTitle.trim() || '未命名文档'
        selectedDoc.summary = editSummary
        selectedDoc.contentHtml = editContentHtml
      } catch (error) {
        setAutosaveStatus('error')
      }
    }, 3000)

    return () => clearTimeout(timer)
  }, [isDirty, editTitle, editSummary, editContentHtml, selectedDoc, inlineDocSaving, autosaveStatus])

  return {
    tree, treeLoading, selectedParentId, setSelectedParentId,
    selectedDoc, selectedDocLoading, treeContextMenu, setTreeContextMenu,
    docs, docsLoading, docTotal, docPage, setDocPage, docPageSize, setDocPageSize,
    selectedRowKeys, setSelectedRowKeys, inlineEditingDocId, inlineDocSaving,
    inlineDocForm, propertyDrawerOpen, setPropertyDrawerOpen,
    editTitle, setEditTitle, editSummary, setEditSummary,
    editContentHtml, setEditContentHtml, editInitialContent, autosaveStatus,
    isDirty, inlineDocParentOptions,
    keyword, setKeyword, deferredKeyword,
    loadTree, loadDocs, loadSelectedDoc, openCreateDoc, openEditDoc,
    handleSaveInlineDoc, handleDeleteDoc, confirmDeleteDoc, enterInlineEdit, exitInlineEdit,
  }
}
