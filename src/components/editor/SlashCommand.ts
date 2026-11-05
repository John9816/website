import { Extension, type Editor, type Range } from '@tiptap/core'
import Suggestion, {
  type SuggestionKeyDownProps,
  type SuggestionOptions,
  type SuggestionProps,
} from '@tiptap/suggestion'
import { ReactRenderer } from '@tiptap/react'
import tippy, { type Instance as TippyInstance } from 'tippy.js'
import {
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  ImagePlus,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Table2,
  Type,
} from 'lucide-react'
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

const headingItem = (
  level: 1 | 2 | 3 | 4 | 5 | 6,
  title: string,
  description: string,
  icon: React.ReactNode,
): SlashCommandItem => ({
  title,
  description,
  hint: EDITOR_TEXT.slashHintHeading,
  keywords: [`h${level}`, `heading${level}`, String(level), '标题', 'heading'],
  icon,
  group: EDITOR_TEXT.slashGroupBasic,
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range).setHeading({ level }).run(),
})

const defaultItems = ({ onInsertImage }: { onInsertImage?: () => void }): SlashCommandItem[] => [
  {
    title: EDITOR_TEXT.slashParagraph,
    description: '普通文本段落',
    keywords: ['p', 'paragraph', 'text', '正文', '段落', '文本'],
    icon: createElement(Type, { size: 16 }),
    group: EDITOR_TEXT.slashGroupBasic,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  headingItem(1, EDITOR_TEXT.slashHeading1, '页面主标题', createElement(Heading1, { size: 16 })),
  headingItem(2, EDITOR_TEXT.slashHeading2, '章节标题', createElement(Heading2, { size: 16 })),
  headingItem(3, EDITOR_TEXT.slashHeading3, '小节标题', createElement(Heading3, { size: 16 })),
  headingItem(4, EDITOR_TEXT.slashHeading4, '四级标题', createElement(Heading4, { size: 16 })),
  headingItem(5, EDITOR_TEXT.slashHeading5, '五级标题', createElement(Heading5, { size: 16 })),
  headingItem(6, EDITOR_TEXT.slashHeading6, '六级标题', createElement(Heading6, { size: 16 })),
  {
    title: EDITOR_TEXT.slashQuote,
    description: '突出显示引用内容',
    hint: EDITOR_TEXT.slashHintQuote,
    keywords: ['quote', 'blockquote', '引用'],
    icon: createElement(Quote, { size: 16 }),
    group: EDITOR_TEXT.slashGroupBasic,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: EDITOR_TEXT.slashDivider,
    description: '分隔上下文内容',
    hint: EDITOR_TEXT.slashHintDivider,
    keywords: ['hr', 'divider', 'rule', '分隔线', '分割线'],
    icon: createElement(Minus, { size: 16 }),
    group: EDITOR_TEXT.slashGroupBasic,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    title: EDITOR_TEXT.slashBulletList,
    description: '创建项目符号列表',
    hint: EDITOR_TEXT.slashHintList,
    keywords: ['ul', 'unordered', 'list', 'bullet', '无序', '列表'],
    icon: createElement(List, { size: 16 }),
    group: EDITOR_TEXT.slashGroupList,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: EDITOR_TEXT.slashOrderedList,
    description: '创建编号列表',
    hint: EDITOR_TEXT.slashHintList,
    keywords: ['ol', 'ordered', 'list', 'number', '有序', '编号', '列表'],
    icon: createElement(ListOrdered, { size: 16 }),
    group: EDITOR_TEXT.slashGroupList,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: EDITOR_TEXT.slashTaskList,
    description: '创建可勾选任务',
    hint: EDITOR_TEXT.slashHintList,
    keywords: ['task', 'todo', 'checklist', '任务', '待办', '清单'],
    icon: createElement(ListChecks, { size: 16 }),
    group: EDITOR_TEXT.slashGroupList,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    title: EDITOR_TEXT.slashCodeBlock,
    description: '插入带语法高亮的代码',
    hint: EDITOR_TEXT.slashHintCode,
    keywords: ['code', 'codeblock', '代码', '代码块'],
    icon: createElement(Code2, { size: 16 }),
    group: EDITOR_TEXT.slashGroupAdvanced,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: EDITOR_TEXT.slashTable,
    description: '插入 3 x 3 表格',
    keywords: ['table', '表格'],
    icon: createElement(Table2, { size: 16 }),
    group: EDITOR_TEXT.slashGroupAdvanced,
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
    icon: createElement(ImagePlus, { size: 16 }),
    group: EDITOR_TEXT.slashGroupAdvanced,
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
        maxWidth: 'none',
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
