import { request } from './client'

/**
 * 阅读模块 API 封装。
 * 后端：Spring Boot `module/reading`，基础路径 /api/v1/books
 * DTO 与后端 com.example.website.module.reading.api.dto 一一对应。
 * 所有端点均需登录（后端 security 全局拦截），统一 auth: true。
 */

export interface BookSourceCatalog {
  id: string
  name: string
  kind: string
  description: string
  catalogUrl: string
  importUrl: string
  maintained: boolean
  status: string
  operational: boolean
}

export interface BookView {
  sourceId: string
  sourceName: string
  name: string
  author: string
  coverUrl: string
  bookUrl: string
  intro: string
  latestChapter: string
  status: string
  category: string
}

export interface BookCategory {
  key: string
  name: string
  [key: string]: unknown
}

export interface BookDiscoverSection {
  key: string
  title: string
  books: BookView[]
}

export interface BookDiscover {
  sourceId: string
  sourceName: string
  categories: BookCategory[]
  sections: BookDiscoverSection[]
}

export interface BookSearchPage {
  list: BookView[]
  page: number
  pageSize: number
  total: number
  hasMore: boolean
}

export interface BookChapter {
  title: string
  url: string
  index: number
  volume: string
}

export interface BookChapterList {
  list: BookChapter[]
  total: number
}

export interface BookContent {
  title: string
  content: string
  chapterUrl: string
}

export interface BookUserSource {
  id: number
  sourceId: string
  sourceName: string
  sourceUrl: string
  sourceType: string
  enabled: boolean
  status: string
  message: string
}

// ---------- 书源 / 发现 ----------

export const listBookSources = () =>
  request<BookSourceCatalog[]>('/api/v1/books/sources', { auth: true })

export const discoverBooks = (params: {
  sourceId?: string
  section?: string
  category?: string
  page?: number
}) =>
  request<BookDiscover>('/api/v1/books/discover', {
    auth: true,
    query: {
      sourceId: params.sourceId,
      section: params.section ?? 'home',
      category: params.category,
      page: params.page ?? 1,
    },
  })

export const searchBooks = (params: {
  keyword: string
  page?: number
  pageSize?: number
  sourceId?: string
}) =>
  request<BookSearchPage>('/api/v1/books/search', {
    auth: true,
    query: {
      keyword: params.keyword,
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 20,
      sourceId: params.sourceId,
    },
  })

export const getBookDetail = (sourceId: string | undefined, bookUrl: string) =>
  request<BookView>('/api/v1/books/detail', {
    auth: true,
    query: { sourceId, bookUrl },
  })

export const getBookChapters = (sourceId: string | undefined, bookUrl: string) =>
  request<BookChapterList>('/api/v1/books/chapters', {
    auth: true,
    query: { sourceId, bookUrl },
  })

export const getBookContent = (
  sourceId: string | undefined,
  bookUrl: string,
  chapterUrl: string,
) =>
  request<BookContent>('/api/v1/books/content', {
    auth: true,
    query: { sourceId, bookUrl, chapterUrl },
  })

// ---------- 用户自定义书源 ----------

export const listUserBookSources = () =>
  request<BookUserSource[]>('/api/v1/books/user-sources', { auth: true })

export const importUserBookSource = (definition: string) =>
  request<BookUserSource>('/api/v1/books/user-sources/import', {
    method: 'POST',
    auth: true,
    body: { definition },
  })

export const setUserBookSourceEnabled = (id: number, enabled: boolean) =>
  request<BookUserSource>(`/api/v1/books/user-sources/${id}/enabled`, {
    method: 'PATCH',
    auth: true,
    body: { enabled },
  })

export const deleteUserBookSource = (id: number) =>
  request<void>(`/api/v1/books/user-sources/${id}`, {
    method: 'DELETE',
    auth: true,
  })
