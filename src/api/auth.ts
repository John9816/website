import { request, setToken } from './client'
import type {
  CurrentUserView,
  EmailVerificationCodeView,
  LoginResponse,
  UserCreditView,
} from '../types'

export async function login(identifier: string, password: string) {
  const normalizedIdentifier = identifier.trim()
  return request<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: normalizedIdentifier.includes('@')
      ? { email: normalizedIdentifier, password }
      : { username: normalizedIdentifier, password },
  })
}

export function refreshSession(refreshToken: string) {
  return request<LoginResponse>('/api/auth/refresh', {
    method: 'POST',
    body: { refresh_token: refreshToken },
  })
}

export function logout() {
  setToken(null)
}

export function sendRegistrationEmailCode(email: string) {
  return request<EmailVerificationCodeView>('/api/auth/email-code', {
    method: 'POST',
    body: { email },
  })
}

export function sendPasswordResetEmailCode(email: string) {
  return request<EmailVerificationCodeView>('/api/auth/password-reset/email-code', {
    method: 'POST',
    body: { email },
  })
}

export function resetPassword(email: string, verificationCode: string, newPassword: string) {
  return request<void>('/api/auth/password-reset/confirm', {
    method: 'POST',
    body: { email, verificationCode, newPassword },
  })
}

export async function register(
  username: string,
  password: string,
  email: string,
  verificationCode: string,
) {
  const body = { username, password, email, verificationCode }
  return request<LoginResponse>('/api/auth/register', {
    method: 'POST',
    body,
  })
}

export function getCurrentUser(token?: string, tokenType?: string) {
  return request<CurrentUserView>('/api/user/me', {
    auth: true,
    authToken: token,
    authTokenType: tokenType,
  })
}

export function updateUserProfile(body: { username: string; email: string }) {
  return request<CurrentUserView>('/api/user/profile', {
    method: 'PUT',
    auth: true,
    body,
  })
}

export function uploadUserAvatar(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return request<CurrentUserView>('/api/user/avatar', {
    method: 'POST',
    auth: true,
    body: formData,
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
