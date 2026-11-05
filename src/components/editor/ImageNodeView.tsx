import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { mergeAttributes } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import { AlignCenter, AlignLeft, AlignRight, Trash2 } from 'lucide-react'
import { EDITOR_TEXT } from './texts'

type ImageAlign = 'left' | 'center' | 'right'
type ImageWidth = '50%' | '75%' | '100%'

const ALIGN_OPTIONS: { value: ImageAlign; label: string; icon: React.ReactNode }[] = [
  { value: 'left', label: EDITOR_TEXT.imageAlignLeft, icon: <AlignLeft size={14} /> },
  { value: 'center', label: EDITOR_TEXT.imageAlignCenter, icon: <AlignCenter size={14} /> },
  { value: 'right', label: EDITOR_TEXT.imageAlignRight, icon: <AlignRight size={14} /> },
]

const WIDTH_OPTIONS: { value: ImageWidth; label: string }[] = [
  { value: '50%', label: EDITOR_TEXT.imageSizeSmall },
  { value: '75%', label: EDITOR_TEXT.imageSizeMedium },
  { value: '100%', label: EDITOR_TEXT.imageSizeLarge },
]

function buildImageStyle(width: string | null, align: string | null): string {
  const parts: string[] = []
  if (width) parts.push(`width:${width}`)
  if (align === 'left') {
    parts.push('margin-left:0', 'margin-right:auto')
  } else if (align === 'right') {
    parts.push('margin-left:auto', 'margin-right:0')
  } else {
    parts.push('margin-left:auto', 'margin-right:auto')
  }
  return parts.join(';')
}

function parseImageStyle(style: string): { width: string | null; align: ImageAlign | null } {
  const widthMatch = /width\s*:\s*([^;]+)/i.exec(style)
  const marginLeft = /margin-left\s*:\s*([^;]+)/i.exec(style)
  const marginRight = /margin-right\s*:\s*([^;]+)/i.exec(style)
  let align: ImageAlign | null = null
  const left = marginLeft?.[1]?.trim()
  const right = marginRight?.[1]?.trim()
  if (left === '0px' || left === '0') align = 'left'
  else if (right === '0px' || right === '0') align = 'right'
  else if (left === 'auto' && right === 'auto') align = 'center'
  return { width: widthMatch?.[1]?.trim() ?? null, align }
}

export function ImageNodeView({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const width = (node.attrs.width as string | null) ?? null
  const align = (node.attrs.align as ImageAlign | null) ?? 'center'
  const src = node.attrs.src as string
  const alt = (node.attrs.alt as string | null) ?? ''

  const setAlign = (value: ImageAlign) => {
    updateAttributes({ align: value })
  }

  const setWidth = (value: ImageWidth | null) => {
    updateAttributes({ width: value })
  }

  const handleDelete = () => {
    editor.chain().focus().deleteSelection().run()
  }

  return (
    <NodeViewWrapper
      className="editor-image-node"
      data-align={align}
      data-selected={selected ? 'true' : undefined}
    >
      <img
        className="editor-image-node__img"
        src={src}
        alt={alt}
        draggable={false}
        style={{ width: width ?? undefined }}
      />
      {selected ? (
        <div
          className="editor-image-toolbar"
          contentEditable={false}
          role="toolbar"
          aria-label={EDITOR_TEXT.imageSelected}
        >
          <div className="editor-image-toolbar__group">
            {ALIGN_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`editor-image-toolbar__btn${align === option.value ? ' is-active' : ''}`}
                title={option.label}
                aria-label={option.label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setAlign(option.value)}
              >
                {option.icon}
              </button>
            ))}
          </div>
          <div className="editor-image-toolbar__group">
            {WIDTH_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`editor-image-toolbar__btn${width === option.value ? ' is-active' : ''}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setWidth(option.value)}
              >
                {option.label}
              </button>
            ))}
            <button
              type="button"
              className={`editor-image-toolbar__btn${width === null ? ' is-active' : ''}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setWidth(null)}
            >
              {EDITOR_TEXT.imageSizeOriginal}
            </button>
          </div>
          <div className="editor-image-toolbar__group">
            <button
              type="button"
              className="editor-image-toolbar__btn is-danger"
              title={EDITOR_TEXT.deleteImage}
              aria-label={EDITOR_TEXT.deleteImage}
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleDelete}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ) : null}
    </NodeViewWrapper>
  )
}

/**
 * Image 扩展：持久化对齐与宽度属性，并使用自定义节点视图提供选中工具条。
 * 属性同时渲染为 data-* 与内联样式，保证编辑器外（文章预览 / 分享页）观感一致。
 */
export const ImageExtended = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => {
          const dataWidth = element.getAttribute('data-width')
          if (dataWidth) return dataWidth
          const styleWidth = element.getAttribute('style')
          if (styleWidth) return parseImageStyle(styleWidth).width
          return null
        },
        renderHTML: (attributes) =>
          attributes.width ? { 'data-width': attributes.width as string } : {},
      },
      align: {
        default: 'center',
        parseHTML: (element) => {
          const dataAlign = element.getAttribute('data-align')
          if (dataAlign === 'left' || dataAlign === 'center' || dataAlign === 'right') return dataAlign
          const style = element.getAttribute('style')
          if (style) return parseImageStyle(style).align ?? 'center'
          return 'center'
        },
        renderHTML: (attributes) =>
          attributes.align ? { 'data-align': attributes.align as string } : {},
      },
    }
  },

  renderHTML({ HTMLAttributes }) {
    const width = (HTMLAttributes['data-width'] as string | undefined) ?? null
    const align = (HTMLAttributes['data-align'] as ImageAlign | undefined) ?? 'center'
    const style = buildImageStyle(width, align)
    return [
      'img',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, style ? { style } : {}),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView)
  },
})
