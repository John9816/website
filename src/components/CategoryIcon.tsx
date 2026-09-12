import { useEffect, useMemo, useState } from 'react'
import {
  Blocks,
  BookOpen,
  Briefcase,
  Cannabis,
  Cloud,
  Code2,
  Coffee,
  Compass,
  Database,
  Folder,
  Gamepad2,
  Globe,
  Heart,
  Home,
  Image as ImageIcon,
  Link2,
  Link as LinkIcon,
  MessageCircle,
  Music,
  Navigation,
  Newspaper,
  Rocket,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  Star,
  Terminal,
  User,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

type Props = {
  icon?: string | null
  alt?: string
  size?: number
}

type LucideIconComponent = LucideIcon

const staticIconRegistry: Record<string, LucideIconComponent> = {
  ai: Sparkles,
  blocks: Blocks,
  book: BookOpen,
  'book-open': BookOpen,
  briefcase: Briefcase,
  cannabis: Cannabis,
  cloud: Cloud,
  code: Code2,
  'code-2': Code2,
  coffee: Coffee,
  compass: Compass,
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
  'link-2': Link2,
  link: LinkIcon,
  message: MessageCircle,
  'message-circle': MessageCircle,
  music: Music,
  navigation: Navigation,
  news: Newspaper,
  newspaper: Newspaper,
  rocket: Rocket,
  search: Search,
  settings: Settings,
  shopping: ShoppingBag,
  'shopping-bag': ShoppingBag,
  sparkles: Sparkles,
  star: Star,
  terminal: Terminal,
  user: User,
  tool: Wrench,
  tools: Wrench,
  wrench: Wrench,
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
  const [imageFailed, setImageFailed] = useState(false)

  const iconKey = useMemo(() => {
    if (!icon || isUrl(icon)) return null
    return normalizeLucideIconName(icon)
  }, [icon])
  const staticIcon = iconKey ? staticIconRegistry[iconKey] ?? null : null

  useEffect(() => {
    setImageFailed(false)
  }, [icon])

  const node = useMemo(() => {
    if (!icon) return null
    if (isUrl(icon) && !imageFailed) {
      return (
        <img
          src={icon}
          alt={alt ?? ''}
          width={size}
          height={size}
          style={{ borderRadius: 4, objectFit: 'cover' }}
          onError={(e) => {
            e.currentTarget.removeAttribute('src')
            setImageFailed(true)
          }}
        />
      )
    }
    const Icon = staticIcon ?? LinkIcon
    if (Icon) {
      return <Icon size={size} />
    }
    return null
  }, [alt, icon, imageFailed, size, staticIcon])

  return <span className="cat-icon">{node}</span>
}
