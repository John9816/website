import { request } from './client'
import type {
  Category,
  GeneratedImageView,
  ImageGenerateResult,
  NavLink,
  PageView,
  SysConfig,
} from '../types'
import { DEFAULT_PAGE_SIZE } from '../constants/pagination'

export interface GenerateImagePayload {
  prompt: string
  size?: string
  n?: number
}

// Categories
export const adminListCategories = () =>
  request<Category[]>('/api/user/categories', { auth: true })
export const adminGetCategory = (id: number) =>
  request<Category>(`/api/user/categories/${id}`, { auth: true })
export const adminCreateCategory = (body: Partial<Category>) =>
  request<Category>('/api/user/categories', { method: 'POST', auth: true, body })
export const adminUpdateCategory = (id: number, body: Partial<Category>) =>
  request<Category>(`/api/user/categories/${id}`, { method: 'PUT', auth: true, body })
export const adminDeleteCategory = (id: number) =>
  request<void>(`/api/user/categories/${id}`, { method: 'DELETE', auth: true })

// Links
export const adminListLinks = (categoryId?: number) =>
  request<NavLink[]>('/api/user/links', { auth: true, query: { categoryId } })
export const adminCreateLink = (body: Partial<NavLink>) =>
  request<NavLink>('/api/user/links', { method: 'POST', auth: true, body })
export const adminUpdateLink = (id: number, body: Partial<NavLink>) =>
  request<NavLink>(`/api/user/links/${id}`, { method: 'PUT', auth: true, body })
export const adminDeleteLink = (id: number) =>
  request<void>(`/api/user/links/${id}`, { method: 'DELETE', auth: true })

// Configs
export const adminListConfigs = () =>
  request<SysConfig[]>('/api/admin/configs', { auth: true })
export const adminCreateConfig = (body: Partial<SysConfig>) =>
  request<SysConfig>('/api/admin/configs', { method: 'POST', auth: true, body })
export const adminUpdateConfig = (id: number, body: Partial<SysConfig>) =>
  request<SysConfig>(`/api/admin/configs/${id}`, { method: 'PUT', auth: true, body })
export const adminDeleteConfig = (id: number) =>
  request<void>(`/api/admin/configs/${id}`, { method: 'DELETE', auth: true })

// Image
export const adminGenerateImage = (body: GenerateImagePayload, signal?: AbortSignal) =>
  request<ImageGenerateResult>('/api/user/image/generate', {
    method: 'POST',
    auth: true,
    body,
    signal,
  })

export const adminListImageHistory = (page = 0, size = DEFAULT_PAGE_SIZE) =>
  request<PageView<GeneratedImageView>>('/api/user/image/history', {
    auth: true,
    query: { page, size },
  })

export const adminDeleteImageHistory = (id: number) =>
  request<void>(`/api/user/image/history/${id}`, {
    method: 'DELETE',
    auth: true,
  })

export const adminToggleImageHistoryShare = (id: number, shared: boolean) =>
  request<GeneratedImageView>(`/api/user/image/history/${id}/share`, {
    method: 'PATCH',
    auth: true,
    query: { shared },
  })
