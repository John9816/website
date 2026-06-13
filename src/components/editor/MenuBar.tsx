import { memo, useRef } from 'react'
import { useEditorState, type Editor } from '@tiptap/react'
import {
  AlignCenterOutlined,
  AlignLeftOutlined,
  AlignRightOutlined,
  BgColorsOutlined,
  BoldOutlined,
  CheckOutlined,
  ClearOutlined,
  CodeOutlined,
  DeleteOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  HighlightOutlined,
  ItalicOutlined,
  LeftOutlined,
  LinkOutlined,
  LoadingOutlined,
  MinusOutlined,
  OrderedListOutlined,
  PictureOutlined,
  RedoOutlined,
  RightOutlined,
  TableOutlined,
  UnderlineOutlined,
  UndoOutlined,
  UnorderedListOutlined,
  UploadOutlined,
  VerticalLeftOutlined,
  VerticalRightOutlined,
} from '@ant-design/icons'
import { Button, ColorPicker, Select, Tooltip } from 'antd'
import { EDITOR_TEXT } from './texts'

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

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
    <Tooltip title={title}>
      <Button
        size="small"
        type="text"
        className={`editor-toolbar-btn${active ? ' is-active' : ''}${
          danger ? ' is-danger' : ''
        }`}
        icon={icon}
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
  characterCount?: number
  onInsertImageUrl: () => void
  onInsertLink: () => void
  onSelectImageFiles: (files: FileList | null) => void
  toggleFullscreen: () => void
}

function MenuBarInner({
  editor,
  imageUploading,
  isFullscreen,
  characterCount,
  onInsertImageUrl,
  onInsertLink,
  onSelectImageFiles,
  toggleFullscreen,
}: MenuBarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const state = useEditorState({
    editor,
    selector: ({ editor: ed }) => {
      if (!ed) return null
      const headingLevel: HeadingLevel | undefined = ([1, 2, 3, 4, 5, 6] as const).find((level) =>
        ed.isActive('heading', { level }),
      )
      const blockValue = ed.isActive('blockquote')
        ? 'blockquote'
        : ed.isActive('codeBlock')
          ? 'codeBlock'
          : 'paragraph'
      return {
        canUndo: ed.can().undo(),
        canRedo: ed.can().redo(),
        headingLevel,
        blockValue,
        textColor: ed.getAttributes('textStyle').color as string | undefined,
        isBold: ed.isActive('bold'),
        isItalic: ed.isActive('italic'),
        isUnderline: ed.isActive('underline'),
        isInlineCode: ed.isActive('code'),
        isHighlight: ed.isActive('highlight'),
        isLink: ed.isActive('link'),
        isBulletList: ed.isActive('bulletList'),
        isOrderedList: ed.isActive('orderedList'),
        isTaskList: ed.isActive('taskList'),
        alignLeft: ed.isActive({ textAlign: 'left' }),
        alignCenter: ed.isActive({ textAlign: 'center' }),
        alignRight: ed.isActive({ textAlign: 'right' }),
        canAddRowBefore: ed.can().addRowBefore(),
        canAddRowAfter: ed.can().addRowAfter(),
        canDeleteRow: ed.can().deleteRow(),
        canAddColBefore: ed.can().addColumnBefore(),
        canAddColAfter: ed.can().addColumnAfter(),
        canDeleteCol: ed.can().deleteColumn(),
        canDeleteTable: ed.can().deleteTable(),
      }
    },
  })

  if (!state) return null

  return (
    <div className="editor-menu-bar">
      <div className="editor-menu-bar__groups">
        <div className="menu-group menu-group--history">
          <ToolbarButton
            title={EDITOR_TEXT.undo}
            icon={<UndoOutlined />}
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!state.canUndo}
          />
          <ToolbarButton
            title={EDITOR_TEXT.redo}
            icon={<RedoOutlined />}
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!state.canRedo}
          />
        </div>

        <div className="menu-group menu-group--field">
          <Select
            size="small"
            className="editor-toolbar-select"
            placeholder={EDITOR_TEXT.heading}
            popupMatchSelectWidth={false}
            value={state.headingLevel}
            onChange={(level: HeadingLevel) =>
              editor.chain().focus().toggleHeading({ level }).run()
            }
            options={[
              { value: 1, label: 'H1' },
              { value: 2, label: 'H2' },
              { value: 3, label: 'H3' },
              { value: 4, label: 'H4' },
              { value: 5, label: 'H5' },
              { value: 6, label: 'H6' },
            ]}
          />
          <Select
            size="small"
            className="editor-toolbar-select"
            popupMatchSelectWidth={false}
            value={state.blockValue}
            onChange={(block: string) => {
              if (block === 'paragraph') {
                editor.chain().focus().setParagraph().run()
                return
              }
              if (block === 'blockquote') {
                editor.chain().focus().toggleBlockquote().run()
                return
              }
              editor.chain().focus().toggleCodeBlock().run()
            }}
            options={[
              { value: 'paragraph', label: EDITOR_TEXT.paragraph },
              { value: 'blockquote', label: EDITOR_TEXT.quote },
              { value: 'codeBlock', label: EDITOR_TEXT.codeBlock },
            ]}
          />
        </div>

        <div className="menu-group menu-group--color">
          <Tooltip title={EDITOR_TEXT.textColor}>
            <ColorPicker
              size="small"
              className="editor-toolbar-color"
              value={state.textColor}
              trigger="click"
              onChange={(color) => editor.chain().focus().setColor(color.toHexString()).run()}
            >
              <Button
                size="small"
                type="text"
                className="editor-toolbar-btn"
                icon={<BgColorsOutlined />}
                aria-label={EDITOR_TEXT.textColor}
              />
            </ColorPicker>
          </Tooltip>
          <Tooltip title={EDITOR_TEXT.highlightColor}>
            <ColorPicker
              size="small"
              className="editor-toolbar-color"
              trigger="click"
              onChange={(color) =>
                editor.chain().focus().toggleHighlight({ color: color.toHexString() }).run()
              }
            >
              <Button
                size="small"
                type="text"
                className={`editor-toolbar-btn${state.isHighlight ? ' is-active' : ''}`}
                icon={<HighlightOutlined />}
                aria-label={EDITOR_TEXT.highlightColor}
              />
            </ColorPicker>
          </Tooltip>
        </div>

        <div className="menu-group menu-group--marks">
          <ToolbarButton
            title={EDITOR_TEXT.bold}
            icon={<BoldOutlined />}
            active={state.isBold}
            onClick={() => editor.chain().focus().toggleBold().run()}
          />
          <ToolbarButton
            title={EDITOR_TEXT.italic}
            icon={<ItalicOutlined />}
            active={state.isItalic}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          />
          <ToolbarButton
            title={EDITOR_TEXT.underline}
            icon={<UnderlineOutlined />}
            active={state.isUnderline}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          />
          <ToolbarButton
            title={EDITOR_TEXT.inlineCode}
            icon={<CodeOutlined />}
            active={state.isInlineCode}
            onClick={() => editor.chain().focus().toggleCode().run()}
          />
        </div>

        <div className="menu-group menu-group--align">
          <ToolbarButton
            title={EDITOR_TEXT.alignLeft}
            icon={<AlignLeftOutlined />}
            active={state.alignLeft}
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
          />
          <ToolbarButton
            title={EDITOR_TEXT.alignCenter}
            icon={<AlignCenterOutlined />}
            active={state.alignCenter}
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
          />
          <ToolbarButton
            title={EDITOR_TEXT.alignRight}
            icon={<AlignRightOutlined />}
            active={state.alignRight}
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
          />
        </div>

        <div className="menu-group menu-group--lists">
          <ToolbarButton
            title={EDITOR_TEXT.bulletList}
            icon={<UnorderedListOutlined />}
            active={state.isBulletList}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          />
          <ToolbarButton
            title={EDITOR_TEXT.orderedList}
            icon={<OrderedListOutlined />}
            active={state.isOrderedList}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          />
          <ToolbarButton
            title={EDITOR_TEXT.taskList}
            icon={<CheckOutlined />}
            active={state.isTaskList}
            onClick={() => editor.chain().focus().toggleTaskList().run()}
          />
        </div>

        <div className="menu-group menu-group--indent">
          <ToolbarButton
            title={EDITOR_TEXT.outdent}
            icon={<LeftOutlined />}
            onClick={() => editor.chain().focus().liftListItem('listItem').run()}
          />
          <ToolbarButton
            title={EDITOR_TEXT.indent}
            icon={<RightOutlined />}
            onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
          />
        </div>

        <div className="menu-group menu-group--insert">
          <input
            ref={fileInputRef}
            hidden
            type="file"
            accept="image/*"
            onChange={(event) => {
              onSelectImageFiles(event.target.files)
              event.currentTarget.value = ''
            }}
          />
          <ToolbarButton
            title={imageUploading ? EDITOR_TEXT.uploadingImage : EDITOR_TEXT.uploadImage}
            icon={imageUploading ? <LoadingOutlined /> : <UploadOutlined />}
            onClick={() => fileInputRef.current?.click()}
            disabled={imageUploading}
          />
          <ToolbarButton
            title={EDITOR_TEXT.insertImageByUrl}
            icon={<PictureOutlined />}
            onClick={onInsertImageUrl}
            disabled={imageUploading}
          />
          <ToolbarButton
            title={EDITOR_TEXT.insertTable}
            icon={<TableOutlined />}
            onClick={() =>
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
          />
        </div>

        <div className="menu-group menu-group--table-edit">
          <ToolbarButton
            title={EDITOR_TEXT.addRowBefore}
            icon={<VerticalLeftOutlined />}
            onClick={() => editor.chain().focus().addRowBefore().run()}
            disabled={!state.canAddRowBefore}
          />
          <ToolbarButton
            title={EDITOR_TEXT.addRowAfter}
            icon={<VerticalRightOutlined />}
            onClick={() => editor.chain().focus().addRowAfter().run()}
            disabled={!state.canAddRowAfter}
          />
          <ToolbarButton
            title={EDITOR_TEXT.deleteRow}
            icon={<MinusOutlined />}
            onClick={() => editor.chain().focus().deleteRow().run()}
            disabled={!state.canDeleteRow}
          />
          <ToolbarButton
            title={EDITOR_TEXT.addColumnBefore}
            icon={<LeftOutlined />}
            onClick={() => editor.chain().focus().addColumnBefore().run()}
            disabled={!state.canAddColBefore}
          />
          <ToolbarButton
            title={EDITOR_TEXT.addColumnAfter}
            icon={<RightOutlined />}
            onClick={() => editor.chain().focus().addColumnAfter().run()}
            disabled={!state.canAddColAfter}
          />
          <ToolbarButton
            title={EDITOR_TEXT.deleteColumn}
            icon={<MinusOutlined />}
            onClick={() => editor.chain().focus().deleteColumn().run()}
            disabled={!state.canDeleteCol}
          />
          <ToolbarButton
            title={EDITOR_TEXT.deleteTable}
            icon={<DeleteOutlined />}
            onClick={() => editor.chain().focus().deleteTable().run()}
            disabled={!state.canDeleteTable}
            danger
          />
        </div>
      </div>

      <div className="editor-menu-bar__actions">
        {typeof characterCount === 'number' && (
          <span className="editor-char-count">
            {characterCount} {EDITOR_TEXT.characters}
          </span>
        )}
        <span className="editor-toolbar-hint">{EDITOR_TEXT.toolbarHint}</span>
        <ToolbarButton
          title={EDITOR_TEXT.insertLink}
          icon={<LinkOutlined />}
          active={state.isLink}
          onClick={onInsertLink}
        />
        <ToolbarButton
          title={EDITOR_TEXT.clearFormatting}
          icon={<ClearOutlined />}
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
        />
        <ToolbarButton
          title={isFullscreen ? EDITOR_TEXT.exitFullscreen : EDITOR_TEXT.fullscreen}
          icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
          onClick={toggleFullscreen}
        />
      </div>
    </div>
  )
}

export const MenuBar = memo(MenuBarInner)
