import test from 'node:test'
import assert from 'node:assert/strict'
import { AllSelection, EditorState, TextSelection } from 'prosemirror-state'
import { schema } from '../src/features/xuecheng/schema.js'
import * as cmd from '../src/features/xuecheng/editor/commands.js'
import { buildKeymap } from '../src/features/xuecheng/plugins/keymap.js'
import { CellSelection, tableEditing, columnResizing } from 'prosemirror-tables'
import { selectContextTarget } from '../src/features/xuecheng/editor/contextMenu.js'
import { buildInputRules } from '../src/features/xuecheng/plugins/inputRules.js'
import { history, undo } from 'prosemirror-history'

const n = schema.nodes
const p = (text, marks) => n.paragraph.create(null, text ? schema.text(text, marks) : null)
function viewFor(content, selectText = '') {
  let state = EditorState.create({ doc: n.doc.create(null, content), plugins: [buildInputRules(), ...buildKeymap(), history(), columnResizing(), tableEditing()] })
  let pos = 1
  state.doc.descendants((node, at) => { if (node.isText && node.text === selectText) pos = at })
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)))
  const view = { state, dispatch(tr) { view.state = view.state.apply(tr); view.state.doc.check() }, focus() {}, dom: { clientWidth: 800 } }
  return view
}
function key(view, key, extra = {}) {
  const event = { key, keyCode: 0, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...extra }
  return view.state.plugins.some(plugin => plugin.props.handleKeyDown?.(view, event))
}

test('list conversion preserves all item content, marks, nested lists and selection', () => {
  const content = [n.bullet_list.create(null, [
    n.list_item.create(null, [p('first', [schema.marks.strong.create()]), n.bullet_list.create(null, n.list_item.create(null, p('nested')))]),
    n.list_item.create(null, p('second')),
  ])]
  const view = viewFor(content, 'first'), before = view.state.selection.from
  cmd.toggleTaskList(view)
  assert.equal(view.state.doc.firstChild.type.name, 'task_list')
  assert.equal(view.state.doc.firstChild.childCount, 2)
  assert.equal(view.state.doc.firstChild.firstChild.firstChild.firstChild.marks[0].type.name, 'strong')
  assert.equal(view.state.doc.firstChild.firstChild.child(1).textContent, 'nested')
  assert.equal(view.state.selection.from, before)
  cmd.toggleOrderedList(view)
  assert.equal(view.state.doc.firstChild.type.name, 'ordered_list')
  assert.equal(view.state.doc.firstChild.childCount, 2)
  cmd.toggleBulletList(view)
  assert.equal(view.state.doc.firstChild.type.name, 'bullet_list')
})

test('quote toggle does not lift an unrelated list or callout', () => {
  const view = viewFor([n.callout.create(null, p('inside'))], 'inside')
  cmd.toggleQuote(view)
  assert.equal(view.state.doc.firstChild.type.name, 'callout')
  assert.equal(view.state.doc.firstChild.firstChild.type.name, 'blockquote')
  cmd.toggleQuote(view)
  assert.equal(view.state.doc.firstChild.type.name, 'callout')
  assert.equal(view.state.doc.firstChild.firstChild.type.name, 'paragraph')
})

test('clear format affects selected paragraphs and pending typing marks only', () => {
  const view = viewFor([n.blockquote.create(null, [n.heading.create({ level: 2 }, schema.text('keep')), p('clear', [schema.marks.strong.create()])])], 'clear')
  cmd.clearFormat(view)
  assert.equal(view.state.doc.firstChild.firstChild.type.name, 'heading')
  assert.equal(view.state.storedMarks?.length, 0)
})

test('font size at cursor applies to new typing without rewriting sibling cells', () => {
  const view = viewFor([n.bullet_list.create(null, [n.list_item.create(null, p('first')), n.list_item.create(null, p('second'))])], 'first')
  cmd.setFontSize(view, 24)
  assert.equal(view.state.storedMarks[0].attrs.size, '24px')
  assert.equal(view.state.doc.textContent, 'firstsecond')
  assert.equal(view.state.doc.firstChild.child(1).firstChild.firstChild.marks.length, 0)
})

test('nested alignment is reflected and Shift+Enter inserts a hard break', () => {
  const view = viewFor([n.callout.create(null, p('inside'))], 'inside')
  cmd.setAlign(view, 'center')
  assert.equal(cmd.currentAlign(view.state), 'center')
  assert.ok(key(view, 'Enter', { shiftKey: true }))
  assert.equal(view.state.doc.firstChild.childCount, 1)
  assert.equal(view.state.doc.firstChild.firstChild.firstChild.type.name, 'hard_break')
})

test('task Enter creates a new unchecked item, Shift+Tab lifts a task item', () => {
  const view = viewFor([n.task_list.create(null, [n.task_item.create({ checked: true }, p('first')), n.task_item.create(null, p('second'))])], 'first')
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, view.state.selection.from + 5)))
  assert.ok(key(view, 'Enter'))
  assert.equal(view.state.doc.firstChild.childCount, 3)
  assert.equal(view.state.doc.firstChild.child(1).attrs.checked, false)
  assert.ok(key(view, 'Tab', { shiftKey: true }))
  assert.equal(view.state.doc.child(1).type.name, 'paragraph')
})

test('table Tab moves backwards and adds a row at the final cell', () => {
  const cell = text => n.table_cell.create(null, p(text))
  const view = viewFor([n.table.create(null, n.table_row.create(null, [cell('a'), cell('b')]))], 'b')
  assert.ok(key(view, 'Tab', { shiftKey: true }))
  assert.equal(view.state.selection.$from.parent.textContent, 'a')
  assert.ok(key(view, 'Tab'))
  assert.ok(key(view, 'Tab'))
  assert.equal(view.state.doc.firstChild.childCount, 2)
})

test('Tab appends a row in an empty 3 by 3 table with a header', () => {
  const view = viewFor([p('hello')], 'hello')
  cmd.insertTable(view)
  let end
  view.state.doc.descendants((node, pos) => { if (node.type === n.table_cell) end = pos + 2 })
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, end)))
  assert.ok(key(view, 'Tab'))
  assert.equal(view.state.doc.child(1).childCount, 4)
})

test('block actions can target the hovered block rather than the cursor block', () => {
  const view = viewFor([p('alpha'), p('beta'), p('gamma')], 'alpha')
  cmd.duplicateBlock(view, view.state.doc.firstChild.nodeSize)
  assert.deepEqual(Array.from({ length: view.state.doc.childCount }, (_, i) => view.state.doc.child(i).textContent), ['alpha', 'beta', 'beta', 'gamma'])
})

test('inserted table receives the cursor and images stay schema-valid', () => {
  const view = viewFor([p('hello')], 'hello')
  cmd.insertTable(view, 2, 2)
  assert.ok(cmd.inTable(view.state))
  const picture = viewFor([p('hello')], 'hello')
  cmd.insertImage(picture, 'https://example.com/a.png')
  picture.state.doc.check()
  assert.equal(picture.state.selection.node?.type.name, 'image')
})

test('rectangular cell formatting and right-click exclude intervening unselected cells', () => {
  const cell = text => n.table_cell.create(null, p(text, text === 'b' ? [schema.marks.strong.create()] : []))
  const view = viewFor([n.table.create(null, [n.table_row.create(null, [cell('a'), cell('b')]), n.table_row.create(null, [cell('c'), cell('d')])])], 'a')
  const cells = []
  view.state.doc.descendants((node, pos) => { if (node.type === n.table_cell) cells.push(pos) })
  view.dispatch(view.state.tr.setSelection(CellSelection.create(view.state.doc, cells[0], cells[2])))
  assert.equal(cmd.markActive(view.state, schema.marks.strong), false)
  cmd.setTextColor(view, '#d93026')
  cmd.setAlign(view, 'center')
  cmd.setLink(view, 'https://example.com')
  const content = []
  view.state.doc.descendants(node => { if (node.isText) content.push(node) })
  for (const index of [0, 2]) assert.ok(schema.marks.link.isInSet(content[index].marks))
  for (const index of [1, 3]) {
    assert.equal(schema.marks.link.isInSet(content[index].marks), undefined)
    assert.equal(schema.marks.textColor.isInSet(content[index].marks), undefined)
  }
  const selection = view.state.selection
  view.posAtCoords = () => ({ pos: cells[0] + 2 })
  selectContextTarget(view, { target: {}, clientX: 0, clientY: 0 })
  assert.ok(view.state.selection.eq(selection))
  view.posAtCoords = () => ({ pos: cells[1] + 2 })
  selectContextTarget(view, { target: {}, clientX: 0, clientY: 0 })
  assert.ok(view.state.selection instanceof TextSelection)
  assert.equal(view.state.selection.$from.parent.textContent, 'b')
})

test('link editing spans mixed marks but never crosses an unlinked gap', () => {
  const link = schema.marks.link.create({ href: 'https://example.com' })
  const strong = schema.marks.strong.create()
  const view = viewFor([n.paragraph.create(null, [schema.text('one', [link]), schema.text('two', [link, strong]), schema.text(' gap '), schema.text('three', [link])])], 'two')
  assert.deepEqual(cmd.linkRange(view.state), { from: 1, to: 7, href: 'https://example.com' })
  cmd.setLink(view, '')
  assert.equal(view.state.doc.firstChild.child(0).marks.length, 0)
  assert.equal(view.state.doc.firstChild.child(1).marks[0].type.name, 'strong')
  assert.ok(schema.marks.link.isInSet(view.state.doc.firstChild.lastChild.marks))
})

test('link shortcut and inline commands do not apply inside a code block', () => {
  const view = viewFor([n.code_block.create(null, schema.text('const a = 1'))], 'const a = 1')
  const before = view.state.doc
  assert.equal(cmd.setLink(view, 'https://example.com'), false)
  assert.equal(cmd.setFontSize(view, 20), false)
  assert.ok(view.state.doc.eq(before))
})

test('Markdown conversion retains existing text styles and Backspace restores delimiters', () => {
  const view = viewFor([p('before **bold*', [schema.marks.underline.create()])], 'before **bold*')
  const end = view.state.doc.content.size - 1
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, end)))
  const rules = view.state.plugins.find(plugin => plugin.spec.isInputRules)
  assert.ok(rules.props.handleTextInput(view, end, end, '*'))
  assert.equal(view.state.doc.textContent, 'before bold')
  assert.ok(schema.marks.strong.isInSet(view.state.doc.firstChild.lastChild.marks))
  assert.ok(schema.marks.underline.isInSet(view.state.doc.firstChild.lastChild.marks))
  assert.ok(key(view, 'Backspace'))
  assert.equal(view.state.doc.textContent, 'before **bold**')
})

test('arrow keys collapse a whole-document selection synchronously', () => {
  const view = viewFor([p('hello')], 'hello')
  view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)))
  assert.ok(key(view, 'ArrowLeft'))
  assert.equal(view.state.selection.from, 1)
  view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)))
  assert.ok(key(view, 'ArrowRight'))
  assert.equal(view.state.selection.from, 6)
})

test('deleting a just-inserted image is separately undoable', () => {
  const view = viewFor([p('hello')], 'hello')
  cmd.insertImage(view, 'https://example.com/image.png')
  cmd.deleteSelectionNode(view)
  undo(view.state, view.dispatch)
  assert.equal(view.state.selection.node?.type.name, 'image')
})

test('Markdown emphasis preserves a repeated leading character outside the delimiters', () => {
  const view = viewFor([p('x*x')], 'x*x')
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 4)))
  const rules = view.state.plugins.find(plugin => plugin.spec.isInputRules)
  assert.ok(rules.props.handleTextInput(view, 4, 4, '*'))
  assert.equal(view.state.doc.textContent, 'xx')
  assert.equal(view.state.doc.firstChild.firstChild.marks.length, 0)
  assert.ok(schema.marks.em.isInSet(view.state.doc.firstChild.lastChild.marks))
})
