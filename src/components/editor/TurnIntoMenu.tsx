import type { Editor } from '@tiptap/react'
import {
  Code2,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListChecks,
  ListOrdered,
  Quote,
  Type,
} from 'lucide-react'
import { EDITOR_TEXT } from './texts'

interface TurnIntoMenuProps {
  editor: Editor
  onApplied?: () => void
}

interface TurnIntoItem {
  key: string
  label: string
  icon: React.ReactNode
  active: boolean
  apply: () => void
}

/**
 * “转换为”块类型菜单：正文 / 标题 / 列表 / 引用 / 代码块。
 * 供气泡菜单与块手柄菜单复用。
 */
export function TurnIntoMenu({ editor, onApplied }: TurnIntoMenuProps) {
  const items: TurnIntoItem[] = [
    {
      key: 'paragraph',
      label: EDITOR_TEXT.paragraph,
      icon: <Type size={15} />,
      active: editor.isActive('paragraph'),
      apply: () => editor.chain().focus().setParagraph().run(),
    },
    {
      key: 'heading-1',
      label: EDITOR_TEXT.slashHeading1,
      icon: <Heading1 size={15} />,
      active: editor.isActive('heading', { level: 1 }),
      apply: () => editor.chain().focus().setHeading({ level: 1 }).run(),
    },
    {
      key: 'heading-2',
      label: EDITOR_TEXT.slashHeading2,
      icon: <Heading2 size={15} />,
      active: editor.isActive('heading', { level: 2 }),
      apply: () => editor.chain().focus().setHeading({ level: 2 }).run(),
    },
    {
      key: 'heading-3',
      label: EDITOR_TEXT.slashHeading3,
      icon: <Heading3 size={15} />,
      active: editor.isActive('heading', { level: 3 }),
      apply: () => editor.chain().focus().setHeading({ level: 3 }).run(),
    },
    {
      key: 'bulletList',
      label: EDITOR_TEXT.bulletList,
      icon: <List size={15} />,
      active: editor.isActive('bulletList'),
      apply: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      key: 'orderedList',
      label: EDITOR_TEXT.orderedList,
      icon: <ListOrdered size={15} />,
      active: editor.isActive('orderedList'),
      apply: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      key: 'taskList',
      label: EDITOR_TEXT.taskList,
      icon: <ListChecks size={15} />,
      active: editor.isActive('taskList'),
      apply: () => editor.chain().focus().toggleTaskList().run(),
    },
    {
      key: 'blockquote',
      label: EDITOR_TEXT.quote,
      icon: <Quote size={15} />,
      active: editor.isActive('blockquote'),
      apply: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      key: 'codeBlock',
      label: EDITOR_TEXT.codeBlock,
      icon: <Code2 size={15} />,
      active: editor.isActive('codeBlock'),
      apply: () => editor.chain().focus().toggleCodeBlock().run(),
    },
  ]

  return (
    <div className="editor-turn-into" role="menu" aria-label={EDITOR_TEXT.turnInto}>
      <div className="editor-turn-into__title">{EDITOR_TEXT.turnInto}</div>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="menuitemradio"
          aria-checked={item.active}
          className={`editor-turn-into__item${item.active ? ' is-active' : ''}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (item.active) {
              onApplied?.()
              return
            }
            item.apply()
            onApplied?.()
          }}
        >
          <span className="editor-turn-into__icon" aria-hidden>
            {item.icon}
          </span>
          <span className="editor-turn-into__label">{item.label}</span>
          {item.active ? (
            <span className="editor-turn-into__check" aria-hidden>
              ✓
            </span>
          ) : null}
        </button>
      ))}
    </div>
  )
}
