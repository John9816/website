import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const SITE_NAME = '个人导航'

const titleMap: Record<string, string> = {
  '/': '首页',
  '/ai-chat': 'AI 对话',
  '/ai-image': 'AI 生图',
  '/music': '音乐',
  '/music/share': '音乐分享',
  '/music/toplist': '榜单详情',
  '/music/playlist': '歌单详情',
  '/kb/share': '知识库分享',
  '/login': '登录',
  '/register': '注册',
  '/admin/login': '管理员登录',
  '/admin': '管理后台',
  '/admin/categories': '分类管理',
  '/admin/links': '链接管理',
  '/admin/configs': '站点配置',
  '/admin/content': '内容工厂',
  '/admin/kb': '知识库管理',
  '/admin/password': '密码管理',
}

function resolveTitle(pathname: string): string {
  if (titleMap[pathname]) return `${titleMap[pathname]} - ${SITE_NAME}`

  let best = ''
  for (const prefix of Object.keys(titleMap)) {
    if (pathname.startsWith(prefix + '/') && prefix.length > best.length) {
      best = prefix
    }
  }
  if (best) return `${titleMap[best]} - ${SITE_NAME}`

  return SITE_NAME
}

export function usePageTitle() {
  const { pathname } = useLocation()

  useEffect(() => {
    document.title = resolveTitle(pathname)
  }, [pathname])
}
