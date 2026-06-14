import { request } from './client'
import type {
  Category,
  ContentArticle,
  ContentArticleGeneratePayload,
  ContentFactoryStatus,
  ContentHotTopicsView,
  ContentWechatDraftResult,
  GeneratedImageView,
  ImageGenerateResult,
  ImageTaskView,
  NavLink,
  PageView,
  SysConfig,
} from '../types'
import { DEFAULT_PAGE_SIZE } from '../constants/pagination'
import { normalizeRemoteImageUrl } from '../utils/remoteImage'

export interface GenerateImagePayload {
  prompt: string
  model?: string
  size?: string
  quality?: string
  n?: number
}

export interface EditImagePayload {
  prompt: string
  image: File
  mask?: File | null
  model?: string
  size?: string
  quality?: string
  n?: number
}

function normalizeGeneratedImageView(item: GeneratedImageView): GeneratedImageView {
  return {
    ...item,
    imageUrl: normalizeRemoteImageUrl(item.imageUrl, { requireUsableAssetPath: true }) || item.imageUrl,
    isShared: item.isShared ?? (item as unknown as { shared?: boolean }).shared ?? false,
  }
}

function normalizeImageGenerateResult(result: ImageGenerateResult): ImageGenerateResult {
  return {
    ...result,
    data: result.data.map((item) => ({
      ...item,
      url: normalizeRemoteImageUrl(item.url, { requireUsableAssetPath: true }) || item.url,
    })),
  }
}

function normalizePageView(page: PageView<GeneratedImageView>): PageView<GeneratedImageView> {
  return {
    ...page,
    items: page.items.map(normalizeGeneratedImageView),
  }
}

function normalizeImageTaskView(task: ImageTaskView): ImageTaskView {
  return {
    ...task,
    result: task.result ? normalizeImageGenerateResult(task.result) : task.result,
  }
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

// Content factory
export const adminGetContentStatus = () =>
  request<ContentFactoryStatus>('/api/admin/content/status', { auth: true })

export const adminGetHotTopics = (limit = 12, category?: string) =>
  request<ContentHotTopicsView>('/api/admin/content/hot', { auth: true, query: { limit, category } })

export const adminListContentArticles = (page = 0, size = DEFAULT_PAGE_SIZE) =>
  request<PageView<ContentArticle>>('/api/admin/content/articles', {
    auth: true,
    query: { page, size },
  })

export const adminGenerateContentArticle = (body: ContentArticleGeneratePayload) =>
  request<ContentArticle>('/api/admin/content/articles/generate', {
    method: 'POST',
    auth: true,
    body,
  })

export const adminUpdateContentArticle = (
  id: number,
  body: Pick<ContentArticle, 'title' | 'digest' | 'contentMarkdown' | 'contentHtml' | 'coverImageUrl'>,
) =>
  request<ContentArticle>(`/api/admin/content/articles/${id}`, {
    method: 'PUT',
    auth: true,
    body,
  })

export const adminDeleteContentArticle = (id: number) =>
  request<void>(`/api/admin/content/articles/${id}`, { method: 'DELETE', auth: true })

export const adminCreateWechatDraft = (id: number) =>
  request<{ article: ContentArticle; draft: ContentWechatDraftResult }>(
    `/api/admin/content/articles/${id}/wechat-draft`,
    { method: 'POST', auth: true },
  )

export const adminPublishWechatArticle = (id: number) =>
  request<{ article: ContentArticle; draft: ContentWechatDraftResult; publish: Record<string, unknown> }>(
    `/api/admin/content/articles/${id}/publish`,
    { method: 'POST', auth: true },
  )

// Image
export const adminGenerateImage = async (body: GenerateImagePayload, signal?: AbortSignal) =>
  normalizeImageTaskView(await request<ImageTaskView>('/api/user/image/generate', {
    method: 'POST',
    auth: true,
    body,
    signal,
  }))

export const adminEditImage = async (body: EditImagePayload, signal?: AbortSignal) => {
  const formData = new FormData()
  formData.set('image', body.image)
  formData.set('prompt', body.prompt)
  if (body.mask) formData.set('mask', body.mask)
  if (body.model) formData.set('model', body.model)
  if (body.size) formData.set('size', body.size)
  if (body.quality) formData.set('quality', body.quality)
  if (body.n) formData.set('n', String(body.n))

  return normalizeImageTaskView(await request<ImageTaskView>('/api/user/image/edit', {
    method: 'POST',
    auth: true,
    body: formData,
    signal,
  }))
}

export const adminGetImageTask = async (taskId: number, signal?: AbortSignal) =>
  normalizeImageTaskView(await request<ImageTaskView>(`/api/user/image/generate/${taskId}`, {
    auth: true,
    signal,
  }))

export const adminListImageHistory = async (page = 0, size = DEFAULT_PAGE_SIZE) =>
  normalizePageView(await request<PageView<GeneratedImageView>>('/api/user/image/history', {
    auth: true,
    query: { page, size },
  }))

export const adminDeleteImageHistory = (id: number) =>
  request<void>(`/api/user/image/history/${id}`, {
    method: 'DELETE',
    auth: true,
  })

export const adminRetryImageHistory = async (id: number) =>
  normalizeImageTaskView(await request<ImageTaskView>(`/api/user/image/history/${id}/retry`, {
    method: 'POST',
    auth: true,
  }))

export const adminToggleImageHistoryShare = async (id: number, shared: boolean) =>
  normalizeGeneratedImageView(await request<GeneratedImageView>(`/api/user/image/history/${id}/share`, {
    method: 'PATCH',
    auth: true,
    query: { shared },
  }))
