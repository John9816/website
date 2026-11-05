import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { EditorContent, ReactNodeViewRenderer, useEditor, useEditorState, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
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
import dart from 'highlight.js/lib/languages/dart'
import { common, createLowlight } from 'lowlight'
import { App as AntApp, Button } from 'antd'
import { Heading2, ListTodo, Pilcrow } from 'lucide-react'
import { MenuBar } from './editor/MenuBar'
import { BubbleMenuBar } from './editor/BubbleMenuBar'
import { BlockHandle } from './editor/BlockHandle'
import { CodeBlockView } from './editor/CodeBlockView'
import { EditorShortcuts } from './editor/EditorShortcuts'
import { FocusModeExtension, setFocusModeEnabled } from './editor/FocusMode'
import { ImagePlaceholder } from './editor/ImagePlaceholderExtension'
import { ImageExtended } from './editor/ImageNodeView'
import { ImagePromptModal } from './editor/ImagePromptModal'
import { LinkPromptModal, type LinkPromptValue } from './editor/LinkPromptModal'
import { SlashCommand } from './editor/SlashCommand'
import { isJsonEqual, safeParseJson } from './editor/serialize'
import { MarkdownShortcuts } from './editor/MarkdownShortcuts'
import { BlockOps } from './editor/BlockOps'
import { EDITOR_TEXT } from './editor/texts'
import '../styles/tiptap.css'

const lowlight = createLowlight({ ...common, dart })
const MAX_IMAGE_EDGE = 1600

const TEXT = {
  ...EDITOR_TEXT,
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
  editorPlaceholder: '\u8f93\u5165\u5185\u5bb9\uff0c\u6216\u8f93\u5165 / \u67e5\u770b\u5185\u5bb9\u5757',
  starterTitle: '\u4ece\u4e00\u4e2a\u5185\u5bb9\u5f00\u59cb',
  starterHint: '\u4e5f\u53ef\u4ee5\u8f93\u5165 / \u9009\u62e9\u5176\u4ed6\u5185\u5bb9\u5757',
} as const

interface TiptapEditorProps {
  content: string
  onChange: (content: string, contentJson?: string) => void
  uploadImage?: (file: File) => Promise<string>
  minHeight?: number | string
  maxHeight?: number | string
  fillHeight?: boolean
  slotBeforeMenu?: React.ReactNode
  slotAfterMenu?: React.ReactNode
  toolbarContainer?: HTMLElement | null
  showWritingStarter?: boolean
}

function normalizeEditorContent(content: string) {
  return safeParseJson(content.trim()) ?? content
}

function isBlankEditorHtml(html: string) {
  return html === '<p></p>' || html === ''
}

function isEditorUsable(editor: Editor | null | undefined): editor is Editor {
  return !!editor && !editor.isDestroyed
}

function isSameEditorContent(editor: Editor, content: string) {
  if (!isEditorUsable(editor)) return true

  const nextContent = content || ''
  const parsedJson = safeParseJson(nextContent.trim())
  if (parsedJson) return isJsonEqual(editor.getJSON(), parsedJson)
  if (!nextContent.trim()) return isBlankEditorHtml(editor.getHTML())
  return editor.getHTML() === nextContent
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

export default function TiptapEditor({
  content,
  onChange,
  uploadImage,
  minHeight,
  maxHeight,
  fillHeight = false,
  slotBeforeMenu,
  slotAfterMenu,
  toolbarContainer,
  showWritingStarter = false,
}: TiptapEditorProps) {
  const { message } = AntApp.useApp()
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isFocusMode, setIsFocusMode] = useState(false)
  const [imageUploading, setImageUploading] = useState(false)
  const [imageModalOpen, setImageModalOpen] = useState(false)
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const editorRef = useRef<Editor | null>(null)
  const onChangeRef = useRef(onChange)
  const pendingImageUploadsRef = useRef(0)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const openImageModal = useCallback(() => {
    setImageModalOpen(true)
  }, [])

  const openLinkModal = useCallback(() => {
    setLinkModalOpen(true)
  }, [])

  const handleImageFiles = useCallback(
    async (files: FileList | File[] | null, targetEditor?: Editor | null, dropPos?: number) => {
      const imageFiles = Array.from(files ?? []).filter((file) => file.type.startsWith('image/'))
      if (!imageFiles.length) return false
      const activeEditor = targetEditor ?? editorRef.current
      if (!isEditorUsable(activeEditor)) return false

      const uploads = imageFiles.map((file, index) => ({
        file,
        id: `image-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        alt: file.name.replace(/\.[^.]+$/, ''),
      }))
      const placeholders = uploads.map(({ id }) => ({
        type: 'imagePlaceholder',
        attrs: { id },
      }))
      const inserted = typeof dropPos === 'number'
        ? activeEditor.chain().focus().insertContentAt(dropPos, placeholders).run()
        : activeEditor.chain().focus().insertContent(placeholders).run()
      if (!inserted) return false

      pendingImageUploadsRef.current += uploads.length
      setImageUploading(true)
      try {
        const results = await Promise.allSettled(
          uploads.map(async ({ file, id, alt }) => {
            try {
              const src = uploadImage ? await uploadImage(file) : await imageFileToDataUrl(file)
              if (!isEditorUsable(activeEditor)) return false
              const replaced = activeEditor.commands.replaceImagePlaceholder(id, { src, alt })
              if (!replaced) throw new Error(TEXT.insertImageFailed)
              return true
            } catch (error) {
              if (isEditorUsable(activeEditor)) {
                activeEditor.commands.removeImagePlaceholder(id)
              }
              throw error
            }
          }),
        )
        const successCount = results.filter(
          (result) => result.status === 'fulfilled' && result.value,
        ).length
        const failedResult = results.find((result) => result.status === 'rejected')
        if (successCount) {
          message.success(`${TEXT.insertedImages}${successCount}${TEXT.imageUnit}`)
        }
        if (failedResult?.status === 'rejected') {
          message.error((failedResult.reason as Error)?.message || TEXT.insertImageFailed)
        }
        return successCount > 0
      } finally {
        pendingImageUploadsRef.current = Math.max(
          0,
          pendingImageUploadsRef.current - uploads.length,
        )
        if (pendingImageUploadsRef.current === 0) {
          setImageUploading(false)
          if (isEditorUsable(activeEditor)) {
            onChangeRef.current(activeEditor.getHTML(), JSON.stringify(activeEditor.getJSON()))
          }
        }
      }
    },
    [message, uploadImage],
  )

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        link: false,
        underline: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          rel: 'noopener noreferrer',
        },
      }),
      ImageExtended.configure({
        allowBase64: true,
      }),
      ImagePlaceholder,
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'heading') {
            const level = Number(node.attrs?.level ?? 1)
            if (level <= 1) return TEXT.placeholderHeading1
            if (level === 2) return TEXT.placeholderHeading2
            return TEXT.placeholderHeading3
          }
          if (node.type.name === 'blockquote') return TEXT.placeholderQuote
          if (node.type.name === 'codeBlock') return TEXT.placeholderCode
          return TEXT.placeholderParagraph
        },
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Table.configure({
        resizable: true,
        allowTableNodeSelection: true,
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
      CodeBlockLowlight.extend({
        addNodeView() {
          return ReactNodeViewRenderer(CodeBlockView)
        },
      }).configure({
        lowlight,
        defaultLanguage: 'plaintext',
      }),
      SlashCommand.configure({
        onInsertImage: openImageModal,
      }),
      EditorShortcuts.configure({
        onInsertLink: openLinkModal,
      }),
      MarkdownShortcuts,
      BlockOps,
      FocusModeExtension,
    ],
    content: normalizeEditorContent(content || ''),
    editorProps: {
      handlePaste: (_view, event) => {
        const files = event.clipboardData?.files
        if (!files?.length) return false
        if (!Array.from(files).some((file) => file.type.startsWith('image/'))) return false
        event.preventDefault()
        void handleImageFiles(files, editorRef.current)
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
        void handleImageFiles(files, editorRef.current, coordinates?.pos)
        return true
      },
    },
    onUpdate: ({ editor: nextEditor }) => {
      if (pendingImageUploadsRef.current > 0) return
      onChangeRef.current(nextEditor.getHTML(), JSON.stringify(nextEditor.getJSON()))
    },
  })

  const editorIsEmpty = useEditorState({
    editor,
    selector: ({ editor: activeEditor }) => activeEditor?.isEmpty ?? true,
  })

  useEffect(() => {
    editorRef.current = editor
    return () => {
      if (editorRef.current === editor) editorRef.current = null
    }
  }, [editor])

  useEffect(() => {
    if (!isEditorUsable(editor)) return
    const nextContent = content || ''
    if (!isSameEditorContent(editor, nextContent)) {
      editor.commands.setContent(normalizeEditorContent(nextContent), { emitUpdate: false })
    }
  }, [content, editor])

  // 专注模式：通过 ProseMirror 装饰为光标所在顶层块打标记，CSS 淡化其余块
  useEffect(() => {
    if (!isEditorUsable(editor)) return
    setFocusModeEnabled(editor, isFocusMode)
  }, [editor, isFocusMode])

  useEffect(() => {
    if (!isFullscreen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isFullscreen])

  useEffect(() => {
    if (!isFullscreen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setIsFullscreen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFullscreen])

  const style = {
    '--editor-min-height':
      typeof minHeight === 'number' ? `${minHeight}px` : minHeight,
    '--editor-max-height':
      typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight,
  } as CSSProperties

  const handleConfirmImageUrl = useCallback(
    (value: { url: string; alt?: string }) => {
      if (!editor) return
      editor.chain().focus().setImage({ src: value.url, alt: value.alt }).run()
      setImageModalOpen(false)
    },
    [editor],
  )

  const handleCancelImageUrl = useCallback(() => {
    setImageModalOpen(false)
    editor?.chain().focus().run()
  }, [editor])

  const handleConfirmLink = useCallback(
    (value: LinkPromptValue | null) => {
      if (!editor) return

      if (!value || !value.url) {
        editor.chain().focus().extendMarkRange('link').unsetLink().run()
        setLinkModalOpen(false)
        return
      }

      editor
        .chain()
        .focus()
        .extendMarkRange('link')
        .setLink({
          href: value.url,
          target: value.openInNewTab ? '_blank' : null,
          rel: value.openInNewTab ? 'noopener noreferrer' : null,
        })
        .run()
      setLinkModalOpen(false)
    },
    [editor],
  )

  const handleCancelLink = useCallback(() => {
    setLinkModalOpen(false)
    editor?.chain().focus().run()
  }, [editor])

  const menuBarContent = useMemo(() => {
    if (!isEditorUsable(editor)) return null

    return (
      <MenuBar
        editor={editor}
        isFullscreen={isFullscreen}
        isFocusMode={isFocusMode}
        onToggleFocusMode={() => setIsFocusMode((value) => !value)}
        onSelectImageFiles={(files) => {
          void handleImageFiles(files, editor)
        }}
        toggleFullscreen={() => setIsFullscreen((value) => !value)}
      />
    )
  }, [editor, handleImageFiles, isFullscreen, isFocusMode])

  const canPortalToolbar = !!toolbarContainer?.isConnected && !isFullscreen

  return (
    <div
      className={`tiptap-editor-container${fillHeight ? ' tiptap-editor-container--fill' : ''}${
        isFullscreen ? ' tiptap-editor-container--fullscreen' : ''
      }${isFocusMode ? ' tiptap-editor-container--focus' : ''}`}
      style={style}
      aria-busy={imageUploading}
    >
      {slotBeforeMenu}
      {canPortalToolbar ? createPortal(menuBarContent, toolbarContainer) : menuBarContent}
      {slotAfterMenu}
      {showWritingStarter && isEditorUsable(editor) && editorIsEmpty ? (
        <div className="editor-writing-starter" aria-label="写作起点">
          <div className="editor-writing-starter__copy">
            <strong>{TEXT.starterTitle}</strong>
            <span>{TEXT.starterHint}</span>
          </div>
          <div className="editor-writing-starter__actions">
            <Button
              size="small"
              icon={<Pilcrow size={15} />}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor.chain().focus().setTextSelection(1).run()}
            >
              写正文
            </Button>
            <Button
              size="small"
              icon={<Heading2 size={15} />}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor.chain().focus().setTextSelection(1).setHeading({ level: 2 }).run()}
            >
              加标题
            </Button>
            <Button
              size="small"
              icon={<ListTodo size={15} />}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor.chain().focus().setTextSelection(1).toggleTaskList().run()}
            >
              待办清单
            </Button>
          </div>
        </div>
      ) : null}
      {isEditorUsable(editor) ? <BubbleMenuBar editor={editor} onInsertLink={openLinkModal} /> : null}
      <BlockHandle editor={editor} onInsertImageByUrl={openImageModal} />
      <EditorContent
        editor={editor}
        className={`editor-content${fillHeight ? ' editor-content--fill' : ''}`}
      />
      <ImagePromptModal
        open={imageModalOpen}
        onCancel={handleCancelImageUrl}
        onConfirm={handleConfirmImageUrl}
      />
      <LinkPromptModal
        open={linkModalOpen}
        initialUrl={isEditorUsable(editor) ? editor.getAttributes('link').href ?? '' : ''}
        onCancel={handleCancelLink}
        onConfirm={handleConfirmLink}
      />
    </div>
  )
}
