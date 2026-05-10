import { useCallback, useState } from 'react'
import { App as AntApp } from 'antd'
import { createKbTag, deleteKbTag, listKbTags, updateKbTag } from '../../../api/kb'
import type { KbTag } from '../../../types'

export function useKbTags() {
  const { message } = AntApp.useApp()
  const [tags, setTags] = useState<KbTag[]>([])
  const [tagsLoading, setTagsLoading] = useState(false)
  const [tagModalOpen, setTagModalOpen] = useState(false)
  const [tagSaving, setTagSaving] = useState(false)
  const [editingTag, setEditingTag] = useState<KbTag | null>(null)
  const [tagFilterId, setTagFilterId] = useState<number | undefined>()

  const loadTags = useCallback(async (signal?: AbortSignal) => {
    setTagsLoading(true)
    try {
      setTags(await listKbTags(signal))
    } catch (error) {
      if ((error as any).code === -2) return
      message.error((error as Error).message)
    } finally {
      setTagsLoading(false)
    }
  }, [message])

  const handleEditTag = useCallback((tag: KbTag, tagForm: any) => {
    setEditingTag(tag)
    tagForm.setFieldsValue({
      name: tag.name,
      color: tag.color ?? undefined,
    })
  }, [])

  const handleSaveTag = useCallback(async (tagForm: any) => {
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
  }, [editingTag, loadTags, message])

  const handleDeleteTag = useCallback(async (id: number) => {
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
  }, [loadTags, message, tagFilterId])

  return {
    tags,
    tagsLoading,
    tagModalOpen,
    setTagModalOpen,
    tagSaving,
    editingTag,
    tagFilterId,
    setTagFilterId,
    loadTags,
    handleEditTag,
    handleSaveTag,
    handleDeleteTag,
  }
}
