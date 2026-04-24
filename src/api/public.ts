import { request } from './client'
import type { Category, CategoryWithLinks, NavLink } from '../types'

export const getCategories = () => request<Category[]>('/api/public/categories')
export const getLinks = (categoryId?: number) =>
  request<NavLink[]>('/api/public/links', { query: { categoryId } })
export const getNav = () => request<CategoryWithLinks[]>('/api/public/nav')
