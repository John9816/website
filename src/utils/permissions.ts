import type { CurrentUserView } from '../types'

export type AdminPermission = 'authenticated' | 'contentFactory' | 'systemConfig'

export function canManageSystemConfig(user?: CurrentUserView | null) {
  return user?.role === 'ADMIN' || user?.canManageSystemConfig === true
}

export function canUseContentFactory(user?: CurrentUserView | null) {
  return user?.role === 'ADMIN' || user?.canManageSystemConfig === true
}

export function canAccessAdminPermission(
  user: CurrentUserView | null | undefined,
  permission: AdminPermission,
) {
  if (!user) return false
  if (permission === 'systemConfig') return canManageSystemConfig(user)
  if (permission === 'contentFactory') return canUseContentFactory(user)
  return true
}

export function getAdminPermissionForPath(pathname: string): AdminPermission {
  if (pathname.startsWith('/admin/configs') || pathname.startsWith('/admin/users')) {
    return 'systemConfig'
  }
  if (pathname.startsWith('/admin/content')) {
    return 'contentFactory'
  }
  return 'authenticated'
}

export function getFirstAccessibleAdminPath(user?: CurrentUserView | null) {
  if (canUseContentFactory(user)) return '/admin/content'
  return '/admin/categories'
}
