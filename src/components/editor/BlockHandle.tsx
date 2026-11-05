import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/react'
import { Popover } from 'antd'
import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Trash2 } from 'lucide-react'
import { TextSelection } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import {
  Code2,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Table2,
  Type,
} from 'lucide-react'
import { EDITOR_TEXT } from './texts'
import { TurnIntoMenu } from './TurnIntoMenu'

interface BlockHandleProps {
  editor: Editor
  onInsertImageByUrl: () => void
}

interface HandlePosition {
  top: number
  left: number
}

interface DropLine {
  top: number
  left: number
  width: number
}

interface TopLevelBlock {
  node: PMNode
  pos: number
  size: number
}

interface HoveredBlock {
  index: number
  el: HTMLElement
}

interface DragState {
  fromIndex: number
  target?: number
  after?: boolean
}

function collectTopLevelBlocks(doc: PMNode): TopLevelBlock[] {
  const blocks: TopLevelBlock[] = []
  doc.forEach((node, offset) => {
    blocks.push({ node, pos: offset, size: node.nodeSize })
  })
  return blocks
}

function blockChildren(pm: HTMLElement): HTMLElement[] {
  return Array.from(pm.children).filter((child) => {
    if (!(child instanceof HTMLElement)) return false
    if (child.classList.contains('ProseMirror-gapcursor')) return false
    if (child.classList.contains('ProseMirror-trailingBreak')) return false
    const rect = child.getBoundingClientRect()
    return rect.height > 0 || rect.width > 0
  }) as HTMLElement[]
}

export function BlockHandle({ editor, onInsertImageByUrl }: BlockHandleProps) {
  const [position, setPosition] = useState<HandlePosition | null>(null)
  const [dropLine, setDropLine] = useState<DropLine | null>(null)
  const [insertMenuOpen, setInsertMenuOpen] = useState(false)
  const [blockMenuOpen, setBlockMenuOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const hoveredRef = useRef<HoveredBlock | null>(null)
  const dragStateRef = useRef<DragState | null>(null)

  const getPm = useCallback((): HTMLElement | null => {
    const dom = editor.view?.dom
    return dom instanceof HTMLElement ? dom : null
  }, [editor])

  const updatePosition = useCallback(() => {
    const hovered = hoveredRef.current
    const pm = getPm()
    if (!hovered || !pm || !hovered.el.isConnected) {
      setPosition(null)
      return
    }
    const pmRect = pm.getBoundingClientRect()
    const rect = hovered.el.getBoundingClientRect()
    setPosition({
      top: rect.top + 2,
      left: Math.max(8, pmRect.left - 38),
    })
  }, [getPm])

  const findBlockAt = useCallback(
    (clientX: number, clientY: number, allowWideX = false): HoveredBlock | null => {
      const pm = getPm()
      if (!pm) return null
      const pmRect = pm.getBoundingClientRect()
      const withinX =
        allowWideX || (clientX >= pmRect.left - 56 && clientX <= pmRect.right + 56)
      if (!withinX) return null
      const children = blockChildren(pm)
      let nearest: { index: number; el: HTMLElement; distance: number } | null = null
      for (let index = 0; index < children.length; index += 1) {
        const el = children[index]
        const rect = el.getBoundingClientRect()
        if (clientY >= rect.top && clientY <= rect.bottom) {
          return { index, el }
        }
        const distance = clientY < rect.top ? rect.top - clientY : clientY - rect.bottom
        if (distance <= 28 && (!nearest || distance < nearest.distance)) {
          nearest = { index, el, distance }
        }
      }
      return nearest ? { index: nearest.index, el: nearest.el } : null
    },
    [getPm],
  )

  // 悬停跟踪：靠近内容块时显示手柄
  useEffect(() => {
    if (!editor.isEditable) return undefined
    let frame = 0
    const schedule = (fn: () => void) => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        fn()
      })
    }

    const onMouseMove = (event: MouseEvent) => {
      schedule(() => {
        if (dragStateRef.current) return
        const target = event.target as HTMLElement | null
        if (
          insertMenuOpen ||
          blockMenuOpen ||
          target?.closest?.('.editor-block-handle') ||
          target?.closest?.('.editor-block-insert-menu') ||
          target?.closest?.('.editor-block-menu') ||
          target?.closest?.('.ant-popover')
        ) {
          return
        }
        const found = findBlockAt(event.clientX, event.clientY)
        if (found) {
          hoveredRef.current = found
          updatePosition()
          return
        }
        const pm = getPm()
        if (!pm) return
        const pmRect = pm.getBoundingClientRect()
        const far =
          event.clientY < pmRect.top - 96 ||
          event.clientY > pmRect.bottom + 96 ||
          event.clientX < pmRect.left - 96 ||
          event.clientX > pmRect.right + 96
        if (far) {
          hoveredRef.current = null
          setPosition(null)
        }
      })
    }

    document.addEventListener('mousemove', onMouseMove)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [blockMenuOpen, editor, findBlockAt, getPm, insertMenuOpen, updatePosition])

  // 滚动 / 缩放时重新定位
  useEffect(() => {
    let frame = 0
    const onScrollOrResize = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        updatePosition()
      })
    }
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [updatePosition])

  // 文档变化后块索引失效，清除手柄
  useEffect(() => {
    const onUpdate = () => {
      hoveredRef.current = null
      setPosition(null)
      setInsertMenuOpen(false)
      setBlockMenuOpen(false)
    }
    editor.on('update', onUpdate)
    return () => {
      editor.off('update', onUpdate)
    }
  }, [editor])

  const focusAtBlockEnd = useCallback(() => {
    const hovered = hoveredRef.current
    if (!hovered) {
      editor.commands.focus('end')
      return
    }
    const blocks = collectTopLevelBlocks(editor.state.doc)
    const target = blocks[hovered.index]
    if (!target) {
      editor.commands.focus('end')
      return
    }
    const pos = Math.max(0, target.pos + target.size - 1)
    const selection = TextSelection.near(editor.state.doc.resolve(pos))
    if (selection) {
      editor.view.dispatch(editor.state.tr.setSelection(selection))
    }
    editor.commands.focus()
  }, [editor])

  // 将光标移入手柄对应的块，供“转换为”等基于选区的命令使用
  const selectHoveredBlock = useCallback(() => {
    const hovered = hoveredRef.current
    const blocks = collectTopLevelBlocks(editor.state.doc)
    const target = hovered ? blocks[hovered.index] : undefined
    if (!target) {
      editor.commands.focus()
      return
    }
    const pos = Math.max(0, target.pos + 1)
    const selection = TextSelection.near(editor.state.doc.resolve(pos))
    if (selection) {
      editor.view.dispatch(editor.state.tr.setSelection(selection))
    }
    editor.commands.focus()
  }, [editor])

  const insertParagraphThen = useCallback(
    (transform: (activeEditor: Editor) => void) => {
      const hovered = hoveredRef.current
      const blocks = collectTopLevelBlocks(editor.state.doc)
      const target = hovered ? blocks[hovered.index] : undefined
      const pos = target ? target.pos + target.size : editor.state.doc.content.size
      const paragraph = editor.state.schema.nodes.paragraph.create()
      const tr = editor.state.tr.insert(pos, paragraph)
      const selection = TextSelection.near(tr.doc.resolve(pos + 1))
      if (selection) tr.setSelection(selection)
      editor.view.dispatch(tr)
      editor.commands.focus()
      transform(editor)
      setInsertMenuOpen(false)
      hoveredRef.current = null
      setPosition(null)
    },
    [editor],
  )

  const insertMenuItems: { label: string; icon: ReactNode; run: () => void }[] = [
    {
      label: EDITOR_TEXT.slashParagraph,
      icon: <Type size={15} />,
      run: () => insertParagraphThen((active) => active.chain().focus().setParagraph().run()),
    },
    {
      label: EDITOR_TEXT.slashHeading1,
      icon: <Heading1 size={15} />,
      run: () => insertParagraphThen((active) => active.chain().focus().setHeading({ level: 1 }).run()),
    },
    {
      label: EDITOR_TEXT.slashHeading2,
      icon: <Heading2 size={15} />,
      run: () => insertParagraphThen((active) => active.chain().focus().setHeading({ level: 2 }).run()),
    },
    {
      label: EDITOR_TEXT.slashHeading3,
      icon: <Heading3 size={15} />,
      run: () => insertParagraphThen((active) => active.chain().focus().setHeading({ level: 3 }).run()),
    },
    {
      label: EDITOR_TEXT.slashBulletList,
      icon: <List size={15} />,
      run: () => insertParagraphThen((active) => active.chain().focus().toggleBulletList().run()),
    },
    {
      label: EDITOR_TEXT.slashOrderedList,
      icon: <ListOrdered size={15} />,
      run: () => insertParagraphThen((active) => active.chain().focus().toggleOrderedList().run()),
    },
    {
      label: EDITOR_TEXT.slashTaskList,
      icon: <ListChecks size={15} />,
      run: () => insertParagraphThen((active) => active.chain().focus().toggleTaskList().run()),
    },
    {
      label: EDITOR_TEXT.slashQuote,
      icon: <Quote size={15} />,
      run: () => insertParagraphThen((active) => active.chain().focus().toggleBlockquote().run()),
    },
    {
      label: EDITOR_TEXT.slashCodeBlock,
      icon: <Code2 size={15} />,
      run: () => insertParagraphThen((active) => active.chain().focus().toggleCodeBlock().run()),
    },
    {
      label: EDITOR_TEXT.slashDivider,
      icon: <Minus size={15} />,
      run: () => insertParagraphThen((active) => active.chain().focus().setHorizontalRule().run()),
    },
    {
      label: EDITOR_TEXT.slashTable,
      icon: <Table2 size={15} />,
      run: () =>
        insertParagraphThen((active) =>
          active.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
        ),
    },
    {
      label: EDITOR_TEXT.slashImage,
      icon: <ImagePlus size={15} />,
      run: () => {
        setInsertMenuOpen(false)
        focusAtBlockEnd()
        onInsertImageByUrl()
      },
    },
  ]

  const moveBlock = useCallback(
    (fromIndex: number, toIndex: number, placeAfter: boolean) => {
      const view = editor.view
      const { state } = view
      const blocks = collectTopLevelBlocks(state.doc)
      const from = blocks[fromIndex]
      const to = blocks[toIndex]
      if (!from || !to) return
      const insertPos = placeAfter ? to.pos + to.size : to.pos
      if (insertPos === from.pos || insertPos === from.pos + from.size) return
      const tr = state.tr
      const nodeToMove = from.node
      tr.delete(from.pos, from.pos + from.size)
      const adjusted = insertPos > from.pos + from.size ? insertPos - from.size : insertPos
      tr.insert(adjusted, nodeToMove)
      const selection = TextSelection.near(tr.doc.resolve(adjusted + 1))
      if (selection) tr.setSelection(selection)
      view.dispatch(tr)
      view.focus()
    },
    [editor],
  )

  const moveHoveredBlock = useCallback(
    (direction: -1 | 1) => {
      const hovered = hoveredRef.current
      if (!hovered) return
      moveBlock(hovered.index, hovered.index + direction, direction === 1)
      setBlockMenuOpen(false)
      hoveredRef.current = null
      setPosition(null)
    },
    [moveBlock],
  )

  const duplicateHoveredBlock = useCallback(() => {
    const hovered = hoveredRef.current
    const blocks = collectTopLevelBlocks(editor.state.doc)
    const target = hovered ? blocks[hovered.index] : undefined
    if (!target) return
    const pos = target.pos + target.size
    const tr = editor.state.tr.insert(pos, target.node)
    const selection = TextSelection.near(tr.doc.resolve(pos + 1))
    if (selection) tr.setSelection(selection)
    editor.view.dispatch(tr)
    editor.view.focus()
    setBlockMenuOpen(false)
    hoveredRef.current = null
    setPosition(null)
  }, [editor])

  const deleteHoveredBlock = useCallback(() => {
    const hovered = hoveredRef.current
    const blocks = collectTopLevelBlocks(editor.state.doc)
    const target = hovered ? blocks[hovered.index] : undefined
    if (!target) return
    const tr = editor.state.tr.delete(target.pos, target.pos + target.size)
    // 删除最后一个块时补一个空段落，保证文档始终有内容
    if (tr.doc.content.size === 0) {
      tr.insert(0, editor.state.schema.nodes.paragraph.create())
    }
    const focusPos = Math.min(target.pos, tr.doc.content.size)
    const selection = TextSelection.near(tr.doc.resolve(focusPos))
    if (selection) tr.setSelection(selection)
    editor.view.dispatch(tr)
    editor.view.focus()
    setBlockMenuOpen(false)
    hoveredRef.current = null
    setPosition(null)
  }, [editor])

  const startDrag = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      const hovered = hoveredRef.current
      if (!hovered) return
      dragStateRef.current = { fromIndex: hovered.index }
      setDragging(true)
      setBlockMenuOpen(false)
      setInsertMenuOpen(false)
      setPosition(null)

      const onMove = (moveEvent: MouseEvent) => {
        const pm = getPm()
        if (!pm) return
        const found = findBlockAt(moveEvent.clientX, moveEvent.clientY, true)
        if (!found) {
          setDropLine(null)
          return
        }
        const rect = found.el.getBoundingClientRect()
        const after = moveEvent.clientY > rect.top + rect.height / 2
        const pmRect = pm.getBoundingClientRect()
        setDropLine({
          top: after ? rect.bottom : rect.top,
          left: pmRect.left,
          width: pmRect.width,
        })
        if (dragStateRef.current) {
          dragStateRef.current.target = found.index
          dragStateRef.current.after = after
        }
      }

      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        const drag = dragStateRef.current
        dragStateRef.current = null
        setDragging(false)
        setDropLine(null)
        if (drag && typeof drag.target === 'number') {
          moveBlock(drag.fromIndex, drag.target, drag.after ?? false)
          hoveredRef.current = null
          setPosition(null)
        }
        // 未发生拖拽（纯点击）时恢复手柄显示，由 Popover click 打开块菜单
        updatePosition()
      }

      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [findBlockAt, getPm, moveBlock, updatePosition],
  )

  if (!editor.isEditable) return null

  const insertMenu = (
    <div className="editor-block-insert-menu" role="menu" aria-label={EDITOR_TEXT.addBlockBelow}>
      {insertMenuItems.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className="editor-block-insert-menu__item"
          onMouseDown={(event) => event.preventDefault()}
          onClick={item.run}
        >
          <span className="editor-block-insert-menu__icon" aria-hidden>
            {item.icon}
          </span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  )

  const blockMenu = (
    <div className="editor-block-menu" role="menu" aria-label={EDITOR_TEXT.blockMenu}>
      <TurnIntoMenu
        editor={editor}
        onApplied={() => {
          setBlockMenuOpen(false)
          hoveredRef.current = null
          setPosition(null)
        }}
      />
      <div className="editor-block-menu__divider" role="separator" />
      <button
        type="button"
        role="menuitem"
        className="editor-block-menu__item"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          selectHoveredBlock()
          moveHoveredBlock(-1)
        }}
      >
        <span className="editor-block-menu__icon" aria-hidden>
          <ArrowUp size={15} />
        </span>
        <span className="editor-block-menu__label">{EDITOR_TEXT.moveBlockUp}</span>
        <span className="editor-block-menu__hint">{EDITOR_TEXT.moveBlockUpHint}</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="editor-block-menu__item"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          selectHoveredBlock()
          moveHoveredBlock(1)
        }}
      >
        <span className="editor-block-menu__icon" aria-hidden>
          <ArrowDown size={15} />
        </span>
        <span className="editor-block-menu__label">{EDITOR_TEXT.moveBlockDown}</span>
        <span className="editor-block-menu__hint">{EDITOR_TEXT.moveBlockDownHint}</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="editor-block-menu__item"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          selectHoveredBlock()
          duplicateHoveredBlock()
        }}
      >
        <span className="editor-block-menu__icon" aria-hidden>
          <Copy size={15} />
        </span>
        <span className="editor-block-menu__label">{EDITOR_TEXT.duplicateBlock}</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="editor-block-menu__item editor-block-menu__item--danger"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          selectHoveredBlock()
          deleteHoveredBlock()
        }}
      >
        <span className="editor-block-menu__icon" aria-hidden>
          <Trash2 size={15} />
        </span>
        <span className="editor-block-menu__label">{EDITOR_TEXT.deleteBlock}</span>
      </button>
    </div>
  )

  return createPortal(
    <>
      {position && !dragging ? (
        <div
          className="editor-block-handle"
          style={{ top: position.top, left: position.left }}
          aria-label={EDITOR_TEXT.dragHandle}
        >
          <Popover
            open={insertMenuOpen}
            onOpenChange={setInsertMenuOpen}
            trigger="click"
            placement="bottomLeft"
            overlayClassName="editor-block-insert-popover"
            content={insertMenu}
          >
            <button
              type="button"
              className="editor-block-handle__btn"
              title={EDITOR_TEXT.addBlockBelow}
              aria-label={EDITOR_TEXT.addBlockBelow}
              onMouseDown={(event) => event.preventDefault()}
            >
              <Plus size={15} />
            </button>
          </Popover>
          <Popover
            open={blockMenuOpen}
            onOpenChange={(open) => {
              setBlockMenuOpen(open)
              if (!open) {
                hoveredRef.current = null
                setPosition(null)
              }
            }}
            trigger="click"
            placement="bottomLeft"
            overlayClassName="editor-block-menu-popover"
            content={blockMenu}
          >
            <button
              type="button"
              className="editor-block-handle__btn editor-block-handle__btn--drag"
              title={EDITOR_TEXT.blockMenu}
              aria-label={EDITOR_TEXT.blockMenu}
              onMouseDown={startDrag}
            >
              <GripVertical size={15} />
            </button>
          </Popover>
        </div>
      ) : null}
      {dropLine ? (
        <div
          className="editor-drop-indicator"
          style={{ top: dropLine.top, left: dropLine.left, width: dropLine.width }}
          aria-hidden
        />
      ) : null}
    </>,
    document.body,
  )
}
