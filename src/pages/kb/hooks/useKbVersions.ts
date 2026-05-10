import { useCallback, useState } from 'react'
import { App as AntApp } from 'antd'
import { getKbDocVersion, listKbDocVersions, restoreKbDocVersion } from '../../../api/kb'
import type { KbDocVersion, KbDocVersionDetail } from '../../../types'
import type { DocRef } from '../context'

const VERSION_PAGE_SIZE = 20

export function useKbVersions() {
  const { message } = AntApp.useApp()
  const [versionDrawerDoc, setVersionDrawerDoc] = useState<DocRef | null>(null)
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [versionItems, setVersionItems] = useState<KbDocVersion[]>([])
  const [versionPage, setVersionPage] = useState(1)
  const [versionTotal, setVersionTotal] = useState(0)
  const [versionDetail, setVersionDetail] = useState<KbDocVersionDetail | null>(null)
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null)
  const [versionDetailLoading, setVersionDetailLoading] = useState(false)

  const loadVersionDetail = useCallback(
    async (docId: number, versionId: number, signal?: AbortSignal) => {
      setVersionDetailLoading(true)
      try {
        setVersionDetail(await getKbDocVersion(docId, versionId, signal))
        setSelectedVersionId(versionId)
      } catch (error) {
        if ((error as any).code === -2) return
        message.error((error as Error).message)
      } finally {
        setVersionDetailLoading(false)
      }
    },
    [message],
  )

  const loadVersions = useCallback(
    async (docId: number, page = 1, signal?: AbortSignal) => {
      setVersionsLoading(true)
      try {
        const data = await listKbDocVersions(docId, page - 1, VERSION_PAGE_SIZE, signal)
        setVersionItems(data.items)
        setVersionTotal(data.total)
        setVersionPage(page)
        if (data.items.length) {
          const initialId = data.items[0].id
          await loadVersionDetail(docId, initialId, signal)
        } else {
          setSelectedVersionId(null)
          setVersionDetail(null)
        }
      } catch (error) {
        if ((error as any).code === -2) return
        message.error((error as Error).message)
      } finally {
        setVersionsLoading(false)
      }
    },
    [loadVersionDetail, message],
  )

  const openVersionsDrawer = useCallback(async (doc: DocRef) => {
    setVersionDrawerDoc(doc)
    setVersionItems([])
    setVersionTotal(0)
    setVersionPage(1)
    setSelectedVersionId(null)
    setVersionDetail(null)
    await loadVersions(doc.id, 1)
  }, [loadVersions])

  const handleRestoreVersion = useCallback(async (activeSpaceId: number | null, loadTree: any, loadDocs: any) => {
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
  }, [loadVersions, message, selectedVersionId, versionDrawerDoc, versionPage])

  return {
    versionDrawerDoc,
    setVersionDrawerDoc,
    versionsLoading,
    versionItems,
    versionPage,
    versionTotal,
    versionDetail,
    selectedVersionId,
    versionDetailLoading,
    loadVersionDetail,
    loadVersions,
    openVersionsDrawer,
    handleRestoreVersion,
  }
}
