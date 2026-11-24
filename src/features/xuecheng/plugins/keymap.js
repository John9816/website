/**
 * 快捷键映射
 * 说明：表格删除类操作只放在工具栏，不绑裸 Backspace —— 否则误触会整行/整表消失。
 */
import { keymap } from "prosemirror-keymap";
import {
  baseKeymap,
  chainCommands,
  exitCode,
  newlineInCode,

} from "prosemirror-commands";
import { redo, history } from "prosemirror-history";
import { splitListItemKeepMarks, liftListItem, sinkListItem } from "prosemirror-schema-list";
import { goToNextCell, addRowAfter, addColumnAfter, isInTable } from "prosemirror-tables";
import { AllSelection, EditorState, Selection, TextSelection } from "prosemirror-state";
import { schema } from "../schema.js";
import { actions } from "../editor/actions.js";
import { undoInputRule } from 'prosemirror-inputrules';

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
  if (!depth) return false;
  while (depth > 0 && $from.node(depth).isBlock && depth > 1) depth--;
  const after = $from.after(depth);
  if (dispatch) {
    const tr = state.tr.insert(after, schema.nodes.paragraph.create());
    dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(after + 1))));
  }
  return true;
};

// At the final table cell, Tab appends one row as a single undoable transaction.
const nextCell = (state, dispatch) => {
  if (!isInTable(state)) return false;
  if (goToNextCell(1)(state, dispatch)) return true;
  let tr;
  if (!addRowAfter(state, value => { tr = value; })) return false;
  // Table plugins can append column-width fixes. Derive the cursor from this
  // exact transaction doc, then let the real dispatch apply those fixes once.
  const nextState = EditorState.create({ doc: tr.doc, selection: tr.selection });
  goToNextCell(1)(nextState, next => tr.setSelection(next.selection));
  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
};
const softBreak = (state, dispatch) => {
  if (!state.selection.$from.parent.inlineContent) return false;
  if (dispatch) dispatch(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView());
  return true;
};
const splitTask = (state, dispatch) => splitListItemKeepMarks(schema.nodes.task_item, { checked: false })(state, dispatch && (tr => {
  const { $from } = tr.selection;
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type === schema.nodes.task_item) {
    tr.setNodeMarkup($from.before(d), null, { checked: false }); break;
  }
  dispatch(tr);
}));
export function buildKeymap(handlers = {}) {
  const keys = Object.fromEntries(Object.values(actions).map(action => [action.shortcut, action.command]));
  Object.assign(keys, {
    ArrowLeft: collapseAll(-1),
    ArrowRight: collapseAll(1),
    Backspace: undoInputRule,
    'Mod-y': redo,
    'Mod-k': () => { handlers.link?.(); return !!handlers.link; },
    Enter: chainCommands(splitTask, splitListItemKeepMarks(schema.nodes.list_item)),
    'Shift-Tab': chainCommands(goToNextCell(-1), liftListItem(schema.nodes.task_item), liftListItem(schema.nodes.list_item)),
    Tab: chainCommands(nextCell, sinkListItem(schema.nodes.task_item), sinkListItem(schema.nodes.list_item)),
    'Mod-Enter': chainCommands(exitCode, insertParagraphAfter),
    'Mod-Shift-Enter': toggleTaskChecked,
    'Mod-Alt-r': addRowAfter,
    'Mod-Alt-c': addColumnAfter,
    'Shift-Enter': chainCommands(newlineInCode, softBreak),
  });
  return [keymap(keys), keymap(baseKeymap)];
}

// Avoid relying on the browser's selectionchange timing immediately after a
// dialog/toolbar returns focus with a whole-document selection.
function collapseAll(direction) {
  return (state, dispatch) => {
    if (!(state.selection instanceof AllSelection)) return false;
    if (dispatch) dispatch(state.tr.setSelection(direction < 0 ? Selection.atStart(state.doc) : Selection.atEnd(state.doc)).scrollIntoView());
    return true;
  };
}

export { history };
