import { memo, useEffect, useState } from 'react'
import { BubbleMenu } from '@tiptap/react/menus'
import { useEditorState, type Editor } from '@tiptap/react'
import { Button, ColorPicker, Input, Popover, Tooltip } from 'antd'
import {
  Bold,
  Code,
  Eraser,
  Highlighter,
  Italic,
  Link,
  PaintBucket,
  Pilcrow,
  Strikethrough,
  Underline,
} from 'lucide-react'
import { EDITOR_TEXT } from './texts'
import { TurnIntoMenu } from './TurnIntoMenu'

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

interface Props {
  editor: Editor
  onInsertLink: () => void
}

function BubbleMenuBarInner({ editor, onInsertLink }: Props) {
  const state = useEditorState({
    editor,
    selector: ({ editor: ed }) => {
      if (!ed || ed.isDestroyed) return null
      return {
        isBold: ed.isActive('bold'),
        isItalic: ed.isActive('italic'),
        isUnderline: ed.isActive('underline'),
        isStrike: ed.isActive('strike'),
        isCode: ed.isActive('code'),
        isHighlight: ed.isActive('highlight'),
        isLink: ed.isActive('link'),
        linkHref: (ed.getAttributes('link').href as string | undefined) ?? '',
      }
    },
  })

  const [turnIntoOpen, setTurnIntoOpen] = useState(false)
  const [textColorOpen, setTextColorOpen] = useState(false)
  const [highlightOpen, setHighlightOpen] = useState(false)
  const [linkDraft, setLinkDraft] = useState('')

  // 进入链接编辑时同步当前 href
  useEffect(() => {
    if (state?.isLink) setLinkDraft(state.linkHref)
  }, [state?.isLink, state?.linkHref])

  const applyLinkDraft = () => {
    const url = linkDraft.trim()
    if (url) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    } else {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    }
  }

  const markButton = (
    key: string,
    label: string,
    icon: React.ReactNode,
    active: boolean,
    onClick: () => void,
  ) => (
    <Tooltip key={key} title={label} mouseEnterDelay={0.45}>
      <Button
        size="small"
        type="text"
        className={`editor-toolbar-btn${active ? ' is-active' : ''}`}
        icon={icon}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClick}
        aria-label={label}
      />
    </Tooltip>
  )

  return (
    <BubbleMenu
      editor={editor}
      className="editor-bubble-menu"
      options={{ placement: 'top', offset: 10 }}
      shouldShow={({ editor: ed, from, to, state: menuState }) => {
        if (from === to) return false
        if (!ed.isEditable) return false
        if (ed.isActive('image')) return false
        if (ed.isActive('codeBlock')) return false
        // 纯节点选择（如图片、表格）不显示文本格式菜单
        if (menuState && menuState.selection instanceof Object && '$from' in menuState.selection) {
          const { $from } = menuState.selection
          if ($from.parent.isTextblock === false) return false
        }
        return true
      }}
    >
      {state && (
        <div className="editor-bubble-menu__inner">
          {state.isLink ? (
            <div className="editor-bubble-menu__link-editor">
              <span className="editor-bubble-menu__link-icon" aria-hidden>
                <Link size={14} />
              </span>
              <Input
                size="small"
                value={linkDraft}
                placeholder={EDITOR_TEXT.linkInputPlaceholder}
                onChange={(event) => setLinkDraft(event.target.value)}
                onPressEnter={applyLinkDraft}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setLinkDraft(state.linkHref)
                    editor.commands.focus()
                  }
                }}
                className="editor-bubble-menu__link-input"
              />
              <Tooltip title={EDITOR_TEXT.linkOpen} mouseEnterDelay={0.45}>
                <Button
                  size="small"
                  type="text"
                  className="editor-toolbar-btn"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    if (state.linkHref) window.open(state.linkHref, '_blank', 'noopener,noreferrer')
                  }}
                  aria-label={EDITOR_TEXT.linkOpen}
                >
                  ↗
                </Button>
              </Tooltip>
              <Tooltip title={EDITOR_TEXT.linkRemove} mouseEnterDelay={0.45}>
                <Button
                  size="small"
                  type="text"
                  className="editor-toolbar-btn editor-toolbar-btn--danger"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    editor.chain().focus().extendMarkRange('link').unsetLink().run()
                  }}
                  aria-label={EDITOR_TEXT.linkRemove}
                >
                  ✕
                </Button>
              </Tooltip>
            </div>
          ) : (
            <>
              <div className="editor-bubble-menu__group">
                {markButton('bold', EDITOR_TEXT.bold, <Bold size={15} />, state.isBold, () =>
                  editor.chain().focus().toggleBold().run(),
                )}
                {markButton('italic', EDITOR_TEXT.italic, <Italic size={15} />, state.isItalic, () =>
                  editor.chain().focus().toggleItalic().run(),
                )}
                {markButton('underline', EDITOR_TEXT.underline, <Underline size={15} />, state.isUnderline, () =>
                  editor.chain().focus().toggleUnderline().run(),
                )}
                {markButton('strike', EDITOR_TEXT.strike, <Strikethrough size={15} />, state.isStrike, () =>
                  editor.chain().focus().toggleStrike().run(),
                )}
                {markButton('code', EDITOR_TEXT.inlineCode, <Code size={15} />, state.isCode, () =>
                  editor.chain().focus().toggleCode().run(),
                )}
                {markButton('highlight', EDITOR_TEXT.highlightColor, <Highlighter size={15} />, state.isHighlight, () =>
                  editor.chain().focus().toggleHighlight().run(),
                )}
              </div>

              <span className="editor-bubble-menu__divider" aria-hidden />

              <Popover
                open={turnIntoOpen}
                onOpenChange={setTurnIntoOpen}
                trigger="click"
                placement="bottom"
                overlayClassName="editor-turn-into-popover"
                content={<TurnIntoMenu editor={editor} onApplied={() => setTurnIntoOpen(false)} />}
              >
                <Tooltip title={EDITOR_TEXT.turnInto} mouseEnterDelay={0.45}>
                  <Button
                    size="small"
                    type="text"
                    className={`editor-toolbar-btn editor-toolbar-btn--wide${turnIntoOpen ? ' is-active' : ''}`}
                    icon={<Pilcrow size={15} />}
                    onMouseDown={(event) => event.preventDefault()}
                    aria-label={EDITOR_TEXT.turnInto}
                  >
                    <span className="editor-bubble-menu__turninto-label">{EDITOR_TEXT.turnInto}</span>
                  </Button>
                </Tooltip>
              </Popover>

              <Popover
                open={textColorOpen}
                onOpenChange={setTextColorOpen}
                trigger="click"
                placement="bottom"
                overlayClassName="editor-color-popover"
                content={
                  <ColorPicker
                    size="small"
                    presets={[{ label: EDITOR_TEXT.textColor, colors: TEXT_PRESETS }]}
                    onChange={(color) => {
                      editor.chain().focus().setColor(color.toHexString()).run()
                      setTextColorOpen(false)
                    }}
                  />
                }
              >
                <Tooltip title={EDITOR_TEXT.textColor} mouseEnterDelay={0.45}>
                  <Button
                    size="small"
                    type="text"
                    className={`editor-toolbar-btn${textColorOpen ? ' is-active' : ''}`}
                    icon={<PaintBucket size={15} />}
                    onMouseDown={(event) => event.preventDefault()}
                    aria-label={EDITOR_TEXT.textColor}
                  />
                </Tooltip>
              </Popover>

              <Popover
                open={highlightOpen}
                onOpenChange={setHighlightOpen}
                trigger="click"
                placement="bottom"
                overlayClassName="editor-color-popover"
                content={
                  <ColorPicker
                    size="small"
                    presets={[{ label: EDITOR_TEXT.highlightColor, colors: HIGHLIGHT_PRESETS }]}
                    onChange={(color) => {
                      editor.chain().focus().setHighlight({ color: color.toHexString() }).run()
                      setHighlightOpen(false)
                    }}
                  />
                }
              >
                <Tooltip title={EDITOR_TEXT.highlightColor} mouseEnterDelay={0.45}>
                  <Button
                    size="small"
                    type="text"
                    className={`editor-toolbar-btn${highlightOpen ? ' is-active' : ''}`}
                    icon={<Highlighter size={15} />}
                    onMouseDown={(event) => event.preventDefault()}
                    aria-label={EDITOR_TEXT.highlightColor}
                  />
                </Tooltip>
              </Popover>

              <span className="editor-bubble-menu__divider" aria-hidden />

              {markButton('link', EDITOR_TEXT.insertLink, <Link size={15} />, false, onInsertLink)}

              {markButton('clear', EDITOR_TEXT.clearFormatting, <Eraser size={15} />, false, () =>
                editor.chain().focus().unsetAllMarks().run(),
              )}
            </>
          )}
        </div>
      )}
    </BubbleMenu>
  )
}

export const BubbleMenuBar = memo(BubbleMenuBarInner)
