import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { LoadingOutlined } from '@ant-design/icons'
import { EDITOR_TEXT } from './texts'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    imagePlaceholder: {
      insertImagePlaceholder: (id: string) => ReturnType
      replaceImagePlaceholder: (id: string, attrs: { src: string; alt?: string }) => ReturnType
      removeImagePlaceholder: (id: string) => ReturnType
    }
  }
}

function PlaceholderView({ node }: NodeViewProps) {
  return (
    <NodeViewWrapper className="editor-image-placeholder" data-placeholder-id={node.attrs.id}>
      <span className="editor-image-placeholder__spinner" aria-hidden>
        <LoadingOutlined spin />
      </span>
      <span className="editor-image-placeholder__hint">{EDITOR_TEXT.imagePlaceholderHint}</span>
    </NodeViewWrapper>
  )
}

export const ImagePlaceholder = Node.create({
  name: 'imagePlaceholder',
  group: 'block',
  atom: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-placeholder-id'),
        renderHTML: (attrs) => (attrs.id ? { 'data-placeholder-id': attrs.id } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-placeholder-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'editor-image-placeholder' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(PlaceholderView)
  },

  addCommands() {
    return {
      insertImagePlaceholder:
        (id: string) =>
        ({ chain }) =>
          chain().insertContent({ type: this.name, attrs: { id } }).run(),

      replaceImagePlaceholder:
        (id: string, attrs: { src: string; alt?: string }) =>
        ({ state, dispatch }) => {
          let foundPos: number | null = null
          state.doc.descendants((node, pos) => {
            if (node.type.name === 'imagePlaceholder' && node.attrs.id === id) {
              foundPos = pos
              return false
            }
            return true
          })
          if (foundPos === null) return false
          if (!dispatch) return true
          const imageType = state.schema.nodes.image
          if (!imageType) return false
          const imageNode = imageType.create({ src: attrs.src, alt: attrs.alt ?? null })
          const tr = state.tr.replaceWith(foundPos, foundPos + 1, imageNode)
          dispatch(tr)
          return true
        },

      removeImagePlaceholder:
        (id: string) =>
        ({ state, dispatch }) => {
          let foundPos: number | null = null
          state.doc.descendants((node, pos) => {
            if (node.type.name === 'imagePlaceholder' && node.attrs.id === id) {
              foundPos = pos
              return false
            }
            return true
          })
          if (foundPos === null) return false
          if (!dispatch) return true
          const tr = state.tr.delete(foundPos, foundPos + 1)
          dispatch(tr)
          return true
        },
    }
  },
})
