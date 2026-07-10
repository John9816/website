import { memo } from 'react'
import { FloatingMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/react'
import { Button, Tooltip } from 'antd'
import {
  CheckSquareOutlined,
  CodeOutlined,
  DashOutlined,
  OrderedListOutlined,
  PictureOutlined,
  TableOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import { EDITOR_TEXT } from './texts'

interface Props {
  editor: Editor
  onInsertImage: () => void
}

function FloatingMenuBarInner({ editor, onInsertImage }: Props) {
  return (
    <FloatingMenu
      editor={editor}
      className="editor-floating-menu"
      options={{ placement: 'left', offset: 8 }}
      shouldShow={({ editor: ed, state }) => {
        if (!ed.isEditable) return false
        const { $from } = state.selection
        const node = $from.parent
        if (node.type.name !== 'paragraph') return false
        if (node.content.size > 0) return false
        if (ed.isActive('table')) return false
        return true
      }}
    >
      <div className="editor-floating-menu__inner">
        <Tooltip title={EDITOR_TEXT.slashHeading1}>
          <Button
            size="small"
            type="text"
            className="editor-toolbar-btn"
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            aria-label={EDITOR_TEXT.slashHeading1}
          >
            H1
          </Button>
        </Tooltip>
        <Tooltip title={EDITOR_TEXT.slashHeading2}>
          <Button
            size="small"
            type="text"
            className="editor-toolbar-btn"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            aria-label={EDITOR_TEXT.slashHeading2}
          >
            H2
          </Button>
        </Tooltip>
        <Tooltip title={EDITOR_TEXT.slashHeading3}>
          <Button
            size="small"
            type="text"
            className="editor-toolbar-btn"
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            aria-label={EDITOR_TEXT.slashHeading3}
          >
            H3
          </Button>
        </Tooltip>
        <Tooltip title={EDITOR_TEXT.bulletList}>
          <Button
            size="small"
            type="text"
            className="editor-toolbar-btn"
            icon={<UnorderedListOutlined />}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            aria-label={EDITOR_TEXT.bulletList}
          />
        </Tooltip>
        <Tooltip title={EDITOR_TEXT.orderedList}>
          <Button
            size="small"
            type="text"
            className="editor-toolbar-btn"
            icon={<OrderedListOutlined />}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            aria-label={EDITOR_TEXT.orderedList}
          />
        </Tooltip>
        <Tooltip title={EDITOR_TEXT.taskList}>
          <Button
            size="small"
            type="text"
            className="editor-toolbar-btn"
            icon={<CheckSquareOutlined />}
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            aria-label={EDITOR_TEXT.taskList}
          />
        </Tooltip>
        <Tooltip title={EDITOR_TEXT.codeBlock}>
          <Button
            size="small"
            type="text"
            className="editor-toolbar-btn"
            icon={<CodeOutlined />}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            aria-label={EDITOR_TEXT.codeBlock}
          />
        </Tooltip>
        <Tooltip title={EDITOR_TEXT.horizontalRule}>
          <Button
            size="small"
            type="text"
            className="editor-toolbar-btn"
            icon={<DashOutlined />}
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            aria-label={EDITOR_TEXT.horizontalRule}
          />
        </Tooltip>
        <Tooltip title={EDITOR_TEXT.insertImageByUrl}>
          <Button
            size="small"
            type="text"
            className="editor-toolbar-btn"
            icon={<PictureOutlined />}
            onClick={onInsertImage}
            aria-label={EDITOR_TEXT.insertImageByUrl}
          />
        </Tooltip>
        <Tooltip title={EDITOR_TEXT.insertTable}>
          <Button
            size="small"
            type="text"
            className="editor-toolbar-btn"
            icon={<TableOutlined />}
            onClick={() =>
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
            aria-label={EDITOR_TEXT.insertTable}
          />
        </Tooltip>
      </div>
    </FloatingMenu>
  )
}

export const FloatingMenuBar = memo(FloatingMenuBarInner)
