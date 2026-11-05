import { memo, useRef, useState } from 'react'
import { useEditorState, type Editor } from '@tiptap/react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Crosshair,
  Eraser,
  IndentDecrease,
  IndentIncrease,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  PaintBucket,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
  Code,
  Minus,
} from 'lucide-react'
import { Button, ColorPicker, Popover, Tooltip } from 'antd'
import { EDITOR_TEXT } from './texts'

const TEXT_PRESETS = [
  '#1f2328',
  '#e06c75',
  '#d19a66',
  '#61afef',
  '#98c379',
  '#c678dd',
  '#167d70',
]

const HIGHLIGHT_PRESETS = [
  '#fff3bf',
  '#ffd8a8',
  '#d3f9d8',
  '#a5d8ff',
  '#eebefa',
  'transparent',
]

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
  isFullscreen: boolean
  isFocusMode: boolean
  onToggleFocusMode: () => void
  onSelectImageFiles: (files: FileList | null) => void
  toggleFullscreen: () => void
}

function MenuBarInner({
  editor,
  isFullscreen,
  isFocusMode,
  onToggleFocusMode,
  onSelectImageFiles,
  toggleFullscreen,
}: MenuBarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)

  const state = useEditorState({
    editor,
    selector: ({ editor: activeEditor }) => {
      if (!activeEditor || activeEditor.isDestroyed) return null
      return {
        canUndo: activeEditor.can().undo(),
        canRedo: activeEditor.can().redo(),
        textColor: activeEditor.getAttributes('textStyle').color as string | undefined,
        highlightColor: activeEditor.getAttributes('highlight').color as string | undefined,
        isUnderline: activeEditor.isActive('underline'),
        isStrike: activeEditor.isActive('strike'),
        isInlineCode: activeEditor.isActive('code'),
        alignLeft: activeEditor.isActive({ textAlign: 'left' }),
        alignCenter: activeEditor.isActive({ textAlign: 'center' }),
        alignRight: activeEditor.isActive({ textAlign: 'right' }),
        canOutdent: activeEditor.can().liftListItem('listItem'),
        canIndent: activeEditor.can().sinkListItem('listItem'),
        characterCount: activeEditor.getText().replace(/\s/g, '').length,
        readingMinutes: Math.max(1, Math.round(activeEditor.getText().replace(/\s/g, '').length / 400)),
      }
    },
  })

  if (!state) return null

  const moreContent = (
    <div className="editor-more-panel" aria-label={EDITOR_TEXT.moreFormat}>
      <div className="editor-more-panel__section">
        <span>{EDITOR_TEXT.textStyle}</span>
        <div className="editor-more-panel__row editor-more-panel__row--icons">
          <ToolbarButton title={EDITOR_TEXT.underline} icon={<Underline size={16} />} active={state.isUnderline} onClick={() => editor.chain().focus().toggleUnderline().run()} />
          <ToolbarButton title={EDITOR_TEXT.strike} icon={<Strikethrough size={16} />} active={state.isStrike} onClick={() => editor.chain().focus().toggleStrike().run()} />
          <ToolbarButton title={EDITOR_TEXT.inlineCode} icon={<Code size={16} />} active={state.isInlineCode} onClick={() => editor.chain().focus().toggleCode().run()} />
        </div>
      </div>
      <div className="editor-more-panel__section">
        <span>{EDITOR_TEXT.color}</span>
        <div className="editor-more-panel__row">
          <ColorPicker
            size="small"
            value={state.textColor}
            presets={[{ label: EDITOR_TEXT.textColor, colors: TEXT_PRESETS }]}
            onChange={(color) => editor.chain().focus().setColor(color.toHexString()).run()}
          >
            <Button size="small" icon={<PaintBucket size={15} />}>{EDITOR_TEXT.textColor}</Button>
          </ColorPicker>
          <ColorPicker
            size="small"
            value={state.highlightColor}
            presets={[{ label: EDITOR_TEXT.highlightColor, colors: HIGHLIGHT_PRESETS }]}
            onChange={(color) =>
              editor.chain().focus().setHighlight({ color: color.toHexString() }).run()
            }
          >
            <Button size="small" icon={<PaintBucket size={15} />}>{EDITOR_TEXT.highlightColor}</Button>
          </ColorPicker>
        </div>
      </div>
      <div className="editor-more-panel__section">
        <span>{EDITOR_TEXT.alignAndIndent}</span>
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
        <Button
          size="small"
          type="text"
          icon={<Eraser size={15} />}
          onClick={() => {
            editor.chain().focus().unsetAllMarks().clearNodes().run()
            setMoreOpen(false)
          }}
        >
          {EDITOR_TEXT.clearFormatting}
        </Button>
      </div>
      <div className="editor-more-panel__section editor-more-panel__section--commands">
        <input
          ref={fileInputRef}
          hidden
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => {
            onSelectImageFiles(event.target.files)
            event.currentTarget.value = ''
            setMoreOpen(false)
          }}
        />
        <Button size="small" type="text" icon={<PaintBucket size={15} />} onClick={() => fileInputRef.current?.click()}>
          {EDITOR_TEXT.uploadImage}
        </Button>
      </div>
    </div>
  )

  return (
    <div className="editor-menu-bar">
      <div className="editor-menu-bar__groups">
        <ToolbarButton
          title={EDITOR_TEXT.undo}
          icon={<Undo2 size={16} />}
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!state.canUndo}
        />
        <ToolbarButton
          title={EDITOR_TEXT.redo}
          icon={<Redo2 size={16} />}
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!state.canRedo}
        />
      </div>

      <div className="editor-menu-bar__actions">
        <span className="editor-char-count" title={`${state.characterCount} ${EDITOR_TEXT.characters}`}>
          {state.characterCount} {EDITOR_TEXT.characters}
          <span className="editor-char-count__reading">
            {EDITOR_TEXT.readingTime} {state.readingMinutes} {EDITOR_TEXT.readingTimeUnit}
          </span>
        </span>
        <ToolbarButton
          title={isFocusMode ? EDITOR_TEXT.exitFocusMode : EDITOR_TEXT.focusMode}
          icon={<Crosshair size={16} />}
          active={isFocusMode}
          onClick={onToggleFocusMode}
        />
        <Popover
          open={moreOpen}
          onOpenChange={setMoreOpen}
          trigger="click"
          placement="bottomRight"
          overlayClassName="editor-more-popover"
          content={moreContent}
        >
          <span className="editor-toolbar-popover-trigger">
            <ToolbarButton title={EDITOR_TEXT.moreFormat} icon={<MoreHorizontal size={17} />} active={moreOpen} onClick={() => undefined} />
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
