/**
 * 编辑器命令集合 —— 工具栏与斜杠菜单共用
 * 统一走 view.dispatch，避免各处重复计算块位置
 */
import { TextSelection, Selection, NodeSelection } from "prosemirror-state";
import { setBlockType, toggleMark, wrapIn } from "prosemirror-commands";
import { liftTarget } from "prosemirror-transform";
import { closeHistory } from 'prosemirror-history';
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
} from "prosemirror-tables";
import { schema } from "../schema.js";

/** 光标所在的「最外层块」范围（doc 的直接子节点） */
export function currentBlock(state, targetPos) {
  if (Number.isInteger(targetPos)) {
    const $pos = state.doc.resolve(targetPos);
    return $pos.depth === 0 && $pos.nodeAfter ? { node: $pos.nodeAfter, pos: targetPos, index: $pos.index() } : null;
  }
  const { $from } = state.selection;
  if ($from.depth < 1) return currentBlock(state, $from.pos);
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
  const pos = b.pos + b.node.nodeSize;
  const tr = state.tr.insert(pos, node);
  tr.setSelection(node.isAtom ? NodeSelection.create(tr.doc, pos) : Selection.near(tr.doc.resolve(pos + 1)));
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
  if (!canSetLink(state)) return false;
  const range = state.selection.empty ? linkRange(state) : null;
  const ranges = state.selection.empty ? (range ? [range] : []) : state.selection.ranges.map(({ $from, $to }) => ({ from: $from.pos, to: $to.pos }));
  if (!ranges.length) {
    if (!href || !safeUrl(href)) return false;
    view.dispatch(state.tr.replaceSelectionWith(schema.text(href, [schema.marks.link.create({ href })]), false).scrollIntoView());
    return true;
  }
  if (!href) {
    const tr = state.tr;
    for (const range of ranges) tr.removeMark(range.from, range.to, schema.marks.link);
    view.dispatch(tr.removeStoredMark(schema.marks.link));
    return true;
  }
  if (!safeUrl(href)) return false;
  const tr = state.tr;
  for (const range of ranges) tr.addMark(range.from, range.to, schema.marks.link.create({ href }));
  view.dispatch(tr);
  return true;
}

export const canSetLink = state => selectedTextblocks(state).some(({ node }) => node.type.allowsMarkType(schema.marks.link));

export function safeUrl(value, image = false) {
  if (!value || /[\u0000-\u0020\u007f]/.test(value)) return false;
  if (/^https?:\/\//i.test(value)) { try { return !!new URL(value).hostname; } catch { return false; } }
  return /^\/(?!\/)/.test(value) || (!image && /^(mailto:|tel:|#)/i.test(value));
}

export function linkRange(state) {
  const { $from } = state.selection;
  const mark = schema.marks.link.isInSet($from.marks()) || schema.marks.link.isInSet($from.nodeAfter?.marks || []);
  if (!mark) return null;
  let result = null, group = null, offset = $from.start();
  $from.parent.forEach(node => {
    if (mark.isInSet(node.marks)) {
      group = group || { from: offset, to: offset, href: mark.attrs.href };
      group.to = offset + node.nodeSize;
      if (group.from <= $from.pos && group.to >= $from.pos) result = group;
    } else group = null;
    offset += node.nodeSize;
  });
  return result;
}

export function selectedTextblocks(state) {
  const found = new Map();
  for (const { $from, $to } of state.selection.ranges) {
    if ($from.pos === $to.pos && $from.parent.isTextblock) found.set($from.before(), $from.parent);
    else state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => { if (node.isTextblock) { found.set(pos, node); return false; } });
  }
  return [...found].map(([pos, node]) => ({ pos, node }));
}

export function clearFormat(view) {
  const { state } = view;
  const { empty } = state.selection;
  const tr = state.tr;
  if (!empty) {
    // schema.marks 是普通对象，需先取 values 再遍历
    for (const { $from, $to } of state.selection.ranges) {
      tr.removeMark($from.pos, $to.pos);
    }
  }
  for (const { node, pos } of selectedTextblocks(state)) {
    if (node.type === schema.nodes.heading || node.type === schema.nodes.paragraph) tr.setNodeMarkup(pos, schema.nodes.paragraph, { align: null });
  }
  tr.setStoredMarks([]);
  view.dispatch(tr.scrollIntoView());
  return true;
}

/* ---------- 块级结构 ---------- */
export const toggleQuote = (view) => {
  const { state } = view;
  const { $from, $to } = state.selection;
  const range = $from.blockRange($to, node => node.type === schema.nodes.blockquote);
  if (!range) return run(view, wrapIn(schema.nodes.blockquote));
  const target = liftTarget(range);
  if (target == null) return false;
  view.dispatch(state.tr.lift(range, target).scrollIntoView());
  return true;
};

function toggleList(view, name) {
  const { state } = view;
  const { $from, $to } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const list = $from.node(d);
    if (!['bullet_list', 'ordered_list', 'task_list'].includes(list.type.name)) continue;
    if ($to.pos > $from.end(d)) return false;
    const itemType = list.firstChild.type;
    if (list.type.name === name) return run(view, liftListItem(itemType));
    const nextItem = name === 'task_list' ? schema.nodes.task_item : schema.nodes.list_item;
    const items = [];
    list.forEach(item => items.push(nextItem.create(name === 'task_list' ? { checked: !!item.attrs.checked } : null, item.content, item.marks)));
    const pos = $from.before(d);
    const tr = state.tr.replaceWith(pos, pos + list.nodeSize, schema.nodes[name].create(null, items));
    // Conversion preserves node sizes, so keep the exact text or cell selection.
    tr.setSelection(Selection.fromJSON(tr.doc, state.selection.toJSON()));
    view.dispatch(tr.scrollIntoView());
    return true;
  }
  return run(view, wrapInList(schema.nodes[name]));
}
export const toggleBulletList = view => toggleList(view, 'bullet_list');
export const toggleOrderedList = view => toggleList(view, 'ordered_list');
export const toggleTaskList = view => toggleList(view, 'task_list');

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
  if (!safeUrl(src, true)) return false;
  const tr = view.state.tr.replaceSelectionWith(schema.nodes.image.create({ src, alt, title: alt }), false);
  const pos = tr.selection.from - 1;
  if (tr.doc.nodeAt(pos)?.type === schema.nodes.image) tr.setSelection(NodeSelection.create(tr.doc, pos));
  view.dispatch(tr.scrollIntoView());
  return true;
}

/* ---------- 块操作（手柄菜单） ---------- */
export function moveBlock(view, dir, targetPos) {
  const { state } = view;
  const b = currentBlock(state, targetPos);
  if (!b) return false;
  const idx = b.index;
  if (dir < 0 && idx === 0) return false;
  if (dir > 0 && idx >= state.doc.childCount - 1) return false;
  const sibling = state.doc.child(idx + dir);
  const from = dir < 0 ? b.pos - sibling.nodeSize : b.pos;
  const to = dir < 0 ? b.pos + b.node.nodeSize : b.pos + b.node.nodeSize + sibling.nodeSize;
  const ordered = dir < 0 ? [b.node, sibling] : [sibling, b.node];
  const tr = state.tr.replaceWith(from, to, ordered);
  tr.setSelection(Selection.near(tr.doc.resolve(dir < 0 ? from + 1 : from + sibling.nodeSize + 1)));
  view.dispatch(tr.scrollIntoView());
  return true;
}

export function duplicateBlock(view, targetPos) {
  const { state } = view;
  const b = currentBlock(state, targetPos);
  if (!b) return false;
  const tr = state.tr.insert(b.pos + b.node.nodeSize, b.node.copy(b.node.content));
  view.dispatch(tr.scrollIntoView());
  return true;
}

export function deleteBlock(view, targetPos) {
  const { state } = view;
  const b = currentBlock(state, targetPos);
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
  const { $from, empty, ranges } = state.selection;
  if (empty) return !!markType.isInSet(state.storedMarks || $from.marks());
  return ranges.some(({ $from, $to }) => state.doc.rangeHasMark($from.pos, $to.pos, markType));
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
  const tr = state.tr;
  const value = align === "left" ? null : align;
  let changed = false;
  for (const { node, pos } of selectedTextblocks(state)) {
    if (node.type.name === "paragraph" || node.type.name === "heading") {
      tr.setNodeMarkup(pos, null, { ...node.attrs, align: value });
      changed = true;
    }
  }
  if (changed) view.dispatch(tr.scrollIntoView());
  view.focus();
  return changed;
}

export function currentAlign(state) {
  const values = selectedTextblocks(state).map(({ node }) => node.attrs.align || 'left');
  return values.every(value => value === values[0]) ? values[0] || 'left' : 'mixed';
}

/* ================= 文字颜色 / 背景色 ================= */
export function setInlineStyle(view, markType, attrs) {
  const { state } = view;
  const { empty, $from } = state.selection;
  if (empty && !$from.parent.type.allowsMarkType(markType)) return false;
  const tr = state.tr;
  if (empty) {
    if (attrs) tr.addStoredMark(markType.create(attrs));
    else tr.removeStoredMark(markType);
  } else {
    for (const { $from, $to } of state.selection.ranges) {
      if (attrs) tr.addMark($from.pos, $to.pos, markType.create(attrs));
      else tr.removeMark($from.pos, $to.pos, markType);
    }
    if (!tr.docChanged) return false;
  }
  view.dispatch(tr);
  view.focus();
  return true;
}
export const setTextColor = (view, color) => setInlineStyle(view, schema.marks.textColor, { color });
export const clearTextColor = view => setInlineStyle(view, schema.marks.textColor, null);
export const setBgColor = (view, color) => setInlineStyle(view, schema.marks.bgColor, { color });
export const clearBgColor = view => setInlineStyle(view, schema.marks.bgColor, null);
export const setFontSize = (view, size) => setInlineStyle(view, schema.marks.fontSize, { size: `${size}px` });
export const clearFontSize = view => setInlineStyle(view, schema.marks.fontSize, null);

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
export const canMerge = state => mergeCells(state);
export const canSplit = state => splitCell(state);

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
  const { from, node } = state.selection;
  if (!node || node.type.name !== "image") return false;
  if (!safeUrl(src, true)) return false;
  view.dispatch(state.tr.setNodeMarkup(from, null, { ...node.attrs, src }));
  view.focus();
  return true;
}

export function deleteSelectionNode(view) {
  const { state } = view;
  view.dispatch(closeHistory(state.tr.deleteSelection()));
  view.focus();
  return true;
}

export function imageAlign(view, align) {
  // 图片对齐用段落对齐表达：选中图片后，改其所在块的对齐
  return setAlign(view, align);
}
