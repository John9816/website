import { request } from './client'
import type {
  MembershipView,
  RedeemCodeAdminView,
  RedeemCodeBatchView,
  RedeemResultView,
  RedeemCodeType,
  RedeemCodeStatus,
  PageView,
} from '../types'

export const getMembership = () =>
  request<MembershipView>('/api/user/membership', { auth: true })

export const redeemMembershipCode = (code: string) =>
  request<RedeemResultView>('/api/user/membership/redeem', {
    method: 'POST',
    auth: true,
    body: { code },
  })

export const adminGenerateRedeemCodes = (type: RedeemCodeType, quantity: number) =>
  request<RedeemCodeBatchView>('/api/admin/redeem-codes', {
    method: 'POST',
    auth: true,
    body: { type, quantity },
  })

export const adminListRedeemCodes = (query: {
  type?: RedeemCodeType
  status?: RedeemCodeStatus
  page?: number
  size?: number
} = {}) =>
  request<PageView<RedeemCodeAdminView>>('/api/admin/redeem-codes', {
    auth: true,
    query,
  })

export const adminRevokeRedeemCode = (id: number) =>
  request<RedeemCodeAdminView>(`/api/admin/redeem-codes/${id}/revoke`, {
    method: 'POST',
    auth: true,
  })
