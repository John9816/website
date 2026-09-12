import { memo, useRef, useState } from 'react'
import { useEditorState, type Editor } from '@tiptap/react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Columns3,
  Eraser,
  Image,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Maximize2,
  Merge,
  Minimize2,
  Minus,
  MoreHorizontal,
  PaintBucket,
  Redo2,
  Rows3,
  Split,
  Strikethrough,
  Table2,
  Trash2,
  Underline,
  Undo2,
  Upload,
} from 'lucide-react'
import { Button, ColorPicker, Popover, Select, Tooltip } from 'antd'
import { EDITOR_TEXT } from './texts'
import { TableSizePicker } from './TableSizePicker'

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6
type BlockValue = 'paragraph' | 'blockquote' | 'codeBlock' | `heading-${HeadingLevel}`

interface ToolbarButtonProps {
  active?: boolean
  danger?: boolean
  disabled?: boolean
  icon: React.ReactNode
  onClick: () => void
  title: string
}

function ToolbarButton({
  active = false,
  danger = false,
  disabled = false,
  icon,
  onClick,
  title,
}: ToolbarButtonProps) {
  return (
    <Tooltip title={title} mouseEnterDelay={0.45}>
      <Button
        size="small"
        type="text"
        className={`editor-toolbar-btn${active ? ' is-active' : ''}${
          danger ? ' is-danger' : ''
        }`}
        icon={icon}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClick}
        disabled={disabled}
        aria-label={title}
      />
    </Tooltip>
  )
}

interface MenuBarProps {
  editor: Editor
  imageUploading: boolean
  isFullscreen: boolean
  onInsertImageUrl: () => void
  onInsertLink: () => void
  onSelectImageFiles: (files: FileList | null) => void
  toggleFullscreen: () => void
}

function resolveBlockValue(editor: Editor): BlockValue {
  const headingLevel = ([1, 2, 3, 4, 5, 6] as const).find((level) =>
    editor.isActive('heading', { level }),
  )
  if (headingLevel) return `heading-${headingLevel}`
  if (editor.isActive('blockquote')) return 'blockquote'
  if (editor.isActive('codeBlock')) return 'codeBlock'
  return 'paragraph'
}

function MenuBarInner({
  editor,
  imageUploading,
  isFullscreen,
  onInsertImageUrl,
  onInsertLink,
  onSelectImageFiles,
  toggleFullscreen,
}: MenuBarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [tablePickerOpen, setTablePickerOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  const state = useEditorState({
    editor,
    selector: ({ editor: activeEditor }) => {
      if (!activeEditor || activeEditor.isDestroyed) return null
      return {
        canUndo: activeEditor.can().undo(),
        canRedo: activeEditor.can().redo(),
        blockValue: resolveBlockValue(activeEditor),
        textColor: activeEditor.getAttributes('textStyle').color as string | undefined,
        highlightColor: activeEditor.getAttributes('highlight').color as string | undefined,
        isBold: activeEditor.isActive('bold'),
        isItalic: activeEditor.isActive('italic'),
        isStrike: activeEditor.isActive('strike'),
        isUnderline: activeEditor.isActive('underline'),
        isInlineCode: activeEditor.isActive('code'),
        isLink: activeEditor.isActive('link'),
        isBulletList: activeEditor.isActive('bulletList'),
        isOrderedList: activeEditor.isActive('orderedList'),
        isTaskList: activeEditor.isActive('taskList'),
        isTableActive: activeEditor.isActive('table'),
        alignLeft: activeEditor.isActive({ textAlign: 'left' }),
        alignCenter: activeEditor.isActive({ textAlign: 'center' }),
        alignRight: activeEditor.isActive({ textAlign: 'right' }),
        canOutdent: activeEditor.can().liftListItem('listItem'),
        canIndent: activeEditor.can().sinkListItem('listItem'),
        canAddRowBefore: activeEditor.can().addRowBefore(),
        canAddRowAfter: activeEditor.can().addRowAfter(),
        canDeleteRow: activeEditor.can().deleteRow(),
        canAddColBefore: activeEditor.can().addColumnBefore(),
        canAddColAfter: activeEditor.can().addColumnAfter(),
        canDeleteCol: activeEditor.can().deleteColumn(),
        canToggleHeaderRow: activeEditor.can().toggleHeaderRow(),
        canToggleHeaderColumn: activeEditor.can().toggleHeaderColumn(),
        canToggleHeaderCell: activeEditor.can().toggleHeaderCell(),
        canMergeCells: activeEditor.can().mergeCells(),
        canSplitCell: activeEditor.can().splitCell(),
        canDeleteTable: activeEditor.can().deleteTable(),
        characterCount: activeEditor.getText().replace(/\s/g, '').length,
      }
    },
  })

  if (!state) return null

  const applyBlock = (value: BlockValue) => {
    const chain = editor.chain().focus()
    if (value === 'paragraph') chain.setParagraph().run()
    else if (value === 'blockquote') chain.toggleBlockquote().run()
    else if (value === 'codeBlock') chain.toggleCodeBlock().run()
    else chain.setHeading({ level: Number(value.slice(8)) as HeadingLevel }).run()
  }

  const moreContent = (
    <div className="editor-more-panel" aria-label="更多格式">
      <div className="editor-more-panel__section">
        <span>文字样式</span>
        <div className="editor-more-panel__row editor-more-panel__row--icons">
          <ToolbarButton title={EDITOR_TEXT.bold} icon={<Bold size={16} />} active={state.isBold} onClick={() => editor.chain().focus().toggleBold().run()} />
          <ToolbarButton title={EDITOR_TEXT.italic} icon={<Italic size={16} />} active={state.isItalic} onClick={() => editor.chain().focus().toggleItalic().run()} />
          <ToolbarButton title={EDITOR_TEXT.underline} icon={<Underline size={16} />} active={state.isUnderline} onClick={() => editor.chain().focus().toggleUnderline().run()} />
          <ToolbarButton title={EDITOR_TEXT.strike} icon={<Strikethrough size={16} />} active={state.isStrike} onClick={() => editor.chain().focus().toggleStrike().run()} />
          <ToolbarButton title={EDITOR_TEXT.inlineCode} icon={<Code size={16} />} active={state.isInlineCode} onClick={() => editor.chain().focus().toggleCode().run()} />
        </div>
      </div>
      <div className="editor-more-panel__section">
        <span>列表</span>
        <div className="editor-more-panel__row editor-more-panel__row--icons">
          <ToolbarButton title={EDITOR_TEXT.bulletList} icon={<List size={16} />} active={state.isBulletList} onClick={() => editor.chain().focus().toggleBulletList().run()} />
          <ToolbarButton title={EDITOR_TEXT.orderedList} icon={<ListOrdered size={16} />} active={state.isOrderedList} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
          <ToolbarButton title={EDITOR_TEXT.taskList} icon={<ListChecks size={16} />} active={state.isTaskList} onClick={() => editor.chain().focus().toggleTaskList().run()} />
        </div>
      </div>
      <div className="editor-more-panel__section">
        <span>颜色</span>
        <div className="editor-more-panel__row">
          <ColorPicker
            size="small"
            value={state.textColor}
            onChange={(color) => editor.chain().focus().setColor(color.toHexString()).run()}
          >
            <Button size="small" icon={<PaintBucket size={15} />}>文字</Button>
          </ColorPicker>
          <ColorPicker
            size="small"
            value={state.highlightColor}
            onChange={(color) =>
              editor.chain().focus().setHighlight({ color: color.toHexString() }).run()
            }
          >
            <Button size="small" icon={<PaintBucket size={15} />}>高亮</Button>
          </ColorPicker>
        </div>
      </div>
      <div className="editor-more-panel__section">
        <span>对齐与缩进</span>
        <div className="editor-more-panel__row editor-more-panel__row--icons">
          <ToolbarButton title={EDITOR_TEXT.alignLeft} icon={<AlignLeft size={16} />} active={state.alignLeft} onClick={() => editor.chain().focus().setTextAlign('left').run()} />
          <ToolbarButton title={EDITOR_TEXT.alignCenter} icon={<AlignCenter size={16} />} active={state.alignCenter} onClick={() => editor.chain().focus().setTextAlign('center').run()} />
          <ToolbarButton title={EDITOR_TEXT.alignRight} icon={<AlignRight size={16} />} active={state.alignRight} onClick={() => editor.chain().focus().setTextAlign('right').run()} />
          <ToolbarButton title={EDITOR_TEXT.outdent} icon={<IndentDecrease size={16} />} disabled={!state.canOutdent} onClick={() => editor.chain().focus().liftListItem('listItem').run()} />
          <ToolbarButton title={EDITOR_TEXT.indent} icon={<IndentIncrease size={16} />} disabled={!state.canIndent} onClick={() => editor.chain().focus().sinkListItem('listItem').run()} />
        </div>
      </div>
      <div className="editor-more-panel__section editor-more-panel__section--commands">
        <Button size="small" type="text" icon={<Minus size={15} />} onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          {EDITOR_TEXT.horizontalRule}
        </Button>
        <Button size="small" type="text" icon={<Eraser size={15} />} onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>
          {EDITOR_TEXT.clearFormatting}
        </Button>
      </div>
      <div className="editor-more-panel__section editor-more-panel__section--insert">
        <span>插入</span>
        <div className="editor-more-panel__insert-grid">
          <Button size="small" icon={<Link size={15} />} onClick={() => { setMoreOpen(false); onInsertLink() }}>
            链接
          </Button>
          <Button size="small" icon={<Upload size={15} />} disabled={imageUploading} onClick={() => { setMoreOpen(false); fileInputRef.current?.click() }}>
            上传图片
          </Button>
          <Button size="small" icon={<Image size={15} />} disabled={imageUploading} onClick={() => { setMoreOpen(false); onInsertImageUrl() }}>
            图片链接
          </Button>
          <Button size="small" icon={<Table2 size={15} />} onClick={() => { editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); setMoreOpen(false) }}>
            3 x 3 表格
          </Button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="editor-menu-bar">
      <div className="editor-menu-bar__groups">
        <div className="menu-group menu-group--history" data-priority="core">
          <ToolbarButton title={EDITOR_TEXT.undo} icon={<Undo2 size={16} />} onClick={() => editor.chain().focus().undo().run()} disabled={!state.canUndo} />
          <ToolbarButton title={EDITOR_TEXT.redo} icon={<Redo2 size={16} />} onClick={() => editor.chain().focus().redo().run()} disabled={!state.canRedo} />
        </div>

        <div className="menu-group menu-group--block" data-priority="core">
          <Select<BlockValue>
            size="small"
            className="editor-toolbar-select editor-toolbar-select--block"
            popupMatchSelectWidth={148}
            value={state.blockValue}
            onChange={applyBlock}
            options={[
              { value: 'paragraph', label: EDITOR_TEXT.paragraph },
              { value: 'heading-1', label: '一级标题' },
              { value: 'heading-2', label: '二级标题' },
              { value: 'heading-3', label: '三级标题' },
              { value: 'heading-4', label: '四级标题' },
              { value: 'blockquote', label: EDITOR_TEXT.quote },
              { value: 'codeBlock', label: EDITOR_TEXT.codeBlock },
            ]}
          />
        </div>

        <div className="menu-group menu-group--marks" data-priority="core">
          <ToolbarButton title={EDITOR_TEXT.bold} icon={<Bold size={16} />} active={state.isBold} onClick={() => editor.chain().focus().toggleBold().run()} />
          <ToolbarButton title={EDITOR_TEXT.italic} icon={<Italic size={16} />} active={state.isItalic} onClick={() => editor.chain().focus().toggleItalic().run()} />
          <ToolbarButton title={EDITOR_TEXT.underline} icon={<Underline size={16} />} active={state.isUnderline} onClick={() => editor.chain().focus().toggleUnderline().run()} />
          <ToolbarButton title={EDITOR_TEXT.strike} icon={<Strikethrough size={16} />} active={state.isStrike} onClick={() => editor.chain().focus().toggleStrike().run()} />
          <ToolbarButton title={EDITOR_TEXT.inlineCode} icon={<Code size={16} />} active={state.isInlineCode} onClick={() => editor.chain().focus().toggleCode().run()} />
        </div>

        <div className="menu-group menu-group--lists" data-priority="medium">
          <ToolbarButton title={EDITOR_TEXT.bulletList} icon={<List size={16} />} active={state.isBulletList} onClick={() => editor.chain().focus().toggleBulletList().run()} />
          <ToolbarButton title={EDITOR_TEXT.orderedList} icon={<ListOrdered size={16} />} active={state.isOrderedList} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
          <ToolbarButton title={EDITOR_TEXT.taskList} icon={<ListChecks size={16} />} active={state.isTaskList} onClick={() => editor.chain().focus().toggleTaskList().run()} />
        </div>

        <div className="menu-group menu-group--insert" data-priority="medium">
          <input
            ref={fileInputRef}
            hidden
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => {
              onSelectImageFiles(event.target.files)
              event.currentTarget.value = ''
            }}
          />
          <ToolbarButton title={EDITOR_TEXT.insertLink} icon={<Link size={16} />} active={state.isLink} onClick={onInsertLink} />
          <ToolbarButton title={imageUploading ? EDITOR_TEXT.uploadingImage : EDITOR_TEXT.uploadImage} icon={<Upload size={16} />} onClick={() => fileInputRef.current?.click()} disabled={imageUploading} />
          <ToolbarButton title={EDITOR_TEXT.insertImageByUrl} icon={<Image size={16} />} onClick={onInsertImageUrl} disabled={imageUploading} />
          <Popover
            open={tablePickerOpen}
            onOpenChange={setTablePickerOpen}
            trigger="click"
            placement="bottomLeft"
            destroyOnHidden
            content={
              <TableSizePicker
                onSelect={(rows, columns) => {
                  editor.chain().focus().insertTable({ rows, cols: columns, withHeaderRow: true }).run()
                  setTablePickerOpen(false)
                }}
              />
            }
          >
            <span className="editor-toolbar-popover-trigger">
              <ToolbarButton title={EDITOR_TEXT.insertTable} icon={<Table2 size={16} />} active={tablePickerOpen} onClick={() => undefined} />
            </span>
          </Popover>
        </div>

        {state.isTableActive && (
          <div className="menu-group menu-group--table-context" data-priority="context">
            <ToolbarButton title={EDITOR_TEXT.addRowBefore} icon={<Rows3 size={16} />} onClick={() => editor.chain().focus().addRowBefore().run()} disabled={!state.canAddRowBefore} />
            <ToolbarButton title={EDITOR_TEXT.addRowAfter} icon={<Rows3 size={16} />} onClick={() => editor.chain().focus().addRowAfter().run()} disabled={!state.canAddRowAfter} />
            <ToolbarButton title={EDITOR_TEXT.deleteRow} icon={<Trash2 size={16} />} onClick={() => editor.chain().focus().deleteRow().run()} disabled={!state.canDeleteRow} danger />
            <ToolbarButton title={EDITOR_TEXT.addColumnBefore} icon={<Columns3 size={16} />} onClick={() => editor.chain().focus().addColumnBefore().run()} disabled={!state.canAddColBefore} />
            <ToolbarButton title={EDITOR_TEXT.addColumnAfter} icon={<Columns3 size={16} />} onClick={() => editor.chain().focus().addColumnAfter().run()} disabled={!state.canAddColAfter} />
            <ToolbarButton title={EDITOR_TEXT.deleteColumn} icon={<Trash2 size={16} />} onClick={() => editor.chain().focus().deleteColumn().run()} disabled={!state.canDeleteCol} danger />
            <ToolbarButton title={EDITOR_TEXT.toggleHeaderRow} icon={<Rows3 size={16} />} onClick={() => editor.chain().focus().toggleHeaderRow().run()} disabled={!state.canToggleHeaderRow} />
            <ToolbarButton title={EDITOR_TEXT.toggleHeaderColumn} icon={<Columns3 size={16} />} onClick={() => editor.chain().focus().toggleHeaderColumn().run()} disabled={!state.canToggleHeaderColumn} />
            <ToolbarButton title={EDITOR_TEXT.toggleHeaderCell} icon={<Table2 size={16} />} onClick={() => editor.chain().focus().toggleHeaderCell().run()} disabled={!state.canToggleHeaderCell} />
            <ToolbarButton title={EDITOR_TEXT.mergeCells} icon={<Merge size={16} />} onClick={() => editor.chain().focus().mergeCells().run()} disabled={!state.canMergeCells} />
            <ToolbarButton title={EDITOR_TEXT.splitCell} icon={<Split size={16} />} onClick={() => editor.chain().focus().splitCell().run()} disabled={!state.canSplitCell} />
            <ToolbarButton title={EDITOR_TEXT.deleteTable} icon={<Trash2 size={16} />} onClick={() => editor.chain().focus().deleteTable().run()} disabled={!state.canDeleteTable} danger />
          </div>
        )}
      </div>

      <div className="editor-menu-bar__actions">
        <span className="editor-char-count">{state.characterCount} {EDITOR_TEXT.characters}</span>
        <Popover
          open={moreOpen}
          onOpenChange={setMoreOpen}
          trigger="click"
          placement="bottomRight"
          destroyOnHidden
          content={moreContent}
        >
          <span className="editor-toolbar-popover-trigger">
            <ToolbarButton title="更多格式" icon={<MoreHorizontal size={17} />} active={moreOpen} onClick={() => undefined} />
          </span>
        </Popover>
        <ToolbarButton
          title={isFullscreen ? EDITOR_TEXT.exitFullscreen : EDITOR_TEXT.fullscreen}
          icon={isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          onClick={toggleFullscreen}
        />
      </div>
    </div>
  )
}

export const MenuBar = memo(MenuBarInner)
