import { forwardRef, useEffect, useImperativeHandle, useState, useMemo } from 'react'
import type { Editor, Range } from '@tiptap/react'
import { EDITOR_TEXT } from './texts'

export interface SlashCommandItem {
  title: string
  description?: string
  hint?: string
  keywords?: string[]
  icon?: React.ReactNode
  group?: string
  command: (props: { editor: Editor; range: Range }) => void
}

export interface SlashCommandListProps {
  items: SlashCommandItem[]
  command: (item: SlashCommandItem) => void
}

export interface SlashCommandListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

interface SlashGroup {
  name: string
  items: SlashCommandItem[]
}

function groupItems(items: SlashCommandItem[]): SlashGroup[] {
  const groups: SlashGroup[] = []
  items.forEach((item) => {
    const name = item.group ?? ''
    const last = groups[groups.length - 1]
    if (last && last.name === name) {
      last.items.push(item)
    } else {
      groups.push({ name, items: [item] })
    }
  })
  return groups
}

export const SlashCommandList = forwardRef<SlashCommandListHandle, SlashCommandListProps>(
  function SlashCommandList({ items, command }, ref) {
    const [activeIndex, setActiveIndex] = useState(0)

    useEffect(() => {
      setActiveIndex(0)
    }, [items])

    const groups = useMemo(() => groupItems(items), [items])

    const selectItem = (index: number) => {
      const item = items[index]
      if (item) command(item)
    }

    const handlers = useMemo(
      () => ({
        upHandler: () => {
          if (!items.length) return
          setActiveIndex((prev) => (prev - 1 + items.length) % items.length)
        },
        downHandler: () => {
          if (!items.length) return
          setActiveIndex((prev) => (prev + 1) % items.length)
        },
        enterHandler: () => {
          if (!items.length) return
          selectItem(activeIndex)
        },
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [items, activeIndex],
    )

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === 'ArrowUp') {
          handlers.upHandler()
          return true
        }
        if (event.key === 'ArrowDown') {
          handlers.downHandler()
          return true
        }
        if (event.key === 'Enter') {
          handlers.enterHandler()
          return true
        }
        return false
      },
    }))

    if (!items.length) {
      return <div className="editor-slash-empty">{EDITOR_TEXT.slashSearchEmpty}</div>
    }

    let flatIndex = -1

    return (
      <div className="editor-slash-command-list">
        {groups.map((group) => (
          <div className="editor-slash-group" key={group.name || 'ungrouped'}>
            {group.name ? <div className="editor-slash-group__title">{group.name}</div> : null}
            {group.items.map((item) => {
              flatIndex += 1
              const index = flatIndex
              return (
                <button
                  key={item.title}
                  type="button"
                  className={`editor-slash-item${index === activeIndex ? ' is-active' : ''}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectItem(index)}
                >
                  <span className="editor-slash-item__icon" aria-hidden>
                    {item.icon}
                  </span>
                  <span className="editor-slash-item__body">
                    <span className="editor-slash-item__title">{item.title}</span>
                    {item.description && (
                      <span className="editor-slash-item__desc">{item.description}</span>
                    )}
                  </span>
                  {item.hint ? <span className="editor-slash-item__hint">{item.hint}</span> : null}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    )
  },
)
