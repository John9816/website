import type { JSONContent } from '@tiptap/react'

export function safeParseJson(value: string | null | undefined): JSONContent | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    if (parsed && typeof parsed === 'object' && parsed.type) return parsed as JSONContent
    return null
  } catch {
    return null
  }
}

export function isJsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null) return a === b
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object') return a === b
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i += 1) {
      if (!isJsonEqual(a[i], b[i])) return false
    }
    return true
  }
  if (Array.isArray(b)) return false
  const ao = a as Record<string, unknown>
  const bo = b as Record<string, unknown>
  const ak = Object.keys(ao)
  const bk = Object.keys(bo)
  if (ak.length !== bk.length) return false
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(bo, k)) return false
    if (!isJsonEqual(ao[k], bo[k])) return false
  }
  return true
}

export function emptyDoc(): JSONContent {
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}
