import CategoryIcon from './CategoryIcon'
import type { NavLink } from '../types'

export default function LinkCard({ link }: { link: NavLink }) {
  return (
    <a
      className="link-card"
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      title={link.description ?? link.name}
    >
      <div className="link-icon">
        <CategoryIcon icon={link.icon} alt={link.name} size={28} />
      </div>
      <div className="link-body">
        <div className="link-name">{link.name}</div>
        {link.description && <div className="link-desc">{link.description}</div>}
      </div>
    </a>
  )
}
