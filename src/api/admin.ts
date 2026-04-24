import { request } from './client'
import type {
  Category,
  GeneratedImageView,
  ImageGenerateResult,
  NavLink,
  PageView,
  SysConfig,
} from '../types'

// Categories
export const adminListCategories = () =>
  request<Category[]>('/api/admin/categories', { auth: true })
export const adminGetCategory = (id: number) =>
  request<Category>(`/api/admin/categories/${id}`, { auth: true })
export const adminCreateCategory = (body: Partial<Category>) =>
  request<Category>('/api/admin/categories', { method: 'POST', auth: true, body })
export const adminUpdateCategory = (id: number, body: Partial<Category>) =>
  request<Category>(`/api/admin/categories/${id}`, { method: 'PUT', auth: true, body })
export const adminDeleteCategory = (id: number) =>
  request<void>(`/api/admin/categories/${id}`, { method: 'DELETE', auth: true })

// Links
export const adminListLinks = (categoryId?: number) =>
  request<NavLink[]>('/api/admin/links', { auth: true, query: { categoryId } })
export const adminCreateLink = (body: Partial<NavLink>) =>
  request<NavLink>('/api/admin/links', { method: 'POST', auth: true, body })
export const adminUpdateLink = (id: number, body: Partial<NavLink>) =>
  request<NavLink>(`/api/admin/links/${id}`, { method: 'PUT', auth: true, body })
export const adminDeleteLink = (id: number) =>
  request<void>(`/api/admin/links/${id}`, { method: 'DELETE', auth: true })

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
export const adminGenerateImage = (prompt: string, signal?: AbortSignal) =>
  request<ImageGenerateResult>('/api/admin/image/generate', {
    method: 'POST',
    auth: true,
    body: { prompt },
    signal,
  })

export const adminListImageHistory = (page = 0, size = 20) =>
  request<PageView<GeneratedImageView>>('/api/admin/image/history', {
    auth: true,
    query: { page, size },
  })

export const adminDeleteImageHistory = (id: number) =>
  request<void>(`/api/admin/image/history/${id}`, {
    method: 'DELETE',
    auth: true,
  })
