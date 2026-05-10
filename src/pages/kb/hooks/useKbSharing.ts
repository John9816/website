import { useCallback, useState } from 'react'
import { App as AntApp } from 'antd'
import { getKbDocShare, upsertKbDocShare, deleteKbDocShare } from '../../../api/kb'
import type { KbDocShare } from '../../../types'
import type { DocRef } from '../context'

function toDatetimeLocalValue(value?: string | null) {
  if (!value) return ''
  const date = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return ''
  const pad = (num: number) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

export function useKbSharing() {
  const { message } = AntApp.useApp()
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareLoading, setShareLoading] = useState(false)
  const [shareSaving, setShareSaving] = useState(false)
  const [shareDoc, setShareDoc] = useState<DocRef | null>(null)
  const [shareInfo, setShareInfo] = useState<KbDocShare | null>(null)
  const [shareExpiresAt, setShareExpiresAt] = useState('')

  const openShareModal = useCallback(async (doc: DocRef) => {
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
  }, [message])

  const handleSaveShare = useCallback(async (rotateToken = false) => {
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
  }, [message, shareDoc, shareExpiresAt])

  const handleDisableShare = useCallback(async () => {
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
  }, [message, shareDoc])

  return {
    shareModalOpen,
    setShareModalOpen,
    shareLoading,
    shareSaving,
    shareDoc,
    shareInfo,
    shareExpiresAt,
    setShareExpiresAt,
    openShareModal,
    handleSaveShare,
    handleDisableShare,
  }
}
