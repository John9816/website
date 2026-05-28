import { forwardRef, useEffect, useImperativeHandle, useState, useMemo } from 'react'
import type { Editor, Range } from '@tiptap/react'
import { EDITOR_TEXT } from './texts'

export interface SlashCommandItem {
  title: string
  description?: string
  keywords?: string[]
  icon?: React.ReactNode
  command: (props: { editor: Editor; range: Range }) => void
}

export interface SlashCommandListProps {
  items: SlashCommandItem[]
  command: (item: SlashCommandItem) => void
}

export interface SlashCommandListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

export const SlashCommandList = forwardRef<SlashCommandListHandle, SlashCommandListProps>(
  function SlashCommandList({ items, command }, ref) {
    const [activeIndex, setActiveIndex] = useState(0)

    useEffect(() => {
      setActiveIndex(0)
    }, [items])

    const selectItem = (index: number) => {
      const item = items[index]
      if (item) command(item)
    }

    const handlers = useMemo(
      () => ({
        upHandler: () => {
          setActiveIndex((prev) => (prev - 1 + items.length) % items.length)
        },
        downHandler: () => {
          setActiveIndex((prev) => (prev + 1) % items.length)
        },
        enterHandler: () => {
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

    return (
      <div className="editor-slash-command-list">
        {items.map((item, index) => (
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
          </button>
        ))}
      </div>
    )
  },
)
