import { request } from './client'
import type { Category, CategoryWithLinks, GeneratedImageView, NavLink, PageView } from '../types'
import { normalizeRemoteImageUrl } from '../utils/remoteImage'

export interface MusicInstallerReleaseView {
  version: string
  title: string
  fileName: string
  downloadUrl: string
  sizeBytes?: number
  releasedAt: string
  notes?: string | null
  /** Android package display channel, e.g. DuckMusic */
  channel?: string | null
  /** Numeric build / versionCode from the app update manifest */
  buildNumber?: number | null
  /** Human platform label, e.g. Android */
  platform?: string | null
  /** Minimum Android version label, e.g. 8.0 */
  minAndroid?: string | null
  /** applicationId, e.g. com.music.player */
  packageName?: string | null
}

function normalizeGeneratedImageView(item: GeneratedImageView): GeneratedImageView {
  return {
    ...item,
    imageUrl: normalizeRemoteImageUrl(item.imageUrl, { requireUsableAssetPath: true }) || item.imageUrl,
    isShared: item.isShared ?? (item as unknown as { shared?: boolean }).shared ?? false,
  }
}

export const getCategories = () => request<Category[]>('/api/public/categories')
export const getLinks = (categoryId?: number) =>
  request<NavLink[]>('/api/public/links', { query: { categoryId } })
export const getNav = () => request<CategoryWithLinks[]>('/api/public/nav')
export const getLatestMusicInstaller = () =>
  request<MusicInstallerReleaseView>('/api/public/music/installer/latest')
export const listSharedImages = async (page = 0, size = 20) => {
  const data = await request<PageView<GeneratedImageView>>('/api/public/image/shared', {
    query: { page, size },
  })
  return {
    ...data,
    items: data.items.map(normalizeGeneratedImageView),
  }
}
