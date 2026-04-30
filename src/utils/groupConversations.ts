import type { AiConversationView } from '../types'

export interface ConversationGroup {
  label: string
  items: AiConversationView[]
}

const GROUP_LABELS = {
  today: '今天',
  yesterday: '昨天',
  thisWeek: '本周',
  thisMonth: '本月',
  earlier: '更早',
} as const

function startOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function getReferenceDate(value: string | null | undefined) {
  if (!value) return null
  const parsed = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

export function groupConversations(items: AiConversationView[]): ConversationGroup[] {
  if (!items.length) return []

  const now = new Date()
  const todayStart = startOfDay(now).getTime()
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000
  const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1
  const weekStart = todayStart - dayOfWeek * 24 * 60 * 60 * 1000
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()

  const buckets: Record<keyof typeof GROUP_LABELS, AiConversationView[]> = {
    today: [],
    yesterday: [],
    thisWeek: [],
    thisMonth: [],
    earlier: [],
  }

  for (const item of items) {
    const ref =
      getReferenceDate(item.lastMessageAt) ??
      getReferenceDate(item.updatedAt) ??
      getReferenceDate(item.createdAt)
    const ts = ref ? ref.getTime() : 0

    if (ts >= todayStart) buckets.today.push(item)
    else if (ts >= yesterdayStart) buckets.yesterday.push(item)
    else if (ts >= weekStart) buckets.thisWeek.push(item)
    else if (ts >= monthStart) buckets.thisMonth.push(item)
    else buckets.earlier.push(item)
  }

  return (Object.keys(buckets) as Array<keyof typeof buckets>)
    .filter((key) => buckets[key].length > 0)
    .map((key) => ({ label: GROUP_LABELS[key], items: buckets[key] }))
}
