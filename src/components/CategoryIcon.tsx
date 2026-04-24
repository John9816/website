import { useMemo } from 'react'
import * as LucideIcons from 'lucide-react'
import { Link as LinkIcon } from 'lucide-react'

type Props = {
  icon?: string | null
  alt?: string
  size?: number
}

function isUrl(v: string) {
  return /^https?:\/\//i.test(v) || v.startsWith('/') || v.startsWith('data:')
}

export default function CategoryIcon({ icon, alt, size = 20 }: Props) {
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
    const Comp = (LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number }>>)[
      icon
    ]
    if (Comp) return <Comp size={size} />
    return <LinkIcon size={size} />
  }, [icon, alt, size])

  return <span className="cat-icon">{node}</span>
}
