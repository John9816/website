import { undo, redo } from 'prosemirror-history';
import { toggleMark, setBlockType } from 'prosemirror-commands';
import { sinkListItem, liftListItem } from 'prosemirror-schema-list';
import { chainCommands } from 'prosemirror-commands';
import { schema } from '../schema.js';
import * as cmd from './commands.js';

// One command catalog for toolbar state, context menus and keyboard bindings.
const fromView = fn => (state, dispatch, view) => fn({ state, dispatch: dispatch || (() => {}), focus: () => {}, dom: view?.dom });
export const actions = {
  undo: { label: '撤销', shortcut: 'Mod-z', command: undo },
  redo: { label: '重做', shortcut: 'Mod-Shift-z', command: redo },
  bold: { label: '加粗', shortcut: 'Mod-b', mark: 'strong' },
  italic: { label: '斜体', shortcut: 'Mod-i', mark: 'em' },
  underline: { label: '下划线', shortcut: 'Mod-u', mark: 'underline' },
  strike: { label: '删除线', shortcut: 'Mod-Shift-x', mark: 'strikethrough' },
  code: { label: '行内代码', shortcut: 'Mod-e', mark: 'code' },
  highlight: { label: '高亮', shortcut: 'Mod-Shift-h', mark: 'highlight' },
  clear: { label: '清除格式', shortcut: 'Mod-\\', command: fromView(cmd.clearFormat) },
  bullet: { label: '无序列表', shortcut: 'Mod-Shift-8', command: fromView(cmd.toggleBulletList), node: 'bullet_list' },
  ordered: { label: '有序列表', shortcut: 'Mod-Shift-7', command: fromView(cmd.toggleOrderedList), node: 'ordered_list' },
  task: { label: '任务列表', shortcut: 'Mod-Shift-9', command: fromView(cmd.toggleTaskList), node: 'task_list' },
  quote: { label: '引用', shortcut: 'Mod-Shift-b', command: fromView(cmd.toggleQuote), node: 'blockquote' },
  indent: { label: '增加缩进', shortcut: 'Mod-]', command: chainCommands(sinkListItem(schema.nodes.list_item), sinkListItem(schema.nodes.task_item)) },
  outdent: { label: '减少缩进', shortcut: 'Mod-[', command: chainCommands(liftListItem(schema.nodes.list_item), liftListItem(schema.nodes.task_item)) },
};
for (const action of Object.values(actions)) if (action.mark) action.command = toggleMark(schema.marks[action.mark]);
for (let level = 0; level <= 6; level++) {
  actions['heading' + level] = { label: level ? `标题 ${level}` : '正文', shortcut: `Mod-Alt-${level}`,
    command: setBlockType(level ? schema.nodes.heading : schema.nodes.paragraph, level ? { level } : null) };
}

export function actionState(state, id) {
  const action = actions[id];
  const active = action.mark ? cmd.markActive(state, schema.marks[action.mark]) : action.node ? !!cmd.ancestor(state, action.node) : false;
  return { enabled: !!action.command(state), active };
}
export function runAction(view, id) {
  if (!view || view.isDestroyed || view.composing) return false;
  const result = actions[id].command(view.state, view.dispatch, view);
  view.focus();
  return result;
}
export function shortcutLabel(shortcut, mac = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform || '')) {
  const keys = shortcut.split('-');
  return keys.map(key => ({ Mod: mac ? '⌘' : 'Ctrl', Shift: mac ? '⇧' : 'Shift', Alt: mac ? '⌥' : 'Alt' }[key] || key.toUpperCase())).join(mac ? '' : '+');
}
export const shortcutHelp = [
  ...Object.values(actions).map(({ label, shortcut }) => ({ label, shortcut })),
  { label: '插入／编辑链接', shortcut: 'Mod-k' },
  { label: '立即保存', shortcut: 'Mod-s' },
  { label: '打开／关闭 AI 助手', shortcut: 'Mod-j' },
  { label: '软换行', shortcut: 'Shift-Enter' },
  { label: '下一单元格／列表缩进', shortcut: 'Tab' },
  { label: '上一单元格／减少缩进', shortcut: 'Shift-Tab' },
  { label: '勾选任务', shortcut: 'Mod-Shift-Enter' },
  { label: '正文右键菜单', shortcut: 'Shift-F10' },
  { label: '聚焦工具栏', shortcut: 'Alt-F10' },
];
