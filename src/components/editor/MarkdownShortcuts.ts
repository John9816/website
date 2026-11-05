import { Extension, wrappingInputRule } from '@tiptap/core'

/**
 * 补全 StarterKit 未覆盖的 Markdown 输入规则：
 * - `[] ` / `[ ] ` / `[x] ` → 任务项（自动包裹 taskList）
 *
 * StarterKit 已内置：# 标题、- 无序列表、1. 有序列表、> 引用、
 * ``` 代码块、--- 分隔线、**粗体**、*斜体*、`行内代码`、~~删除线~~。
 */
export const MarkdownShortcuts = Extension.create({
  name: 'markdownShortcuts',

  addInputRules() {
    const taskItemType = this.editor.schema.nodes.taskItem
    if (!taskItemType) return []

    return [
      wrappingInputRule({
        find: /^\s*(\[([ x]?)\])\s$/,
        type: taskItemType,
        getAttributes: (match) => ({ checked: match[2] === 'x' }),
      }),
    ]
  },
})
