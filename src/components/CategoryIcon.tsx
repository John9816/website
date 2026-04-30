import { useEffect, useMemo, useState, type ComponentType } from 'react'
import dynamicIconImports from 'lucide-react/dynamicIconImports'
import { Link as LinkIcon } from 'lucide-react'

type Props = {
  icon?: string | null
  alt?: string
  size?: number
}

type LucideIconComponent = ComponentType<{ size?: number }>

const iconLoaders = dynamicIconImports as Record<
  string,
  () => Promise<{ default: LucideIconComponent }>
>

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

  useEffect(() => {
    let cancelled = false

    if (!iconKey) {
      setDynamicIcon(null)
      return () => {
        cancelled = true
      }
    }

    const loadIcon = iconLoaders[iconKey]
    if (!loadIcon) {
      setDynamicIcon(null)
      return () => {
        cancelled = true
      }
    }

    void loadIcon()
      .then((module) => {
        if (!cancelled) {
          setDynamicIcon(() => module.default)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDynamicIcon(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [iconKey])

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
    if (dynamicIcon) {
      const Icon = dynamicIcon
      return <Icon size={size} />
    }
    return <LinkIcon size={size} />
  }, [alt, dynamicIcon, icon, size])

  return <span className="cat-icon">{node}</span>
}
