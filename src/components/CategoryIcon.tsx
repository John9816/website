import { useEffect, useMemo, useState } from 'react'
import {
  Blocks,
  BookOpen,
  Briefcase,
  Cloud,
  Code2,
  Database,
  Folder,
  Gamepad2,
  Globe,
  Heart,
  Home,
  Image as ImageIcon,
  Link as LinkIcon,
  MessageCircle,
  Music,
  Navigation,
  Newspaper,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  Star,
  Terminal,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

type Props = {
  icon?: string | null
  alt?: string
  size?: number
}

type LucideIconComponent = LucideIcon
type IconLoaderMap = Record<string, () => Promise<{ default: LucideIconComponent }>>

const staticIconRegistry: Record<string, LucideIconComponent> = {
  ai: Sparkles,
  blocks: Blocks,
  book: BookOpen,
  'book-open': BookOpen,
  briefcase: Briefcase,
  cloud: Cloud,
  code: Code2,
  'code-2': Code2,
  database: Database,
  folder: Folder,
  game: Gamepad2,
  'gamepad-2': Gamepad2,
  globe: Globe,
  heart: Heart,
  home: Home,
  house: Home,
  image: ImageIcon,
  'image-icon': ImageIcon,
  link: LinkIcon,
  message: MessageCircle,
  'message-circle': MessageCircle,
  music: Music,
  navigation: Navigation,
  news: Newspaper,
  newspaper: Newspaper,
  search: Search,
  settings: Settings,
  shopping: ShoppingBag,
  'shopping-bag': ShoppingBag,
  sparkles: Sparkles,
  star: Star,
  terminal: Terminal,
  tool: Wrench,
  tools: Wrench,
  wrench: Wrench,
}

let iconLoadersPromise: Promise<IconLoaderMap> | null = null
const iconCache = new Map<string, LucideIconComponent | null>()
const iconPromiseCache = new Map<string, Promise<LucideIconComponent | null>>()

function getIconLoaders() {
  if (!iconLoadersPromise) {
    iconLoadersPromise = import('lucide-react/dynamicIconImports').then(
      (module) => module.default as IconLoaderMap,
    )
  }
  return iconLoadersPromise
}

function isUrl(v: string) {
  return /^https?:\/\//i.test(v) || v.startsWith('/') || v.startsWith('data:')
}

function normalizeLucideIconName(value: string) {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Za-z])(\d)/g, '$1-$2')
    .replace(/(\d)([A-Za-z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase()
}

export default function CategoryIcon({ icon, alt, size = 20 }: Props) {
  const [dynamicIcon, setDynamicIcon] = useState<LucideIconComponent | null>(null)

  const iconKey = useMemo(() => {
    if (!icon || isUrl(icon)) return null
    return normalizeLucideIconName(icon)
  }, [icon])
  const staticIcon = iconKey ? staticIconRegistry[iconKey] ?? null : null

  useEffect(() => {
    let cancelled = false

    if (!iconKey || staticIcon) {
      setDynamicIcon(null)
      return () => {
        cancelled = true
      }
    }

    if (iconCache.has(iconKey)) {
      setDynamicIcon(() => iconCache.get(iconKey) ?? null)
      return () => {
        cancelled = true
      }
    }

    let iconPromise = iconPromiseCache.get(iconKey)
    if (!iconPromise) {
      iconPromise = getIconLoaders()
        .then((iconLoaders) => {
          const loadIcon = iconLoaders[iconKey]
          if (!loadIcon) return null
          return loadIcon().then((module) => module.default)
        })
        .then((module) => {
          iconCache.set(iconKey, module)
          return module
        })
        .catch(() => {
          iconCache.set(iconKey, null)
          return null
        })
      iconPromiseCache.set(iconKey, iconPromise)
    }

    void iconPromise.then((Icon) => {
      if (!cancelled) {
        setDynamicIcon(() => Icon)
      }
    })

    return () => {
      cancelled = true
    }
  }, [iconKey, staticIcon])

  const node = useMemo(() => {
    if (!icon) return null
    if (isUrl(icon)) {
      return (
        <img
          src={icon}
          alt={alt ?? ''}
          width={size}
          height={size}
          style={{ borderRadius: 4, objectFit: 'cover' }}
          onError={(e) => {
            const el = e.currentTarget
            el.style.display = 'none'
          }}
        />
      )
    }
    const Icon = staticIcon ?? dynamicIcon
    if (Icon) {
      return <Icon size={size} />
    }
    return <LinkIcon size={size} />
  }, [alt, dynamicIcon, icon, size, staticIcon])

  return <span className="cat-icon">{node}</span>
}
