import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/react'
import { Button, Tooltip } from 'antd'
import {
  Columns3,
  Merge,
  Rows3,
  Split,
  Table2,
  Trash2,
} from 'lucide-react'
import { EDITOR_TEXT } from './texts'

interface TableToolbarProps {
  editor: Editor
}

interface Position {
  top: number
  left: number
}

interface TableAction {
  key: string
  label: string
  icon: React.ReactNode
  danger?: boolean
  run: () => void
  can: () => boolean
}

/**
 * 表格浮动工具条：光标进入表格时浮现在表格上方，
 * 提供行/列增删、表头切换、合并/拆分与删表能力。
 */
export function TableToolbar({ editor }: TableToolbarProps) {
  const [position, setPosition] = useState<Position | null>(null)
  const [active, setActive] = useState(false)
  const actionsRef = useRef<TableAction[]>([])

  const locateTable = useCallback((): HTMLElement | null => {
    if (!editor.isEditable || editor.isDestroyed) return null
    if (!editor.isActive('table')) return null
    try {
      const dom = editor.view.domAtPos(editor.state.selection.from)
      const node = dom.node
      const element =
        node instanceof HTMLElement ? node : node.parentElement
      const wrapper = element?.closest('.tableWrapper')
      return wrapper instanceof HTMLElement ? wrapper : null
    } catch {
      return null
    }
  }, [editor])

  const updatePosition = useCallback(() => {
    const wrapper = locateTable()
    if (!wrapper || !wrapper.isConnected) {
      setActive(false)
      setPosition(null)
      return
    }
    const rect = wrapper.getBoundingClientRect()
    const above = rect.top - 46
    const top = above > 56 ? above : rect.bottom + 8
    setPosition({
      top,
      left: rect.left + rect.width / 2,
    })
    setActive(true)
  }, [locateTable])

  useEffect(() => {
    let frame = 0
    const schedule = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        updatePosition()
      })
    }
    const onSelection = () => schedule()

    editor.on('selectionUpdate', onSelection)
    editor.on('update', onSelection)
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    return () => {
      editor.off('selectionUpdate', onSelection)
      editor.off('update', onSelection)
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [editor, updatePosition])

  const actions: TableAction[] = [
    {
      key: 'addRowBefore',
      label: EDITOR_TEXT.addRowBefore,
      icon: <Rows3 size={15} />,
      run: () => editor.chain().focus().addRowBefore().run(),
      can: () => editor.can().addRowBefore(),
    },
    {
      key: 'addRowAfter',
      label: EDITOR_TEXT.addRowAfter,
      icon: <Rows3 size={15} />,
      run: () => editor.chain().focus().addRowAfter().run(),
      can: () => editor.can().addRowAfter(),
    },
    {
      key: 'addColumnBefore',
      label: EDITOR_TEXT.addColumnBefore,
      icon: <Columns3 size={15} />,
      run: () => editor.chain().focus().addColumnBefore().run(),
      can: () => editor.can().addColumnBefore(),
    },
    {
      key: 'addColumnAfter',
      label: EDITOR_TEXT.addColumnAfter,
      icon: <Columns3 size={15} />,
      run: () => editor.chain().focus().addColumnAfter().run(),
      can: () => editor.can().addColumnAfter(),
    },
    {
      key: 'deleteRow',
      label: EDITOR_TEXT.deleteRow,
      icon: <Trash2 size={15} />,
      danger: true,
      run: () => editor.chain().focus().deleteRow().run(),
      can: () => editor.can().deleteRow(),
    },
    {
      key: 'deleteColumn',
      label: EDITOR_TEXT.deleteColumn,
      icon: <Trash2 size={15} />,
      danger: true,
      run: () => editor.chain().focus().deleteColumn().run(),
      can: () => editor.can().deleteColumn(),
    },
    {
      key: 'toggleHeaderRow',
      label: EDITOR_TEXT.toggleHeaderRow,
      icon: <Table2 size={15} />,
      run: () => editor.chain().focus().toggleHeaderRow().run(),
      can: () => editor.can().toggleHeaderRow(),
    },
    {
      key: 'toggleHeaderColumn',
      label: EDITOR_TEXT.toggleHeaderColumn,
      icon: <Table2 size={15} />,
      run: () => editor.chain().focus().toggleHeaderColumn().run(),
      can: () => editor.can().toggleHeaderColumn(),
    },
    {
      key: 'mergeCells',
      label: EDITOR_TEXT.mergeCells,
      icon: <Merge size={15} />,
      run: () => editor.chain().focus().mergeCells().run(),
      can: () => editor.can().mergeCells(),
    },
    {
      key: 'splitCell',
      label: EDITOR_TEXT.splitCell,
      icon: <Split size={15} />,
      run: () => editor.chain().focus().splitCell().run(),
      can: () => editor.can().splitCell(),
    },
    {
      key: 'deleteTable',
      label: EDITOR_TEXT.deleteTable,
      icon: <Trash2 size={15} />,
      danger: true,
      run: () => editor.chain().focus().deleteTable().run(),
      can: () => editor.can().deleteTable(),
    },
  ]
  actionsRef.current = actions

  if (!active || !position) return null

  return createPortal(
    <div
      className="editor-table-toolbar"
      style={{ top: position.top, left: position.left }}
      role="toolbar"
      aria-label={EDITOR_TEXT.tableToolbar}
      onMouseDown={(event) => event.preventDefault()}
    >
      {actionsRef.current.map((action) => (
        <Tooltip key={action.key} title={action.label} mouseEnterDelay={0.45}>
          <Button
            size="small"
            type="text"
            className={`editor-toolbar-btn editor-toolbar-btn--table${
              action.danger ? ' is-danger' : ''
            }`}
            icon={action.icon}
            disabled={!action.can()}
            onClick={action.run}
            aria-label={action.label}
          />
        </Tooltip>
      ))}
    </div>,
    document.body,
  )
}
