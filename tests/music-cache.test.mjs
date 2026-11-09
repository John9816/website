import test from 'node:test'
import assert from 'node:assert/strict'
import { MusicReadCache } from '../src/utils/musicReadCache.ts'
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
test('music reads coalesce, return independent values and expire', async () => {
  let now = 0,
    calls = 0
  const c = new MusicReadCache({
    now: () => now,
    maxEntries: 2,
    maxBytes: 1000,
  })
  const load = async () => {
    calls++
    await delay(5)
    return { items: [1] }
  }
  const [a, b] = await Promise.all([
    c.read('a', load, 10),
    c.read('a', load, 10),
  ])
  a.items.push(2)
  assert.deepEqual(b.items, [1])
  assert.equal(calls, 1)
  await c.read('a', load, 10)
  assert.equal(calls, 1)
  now = 11
  await c.read('a', load, 10)
  assert.equal(calls, 2)
})
test('canceling one consumer keeps the shared read alive; clearing prevents stale cache writes', async () => {
  const c = new MusicReadCache()
  const a = new AbortController(),
    b = new AbortController()
  let aborted = false,
    finish
  const load = (signal) => {
    signal.addEventListener('abort', () => (aborted = true))
    return new Promise((r) => (finish = r))
  }
  const first = c.read('a', load, 100, a.signal)
  const second = c.read('a', load, 100, b.signal)
  a.abort()
  await assert.rejects(first, { name: 'AbortError' })
  assert.equal(aborted, false)
  finish('ok')
  assert.equal(await second, 'ok')
  const pending = c.read('b', load, 100)
  c.clear()
  assert.equal(aborted, true)
  finish('old')
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(await c.read('b', async () => 'new', 100), 'new')
})
test('failed, oversized and evicted entries never become permanent cache hits', async () => {
  const c = new MusicReadCache({ maxEntries: 1, maxBytes: 25 })
  let calls = 0
  const fail = async () => {
    calls++
    throw Error('network')
  }
  await assert.rejects(c.read('f', fail, 100))
  await assert.rejects(c.read('f', fail, 100))
  assert.equal(calls, 2)
  const large = async () => {
    calls++
    return 'x'.repeat(100)
  }
  await c.read('large', large, 100)
  await c.read('large', large, 100)
  assert.equal(calls, 4)
  await c.read('a', async () => 1, 100)
  await c.read('b', async () => 2, 100)
  assert.equal(await c.read('a', async () => 3, 100), 3)
})
test('cache supports JSON responses on browsers without structuredClone', async () => {
  const original = globalThis.structuredClone
  try {
    globalThis.structuredClone = undefined
    const c = new MusicReadCache()
    const a = await c.read('a', async () => ({ items: [1] }), 100)
    a.items.push(2)
    assert.deepEqual(await c.read('a', async () => null, 100), { items: [1] })
  } finally {
    globalThis.structuredClone = original
  }
})
test('last subscriber cancellation releases request and permits an immediate retry', async () => {
  const c = new MusicReadCache()
  const signal = new AbortController()
  let canceled = false,
    finish
  const first = c.read(
    'x',
    (s) => {
      s.addEventListener('abort', () => (canceled = true))
      return new Promise((r) => (finish = r))
    },
    100,
    signal.signal,
  )
  signal.abort()
  await assert.rejects(first, { name: 'AbortError' })
  assert.equal(canceled, true)
  assert.equal(await c.read('x', async () => 'new', 100), 'new')
  finish('old')
  await delay(0)
  assert.equal(await c.read('x', async () => 'unexpected', 100), 'new')
})
