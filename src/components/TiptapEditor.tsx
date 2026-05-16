import { useState, useEffect, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
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
import { Color } from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import { all, createLowlight } from 'lowlight'
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
  FullscreenOutlined,
  FullscreenExitOutlined,
  CheckOutlined,
  AlignLeftOutlined,
  AlignCenterOutlined,
  AlignRightOutlined,
  ClearOutlined,
  MinusOutlined,
  DeleteOutlined,
  RightOutlined,
  LeftOutlined,
  VerticalLeftOutlined,
  VerticalRightOutlined,
} from '@ant-design/icons'
import { Button, Space, Tooltip, Divider, Select, ColorPicker } from 'antd'
import '../styles/tiptap.css'

const lowlight = createLowlight(all)

interface TiptapEditorProps {
  content: string
  onChange: (content: string) => void
  minHeight?: number | string
  maxHeight?: number | string
  fillHeight?: boolean
  slotBeforeMenu?: React.ReactNode
  slotAfterMenu?: React.ReactNode
  toolbarContainer?: HTMLElement | null
}

const MenuBar = ({ editor, isFullscreen, toggleFullscreen }: { editor: any, isFullscreen: boolean, toggleFullscreen: () => void }) => {
  if (!editor) {
    return null
  }

  const addImage = () => {
    const url = window.prompt('图片 URL')
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
        <div className="menu-group">
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
        </div>
        <Divider type="vertical" />
        <div className="menu-group">
          <Select
            size="small"
            placeholder="标题"
            style={{ width: 70 }}
            onChange={(level: number) => editor.chain().focus().toggleHeading({ level }).run()}
            options={[
              { value: 1, label: 'H1' },
              { value: 2, label: 'H2' },
              { value: 3, label: 'H3' },
              { value: 4, label: 'H4' },
              { value: 5, label: 'H5' },
              { value: 6, label: 'H6' },
            ]}
            value={
              editor.isActive('heading', { level: 1 }) ? 1 :
              editor.isActive('heading', { level: 2 }) ? 2 :
              editor.isActive('heading', { level: 3 }) ? 3 :
              editor.isActive('heading', { level: 4 }) ? 4 :
              editor.isActive('heading', { level: 5 }) ? 5 :
              editor.isActive('heading', { level: 6 }) ? 6 : undefined
            }
          />
          <Select
            size="small"
            placeholder="段落"
            style={{ width: 70 }}
            onChange={(block: string) => {
              if (block === 'paragraph') {
                editor.chain().focus().setParagraph().run()
              } else if (block === 'blockquote') {
                editor.chain().focus().toggleBlockquote().run()
              } else if (block === 'codeBlock') {
                editor.chain().focus().toggleCodeBlock().run()
              }
            }}
            options={[
              { value: 'paragraph', label: '正文' },
              { value: 'blockquote', label: '引用' },
              { value: 'codeBlock', label: '代码块' },
            ]}
          />
        </div>
        <Divider type="vertical" />
        <div className="menu-group">
          <Tooltip title="文本颜色">
            <ColorPicker
              size="small"
              onChange={(color) => editor.chain().focus().setColor(color.toHexString()).run()}
              value={editor.getAttributes('textStyle').color}
              trigger="click"
            />
          </Tooltip>
          <Tooltip title="背景颜色">
            <ColorPicker
              size="small"
              onChange={(color) => editor.chain().focus().toggleHighlight({ color: color.toHexString() }).run()}
              trigger="click"
            />
          </Tooltip>
        </div>
        <Divider type="vertical" />
        <div className="menu-group">
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
        </div>
        <Divider type="vertical" />
        <div className="menu-group">
          <Tooltip title="左对齐">
            <Button
              size="small"
              type={editor.isActive({ textAlign: 'left' }) ? 'primary' : 'text'}
              icon={<AlignLeftOutlined />}
              onClick={() => editor.chain().focus().setTextAlign('left').run()}
            />
          </Tooltip>
          <Tooltip title="居中">
            <Button
              size="small"
              type={editor.isActive({ textAlign: 'center' }) ? 'primary' : 'text'}
              icon={<AlignCenterOutlined />}
              onClick={() => editor.chain().focus().setTextAlign('center').run()}
            />
          </Tooltip>
          <Tooltip title="右对齐">
            <Button
              size="small"
              type={editor.isActive({ textAlign: 'right' }) ? 'primary' : 'text'}
              icon={<AlignRightOutlined />}
              onClick={() => editor.chain().focus().setTextAlign('right').run()}
            />
          </Tooltip>
        </div>
        <Divider type="vertical" />
        <div className="menu-group">
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
              icon={<CheckOutlined />}
              onClick={() => editor.chain().focus().toggleTaskList().run()}
            />
          </Tooltip>
        </div>
        <Divider type="vertical" />
        <div className="menu-group">
          <Tooltip title="减少缩进">
            <Button
              size="small"
              type="text"
              icon={<LeftOutlined />}
              onClick={() => editor.chain().focus().liftListItem('listItem').run()}
            />
          </Tooltip>
          <Tooltip title="增加缩进">
            <Button
              size="small"
              type="text"
              icon={<RightOutlined />}
              onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
            />
          </Tooltip>
        </div>
        <Divider type="vertical" />
        <div className="menu-group">
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
        </div>
        <Divider type="vertical" />
        <div className="menu-group">
          <Tooltip title="上方插入行">
            <Button
              size="small"
              type="text"
              icon={<VerticalLeftOutlined />}
              onClick={() => editor.chain().focus().addRowBefore().run()}
              disabled={!editor.can().addRowBefore()}
            />
          </Tooltip>
          <Tooltip title="下方插入行">
            <Button
              size="small"
              type="text"
              icon={<VerticalRightOutlined />}
              onClick={() => editor.chain().focus().addRowAfter().run()}
              disabled={!editor.can().addRowAfter()}
            />
          </Tooltip>
          <Tooltip title="删除行">
            <Button
              size="small"
              type="text"
              icon={<MinusOutlined />}
              onClick={() => editor.chain().focus().deleteRow().run()}
              disabled={!editor.can().deleteRow()}
            />
          </Tooltip>
          <Tooltip title="左侧插入列">
            <Button
              size="small"
              type="text"
              icon={<LeftOutlined />}
              onClick={() => editor.chain().focus().addColumnBefore().run()}
              disabled={!editor.can().addColumnBefore()}
            />
          </Tooltip>
          <Tooltip title="右侧插入列">
            <Button
              size="small"
              type="text"
              icon={<RightOutlined />}
              onClick={() => editor.chain().focus().addColumnAfter().run()}
              disabled={!editor.can().addColumnAfter()}
            />
          </Tooltip>
          <Tooltip title="删除列">
            <Button
              size="small"
              type="text"
              icon={<MinusOutlined />}
              onClick={() => editor.chain().focus().deleteColumn().run()}
              disabled={!editor.can().deleteColumn()}
            />
          </Tooltip>
          <Tooltip title="删除表格">
            <Button
              size="small"
              type="text"
              icon={<DeleteOutlined />}
              onClick={() => editor.chain().focus().deleteTable().run()}
              disabled={!editor.can().deleteTable()}
            />
          </Tooltip>
        </div>
        <Divider type="vertical" />
        <div className="menu-group">
          <Tooltip title="清除格式">
            <Button
              size="small"
              type="text"
              icon={<ClearOutlined />}
              onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
            />
          </Tooltip>
        </div>
        <Divider type="vertical" />
        <div className="menu-group">
          <Tooltip title={isFullscreen ? "退出全屏" : "全屏"}>
            <Button
              size="small"
              type="text"
              icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              onClick={toggleFullscreen}
            />
          </Tooltip>
        </div>
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
  slotBeforeMenu,
  slotAfterMenu,
  toolbarContainer,
}: TiptapEditorProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
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
      Color,
      TextStyle,
      Highlight.configure({
        multicolor: true,
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      CodeBlockLowlight.configure({
        lowlight,
      }),
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

  const menuBarContent = <MenuBar editor={editor} isFullscreen={isFullscreen} toggleFullscreen={() => setIsFullscreen(!isFullscreen)} />

  return (
    <div
      className={`tiptap-editor-container${fillHeight ? ' tiptap-editor-container--fill' : ''}${isFullscreen ? ' tiptap-editor-container--fullscreen' : ''}`}
      style={style}
    >
      {slotBeforeMenu}
      {toolbarContainer && !isFullscreen ? createPortal(menuBarContent, toolbarContainer) : menuBarContent}
      {slotAfterMenu}
      <EditorContent
        editor={editor}
        className={`editor-content${fillHeight ? ' editor-content--fill' : ''}`}
      />
    </div>
  )
}
