import { Extension } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'

/**
 * 块级键盘操作：
 * - Alt + ↑ / Alt + ↓：上下移动光标所在的顶层内容块
 */
export const BlockOps = Extension.create({
  name: 'blockOps',

  addKeyboardShortcuts() {
    const moveCurrentBlock = (direction: -1 | 1) => {
      const { state, view } = this.editor
      const { $from } = state.selection

      // 光标所在顶层块的起始位置与节点
      const blockFrom = $from.before(1)
      const node = state.doc.nodeAt(blockFrom)
      if (!node) return false
      const blockEnd = blockFrom + node.nodeSize

      // 计算插入位置：上移 → 上一个块的起点；下移 → 下一个块的终点
      let insertPos: number | null = null
      state.doc.forEach((sibling, offset) => {
        if (insertPos !== null) return
        const end = offset + sibling.nodeSize
        if (direction === -1 && end <= blockFrom) {
          insertPos = offset
        }
        if (direction === 1 && offset >= blockEnd) {
          insertPos = end
        }
      })
      if (insertPos === null) return false

      const tr = state.tr
      tr.delete(blockFrom, blockEnd)
      const adjusted = insertPos > blockEnd ? insertPos - node.nodeSize : insertPos
      if (adjusted === blockFrom) return false
      tr.insert(adjusted, node)
      const selection = TextSelection.near(tr.doc.resolve(adjusted + 1))
      if (selection) tr.setSelection(selection)
      view.dispatch(tr)
      view.focus()
      return true
    }

    return {
      'Alt-ArrowUp': () => moveCurrentBlock(-1),
      'Alt-ArrowDown': () => moveCurrentBlock(1),
    }
  },
})
