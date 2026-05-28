import { Extension, type Editor, type Range } from '@tiptap/core'
import Suggestion, {
  type SuggestionKeyDownProps,
  type SuggestionOptions,
  type SuggestionProps,
} from '@tiptap/suggestion'
import { ReactRenderer } from '@tiptap/react'
import tippy, { type Instance as TippyInstance } from 'tippy.js'
import {
  CheckSquareOutlined,
  CodeOutlined,
  FontSizeOutlined,
  LineOutlined,
  OrderedListOutlined,
  PictureOutlined,
  TableOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import { createElement } from 'react'
import {
  SlashCommandList,
  type SlashCommandItem,
  type SlashCommandListHandle,
} from './SlashCommandList'
import { EDITOR_TEXT } from './texts'

interface SlashCommandStorage {
  onInsertImage?: () => void
}

type SlashCommandSuggestionOptions = SuggestionOptions<SlashCommandItem, SlashCommandItem>
type SlashCommandSuggestionProps = SuggestionProps<SlashCommandItem, SlashCommandItem>
type SlashCommandItemsProps = { query: string; editor: Editor }

const defaultItems = ({ onInsertImage }: { onInsertImage?: () => void }): SlashCommandItem[] => [
  {
    title: EDITOR_TEXT.slashHeading1,
    keywords: ['h1', 'heading1', 'title'],
    icon: createElement(FontSizeOutlined),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 1 }).run(),
  },
  {
    title: EDITOR_TEXT.slashHeading2,
    keywords: ['h2', 'heading2'],
    icon: createElement(FontSizeOutlined),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run(),
  },
  {
    title: EDITOR_TEXT.slashHeading3,
    keywords: ['h3', 'heading3'],
    icon: createElement(FontSizeOutlined),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run(),
  },
  {
    title: EDITOR_TEXT.slashBulletList,
    keywords: ['ul', 'unordered', 'list', 'bullet'],
    icon: createElement(UnorderedListOutlined),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: EDITOR_TEXT.slashOrderedList,
    keywords: ['ol', 'ordered', 'list', 'number'],
    icon: createElement(OrderedListOutlined),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: EDITOR_TEXT.slashTaskList,
    keywords: ['task', 'todo', 'checklist'],
    icon: createElement(CheckSquareOutlined),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    title: EDITOR_TEXT.slashQuote,
    keywords: ['quote', 'blockquote'],
    icon: createElement(LineOutlined),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: EDITOR_TEXT.slashCodeBlock,
    keywords: ['code', 'codeblock'],
    icon: createElement(CodeOutlined),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: EDITOR_TEXT.slashDivider,
    keywords: ['hr', 'divider', 'rule'],
    icon: createElement(LineOutlined),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    title: EDITOR_TEXT.slashTable,
    keywords: ['table'],
    icon: createElement(TableOutlined),
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  {
    title: EDITOR_TEXT.slashImage,
    keywords: ['image', 'img', 'picture'],
    icon: createElement(PictureOutlined),
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run()
      onInsertImage?.()
    },
  },
]

const renderSuggestion: SlashCommandSuggestionOptions['render'] = () => {
  let component: ReactRenderer<SlashCommandListHandle> | null = null
  let popup: TippyInstance | null = null
  let cachedRect: DOMRect | null = null

  return {
    onStart: (props: SlashCommandSuggestionProps) => {
      component = new ReactRenderer(SlashCommandList, {
        props,
        editor: props.editor,
      })
      if (!props.clientRect) return
      cachedRect = props.clientRect()
      if (!cachedRect) return
      const referenceRect = cachedRect
      popup = tippy(document.body, {
        getReferenceClientRect: () => props.clientRect?.() ?? referenceRect,
        appendTo: () => document.body,
        content: component.element,
        showOnCreate: true,
        interactive: true,
        trigger: 'manual',
        placement: 'bottom-start',
      })
    },
    onUpdate: (props: SlashCommandSuggestionProps) => {
      component?.updateProps(props)
      if (props.clientRect) {
        const fallback = cachedRect
        popup?.setProps({
          getReferenceClientRect: () => props.clientRect?.() ?? fallback ?? new DOMRect(),
        })
      }
    },
    onKeyDown: (props: SuggestionKeyDownProps) => {
      if (props.event.key === 'Escape') {
        popup?.hide()
        return true
      }
      return component?.ref?.onKeyDown(props) ?? false
    },
    onExit: () => {
      popup?.destroy()
      component?.destroy()
      popup = null
      component = null
      cachedRect = null
    },
  }
}

export interface SlashCommandOptions {
  suggestion: Omit<SlashCommandSuggestionOptions, 'editor'>
  onInsertImage?: () => void
}

export const SlashCommand = Extension.create<SlashCommandOptions, SlashCommandStorage>({
  name: 'slashCommand',

  addOptions() {
    return {
      onInsertImage: undefined,
      suggestion: {
        char: '/',
        startOfLine: false,
        allowSpaces: false,
        command: ({
          editor,
          range,
          props,
        }: {
          editor: Editor
          range: Range
          props: SlashCommandItem
        }) => {
          props.command({ editor, range })
        },
        items: ({ query }: SlashCommandItemsProps): SlashCommandItem[] => {
          // `this` is the extension instance — but `items` runs without `this`
          // so we capture options via closure created in `addProseMirrorPlugins`
          return filterItems(defaultItems({}), query)
        },
        render: renderSuggestion,
      },
    }
  },

  addStorage() {
    return {
      onInsertImage: undefined,
    }
  },

  addProseMirrorPlugins() {
    const extension = this
    return [
      Suggestion<SlashCommandItem>({
        editor: this.editor,
        ...this.options.suggestion,
        items: ({ query }: SlashCommandItemsProps) =>
          filterItems(
            defaultItems({ onInsertImage: extension.storage.onInsertImage }),
            query,
          ),
      }),
    ]
  },
})

function filterItems(items: SlashCommandItem[], query: string): SlashCommandItem[] {
  if (!query) return items
  const q = query.toLowerCase()
  return items.filter((item) => {
    if (item.title.toLowerCase().includes(q)) return true
    return (item.keywords ?? []).some((kw) => kw.toLowerCase().includes(q))
  })
}
