import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MUSIC_SOURCE_OPTIONS, STANDARD_CATALOG_SOURCE_OPTIONS, isMusicSourceId,
  sourceLabel, supportedSearchTypes, normalizeSearchType, musicPlaybackError,
} from '../src/features/music/sources.ts'

test('Qishui is searchable while existing catalog sources remain unchanged', () => {
  assert.deepEqual(MUSIC_SOURCE_OPTIONS.map(s => s.value), ['qq', 'netease', 'kuwo', 'qishui'])
  assert.deepEqual(STANDARD_CATALOG_SOURCE_OPTIONS.map(s => s.value), ['qq', 'netease', 'kuwo'])
  assert.equal(isMusicSourceId('qishui'), true)
  assert.equal(isMusicSourceId('invalid'), false)
  assert.equal(sourceLabel('qishui'), '汽水音乐（黑源）')
})

test('Qishui metadata links fall back to supported song searches', () => {
  assert.deepEqual(supportedSearchTypes('qishui'), ['song', 'playlist'])
  assert.equal(normalizeSearchType('qishui', 'artist'), 'song')
  assert.equal(normalizeSearchType('qishui', 'album'), 'song')
  assert.equal(normalizeSearchType('qishui', 'playlist'), 'playlist')
  assert.equal(normalizeSearchType('qq', 'album'), 'album')
})

test('Qishui unavailable playback has actionable messages without changing other sources', () => {
  assert.match(musicPlaybackError('qishui', { code: 1012, message: 'encrypted audio' }), /加密/)
  assert.match(musicPlaybackError('qishui', { code: 1003, message: 'token missing' }), /播放服务/)
  assert.equal(musicPlaybackError('qq', { code: 1003, message: 'original' }), 'original')
})
