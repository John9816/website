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
    title: EDITOR_TEXT.slashParagraph,
    description: '普通文本段落',
    keywords: ['p', 'paragraph', 'text', '正文', '段落', '文本'],
    icon: createElement(FontSizeOutlined),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    title: EDITOR_TEXT.slashHeading1,
    description: '页面主标题',
    keywords: ['h1', 'heading1', 'title', '一级', '标题'],
    icon: createElement(FontSizeOutlined),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 1 }).run(),
  },
  {
    title: EDITOR_TEXT.slashHeading2,
    description: '章节标题',
    keywords: ['h2', 'heading2', '二级', '标题'],
    icon: createElement(FontSizeOutlined),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run(),
  },
  {
    title: EDITOR_TEXT.slashHeading3,
    description: '小节标题',
    keywords: ['h3', 'heading3', '三级', '标题'],
    icon: createElement(FontSizeOutlined),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run(),
  },
  {
    title: EDITOR_TEXT.slashHeading4,
    description: '四级标题',
    keywords: ['h4', 'heading4', '四级', '标题'],
    icon: createElement(FontSizeOutlined),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 4 }).run(),
  },
  {
    title: EDITOR_TEXT.slashHeading5,
    description: '五级标题',
    keywords: ['h5', 'heading5', '五级', '标题'],
    icon: createElement(FontSizeOutlined),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 5 }).run(),
  },
  {
    title: EDITOR_TEXT.slashHeading6,
    description: '六级标题',
    keywords: ['h6', 'heading6', '六级', '标题'],
    icon: createElement(FontSizeOutlined),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 6 }).run(),
  },
  {
    title: EDITOR_TEXT.slashBulletList,
    description: '创建项目符号列表',
    keywords: ['ul', 'unordered', 'list', 'bullet', '无序', '列表'],
    icon: createElement(UnorderedListOutlined),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: EDITOR_TEXT.slashOrderedList,
    description: '创建编号列表',
    keywords: ['ol', 'ordered', 'list', 'number', '有序', '编号', '列表'],
    icon: createElement(OrderedListOutlined),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: EDITOR_TEXT.slashTaskList,
    description: '创建可勾选任务',
    keywords: ['task', 'todo', 'checklist', '任务', '待办', '清单'],
    icon: createElement(CheckSquareOutlined),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    title: EDITOR_TEXT.slashQuote,
    description: '突出显示引用内容',
    keywords: ['quote', 'blockquote', '引用'],
    icon: createElement(LineOutlined),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: EDITOR_TEXT.slashCodeBlock,
    description: '插入带语法高亮的代码',
    keywords: ['code', 'codeblock', '代码', '代码块'],
    icon: createElement(CodeOutlined),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: EDITOR_TEXT.slashDivider,
    description: '分隔上下文内容',
    keywords: ['hr', 'divider', 'rule', '分隔线', '分割线'],
    icon: createElement(LineOutlined),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    title: EDITOR_TEXT.slashTable,
    description: '插入 3 x 3 表格',
    keywords: ['table', '表格'],
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
    description: '通过链接插入图片',
    keywords: ['image', 'img', 'picture', '图片', '图像'],
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
      onInsertImage: this.options.onInsertImage,
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
