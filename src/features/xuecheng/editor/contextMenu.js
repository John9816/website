import { NodeSelection, Selection } from 'prosemirror-state';
import { selectAll, deleteSelection } from 'prosemirror-commands';
import { addRowBefore, addRowAfter, addColumnBefore, addColumnAfter, deleteRow, deleteColumn, deleteTable, CellSelection, mergeCells, splitCell, toggleHeaderRow, toggleHeaderColumn } from 'prosemirror-tables';
import * as cmd from './commands.js';
import { actions, actionState, runAction, shortcutLabel } from './actions.js';

// Keep a right-click inside the selection from collapsing it. Otherwise target
// the clicked text/image/cell, so commands never modify an unrelated block.
export function selectContextTarget(view, event) {
  const hit = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (!hit) return;
  const { state } = view;
  const { from, to, empty } = state.selection;
  if (!empty) {
    let inside = false;
    if (state.selection instanceof CellSelection) state.selection.forEachCell((node, pos) => { if (hit.pos >= pos && hit.pos < pos + node.nodeSize) inside = true; });
    else inside = hit.pos >= from && hit.pos <= to;
    if (inside) return;
  }
  const image = event.target.closest?.('img');
  const at = image ? view.posAtDOM(image, 0) : hit.pos;
  const node = state.doc.nodeAt(at);
  const selection = image && node?.type.name === 'image'
    ? NodeSelection.create(state.doc, at) : Selection.near(state.doc.resolve(hit.pos));
  view.dispatch(state.tr.setSelection(selection));
}

async function copySelection(view, cut) {
  const snapshot = view.state;
  if (snapshot.selection.empty) return;
  const { dom, text } = view.serializeForClipboard(snapshot.selection.content());
  try {
    if (navigator.clipboard?.write && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/plain': new Blob([text], { type: 'text/plain' }),
        'text/html': new Blob([dom.innerHTML], { type: 'text/html' }),
      })]);
    } else {
      await navigator.clipboard.writeText(text);
    }
  } catch { throw new Error('浏览器未允许访问剪贴板，请使用键盘快捷键复制或剪切'); }
  if (cut && !view.isDestroyed && view.state.doc === snapshot.doc && view.state.selection.eq(snapshot.selection)) {
    deleteSelection(view.state, view.dispatch);
  }
}

async function paste(view, plainOnly = false) {
  const snapshot = view.state;
  let html, text;
  try {
    if (navigator.clipboard?.read) {
      const items = await navigator.clipboard.read();
      const rich = items.find(item => item.types.includes('text/html'));
      const plain = items.find(item => item.types.includes('text/plain'));
      if (rich && !plainOnly) html = await (await rich.getType('text/html')).text();
      else if (plain) text = await (await plain.getType('text/plain')).text();
    } else text = await navigator.clipboard.readText();
  } catch { throw new Error('浏览器未允许读取剪贴板，请在正文中按 Ctrl+V 或 ⌘V 粘贴'); }
  if (view.isDestroyed) return;
  if (view.state.doc !== snapshot.doc || !view.state.selection.eq(snapshot.selection)) {
    throw new Error('编辑位置已改变，请在目标位置重新粘贴');
  }
  if (html) view.pasteHTML(html);
  else if (text) view.pasteText(text);
  else throw new Error('剪贴板中没有可粘贴的文字；图片请使用键盘快捷键粘贴');
}

export function editorContextItems(view, handlers = {}) {
  const snapshot = view.state;
  const guard = run => () => {
    if (view.isDestroyed) return;
    if (view.state.doc !== snapshot.doc || !view.state.selection.eq(snapshot.selection)) throw new Error('编辑位置已改变，请重新打开菜单');
    return run();
  };
  const command = (label, run, danger = false) => ({ label, danger, disabled: !run(view.state), run: guard(() => run(view.state, view.dispatch, view)) });
  const action = id => {
    const a = actions[id], state = actionState(view.state, id);
    return { label: a.label, shortcut: shortcutLabel(a.shortcut), checked: a.mark || a.node ? state.active : undefined,
      disabled: !state.enabled, run: guard(() => runAction(view, id)) };
  };
  const selected = !view.state.selection.empty;
  const table = cmd.inTable(view.state);
  const image = view.state.selection.node?.type.name === 'image';
  return [
    action('undo'), action('redo'), null,
    { label: '剪切', shortcut: shortcutLabel('Mod-x'), disabled: !selected, run: guard(() => copySelection(view, true)) },
    { label: '复制', shortcut: shortcutLabel('Mod-c'), disabled: !selected, run: guard(() => copySelection(view, false)) },
    { label: '粘贴', shortcut: shortcutLabel('Mod-v'), run: guard(() => paste(view)) },
    { label: '粘贴为纯文本', shortcut: shortcutLabel('Mod-Shift-v'), run: guard(() => paste(view, true)) },
    command('全选', selectAll), null,
    ...(image ? [
      { label: '替换图片', run: guard(() => handlers.image?.(true)) },
      { label: '删除图片', danger: true, run: guard(() => cmd.deleteSelectionNode(view)) },
    ] : [action('bold'), action('italic'), action('underline'), action('strike'), action('clear'), null,
      { label: cmd.linkRange(view.state) ? '编辑链接' : '插入链接', shortcut: shortcutLabel('Mod-k'), disabled: !cmd.canSetLink(view.state), run: guard(() => handlers.link?.()) },
      ...(cmd.linkRange(view.state) ? [{ label: '移除链接', run: guard(() => cmd.setLink(view, '')) }] : []),
      ...(!table ? [action('bullet'), action('ordered'), action('task'), action('indent'), action('outdent')] : []),
    ]),
    ...(table ? [null,
      command('上方插入行', addRowBefore), command('下方插入行', addRowAfter),
      command('左侧插入列', addColumnBefore), command('右侧插入列', addColumnAfter),
      command('合并单元格', mergeCells), command('拆分单元格', splitCell),
      command('切换表头行', toggleHeaderRow), command('切换表头列', toggleHeaderColumn),
      command('删除当前行', deleteRow, true), command('删除当前列', deleteColumn, true),
      command('删除表格', deleteTable, true),
    ] : []),
    null, { label: '快捷键速查', run: () => handlers.help?.() },
  ];
}
