import { ApiError, request, setToken } from './client'
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

type RegisterResponse =
  | string
  | {
      message?: string
      username?: string
      token?: string
      tokenType?: string
      expiresInMinutes?: number
    }

export async function register(username: string, password: string) {
  const body = { username, password }

  try {
    return await request<RegisterResponse>('/api/auth/register', {
      method: 'POST',
      body,
    })
  } catch (error) {
    if (error instanceof ApiError && (error.code === 404 || error.code === 405)) {
      return request<RegisterResponse>('/api/auth/signup', {
        method: 'POST',
        body,
      })
    }
    throw error
  }
}

export function changePassword(oldPassword: string, newPassword: string) {
  return request<string>('/api/admin/change-password', {
    method: 'POST',
    auth: true,
    body: { oldPassword, newPassword },
  })
}
