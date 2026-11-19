import {
  Activity,
  BookOpen,
  Compass,
  Image as ImageIcon,
  MessageSquare,
  Music2,
  type LucideIcon,
} from 'lucide-react'

/**
 * Single source of truth for the global navigation tabs.
 * `id` is the stable key persisted in sys_config (ui.tabs.visibility JSON).
 * Keep ids stable — renaming an id resets that tab's visibility to default.
 */
export interface AppTab {
  id: string
  to: string
  label: string
  Icon: LucideIcon
  end: boolean
}

export const APP_TABS: AppTab[] = [
  { id: 'home', to: '/', label: '导航', Icon: Compass, end: true },
  { id: 'music', to: '/music', label: '音乐', Icon: Music2, end: false },
  { id: 'aiChat', to: '/ai-chat', label: 'AI 对话', Icon: MessageSquare, end: false },
  { id: 'aiImage', to: '/ai-image', label: 'AI 生图', Icon: ImageIcon, end: false },
  { id: 'kb', to: '/editor/', label: '知识库', Icon: BookOpen, end: false },
  { id: 'monitor', to: '/server-monitor', label: '服务器监控', Icon: Activity, end: false },
]

export const TAB_VISIBILITY_KEY = 'ui.tabs.visibility'

/** Parse the visibility map returned by the public API. Missing ids default to visible. */
export function parseTabVisibility(raw: Record<string, boolean> | null | undefined): Record<string, boolean> {
  const result: Record<string, boolean> = {}
  for (const tab of APP_TABS) {
    result[tab.id] = raw && Object.prototype.hasOwnProperty.call(raw, tab.id)
      ? Boolean(raw[tab.id])
      : true
  }
  return result
}

export const DEFAULT_TAB_VISIBILITY: Record<string, boolean> =
  parseTabVisibility(null)
