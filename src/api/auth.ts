import { ApiError, request, setToken } from './client'
import type { CurrentUserView, LoginResponse, UserCreditView } from '../types'

export async function login(username: string, password: string) {
  const data = await request<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: { username, password },
  })
  setToken(data.token, data.tokenType || 'Bearer')
  return data
}

export function logout() {
  setToken(null)
}

export async function register(username: string, password: string, email: string) {
  const body = { username, password, email }

  try {
    return await request<LoginResponse>('/api/auth/register', {
      method: 'POST',
      body,
    })
  } catch (error) {
    if (error instanceof ApiError && (error.code === 404 || error.code === 405)) {
      return request<LoginResponse>('/api/auth/signup', {
        method: 'POST',
        body,
      })
    }
    throw error
  }
}

export function getCurrentUser() {
  return request<CurrentUserView>('/api/user/me', { auth: true })
}

export function updateUserProfile(body: { username: string; email: string }) {
  return request<CurrentUserView>('/api/user/profile', {
    method: 'PUT',
    auth: true,
    body,
  })
}

export function getUserCredits() {
  return request<UserCreditView>('/api/user/credits', { auth: true })
}

export function checkInToday() {
  return request<UserCreditView>('/api/user/check-in', {
    method: 'POST',
    auth: true,
  })
}

export function changePassword(oldPassword: string, newPassword: string) {
  return request<void>('/api/user/change-password', {
    method: 'POST',
    auth: true,
    body: { oldPassword, newPassword },
  })
}
