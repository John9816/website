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

export const listKbSpaces = () => request<KbSpace[]>('/api/user/kb/spaces', { auth: true })

export const getKbSpace = (id: number) =>
  request<KbSpace>(`/api/user/kb/spaces/${id}`, { auth: true })

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

export const getKbSpaceTree = (id: number) =>
  request<KbDocTreeNode[]>(`/api/user/kb/spaces/${id}/tree`, { auth: true })

export const listKbTags = () => request<KbTag[]>('/api/user/kb/tags', { auth: true })

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

export const searchKbDocs = (query: KbDocSearchQuery = {}) =>
  request<PageView<KbDocSummary>>('/api/user/kb/docs', {
    auth: true,
    query: query as Record<string, string | number | undefined>,
  })

export const createKbDoc = (body: KbDocPayload) =>
  request<KbDoc>('/api/user/kb/docs', {
    method: 'POST',
    auth: true,
    body,
  })

export const getKbDoc = (id: number) =>
  request<KbDoc>(`/api/user/kb/docs/${id}`, { auth: true })

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

export const listKbDocVersions = (id: number, page = 0, size = 20) =>
  request<PageView<KbDocVersion>>(`/api/user/kb/docs/${id}/versions`, {
    auth: true,
    query: { page, size },
  })

export const getKbDocVersion = (id: number, versionId: number) =>
  request<KbDocVersionDetail>(`/api/user/kb/docs/${id}/versions/${versionId}`, {
    auth: true,
  })

export const restoreKbDocVersion = (id: number, versionId: number) =>
  request<KbDoc>(`/api/user/kb/docs/${id}/versions/${versionId}/restore`, {
    method: 'POST',
    auth: true,
  })

export const getKbDocShare = (id: number) =>
  request<KbDocShare | null>(`/api/user/kb/docs/${id}/share`, { auth: true })

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
