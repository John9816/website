import { useCallback, useState } from 'react'
import { App as AntApp } from 'antd'
import { createKbSpace, listKbSpaces } from '../../../api/kb'
import type { KbSpace } from '../../../types'

export function useKbSpaces() {
  const { message } = AntApp.useApp()
  const [spaces, setSpaces] = useState<KbSpace[]>([])
  const [spacesLoading, setSpacesLoading] = useState(false)
  const [creatingPersonalSpace, setCreatingPersonalSpace] = useState(false)
  const [activeSpaceId, setActiveSpaceId] = useState<number | null>(null)

  const loadSpaces = useCallback(
    async (preferredSpaceId?: number, signal?: AbortSignal) => {
      setSpacesLoading(true)
      try {
        const data = (await listKbSpaces(signal)).sort((a, b) => a.sortOrder - b.sortOrder)
        setSpaces(data)
        setActiveSpaceId((current) => {
          if (preferredSpaceId && data.some((item) => item.id === preferredSpaceId)) {
            return preferredSpaceId
          }
          if (current && data.some((item) => item.id === current)) {
            return current
          }
          return data[0]?.id ?? null
        })
      } catch (error) {
        if ((error as any).code === -2) return
        message.error((error as Error).message)
      } finally {
        setSpacesLoading(false)
      }
    },
    [message],
  )

  const handleCreatePersonalSpace = async () => {
    if (spaces.length) {
      message.warning('一个账户只能创建一个空间')
      return
    }
    setCreatingPersonalSpace(true)
    try {
      const created = await createKbSpace({
        name: '个人空间',
        sortOrder: 0,
      })
      message.success('个人空间已创建')
      await loadSpaces(created.id)
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setCreatingPersonalSpace(false)
    }
  }

  return {
    spaces,
    spacesLoading,
    creatingPersonalSpace,
    activeSpaceId,
    setActiveSpaceId,
    loadSpaces,
    handleCreatePersonalSpace,
  }
}
