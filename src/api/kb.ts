import { request } from './client'
import type {
  KbDoc,
  KbDocShare,
  KbDocSummary,
  KbDocTreeNode,
  KbDocVersion,
  KbDocVersionDetail,
  KbPublicDoc,
  KbSpace,
  KbTag,
  PageView,
} from '../types'

export interface KbSpacePayload {
  name: string
  description?: string
  icon?: string
  sortOrder?: number
}

export interface KbTagPayload {
  name: string
  color?: string
}

export interface KbDocPayload {
  spaceId: number
  parentId?: number | null
  title: string
  summary?: string
  contentJson?: string
  contentHtml?: string
  status?: 'draft' | 'published'
  sortOrder?: number
}

export interface KbDocUpdatePayload {
  title: string
  summary?: string
  contentJson?: string
  contentHtml?: string
  status?: 'draft' | 'published'
  sortOrder?: number
  changeNote?: string
}

export interface KbDocMovePayload {
  spaceId: number
  parentId?: number | null
  sortOrder?: number
}

export interface KbDocSearchQuery {
  spaceId?: number
  parentId?: number | null
  keyword?: string
  tagId?: number
  page?: number
  size?: number
}

export interface KbDocSharePayload {
  enabled?: boolean
  expiresAt?: string | null
  rotateToken?: boolean
}

export interface KbAssetUploadResult {
  url: string
  key?: string
  contentType?: string
  size?: number
}

export const listKbSpaces = (signal?: AbortSignal) => request<KbSpace[]>('/api/user/kb/spaces', { auth: true, signal })

export const getKbSpace = (id: number, signal?: AbortSignal) =>
  request<KbSpace>(`/api/user/kb/spaces/${id}`, { auth: true, signal })

export const createKbSpace = (body: KbSpacePayload) =>
  request<KbSpace>('/api/user/kb/spaces', {
    method: 'POST',
    auth: true,
    body,
  })

export const updateKbSpace = (id: number, body: KbSpacePayload) =>
  request<KbSpace>(`/api/user/kb/spaces/${id}`, {
    method: 'PUT',
    auth: true,
    body,
  })

export const deleteKbSpace = (id: number) =>
  request<void>(`/api/user/kb/spaces/${id}`, {
    method: 'DELETE',
    auth: true,
  })

export const getKbSpaceTree = (id: number, signal?: AbortSignal) =>
  request<KbDocTreeNode[]>(`/api/user/kb/spaces/${id}/tree`, { auth: true, signal })

export const listKbTags = (signal?: AbortSignal) => request<KbTag[]>('/api/user/kb/tags', { auth: true, signal })

export const createKbTag = (body: KbTagPayload) =>
  request<KbTag>('/api/user/kb/tags', {
    method: 'POST',
    auth: true,
    body,
  })

export const updateKbTag = (id: number, body: KbTagPayload) =>
  request<KbTag>(`/api/user/kb/tags/${id}`, {
    method: 'PUT',
    auth: true,
    body,
  })

export const deleteKbTag = (id: number) =>
  request<void>(`/api/user/kb/tags/${id}`, {
    method: 'DELETE',
    auth: true,
  })

export const searchKbDocs = (query: KbDocSearchQuery = {}, signal?: AbortSignal) =>
  request<PageView<KbDocSummary>>('/api/user/kb/docs', {
    auth: true,
    query: query as Record<string, string | number | undefined>,
    signal,
  })

export const createKbDoc = (body: KbDocPayload) =>
  request<KbDoc>('/api/user/kb/docs', {
    method: 'POST',
    auth: true,
    body,
  })

export const getKbDoc = (id: number, signal?: AbortSignal) =>
  request<KbDoc>(`/api/user/kb/docs/${id}`, { auth: true, signal })

export const updateKbDoc = (id: number, body: KbDocUpdatePayload) =>
  request<KbDoc>(`/api/user/kb/docs/${id}`, {
    method: 'PUT',
    auth: true,
    body,
  })

export const deleteKbDoc = (id: number) =>
  request<void>(`/api/user/kb/docs/${id}`, {
    method: 'DELETE',
    auth: true,
  })

export const moveKbDoc = (id: number, body: KbDocMovePayload) =>
  request<KbDoc>(`/api/user/kb/docs/${id}/move`, {
    method: 'POST',
    auth: true,
    body,
  })

export const replaceKbDocTags = (id: number, tagIds: number[]) =>
  request<KbDoc>(`/api/user/kb/docs/${id}/tags`, {
    method: 'PUT',
    auth: true,
    body: { tagIds },
  })

export const listKbDocVersions = (id: number, page = 0, size = 20, signal?: AbortSignal) =>
  request<PageView<KbDocVersion>>(`/api/user/kb/docs/${id}/versions`, {
    auth: true,
    query: { page, size },
    signal,
  })

export const getKbDocVersion = (id: number, versionId: number, signal?: AbortSignal) =>
  request<KbDocVersionDetail>(`/api/user/kb/docs/${id}/versions/${versionId}`, {
    auth: true,
    signal,
  })

export const restoreKbDocVersion = (id: number, versionId: number) =>
  request<KbDoc>(`/api/user/kb/docs/${id}/versions/${versionId}/restore`, {
    method: 'POST',
    auth: true,
  })

export const getKbDocShare = (id: number, signal?: AbortSignal) =>
  request<KbDocShare | null>(`/api/user/kb/docs/${id}/share`, { auth: true, signal })

export const upsertKbDocShare = (id: number, body: KbDocSharePayload = {}) =>
  request<KbDocShare>(`/api/user/kb/docs/${id}/share`, {
    method: 'POST',
    auth: true,
    body,
  })

export const deleteKbDocShare = (id: number) =>
  request<void>(`/api/user/kb/docs/${id}/share`, {
    method: 'DELETE',
    auth: true,
  })

export const getPublicKbShare = (token: string) =>
  request<KbPublicDoc>(`/api/public/kb/share/${encodeURIComponent(token)}`)

export const uploadKbAsset = (file: File, docId?: number) => {
  const formData = new FormData()
  formData.append('file', file)
  if (docId) formData.append('docId', String(docId))

  return request<KbAssetUploadResult>('/api/user/kb/assets', {
    method: 'POST',
    auth: true,
    body: formData,
  })
}
