import { memo } from 'react'
import { BubbleMenu } from '@tiptap/react/menus'
import { useEditorState, type Editor } from '@tiptap/react'
import { Button, Tooltip } from 'antd'
import {
  BoldOutlined,
  ClearOutlined,
  CodeOutlined,
  HighlightOutlined,
  ItalicOutlined,
  LinkOutlined,
  StrikethroughOutlined,
  UnderlineOutlined,
} from '@ant-design/icons'
import { EDITOR_TEXT } from './texts'

interface Props {
  editor: Editor
  onInsertLink: () => void
}

function BubbleMenuBarInner({ editor, onInsertLink }: Props) {
  const state = useEditorState({
    editor,
    selector: ({ editor: ed }) => {
      if (!ed) return null
      return {
        isBold: ed.isActive('bold'),
        isItalic: ed.isActive('italic'),
        isUnderline: ed.isActive('underline'),
        isStrike: ed.isActive('strike'),
        isCode: ed.isActive('code'),
        isHighlight: ed.isActive('highlight'),
        isLink: ed.isActive('link'),
      }
    },
  })

  return (
    <BubbleMenu
      editor={editor}
      className="editor-bubble-menu"
      options={{
        placement: 'top',
        offset: 8,
      }}
      shouldShow={({ editor: ed, from, to }) => {
        if (from === to) return false
        if (!ed.isEditable) return false
        if (ed.isActive('image')) return false
        if (ed.isActive('codeBlock')) return false
        return true
      }}
    >
      {state && (
        <div className="editor-bubble-menu__inner">
          <Tooltip title={EDITOR_TEXT.bold}>
            <Button
              size="small"
              type="text"
              className={`editor-toolbar-btn${state.isBold ? ' is-active' : ''}`}
              icon={<BoldOutlined />}
              onClick={() => editor.chain().focus().toggleBold().run()}
              aria-label={EDITOR_TEXT.bold}
            />
          </Tooltip>
          <Tooltip title={EDITOR_TEXT.italic}>
            <Button
              size="small"
              type="text"
              className={`editor-toolbar-btn${state.isItalic ? ' is-active' : ''}`}
              icon={<ItalicOutlined />}
              onClick={() => editor.chain().focus().toggleItalic().run()}
              aria-label={EDITOR_TEXT.italic}
            />
          </Tooltip>
          <Tooltip title={EDITOR_TEXT.underline}>
            <Button
              size="small"
              type="text"
              className={`editor-toolbar-btn${state.isUnderline ? ' is-active' : ''}`}
              icon={<UnderlineOutlined />}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              aria-label={EDITOR_TEXT.underline}
            />
          </Tooltip>
          <Tooltip title="删除线">
            <Button
              size="small"
              type="text"
              className={`editor-toolbar-btn${state.isStrike ? ' is-active' : ''}`}
              icon={<StrikethroughOutlined />}
              onClick={() => editor.chain().focus().toggleStrike().run()}
              aria-label="删除线"
            />
          </Tooltip>
          <Tooltip title={EDITOR_TEXT.inlineCode}>
            <Button
              size="small"
              type="text"
              className={`editor-toolbar-btn${state.isCode ? ' is-active' : ''}`}
              icon={<CodeOutlined />}
              onClick={() => editor.chain().focus().toggleCode().run()}
              aria-label={EDITOR_TEXT.inlineCode}
            />
          </Tooltip>
          <Tooltip title={EDITOR_TEXT.highlightColor}>
            <Button
              size="small"
              type="text"
              className={`editor-toolbar-btn${state.isHighlight ? ' is-active' : ''}`}
              icon={<HighlightOutlined />}
              onClick={() => editor.chain().focus().toggleHighlight().run()}
              aria-label={EDITOR_TEXT.highlightColor}
            />
          </Tooltip>
          <Tooltip title={EDITOR_TEXT.insertLink}>
            <Button
              size="small"
              type="text"
              className={`editor-toolbar-btn${state.isLink ? ' is-active' : ''}`}
              icon={<LinkOutlined />}
              onClick={onInsertLink}
              aria-label={EDITOR_TEXT.insertLink}
            />
          </Tooltip>
          <Tooltip title={EDITOR_TEXT.clearFormatting}>
            <Button
              size="small"
              type="text"
              className="editor-toolbar-btn"
              icon={<ClearOutlined />}
              onClick={() => editor.chain().focus().unsetAllMarks().run()}
              aria-label={EDITOR_TEXT.clearFormatting}
            />
          </Tooltip>
        </div>
      )}
    </BubbleMenu>
  )
}

export const BubbleMenuBar = memo(BubbleMenuBarInner)
