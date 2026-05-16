import { request } from './client'
import type { Category, CategoryWithLinks, GeneratedImageView, NavLink, PageView } from '../types'

export const getCategories = () => request<Category[]>('/api/public/categories')
export const getLinks = (categoryId?: number) =>
  request<NavLink[]>('/api/public/links', { query: { categoryId } })
export const getNav = () => request<CategoryWithLinks[]>('/api/public/nav')
export const listSharedImages = (page = 0, size = 20) =>
  request<PageView<GeneratedImageView>>('/api/public/image/shared', {
    query: { page, size },
  })
