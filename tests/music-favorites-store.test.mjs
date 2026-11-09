import test from 'node:test'
import assert from 'node:assert/strict'
import { MusicFavoriteStore } from '../src/utils/musicFavoriteStore.ts'

test('favorite changes publish immediately, coalesce repeated taps, and roll back a failed write', async () => {
  const store = new MusicFavoriteStore()
  store.setScope('a')
  store.hydrate('a', [{ key: 'q:1', liked: false }])
  let finish,
    calls = 0,
    updates = 0
  store.subscribe(() => updates++)
  const write = () => {
    calls++
    return new Promise((resolve, reject) => {
      finish = { resolve, reject }
    })
  }
  const first = store.toggle('a', 'q:1', write)
  const second = store.toggle('a', 'q:1', write)
  assert.equal(store.getSnapshot().liked['q:1'], true)
  assert.equal(store.getSnapshot().pending['q:1'], true)
  assert.equal(calls, 1)
  // An older status request cannot overwrite the optimistic value.
  store.hydrate('a', [{ key: 'q:1', liked: false }])
  assert.equal(store.getSnapshot().liked['q:1'], true)
  finish.reject(Error('offline'))
  await assert.rejects(first, /offline/)
  await assert.rejects(second, /offline/)
  assert.equal(store.getSnapshot().liked['q:1'], false)
  assert.equal(store.getSnapshot().pending['q:1'], undefined)
  assert.ok(updates >= 3)
})
test('account switch discards old favorite requests and cached values', async () => {
  const store = new MusicFavoriteStore()
  store.setScope('a')
  let finish
  const first = store.toggle(
    'a',
    'q:1',
    () => new Promise((resolve) => (finish = resolve)),
  )
  store.setScope('b')
  finish()
  await first
  store.hydrate('a', [{ key: 'q:1', liked: true }])
  assert.deepEqual(store.getSnapshot().liked, {})
  await store.toggle('b', 'q:1', async () => {})
  assert.equal(store.getSnapshot().liked['q:1'], true)
})
