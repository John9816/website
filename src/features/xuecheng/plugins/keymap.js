/**
 * 快捷键映射
 * 说明：表格删除类操作只放在工具栏，不绑裸 Backspace —— 否则误触会整行/整表消失。
 */
import { keymap } from "prosemirror-keymap";
import {
  baseKeymap,
  toggleMark,
  setBlockType,
  chainCommands,
  exitCode,
  newlineInCode,
  splitBlock,
} from "prosemirror-commands";
import { undo, redo, history } from "prosemirror-history";
import { splitListItem, liftListItem, sinkListItem } from "prosemirror-schema-list";
import { goToNextCell, addRowAfter, addColumnAfter } from "prosemirror-tables";
import { TextSelection } from "prosemirror-state";
import { schema } from "../schema.js";

/** 切换任务项勾选状态 */
export const toggleTaskChecked = (state, dispatch) => {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === "task_item") {
      if (dispatch) {
        const pos = $from.before(d);
        dispatch(
          state.tr.setNodeMarkup(pos, null, { ...node.attrs, checked: !node.attrs.checked })
        );
      }
      return true;
    }
  }
  return false;
};

/** 在光标所在块之后插入一个空段落（块手柄的「+」用它） */
export const insertParagraphAfter = (state, dispatch) => {
  const { $from } = state.selection;
  // 找到最外层块
  let depth = $from.depth;
  while (depth > 0 && $from.node(depth).isBlock && depth > 1) depth--;
  const after = $from.after(depth);
  if (dispatch) {
    const tr = state.tr.insert(after, schema.nodes.paragraph.create());
    dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(after + 1))));
  }
  return true;
};

export function buildKeymap() {
  const keys = {
    "Mod-z": undo,
    "Mod-y": redo,
    "Mod-Shift-z": redo,

    "Mod-b": toggleMark(schema.marks.strong),
    "Mod-i": toggleMark(schema.marks.em),
    "Mod-u": toggleMark(schema.marks.underline),
    "Mod-Shift-x": toggleMark(schema.marks.strikethrough),
    "Mod-e": toggleMark(schema.marks.code),
    "Mod-Shift-h": toggleMark(schema.marks.highlight),

    "Mod-Alt-0": setBlockType(schema.nodes.paragraph),
    "Mod-Alt-1": setBlockType(schema.nodes.heading, { level: 1 }),
    "Mod-Alt-2": setBlockType(schema.nodes.heading, { level: 2 }),
    "Mod-Alt-3": setBlockType(schema.nodes.heading, { level: 3 }),

    Enter: splitListItem(schema.nodes.list_item),
    "Shift-Tab": liftListItem(schema.nodes.list_item),
    Tab: chainCommands(
      sinkListItem(schema.nodes.list_item),
      sinkListItem(schema.nodes.task_item),
      goToNextCell(1)
    ),
    "Mod-Enter": chainCommands(exitCode, newlineInCode),
    "Mod-Shift-Enter": toggleTaskChecked,

    "Mod-Alt-r": addRowAfter,
    "Mod-Alt-c": addColumnAfter,

    // 代码块内换行：Shift-Enter 插入软换行，Mod-Enter 跳出代码块
    "Shift-Enter": chainCommands(newlineInCode, splitBlock),
  };
  return [keymap(keys), keymap(baseKeymap)];
}

export { history };
