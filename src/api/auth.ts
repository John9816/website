import { request, setToken } from './client'
import type { LoginResponse } from '../types'

export async function login(username: string, password: string) {
  const data = await request<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: { username, password },
  })
  setToken(data.token)
  return data
}

export function logout() {
  setToken(null)
}

export function changePassword(oldPassword: string, newPassword: string) {
  return request<string>('/api/admin/change-password', {
    method: 'POST',
    auth: true,
    body: { oldPassword, newPassword },
  })
}
