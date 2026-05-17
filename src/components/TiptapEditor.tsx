import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
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
import { App as AntApp, Button, ColorPicker, Select, Tooltip } from 'antd'
import '../styles/tiptap.css'

const lowlight = createLowlight(all)
const MAX_IMAGE_EDGE = 1600
type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

const TEXT = {
  undo: '\u64a4\u9500',
  redo: '\u91cd\u505a',
  heading: '\u6807\u9898',
  paragraph: '\u6b63\u6587',
  quote: '\u5f15\u7528',
  codeBlock: '\u4ee3\u7801\u5757',
  textColor: '\u6587\u5b57\u989c\u8272',
  highlightColor: '\u9ad8\u4eae\u989c\u8272',
  bold: '\u52a0\u7c97',
  italic: '\u659c\u4f53',
  underline: '\u4e0b\u5212\u7ebf',
  inlineCode: '\u884c\u5185\u4ee3\u7801',
  alignLeft: '\u5de6\u5bf9\u9f50',
  alignCenter: '\u5c45\u4e2d',
  alignRight: '\u53f3\u5bf9\u9f50',
  bulletList: '\u65e0\u5e8f\u5217\u8868',
  orderedList: '\u6709\u5e8f\u5217\u8868',
  taskList: '\u4efb\u52a1\u5217\u8868',
  outdent: '\u51cf\u5c11\u7f29\u8fdb',
  indent: '\u589e\u52a0\u7f29\u8fdb',
  uploadImage: '\u4e0a\u4f20\u56fe\u7247',
  uploadingImage: '\u6b63\u5728\u5904\u7406\u56fe\u7247\u2026',
  insertImageByUrl: '\u901a\u8fc7 URL \u63d2\u5165\u56fe\u7247',
  insertTable: '\u63d2\u5165\u8868\u683c',
  addRowBefore: '\u4e0a\u65b9\u63d2\u5165\u884c',
  addRowAfter: '\u4e0b\u65b9\u63d2\u5165\u884c',
  deleteRow: '\u5220\u9664\u884c',
  addColumnBefore: '\u5de6\u4fa7\u63d2\u5165\u5217',
  addColumnAfter: '\u53f3\u4fa7\u63d2\u5165\u5217',
  deleteColumn: '\u5220\u9664\u5217',
  deleteTable: '\u5220\u9664\u8868\u683c',
  toolbarHint: '\u652f\u6301\u7c98\u8d34\u3001\u62d6\u62fd\u6216\u4e0a\u4f20\u56fe\u7247',
  insertLink: '\u63d2\u5165\u94fe\u63a5',
  clearFormatting: '\u6e05\u9664\u683c\u5f0f',
  exitFullscreen: '\u9000\u51fa\u5168\u5c4f',
  fullscreen: '\u5168\u5c4f\u7f16\u8f91',
  readImageFailed: '\u8bfb\u53d6\u56fe\u7247\u5931\u8d25',
  decodeImageFailed: '\u56fe\u7247\u89e3\u7801\u5931\u8d25',
  browserProcessImageUnsupported: '\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u56fe\u7247\u5904\u7406',
  imageUrlPrompt: '\u56fe\u7247 URL',
  linkUrlPrompt: '\u94fe\u63a5 URL',
  insertedImages: '\u5df2\u63d2\u5165 ',
  imageUnit: ' \u5f20\u56fe\u7247',
  insertImageFailed: '\u63d2\u5165\u56fe\u7247\u5931\u8d25',
  editorPlaceholder: '\u8f93\u5165\u5185\u5bb9\u2026',
} as const

type EditorViewLike = {
  state: any
  dispatch: (transaction: any) => void
  focus: () => void
}

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
      />
    </Tooltip>
  )
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error(TEXT.readImageFailed))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(TEXT.decodeImageFailed))
    image.decoding = 'async'
    image.src = src
  })
}

async function imageFileToDataUrl(file: File) {
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return fileToDataUrl(file)
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await loadImage(objectUrl)
    const ratio = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight))
    const width = Math.max(1, Math.round(image.naturalWidth * ratio))
    const height = Math.max(1, Math.round(image.naturalHeight * ratio))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) throw new Error(TEXT.browserProcessImageUnsupported)

    context.drawImage(image, 0, 0, width, height)

    const webpDataUrl = canvas.toDataURL('image/webp', 0.9)
    if (webpDataUrl.startsWith('data:image/webp')) {
      return webpDataUrl
    }

    if (file.type === 'image/png') {
      return canvas.toDataURL('image/png')
    }

    return canvas.toDataURL('image/jpeg', 0.9)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function getHeadingValue(editor: Editor): HeadingLevel | undefined {
  if (editor.isActive('heading', { level: 1 })) return 1
  if (editor.isActive('heading', { level: 2 })) return 2
  if (editor.isActive('heading', { level: 3 })) return 3
  if (editor.isActive('heading', { level: 4 })) return 4
  if (editor.isActive('heading', { level: 5 })) return 5
  if (editor.isActive('heading', { level: 6 })) return 6
  return undefined
}

function getBlockValue(editor: Editor) {
  if (editor.isActive('blockquote')) return 'blockquote'
  if (editor.isActive('codeBlock')) return 'codeBlock'
  return 'paragraph'
}

function MenuBar({
  editor,
  imageUploading,
  isFullscreen,
  onInsertImageUrl,
  onInsertLink,
  onSelectImageFiles,
  toggleFullscreen,
}: {
  editor: Editor
  imageUploading: boolean
  isFullscreen: boolean
  onInsertImageUrl: () => void
  onInsertLink: () => void
  onSelectImageFiles: (files: FileList | null) => void
  toggleFullscreen: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const headingValue = getHeadingValue(editor)
  const blockValue = getBlockValue(editor)

  return (
    <div className="editor-menu-bar">
      <div className="editor-menu-bar__groups">
        <div className="menu-group">
          <ToolbarButton
            title={TEXT.undo}
            icon={<UndoOutlined />}
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().chain().focus().undo().run()}
          />
          <ToolbarButton
            title={TEXT.redo}
            icon={<RedoOutlined />}
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().chain().focus().redo().run()}
          />
        </div>

        <div className="menu-group menu-group--field">
          <Select
            size="small"
            className="editor-toolbar-select"
            placeholder={TEXT.heading}
            popupMatchSelectWidth={false}
            value={headingValue}
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
            value={blockValue}
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
              { value: 'paragraph', label: TEXT.paragraph },
              { value: 'blockquote', label: TEXT.quote },
              { value: 'codeBlock', label: TEXT.codeBlock },
            ]}
          />
        </div>

        <div className="menu-group">
          <Tooltip title={TEXT.textColor}>
            <ColorPicker
              size="small"
              className="editor-toolbar-color"
              value={editor.getAttributes('textStyle').color}
              trigger="click"
              onChange={(color) => editor.chain().focus().setColor(color.toHexString()).run()}
            >
              <Button
                size="small"
                type="text"
                className="editor-toolbar-btn"
                icon={<BgColorsOutlined />}
              />
            </ColorPicker>
          </Tooltip>
          <Tooltip title={TEXT.highlightColor}>
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
                className={`editor-toolbar-btn${editor.isActive('highlight') ? ' is-active' : ''}`}
                icon={<HighlightOutlined />}
              />
            </ColorPicker>
          </Tooltip>
        </div>

        <div className="menu-group">
          <ToolbarButton
            title={TEXT.bold}
            icon={<BoldOutlined />}
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
          />
          <ToolbarButton
            title={TEXT.italic}
            icon={<ItalicOutlined />}
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          />
          <ToolbarButton
            title={TEXT.underline}
            icon={<UnderlineOutlined />}
            active={editor.isActive('underline')}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          />
          <ToolbarButton
            title={TEXT.inlineCode}
            icon={<CodeOutlined />}
            active={editor.isActive('code')}
            onClick={() => editor.chain().focus().toggleCode().run()}
          />
        </div>

        <div className="menu-group">
          <ToolbarButton
            title={TEXT.alignLeft}
            icon={<AlignLeftOutlined />}
            active={editor.isActive({ textAlign: 'left' })}
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
          />
          <ToolbarButton
            title={TEXT.alignCenter}
            icon={<AlignCenterOutlined />}
            active={editor.isActive({ textAlign: 'center' })}
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
          />
          <ToolbarButton
            title={TEXT.alignRight}
            icon={<AlignRightOutlined />}
            active={editor.isActive({ textAlign: 'right' })}
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
          />
        </div>

        <div className="menu-group">
          <ToolbarButton
            title={TEXT.bulletList}
            icon={<UnorderedListOutlined />}
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          />
          <ToolbarButton
            title={TEXT.orderedList}
            icon={<OrderedListOutlined />}
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          />
          <ToolbarButton
            title={TEXT.taskList}
            icon={<CheckOutlined />}
            active={editor.isActive('taskList')}
            onClick={() => editor.chain().focus().toggleTaskList().run()}
          />
        </div>

        <div className="menu-group">
          <ToolbarButton
            title={TEXT.outdent}
            icon={<LeftOutlined />}
            onClick={() => editor.chain().focus().liftListItem('listItem').run()}
          />
          <ToolbarButton
            title={TEXT.indent}
            icon={<RightOutlined />}
            onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
          />
        </div>

        <div className="menu-group">
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
            title={imageUploading ? TEXT.uploadingImage : TEXT.uploadImage}
            icon={imageUploading ? <LoadingOutlined /> : <UploadOutlined />}
            onClick={() => fileInputRef.current?.click()}
            disabled={imageUploading}
          />
          <ToolbarButton
            title={TEXT.insertImageByUrl}
            icon={<PictureOutlined />}
            onClick={onInsertImageUrl}
            disabled={imageUploading}
          />
          <ToolbarButton
            title={TEXT.insertTable}
            icon={<TableOutlined />}
            onClick={() =>
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
          />
        </div>

        <div className="menu-group">
          <ToolbarButton
            title={TEXT.addRowBefore}
            icon={<VerticalLeftOutlined />}
            onClick={() => editor.chain().focus().addRowBefore().run()}
            disabled={!editor.can().addRowBefore()}
          />
          <ToolbarButton
            title={TEXT.addRowAfter}
            icon={<VerticalRightOutlined />}
            onClick={() => editor.chain().focus().addRowAfter().run()}
            disabled={!editor.can().addRowAfter()}
          />
          <ToolbarButton
            title={TEXT.deleteRow}
            icon={<MinusOutlined />}
            onClick={() => editor.chain().focus().deleteRow().run()}
            disabled={!editor.can().deleteRow()}
          />
          <ToolbarButton
            title={TEXT.addColumnBefore}
            icon={<LeftOutlined />}
            onClick={() => editor.chain().focus().addColumnBefore().run()}
            disabled={!editor.can().addColumnBefore()}
          />
          <ToolbarButton
            title={TEXT.addColumnAfter}
            icon={<RightOutlined />}
            onClick={() => editor.chain().focus().addColumnAfter().run()}
            disabled={!editor.can().addColumnAfter()}
          />
          <ToolbarButton
            title={TEXT.deleteColumn}
            icon={<MinusOutlined />}
            onClick={() => editor.chain().focus().deleteColumn().run()}
            disabled={!editor.can().deleteColumn()}
          />
          <ToolbarButton
            title={TEXT.deleteTable}
            icon={<DeleteOutlined />}
            onClick={() => editor.chain().focus().deleteTable().run()}
            disabled={!editor.can().deleteTable()}
            danger
          />
        </div>
      </div>

      <div className="editor-menu-bar__actions">
        <span className="editor-toolbar-hint">{TEXT.toolbarHint}</span>
        <ToolbarButton
          title={TEXT.insertLink}
          icon={<LinkOutlined />}
          active={editor.isActive('link')}
          onClick={onInsertLink}
        />
        <ToolbarButton
          title={TEXT.clearFormatting}
          icon={<ClearOutlined />}
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
        />
        <ToolbarButton
          title={isFullscreen ? TEXT.exitFullscreen : TEXT.fullscreen}
          icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
          onClick={toggleFullscreen}
        />
      </div>
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
  const { message } = AntApp.useApp()
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [imageUploading, setImageUploading] = useState(false)

  const insertImageIntoView = useCallback(
    (view: EditorViewLike | null | undefined, src: string, alt?: string, pos?: number) => {
      if (!view) return

      const imageNode = view.state.schema.nodes.image?.create({ src, alt })
      if (!imageNode) return

      const transaction =
        typeof pos === 'number'
          ? view.state.tr.insert(pos, imageNode)
          : view.state.tr.replaceSelectionWith(imageNode)

      view.dispatch(transaction.scrollIntoView())
      view.focus()
    },
    [],
  )

  const handleImageFiles = useCallback(
    async (files: FileList | File[] | null, view?: EditorViewLike | null, dropPos?: number) => {
      const imageFiles = Array.from(files ?? []).filter((file) => file.type.startsWith('image/'))
      if (!imageFiles.length) return false

      setImageUploading(true)
      try {
        let nextPos = dropPos
        for (const file of imageFiles) {
          const dataUrl = await imageFileToDataUrl(file)
          insertImageIntoView(view, dataUrl, file.name.replace(/\.[^.]+$/, ''), nextPos)
          if (typeof nextPos === 'number' && view?.state?.schema?.nodes?.image) {
            const imageNode = view.state.schema.nodes.image.create({ src: dataUrl })
            nextPos += imageNode.nodeSize
          }
        }
        message.success(`${TEXT.insertedImages}${imageFiles.length}${TEXT.imageUnit}`)
        return true
      } catch (error) {
        message.error((error as Error).message || TEXT.insertImageFailed)
        return false
      } finally {
        setImageUploading(false)
      }
    },
    [insertImageIntoView, message],
  )

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({
        openOnClick: false,
      }),
      Image,
      Placeholder.configure({
        placeholder: TEXT.editorPlaceholder,
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
    editorProps: {
      handlePaste: (view, event) => {
        const files = event.clipboardData?.files
        if (!files?.length) return false
        if (!Array.from(files).some((file) => file.type.startsWith('image/'))) return false
        event.preventDefault()
        void handleImageFiles(files, view as EditorViewLike)
        return true
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files
        if (!files?.length) return false
        if (!Array.from(files).some((file) => file.type.startsWith('image/'))) return false
        event.preventDefault()
        const coordinates = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        })
        void handleImageFiles(files, view as EditorViewLike, coordinates?.pos)
        return true
      },
    },
    onUpdate: ({ editor: nextEditor }) => {
      onChange(nextEditor.getHTML())
    },
  })

  useEffect(() => {
    if (!editor) return
    const nextContent = content || ''
    if (editor.getHTML() !== nextContent) {
      editor.commands.setContent(nextContent, { emitUpdate: false })
    }
  }, [content, editor])

  useEffect(() => {
    if (!isFullscreen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isFullscreen])

  const style = {
    '--editor-min-height':
      typeof minHeight === 'number' ? `${minHeight}px` : minHeight,
    '--editor-max-height':
      typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight,
  } as CSSProperties

  const handleInsertImageUrl = useCallback(() => {
    if (!editor) return
    const url = window.prompt(TEXT.imageUrlPrompt)
    if (!url) return
    editor.chain().focus().setImage({ src: url }).run()
  }, [editor])

  const handleInsertLink = useCallback(() => {
    if (!editor) return
    const previousUrl = editor.getAttributes('link').href
    const url = window.prompt(TEXT.linkUrlPrompt, previousUrl)

    if (url === null) return

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }, [editor])

  const menuBarContent = useMemo(() => {
    if (!editor) return null

    return (
      <MenuBar
        editor={editor}
        imageUploading={imageUploading}
        isFullscreen={isFullscreen}
        onInsertImageUrl={handleInsertImageUrl}
        onInsertLink={handleInsertLink}
        onSelectImageFiles={(files) => {
          void handleImageFiles(files, editor.view as unknown as EditorViewLike)
        }}
        toggleFullscreen={() => setIsFullscreen((value) => !value)}
      />
    )
  }, [
    editor,
    handleImageFiles,
    handleInsertImageUrl,
    handleInsertLink,
    imageUploading,
    isFullscreen,
  ])

  return (
    <div
      className={`tiptap-editor-container${fillHeight ? ' tiptap-editor-container--fill' : ''}${
        isFullscreen ? ' tiptap-editor-container--fullscreen' : ''
      }`}
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
