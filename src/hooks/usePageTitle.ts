import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const SITE_NAME = '个人导航'
const SITE_ORIGIN = 'https://hi.751152.xyz'

interface PageMeta {
  title: string
  /** 页面描述；缺省时沿用站点默认描述 */
  description?: string
}

const DEFAULT_DESCRIPTION =
  '个人导航与工作台：常用网站导航、AI 对话、AI 生图、在线音乐与知识库，一站直达。'

const metaMap: Record<string, PageMeta> = {
  '/': { title: '首页', description: DEFAULT_DESCRIPTION },
  '/editor': { title: '学城文档' },
  '/ai-chat': { title: 'AI 对话' },
  '/ai-image': { title: 'AI 生图' },
  '/music': {
    title: '音乐',
    description: '在线音乐聚合：QQ、网易云、酷我搜索、播放、歌词、榜单与歌单，一处畅听。',
  },
  '/music/app': {
    title: '柒伍壹壹音乐 App',
    description:
      '下载柒伍壹壹音乐 Android 客户端：多音源搜索播放、榜单歌单、云端收藏、歌词队列、电台电视直播与实用工具。',
  },
  '/music/share': { title: '音乐分享' },
  '/music/toplist': { title: '榜单详情' },
  '/music/playlist': { title: '歌单详情' },
  '/kb/share': { title: '知识库分享' },
  '/login': { title: '登录' },
  '/register': { title: '注册' },
  '/admin/login': { title: '管理员登录' },
  '/admin': { title: '管理后台' },
  '/admin/categories': { title: '分类管理' },
  '/admin/links': { title: '链接管理' },
  '/admin/configs': { title: '站点配置' },
  '/admin/content': { title: '内容工厂' },
  '/admin/kb': { title: '知识库管理' },
  '/admin/password': { title: '密码管理' },
}

/** 允许被搜索引擎收录的公开路径前缀；其余页面输出 noindex，并不设 canonical。 */
const INDEXABLE_PREFIXES = ['/', '/music', '/music/app']

function resolveMeta(pathname: string): PageMeta {
  if (metaMap[pathname]) return metaMap[pathname]

  let best = ''
  for (const prefix of Object.keys(metaMap)) {
    if (pathname.startsWith(prefix + '/') && prefix.length > best.length) {
      best = prefix
    }
  }
  if (best) return metaMap[best]

  return { title: SITE_NAME }
}

function isIndexable(pathname: string): boolean {
  if (pathname === '/') return true
  return INDEXABLE_PREFIXES.some(
    (p) => p !== '/' && (pathname === p || pathname.startsWith(p + '/')),
  )
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertCanonical(href: string | null) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!href) {
    if (el) el.remove()
    return
  }
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'canonical')
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

export function usePageTitle() {
  const { pathname } = useLocation()

  useEffect(() => {
    const meta = resolveMeta(pathname)
    const fullTitle =
      meta.title === SITE_NAME ? SITE_NAME : `${meta.title} - ${SITE_NAME}`
    document.title = fullTitle

    const description = meta.description ?? DEFAULT_DESCRIPTION
    upsertMeta('name', 'description', description)
    upsertMeta('property', 'og:title', fullTitle)
    upsertMeta('property', 'og:description', description)

    const indexable = isIndexable(pathname)
    if (indexable) {
      const canonical = `${SITE_ORIGIN}${pathname === '/' ? '' : pathname}`
      upsertMeta('name', 'robots', 'index,follow')
      upsertMeta('property', 'og:url', canonical || `${SITE_ORIGIN}/`)
      upsertCanonical(canonical || `${SITE_ORIGIN}/`)
    } else {
      // 私有 / 动态分享页：不参与收录，也不设 canonical
      upsertMeta('name', 'robots', 'noindex,nofollow')
      upsertCanonical(null)
    }
  }, [pathname])
}
