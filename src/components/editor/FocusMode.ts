import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

/**
 * 专注模式：给光标所在的顶层内容块打上标记类，配合 CSS 淡化其余块。
 *
 * 实现要点：标记必须通过 ProseMirror 装饰（Decoration）下发，而不是直接操作 DOM classList。
 * 直接改 class 会被视图的 MutationObserver 判定为外部改动，触发 readDOMChange 重绘节点，
 * 导致类名在下一帧被抹掉。装饰由视图在自身更新周期内应用，不受该机制影响。
 */

export const FOCUS_ACTIVE_CLASS = 'is-focus-active'

const focusModeKey = new PluginKey('focusMode')

interface FocusModePluginState {
  enabled: boolean
  decorations: DecorationSet
}

/** 找到光标所在的顶层内容块（doc 的直接子节点） */
function findTopLevelBlock(state: EditorState): { from: number; to: number } | null {
  const { selection } = state
  let target: { from: number; to: number } | null = null
  state.doc.forEach((node, pos) => {
    if (target) return
    const end = pos + node.nodeSize
    // 边界位置归前一个块，与视觉光标位置保持一致
    if (selection.from >= pos && selection.from <= end) {
      target = { from: pos, to: end }
    }
  })
  return target
}

function buildFocusDecorations(state: EditorState): DecorationSet {
  const range = findTopLevelBlock(state)
  if (!range) return DecorationSet.empty
  return DecorationSet.create(state.doc, [
    Decoration.node(range.from, range.to, { class: FOCUS_ACTIVE_CLASS }),
  ])
}

export const FocusModeExtension = Extension.create({
  name: 'focusMode',
  addProseMirrorPlugins() {
    return [
      new Plugin<FocusModePluginState>({
        key: focusModeKey,
        state: {
          init(): FocusModePluginState {
            return { enabled: false, decorations: DecorationSet.empty }
          },
          apply(tr, value, _oldState, newState): FocusModePluginState {
            const toggle = tr.getMeta(focusModeKey)
            if (toggle === true) {
              return { enabled: true, decorations: buildFocusDecorations(newState) }
            }
            if (toggle === false) {
              return { enabled: false, decorations: DecorationSet.empty }
            }
            if (!value.enabled) return value
            // 开启状态下，选区移动或文档变化都重新计算目标块
            if (tr.selectionSet || tr.docChanged) {
              return { enabled: true, decorations: buildFocusDecorations(newState) }
            }
            return value
          },
        },
        props: {
          decorations(state) {
            return focusModeKey.getState(state)?.decorations ?? DecorationSet.empty
          },
        },
      }),
    ]
  },
})

/** 切换专注模式（通过 meta 事务驱动插件状态，避免直接操作 DOM） */
export function setFocusModeEnabled(editor: Editor, enabled: boolean) {
  if (!editor || editor.isDestroyed) return
  editor.view.dispatch(editor.state.tr.setMeta(focusModeKey, enabled))
}
