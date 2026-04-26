import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

type Props = {
  bare?: boolean
}

export default function ThemeToggle({ bare = false }: Props) {
  const { mode, toggle } = useTheme()
  const isDark = mode === 'dark'
  const label = isDark ? '切换到浅色模式' : '切换到深色模式'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      aria-pressed={isDark}
      title={label}
      className={bare ? 'theme-toggle theme-toggle--bare' : 'theme-toggle'}
      data-mode={mode}
    >
      <span className="theme-toggle__icon" aria-hidden="true">
        {isDark ? <Sun size={16} /> : <Moon size={16} />}
      </span>
    </button>
  )
}
