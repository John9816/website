import { NodeSelection, Selection } from 'prosemirror-state';
import { selectAll, deleteSelection } from 'prosemirror-commands';
import { undo, redo } from 'prosemirror-history';
import { addRowBefore, addRowAfter, addColumnBefore, addColumnAfter, deleteRow, deleteColumn, deleteTable } from 'prosemirror-tables';
import * as cmd from './commands.js';

// Keep a right-click inside the selection from collapsing it. Otherwise target
// the clicked text/image/cell, so commands never modify an unrelated block.
export function selectContextTarget(view, event) {
  const hit = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (!hit) return;
  const { state } = view;
  const { from, to, empty } = state.selection;
  if (!empty && hit.pos >= from && hit.pos <= to) return;
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

async function paste(view) {
  const snapshot = view.state;
  let html, text;
  try {
    if (navigator.clipboard?.read) {
      const items = await navigator.clipboard.read();
      const rich = items.find(item => item.types.includes('text/html'));
      const plain = items.find(item => item.types.includes('text/plain'));
      if (rich) html = await (await rich.getType('text/html')).text();
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

export function editorContextItems(view) {
  const command = (label, run, danger = false) => ({ label, danger, disabled: !run(view.state), run: () => run(view.state, view.dispatch, view) });
  const selected = !view.state.selection.empty;
  return [
    command('撤销', undo), command('重做', redo), null,
    { label: '剪切', disabled: !selected, run: () => copySelection(view, true) },
    { label: '复制', disabled: !selected, run: () => copySelection(view, false) },
    { label: '粘贴', run: () => paste(view) },
    command('全选', selectAll), null,
    { label: '加粗', run: () => cmd.toggleBold(view) },
    { label: '斜体', run: () => cmd.toggleItalic(view) },
    { label: '清除格式', run: () => cmd.clearFormat(view) },
    ...(cmd.inTable(view.state) ? [null,
      command('上方插入行', addRowBefore), command('下方插入行', addRowAfter),
      command('左侧插入列', addColumnBefore), command('右侧插入列', addColumnAfter),
      command('删除当前行', deleteRow, true), command('删除当前列', deleteColumn, true),
      command('删除表格', deleteTable, true),
    ] : []),
  ];
}
