import { request } from './client'
import type { Category, CategoryWithLinks, GeneratedImageView, NavLink, PageView } from '../types'
import { normalizeRemoteImageUrl } from '../utils/remoteImage'

function normalizeGeneratedImageView(item: GeneratedImageView): GeneratedImageView {
  return {
    ...item,
    imageUrl: normalizeRemoteImageUrl(item.imageUrl, { requireUsableAssetPath: true }) || item.imageUrl,
  }
}

export const getCategories = () => request<Category[]>('/api/public/categories')
export const getLinks = (categoryId?: number) =>
  request<NavLink[]>('/api/public/links', { query: { categoryId } })
export const getNav = () => request<CategoryWithLinks[]>('/api/public/nav')
export const listSharedImages = async (page = 0, size = 20) => {
  const data = await request<PageView<GeneratedImageView>>('/api/public/image/shared', {
    query: { page, size },
  })
  return {
    ...data,
    items: data.items.map(normalizeGeneratedImageView),
  }
}
