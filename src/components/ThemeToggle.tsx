import { Moon, Sun } from 'lucide-react'
import { THEME_MODES, type ThemeMode, useTheme } from '../context/ThemeContext'

type Props = {
  bare?: boolean
}

const themeMeta: Record<
  ThemeMode,
  {
    label: string
    title: string
    Icon: typeof Sun
  }
> = {
  light: {
    label: '白天',
    title: '切换到白天模式',
    Icon: Sun,
  },
  dark: {
    label: '黑夜',
    title: '切换到黑夜模式',
    Icon: Moon,
  },
}

export default function ThemeToggle({ bare = false }: Props) {
  const { mode, setMode } = useTheme()

  return (
    <div
      className={bare ? 'theme-toggle theme-toggle--bare' : 'theme-toggle'}
      role="group"
      aria-label="选择显示模式"
      data-mode={mode}
    >
      {THEME_MODES.map((themeMode) => {
        const { Icon, label, title } = themeMeta[themeMode]
        const active = mode === themeMode
        return (
          <button
            key={themeMode}
            type="button"
            className={`theme-toggle__option${active ? ' is-active' : ''}`}
            onClick={() => setMode(themeMode)}
            aria-label={title}
            aria-pressed={active}
            title={label}
          >
            <Icon size={15} aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}
