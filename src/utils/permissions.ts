import type { CurrentUserView } from '../types'

export type AdminPermission = 'authenticated' | 'contentFactory' | 'systemConfig' | 'oreatePool'

export function canManageSystemConfig(user?: CurrentUserView | null) {
  return isAdminUser(user) && user?.canManageSystemConfig === true
}

export function isAdminUser(user?: CurrentUserView | null) {
  return user?.role === 'ADMIN'
}

export function canUseContentFactory(user?: CurrentUserView | null) {
  return isAdminUser(user)
}

export function canAccessAdminPermission(
  user: CurrentUserView | null | undefined,
  permission: AdminPermission,
) {
  if (!user) return false
  if (permission === 'systemConfig') return canManageSystemConfig(user)
  if (permission === 'contentFactory') return canUseContentFactory(user)
  if (permission === 'oreatePool') return isAdminUser(user)
  return true
}

export function getAdminPermissionForPath(pathname: string): AdminPermission {
  if (pathname.startsWith('/admin/configs') || pathname.startsWith('/admin/users')) {
    return 'systemConfig'
  }
  if (pathname.startsWith('/admin/content')) {
    return 'contentFactory'
  }
  if (pathname.startsWith('/admin/oreate-pool')) {
    return 'oreatePool'
  }
  return 'authenticated'
}

export function getFirstAccessibleAdminPath(user?: CurrentUserView | null) {
  if (canUseContentFactory(user)) return '/admin/content'
  return '/admin/categories'
}
