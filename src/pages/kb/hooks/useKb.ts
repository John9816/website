import { useMemo } from 'react'
import { Form } from 'antd'
import { useKbSpaces } from './useKbSpaces'
import { useKbTags } from './useKbTags'
import { useKbDocs } from './useKbDocs'
import { useKbSharing } from './useKbSharing'
import { useKbVersions } from './useKbVersions'
import type { KbContextState } from '../context'

export function useKb(): KbContextState {
  const [tagForm] = Form.useForm()

  const spaces = useKbSpaces()
  const tags = useKbTags()
  const docs = useKbDocs(spaces.activeSpaceId)
  const sharing = useKbSharing()
  const versions = useKbVersions()

  // We need to bridge some cross-hook calls
  const openCreateDocWithSpaces = (parentIdOverride?: number | null) =>
    docs.openCreateDoc(parentIdOverride, spaces.loadSpaces)

  const handleSaveInlineDocWithSpaces = () =>
    docs.handleSaveInlineDoc(spaces.loadSpaces, tags.loadTags)

  const handleDeleteDocWithSpaces = (docId: number) =>
    docs.handleDeleteDoc(docId, spaces.loadSpaces)

  const confirmDeleteDocWithSpaces = (docId: number, title: string) =>
    docs.confirmDeleteDoc(docId, title, spaces.loadSpaces)

  const handleRestoreVersionWithDocs = () =>
    versions.handleRestoreVersion(spaces.activeSpaceId, docs.loadTree, docs.loadDocs)

  const shareUrl = useMemo(() => {
    if (!sharing.shareInfo?.token) return ''
    return new URL(`/kb/share/${sharing.shareInfo.token}`, window.location.origin).toString()
  }, [sharing.shareInfo?.token])

  return {
    ...spaces,
    ...tags,
    ...docs,
    ...sharing,
    ...versions,
    shareUrl,
    tagForm,
    inlineDocForm: docs.inlineDocForm,

    // Overrides for cross-hook logic
    openCreateDoc: openCreateDocWithSpaces,
    handleSaveInlineDoc: handleSaveInlineDocWithSpaces,
    handleDeleteDoc: handleDeleteDocWithSpaces,
    confirmDeleteDoc: confirmDeleteDocWithSpaces,
    handleRestoreVersion: handleRestoreVersionWithDocs,
    handleSaveTag: () => tags.handleSaveTag(tagForm),
    handleEditTag: (tag: any) => tags.handleEditTag(tag, tagForm),
  } as any
}
