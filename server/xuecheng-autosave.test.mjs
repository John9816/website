import assert from 'node:assert/strict'
import test from 'node:test'
import { createDocumentSaver } from '../src/features/xuecheng/autosave.js'

test('pending edits keep their original document id when another document opens', async () => {
  const writes = []
  const saver = createDocumentSaver({ save: async doc => { writes.push(doc); return doc }, delay: 10000 })
  saver.schedule({ id: 'a', title: 'A', content: 'first edit' })
  saver.schedule({ id: 'b', title: 'B', content: 'second edit' })
  assert.equal(await saver.flushAll(), true)
  assert.deepEqual(writes.map(d => [d.id, d.content]), [['a', 'first edit'], ['b', 'second edit']])
})

test('writes to one document serialize and latest title plus content are saved together', async () => {
  let release
  const writes = []
  const saver = createDocumentSaver({ save: async doc => {
    writes.push(doc)
    if (writes.length === 1) await new Promise(r => release = r)
    return doc
  }, delay: 10000 })
  saver.schedule({ id: 'a', title: 'old', content: 'one' })
  const first = saver.flush('a')
  await new Promise(r => setImmediate(r))
  saver.schedule({ id: 'a', title: 'new', content: 'two' })
  const second = saver.flush('a')
  await new Promise(r => setImmediate(r))
  assert.equal(writes.length, 1)
  release()
  await Promise.all([first, second])
  assert.equal(writes.length, 2)
  assert.equal(writes[1].title, 'new')
  assert.equal(writes[1].content, 'two')
  assert.equal(saver.hasPending(), false)
})

test('failed saves remain pending and can be retried before leaving', async () => {
  let fail = true
  const saver = createDocumentSaver({ save: async doc => { if (fail) throw new Error('offline'); return doc }, delay: 10000 })
  saver.schedule({ id: 'a', title: 'A', content: 'keep this' })
  assert.equal(await saver.flushAll(), false)
  assert.equal(saver.hasPending(), true)
  fail = false
  assert.equal(await saver.flushAll(), true)
  assert.equal(saver.hasPending(), false)
})
