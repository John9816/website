import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clearQueueKeepingCurrent,
  insertIntoQueue,
  moveQueueItemToNext,
  removeQueueIndex,
} from '../src/features/music/queue.ts'

const song = (id) => ({ id, source: 'qishui', name: id, artist: 'artist', availableQualities: ['320k'] })
const queue = () => ['a', 'b', 'c', 'd'].map(song)

test('insert next and last preserve the existing queue order', () => {
  assert.deepEqual(insertIntoQueue(queue(), song('x'), 1, 'next').map(s => s.id), ['a', 'b', 'x', 'c', 'd'])
  assert.deepEqual(insertIntoQueue(queue(), song('x'), 1, 'last').map(s => s.id), ['a', 'b', 'c', 'd', 'x'])
  assert.deepEqual(insertIntoQueue([], song('x'), -1, 'next').map(s => s.id), ['x'])
})

test('current track cannot be removed and clear keeps only current track', () => {
  const items = queue()
  assert.equal(removeQueueIndex(items, 1, 1), items)
  assert.deepEqual(removeQueueIndex(items, 3, 1).map(s => s.id), ['a', 'b', 'c'])
  assert.deepEqual(clearQueueKeepingCurrent(items, 1).map(s => s.id), ['b'])
  assert.deepEqual(clearQueueKeepingCurrent(items, -1), [])
})

test('move to next only reorders upcoming tracks', () => {
  const items = queue()
  assert.deepEqual(moveQueueItemToNext(items, 3, 0).map(s => s.id), ['a', 'd', 'b', 'c'])
  assert.equal(moveQueueItemToNext(items, 1, 0), items)
  assert.equal(moveQueueItemToNext(items, 0, 0), items)
})
