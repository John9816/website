import { useEffect, type CSSProperties } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import {
  BoldOutlined,
  ItalicOutlined,
  UnderlineOutlined,
  StrikethroughOutlined,
  CodeOutlined,
  OrderedListOutlined,
  UnorderedListOutlined,
  LinkOutlined,
  PictureOutlined,
  TableOutlined,
  UndoOutlined,
  RedoOutlined,
} from '@ant-design/icons'
import { Button, Space, Tooltip, Divider } from 'antd'
import '../styles/tiptap.css'

interface TiptapEditorProps {
  content: string
  onChange: (content: string) => void
  minHeight?: number | string
  maxHeight?: number | string
  fillHeight?: boolean
}

const MenuBar = ({ editor }: { editor: any }) => {
  if (!editor) {
    return null
  }

  const addImage = () => {
    const url = window.prompt('URL')
    if (url) {
      editor.chain().focus().setImage({ src: url }).run()
    }
  }

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href
    const url = window.prompt('URL', previousUrl)

    if (url === null) {
      return
    }

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    <div className="editor-menu-bar">
      <Space wrap size={4}>
        <Tooltip title="撤销">
          <Button
            size="small"
            type="text"
            icon={<UndoOutlined />}
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().chain().focus().undo().run()}
          />
        </Tooltip>
        <Tooltip title="重做">
          <Button
            size="small"
            type="text"
            icon={<RedoOutlined />}
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().chain().focus().redo().run()}
          />
        </Tooltip>
        <Divider type="vertical" />
        <Tooltip title="加粗">
          <Button
            size="small"
            type={editor.isActive('bold') ? 'primary' : 'text'}
            icon={<BoldOutlined />}
            onClick={() => editor.chain().focus().toggleBold().run()}
          />
        </Tooltip>
        <Tooltip title="斜体">
          <Button
            size="small"
            type={editor.isActive('italic') ? 'primary' : 'text'}
            icon={<ItalicOutlined />}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          />
        </Tooltip>
        <Tooltip title="下划线">
          <Button
            size="small"
            type={editor.isActive('underline') ? 'primary' : 'text'}
            icon={<UnderlineOutlined />}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          />
        </Tooltip>
        <Tooltip title="删除线">
          <Button
            size="small"
            type={editor.isActive('strike') ? 'primary' : 'text'}
            icon={<StrikethroughOutlined />}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          />
        </Tooltip>
        <Tooltip title="代码">
          <Button
            size="small"
            type={editor.isActive('code') ? 'primary' : 'text'}
            icon={<CodeOutlined />}
            onClick={() => editor.chain().focus().toggleCode().run()}
          />
        </Tooltip>
        <Divider type="vertical" />
        <Tooltip title="无序列表">
          <Button
            size="small"
            type={editor.isActive('bulletList') ? 'primary' : 'text'}
            icon={<UnorderedListOutlined />}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          />
        </Tooltip>
        <Tooltip title="有序列表">
          <Button
            size="small"
            type={editor.isActive('orderedList') ? 'primary' : 'text'}
            icon={<OrderedListOutlined />}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          />
        </Tooltip>
        <Tooltip title="任务列表">
          <Button
            size="small"
            type={editor.isActive('taskList') ? 'primary' : 'text'}
            icon={<CodeOutlined />}
            onClick={() => editor.chain().focus().toggleTaskList().run()}
          />
        </Tooltip>
        <Divider type="vertical" />
        <Tooltip title="链接">
          <Button
            size="small"
            type={editor.isActive('link') ? 'primary' : 'text'}
            icon={<LinkOutlined />}
            onClick={setLink}
          />
        </Tooltip>
        <Tooltip title="插入图片">
          <Button
            size="small"
            type="text"
            icon={<PictureOutlined />}
            onClick={addImage}
          />
        </Tooltip>
        <Tooltip title="插入表格">
          <Button
            size="small"
            type="text"
            icon={<TableOutlined />}
            onClick={() =>
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
          />
        </Tooltip>
      </Space>
    </div>
  )
}

export default function TiptapEditor({
  content,
  onChange,
  minHeight,
  maxHeight,
  fillHeight = false,
}: TiptapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({
        openOnClick: false,
      }),
      Image,
      Placeholder.configure({
        placeholder: '输入内容...',
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
  })

  useEffect(() => {
    if (!editor) return
    const nextContent = content || ''
    if (editor.getHTML() !== nextContent) {
      editor.commands.setContent(nextContent, { emitUpdate: false })
    }
  }, [content, editor])

  const style = {
    '--editor-min-height':
      typeof minHeight === 'number' ? `${minHeight}px` : minHeight,
    '--editor-max-height':
      typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight,
  } as CSSProperties

  return (
    <div
      className={`tiptap-editor-container${fillHeight ? ' tiptap-editor-container--fill' : ''}`}
      style={style}
    >
      <MenuBar editor={editor} />
      <EditorContent
        editor={editor}
        className={`editor-content${fillHeight ? ' editor-content--fill' : ''}`}
      />
    </div>
  )
}
