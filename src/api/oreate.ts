import { ApiError, BASE, getToken, getTokenType, request } from './client'

export interface OreatePointCost { point?: number; resolution?: string; duration?: number; audio?: boolean; [key: string]: unknown }
export interface OreateModelItem { type?: 'image' | 'video'; factory?: string; modelName: string; modelDesc?: string | Record<string, string>; modelIcon?: string; pointCost?: OreatePointCost[]; pointCostImage?: OreatePointCost[]; resolution?: string[]; size?: string[]; duration?: Array<string | number>; supportAudio?: boolean; [key: string]: unknown }
export interface OreateModelConfig { image: OreateModelItem[]; video: OreateModelItem[] }
export interface OreateOptionsView { models?: OreateModelConfig; [key: string]: unknown }
export interface OreateAccountPoolView { accounts?: OreatePoolAccountView[]; total?: number; active?: number; totalBalance?: number; [key: string]: unknown }
export interface OreatePoolAccountView { email?: string; password?: string; status?: string; statusText?: string; balance?: number; jt?: string; source?: string; updatedAt?: string; lastCheckedAt?: string; error?: string; [key: string]: unknown }
export interface OreateChatPayload { type?: 'image' | 'video'; prompt: string; model?: string; ratio?: string; resolution?: string; duration?: string | number; inputImage?: string; imageUrl?: string; [key: string]: unknown }
export interface OreateMediaResult { urls: string[]; videoUrls: string[]; rawEvents: unknown[] }

export interface OreateRegisterStepView { key?: string; label?: string; status?: 'pending' | 'done' | 'failed' | string; time?: number | null; email?: string | null; [key: string]: unknown }
export interface OreateRegisterJobView { job_id?: string; jobId?: string; id?: string; status?: string; count?: number; currentStep?: string; progress?: number; steps?: OreateRegisterStepView[]; stdout?: string; stderr?: string; result?: unknown; import_result?: unknown; [key: string]: unknown }

export const getOreateModelConfig = () => request<OreateModelConfig>('/api/user/oreate/model-config', { auth: true })
export const getAdminOreatePool = (force = false) => request<OreateAccountPoolView>('/api/admin/oreate/account-pool', { auth: true, query: { force } })
export const reloadAdminOreatePool = () => request<unknown>('/api/admin/oreate/reload-accounts', { method: 'POST', auth: true })
export const refreshAdminOreateJt = (body: Record<string, unknown> = {}) => request<unknown>('/api/admin/oreate/refresh-jt', { method: 'POST', auth: true, body })
export const removeAdminOreateAccount = (index: number) => request<unknown>('/api/admin/oreate/account-pool/remove', { method: 'POST', auth: true, body: { index } })

export const startAdminOreateRegisterChain = (body: Record<string, unknown> = {}) => request<OreateRegisterJobView>('/api/admin/oreate/register-chain', { method: 'POST', auth: true, body })
export const getAdminOreateRegisterJob = (jobId: string) => request<OreateRegisterJobView>(`/api/admin/oreate/register-chain/${encodeURIComponent(jobId)}`, { auth: true })
export const importAdminOreateRegisteredAccounts = (body: Record<string, unknown> = {}) => request<unknown>('/api/admin/oreate/import-registered-accounts', { method: 'POST', auth: true, body })

function cleanMediaUrl(url: string) {
  return url
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/')
    .replace(/[\\\\),.;\]}]+$/g, '')
    .replace(/^['\"]|['\"]$/g, '')
}

function extractUrls(text: string) {
  return Array.from(new Set((text.match(/https?:\/\/[^\s)\"'<>]+/g) ?? []).map(cleanMediaUrl).filter(Boolean)))
}

function collectUrls(value: unknown, output: string[] = []) {
  if (!value) return output
  if (typeof value === 'string') {
    output.push(...extractUrls(value))
    return output
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectUrls(item, output))
    return output
  }
  if (typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach(item => collectUrls(item, output))
  }
  return output
}

function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov|m3u8)(\?|#|$)/i.test(url) || /video/i.test(url)
}

export async function generateOreateMedia(body: OreateChatPayload, callbacks: { onLog?: (line: string) => void; onEvent?: (event: unknown) => void } = {}, signal?: AbortSignal): Promise<OreateMediaResult> {
  const token = getToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'text/event-stream' }
  if (token) headers.Authorization = `${getTokenType()} ${token}`
  const res = await fetch(`${BASE}/api/user/oreate/chat`, { method: 'POST', headers, body: JSON.stringify(body), signal })
  if (res.status === 401) throw new ApiError(401, '登录已过期，请重新登录')
  if (!res.ok || !res.body) throw new ApiError(res.status, `Oreate 请求失败: HTTP ${res.status}`)
  const reader = res.body.getReader(); const decoder = new TextDecoder(); let buffer = ''
  const rawEvents: unknown[] = []; const urls: string[] = []; const videoUrls: string[] = []; let error: ApiError | null = null
  const handleLine = (line: string) => {
    if (!line.startsWith('data:')) return
    const data = line.slice(5).trim(); if (!data) return
    callbacks.onLog?.(`SSE: data: ${data}`)
    try {
      const event = JSON.parse(data); rawEvents.push(event); callbacks.onEvent?.(event)
      if (event?.event === 'error' || event?.error) error = new ApiError(Number(event?.data?.code ?? event?.status ?? 500), event?.data?.msg || event?.data?.message || event?.error || 'Oreate 生成失败')
      for (const url of collectUrls(event)) (isVideoUrl(url) ? videoUrls : urls).push(url)
    } catch { for (const url of extractUrls(data)) (isVideoUrl(url) ? videoUrls : urls).push(url) }
  }
  while (true) { const { value, done } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split(/\r?\n/); buffer = lines.pop() ?? ''; lines.forEach(handleLine) }
  if (buffer) handleLine(buffer)
  if (error) throw error
  return { urls: Array.from(new Set(urls)), videoUrls: Array.from(new Set(videoUrls)), rawEvents }
}

