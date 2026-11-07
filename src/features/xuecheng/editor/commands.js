/**
 * 编辑器命令集合 —— 工具栏与斜杠菜单共用
 * 统一走 view.dispatch，避免各处重复计算块位置
 */
import { TextSelection } from "prosemirror-state";
import { setBlockType, toggleMark, wrapIn, lift, chainCommands } from "prosemirror-commands";
import { wrapInList, liftListItem } from "prosemirror-schema-list";
import {
  addRowBefore,
  addRowAfter,
  addColumnBefore,
  addColumnAfter,
  deleteRow,
  deleteColumn,
  deleteTable,
  mergeCells,
  splitCell,
  toggleHeaderRow,
  toggleHeaderColumn,
  selectedRect,
} from "prosemirror-tables";
import { schema } from "../schema.js";

/** 光标所在的「最外层块」范围（doc 的直接子节点） */
export function currentBlock(state) {
  const { $from } = state.selection;
  if ($from.depth < 1) return null;
  const index = $from.index(0);
  const node = state.doc.child(index);
  const pos = $from.before(1);
  return { node, pos, index };
}

/** 在光标所在块之后插入一个节点 */
export function insertBlockAfter(view, node) {
  const { state } = view;
  const b = currentBlock(state);
  if (!b) return false;
  const tr = state.tr.insert(b.pos + b.node.nodeSize, node);
  view.dispatch(tr.scrollIntoView());
  return true;
}

/** 用给定节点替换当前块 */
export function replaceBlock(view, makeNode) {
  const { state } = view;
  const b = currentBlock(state);
  if (!b) return false;
  const node = makeNode(schema);
  const tr = state.tr.replaceWith(b.pos, b.pos + b.node.nodeSize, node);
  view.dispatch(tr.scrollIntoView());
  return true;
}

/* ---------- 文本块类型 ---------- */
export const setParagraph = (view) => run(view, setBlockType(schema.nodes.paragraph));
export const setHeading = (view, level) =>
  run(view, setBlockType(schema.nodes.heading, { level }));

/* ---------- 行内样式 ---------- */
export const toggleBold = (view) => run(view, toggleMark(schema.marks.strong));
export const toggleItalic = (view) => run(view, toggleMark(schema.marks.em));
export const toggleUnderline = (view) => run(view, toggleMark(schema.marks.underline));
export const toggleStrike = (view) => run(view, toggleMark(schema.marks.strikethrough));
export const toggleCode = (view) => run(view, toggleMark(schema.marks.code));
export const toggleHighlight = (view) => run(view, toggleMark(schema.marks.highlight));

export function setLink(view, href) {
  const { state } = view;
  const { from, to, empty } = state.selection;
  if (empty) return false;
  if (!href) {
    view.dispatch(state.tr.removeMark(from, to, schema.marks.link));
    return true;
  }
  view.dispatch(state.tr.addMark(from, to, schema.marks.link.create({ href })));
  return true;
}

export function clearFormat(view) {
  const { state } = view;
  const { from, to, empty } = state.selection;
  const tr = state.tr;
  if (!empty) {
    // schema.marks 是普通对象，需先取 values 再遍历
    for (const mark of Object.values(state.schema.marks)) {
      tr.removeMark(from, to, mark);
    }
  }
  const b = currentBlock(state);
  if (b) {
    tr.setBlockType(b.pos, b.pos + b.node.nodeSize, schema.nodes.paragraph);
  }
  view.dispatch(tr.scrollIntoView());
  return true;
}

/* ---------- 块级结构 ---------- */
export const toggleQuote = (view) => {
  const { state } = view;
  return run(view, chainCommands(lift, wrapIn(schema.nodes.blockquote)));
};

export const toggleBulletList = (view) => {
  const { state } = view;
  return run(view, chainCommands(liftListItem(schema.nodes.list_item), wrapInList(schema.nodes.bullet_list)));
};

export const toggleOrderedList = (view) => {
  const { state } = view;
  return run(view, chainCommands(liftListItem(schema.nodes.list_item), wrapInList(schema.nodes.ordered_list)));
};

/** 任务列表：当前是普通列表则整段转换，否则新建一项 */
export function toggleTaskList(view) {
  const { state } = view;
  const b = currentBlock(state);
  if (!b) return false;
  if (b.node.type.name === "task_list") {
    // 转回普通无序列表
    const list = schema.nodes.bullet_list.create(
      null,
      Array.from({ length: b.node.childCount }, (_, i) => {
        const item = b.node.child(i);
        const para = schema.nodes.paragraph.create(null, item.content);
        return schema.nodes.list_item.create(null, para);
      })
    );
    return replaceBlock(view, () => list);
  }
  const text = b.node.textContent;
  const item = schema.nodes.task_item.create({ checked: false }, [
    schema.nodes.paragraph.create(null, text ? schema.text(text) : null),
  ]);
  return replaceBlock(view, () => schema.nodes.task_list.create(null, item));
}

export function insertCallout(view, type = "info") {
  const node = schema.nodes.callout.create({ type }, [schema.nodes.paragraph.create()]);
  return insertBlockAfter(view, node);
}

export function insertToggle(view) {
  const node = schema.nodes.toggle.create({ summary: "折叠内容", open: true }, [
    schema.nodes.paragraph.create(),
  ]);
  return insertBlockAfter(view, node);
}

export function insertHr(view) {
  return insertBlockAfter(view, schema.nodes.horizontal_rule.create());
}

export function insertCodeBlock(view, language = "") {
  const node = schema.nodes.code_block.create({ language }, []);
  return insertBlockAfter(view, node);
}

export function insertTable(view, rows = 3, cols = 3) {
  // 给每列一个显式起始宽度：列拖拽只改被拖列，其余列保持不动（避免被连累均摊）
  const hostW = (view.dom && view.dom.clientWidth) || 800;
  const colW = Math.max(60, Math.floor(hostW / cols));
  const cell = (isHeader) =>
    (isHeader ? schema.nodes.table_header : schema.nodes.table_cell).createAndFill({ colwidth: [colW] });
  const rowNodes = [];
  for (let r = 0; r < rows; r++) {
    const cells = [];
    for (let c = 0; c < cols; c++) cells.push(cell(r === 0));
    rowNodes.push(schema.nodes.table_row.create(null, cells));
  }
  return insertBlockAfter(view, schema.nodes.table.create(null, rowNodes));
}

export function insertImage(view, src, alt = "") {
  return insertBlockAfter(view, schema.nodes.image.create({ src, alt, title: alt }));
}

/* ---------- 块操作（手柄菜单） ---------- */
export function moveBlock(view, dir) {
  const { state } = view;
  const b = currentBlock(state);
  if (!b) return false;
  const idx = b.index;
  if (dir < 0 && idx === 0) return false;
  if (dir > 0 && idx >= state.doc.childCount - 1) return false;
  const sibling = state.doc.child(idx + dir);
  const from = dir < 0 ? b.pos - sibling.nodeSize : b.pos;
  const to = dir < 0 ? b.pos + b.node.nodeSize : b.pos + b.node.nodeSize + sibling.nodeSize;
  const ordered = dir < 0 ? [b.node, sibling] : [sibling, b.node];
  const tr = state.tr.replaceWith(from, to, ordered);
  view.dispatch(tr.scrollIntoView());
  return true;
}

export function duplicateBlock(view) {
  const { state } = view;
  const b = currentBlock(state);
  if (!b) return false;
  const tr = state.tr.insert(b.pos + b.node.nodeSize, b.node.copy(b.node.content));
  view.dispatch(tr.scrollIntoView());
  return true;
}

export function deleteBlock(view) {
  const { state } = view;
  const b = currentBlock(state);
  if (!b || state.doc.childCount <= 1) return false;
  const tr = state.tr.delete(b.pos, b.pos + b.node.nodeSize);
  view.dispatch(tr.scrollIntoView());
  return true;
}

export function insertParagraphAt(view, pos) {
  const { state } = view;
  const tr = state.tr.insert(pos, schema.nodes.paragraph.create());
  view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1))).scrollIntoView());
  return true;
}

/** 统一执行 command，返回是否成功 */
function run(view, command) {
  if (!view) return false;
  const ok = command(view.state, view.dispatch, view);
  if (ok) view.focus();
  return ok;
}

/* ---------- 状态查询（工具栏高亮） ---------- */
export function markActive(state, markType) {
  const { from, $from, to, empty } = state.selection;
  if (empty) return !!markType.isInSet(state.storedMarks || $from.marks());
  return state.doc.rangeHasMark(from, to, markType);
}

export function blockActive(state, type, attrs = {}) {
  const { $from, node } = state.selection;
  const target = node || $from.parent;
  if (!target || target.type !== type) return false;
  // 不用 hasMarkup：它在 attrs 键数不一致时会返回 false
  //（heading 现在带 align，传 {level:1} 会被判为不匹配）
  return Object.entries(attrs).every(([k, v]) => target.attrs[k] === v);
}

export function inTable(state) {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === "table") return true;
  }
  return false;
}

/** 取最近的祖先节点（用于定位 callout / code_block / toggle / table） */
export function ancestor(state, name) {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === name) {
      return { node: $from.node(d), pos: $from.before(d), depth: d };
    }
  }
  return null;
}

/* ================= 段落对齐 ================= */
export function setAlign(view, align) {
  const { state } = view;
  const { from, to } = state.selection;
  const tr = state.tr;
  const value = align === "left" ? null : align;
  let changed = false;
  const rangeTo = to > from ? to : from + 1;
  state.doc.nodesBetween(from, rangeTo, (node, pos) => {
    if (node.type.name === "paragraph" || node.type.name === "heading") {
      tr.setNodeMarkup(pos, null, { ...node.attrs, align: value });
      changed = true;
      return false;
    }
    return true;
  });
  if (changed) view.dispatch(tr.scrollIntoView());
  view.focus();
  return changed;
}

export function currentAlign(state) {
  const b = currentBlock(state);
  return (b && b.node.attrs.align) || "left";
}

/* ================= 文字颜色 / 背景色 ================= */
export function setTextColor(view, color) {
  const { state } = view;
  const { from, to, empty } = state.selection;
  const mark = schema.marks.textColor.create({ color });
  if (empty) {
    view.dispatch(state.tr.addStoredMark(mark));
  } else {
    view.dispatch(state.tr.addMark(from, to, mark));
  }
  view.focus();
  return true;
}

export function clearTextColor(view) {
  const { state } = view;
  const { from, to, empty } = state.selection;
  const tr = empty
    ? state.tr.removeStoredMark(schema.marks.textColor)
    : state.tr.removeMark(from, to, schema.marks.textColor);
  view.dispatch(tr);
  view.focus();
  return true;
}

export function setBgColor(view, color) {
  const { state } = view;
  const { from, to, empty } = state.selection;
  const mark = schema.marks.bgColor.create({ color });
  if (empty) {
    view.dispatch(state.tr.addStoredMark(mark));
  } else {
    view.dispatch(state.tr.addMark(from, to, mark));
  }
  view.focus();
  return true;
}

export function clearBgColor(view) {
  const { state } = view;
  const { from, to, empty } = state.selection;
  const tr = empty
    ? state.tr.removeStoredMark(schema.marks.bgColor)
    : state.tr.removeMark(from, to, schema.marks.bgColor);
  view.dispatch(tr);
  view.focus();
  return true;
}

/* ================= 字号 ================= */
export function setFontSize(view, size) {
  const { state } = view;
  const { from, to, empty } = state.selection;
  const mark = schema.marks.fontSize.create({ size: `${size}px` });
  let tr;
  if (empty) {
    // 空选区时作用于整个当前块，符合「选字号即整段生效」的预期
    const b = currentBlock(state);
    if (b && b.node.content.size > 0) {
      tr = state.tr.addMark(b.pos + 1, b.pos + b.node.nodeSize - 1, mark);
    } else {
      tr = state.tr.addStoredMark(mark);
    }
  } else {
    tr = state.tr.addMark(from, to, mark);
  }
  view.dispatch(tr);
  view.focus();
  return true;
}

export function clearFontSize(view) {
  const { state } = view;
  const { from, to, empty } = state.selection;
  let tr;
  if (empty) {
    const b = currentBlock(state);
    tr =
      b && b.node.content.size > 0
        ? state.tr.removeMark(b.pos + 1, b.pos + b.node.nodeSize - 1, schema.marks.fontSize)
        : state.tr.removeStoredMark(schema.marks.fontSize);
  } else {
    tr = state.tr.removeMark(from, to, schema.marks.fontSize);
  }
  view.dispatch(tr);
  view.focus();
  return true;
}

/* ================= 上标 / 下标 ================= */
export const toggleSup = (view) => run(view, toggleMark(schema.marks.superscript));
export const toggleSub = (view) => run(view, toggleMark(schema.marks.subscript));

/* ================= 表格 ================= */
const tableCmd = (command) => (view) => {
  if (!view) return false;
  const ok = command(view.state, view.dispatch, view);
  if (ok) view.focus();
  return ok;
};

export const tableAddRowBefore = tableCmd(addRowBefore);
export const tableAddRowAfter = tableCmd(addRowAfter);
export const tableAddColBefore = tableCmd(addColumnBefore);
export const tableAddColAfter = tableCmd(addColumnAfter);
export const tableDeleteRow = tableCmd(deleteRow);
export const tableDeleteCol = tableCmd(deleteColumn);
export const tableDelete = tableCmd(deleteTable);
export const tableMerge = tableCmd(mergeCells);
export const tableSplit = tableCmd(splitCell);
export const tableToggleHeaderRow = tableCmd(toggleHeaderRow);
export const tableToggleHeaderCol = tableCmd(toggleHeaderColumn);

/* 一次插入多行 / 多列（count 默认 1，保持旧行为） */
function insertRows(view, count, after) {
  if (!view) return false;
  const cmd = after ? addRowAfter : addRowBefore;
  for (let i = 0; i < count; i++) {
    if (!cmd(view.state, view.dispatch, view)) break;
  }
  view.focus();
  return true;
}
function insertCols(view, count, after) {
  if (!view) return false;
  const cmd = after ? addColumnAfter : addColumnBefore;
  for (let i = 0; i < count; i++) {
    if (!cmd(view.state, view.dispatch, view)) break;
  }
  view.focus();
  return true;
}
export const tableAddRowsAfter = (view, n = 1) => insertRows(view, n, true);
export const tableAddRowsBefore = (view, n = 1) => insertRows(view, n, false);
export const tableAddColsAfter = (view, n = 1) => insertCols(view, n, true);
export const tableAddColsBefore = (view, n = 1) => insertCols(view, n, false);

/** 当前是否多选了多个单元格（决定「合并」是否可用） */
export function canMerge(state) {
  try {
    const r = selectedRect(state);
    return r.width > 1 || r.height > 1;
  } catch (_) {
    return false;
  }
}

/* ================= 块属性切换 ================= */
/** 修改最近祖先节点的 attrs */
function patchAncestor(view, name, attrs) {
  const { state } = view;
  const hit = ancestor(state, name);
  if (!hit) return false;
  view.dispatch(state.tr.setNodeMarkup(hit.pos, null, { ...hit.node.attrs, ...attrs }));
  view.focus();
  return true;
}

export const setCalloutType = (view, type) => patchAncestor(view, "callout", { type });
export const setCodeLanguage = (view, language) => patchAncestor(view, "code_block", { language });
export const setToggleSummary = (view, summary) => patchAncestor(view, "toggle", { summary });

/** 提示块类型的中文名（工具栏与上下文条共用） */
export const CALLOUT_TYPES = [
  { key: "info", label: "信息", color: "#4a9bff" },
  { key: "success", label: "成功", color: "#2fbf71" },
  { key: "warning", label: "警告", color: "#f5a623" },
  { key: "danger", label: "危险", color: "#d93026" },
];

/* ================= 图片 ================= */
export function replaceImage(view, src) {
  const { state } = view;
  const { from, to, node } = state.selection;
  if (!node || node.type.name !== "image") return false;
  view.dispatch(state.tr.setNodeMarkup(from, null, { ...node.attrs, src }));
  view.focus();
  return true;
}

export function deleteSelectionNode(view) {
  const { state } = view;
  view.dispatch(state.tr.deleteSelection());
  view.focus();
  return true;
}

export function imageAlign(view, align) {
  // 图片对齐用段落对齐表达：选中图片后，改其所在块的对齐
  return setAlign(view, align);
}
