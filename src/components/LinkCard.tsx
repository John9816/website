import { ExternalLink } from 'lucide-react'
import CategoryIcon from './CategoryIcon'
import type { NavLink } from '../types'

function getHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export default function LinkCard({ link }: { link: NavLink }) {
  const host = getHost(link.url)

  return (
    <a
      className="link-card"
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      title={link.description ?? link.name}
    >
      <div className="link-icon">
        <CategoryIcon icon={link.icon} alt={link.name} size={22} />
      </div>
      <div className="link-body">
        <div className="link-name">{link.name}</div>
        <div className="link-meta">
          <span>{host}</span>
          <ExternalLink size={13} aria-hidden="true" />
        </div>
      </div>
    </a>
  )
}
