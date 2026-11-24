import assert from 'node:assert/strict'
import test from 'node:test'
import { parseTtmlTime, parseYrc, activeLyricIndex, lyricPreviewText, lyricMediaTitle } from '../src/utils/musicLyrics.ts'
test('TTML clock and offset times reject malformed and excessive values', () => {
  assert.equal(parseTtmlTime('01:02.500'), 62.5)
  assert.equal(parseTtmlTime('01:02:03.25'), 3723.25)
  assert.equal(parseTtmlTime('1500ms'), 1.5)
  for (const value of ['NaN', '-1s', '00:99', '1:02:77', 'Infinitys']) assert.throws(() => parseTtmlTime(value))
})
test('YRC words retain absolute positions for Qishui karaoke lyrics', () => {
  const lines = parseYrc('[1000,800](1000,300,0)测(1300,500,0)试')
  assert.equal(lines[0].text, '测试')
  assert.equal(lines[0].words[1].time, 1.3)
  assert.equal(lines[0].end, 1.8)
  assert.equal(parseYrc('[bad]broken').length, 0)
})
test('seeking and lyric gaps restore track metadata', () => {
  const lines = [{time:1,end:2,text:'Hello'}, {time:5,end:6,text:'World'}]
  assert.equal(activeLyricIndex(lines,0),-1)
  assert.equal(activeLyricIndex(lines,1.5),0)
  assert.equal(activeLyricIndex(lines,3),-1)
  assert.equal(activeLyricIndex(lines,5.5),1)
  assert.equal(activeLyricIndex(lines,1),0)
  assert.equal(lyricMediaTitle('Song','Hello',true),'Hello · Song')
  assert.equal(lyricMediaTitle('Song','Hello',false),'Song')
})

test('loaded lyrics remain available during the intro and instrumental gaps', () => {
  const lines = [{time:10,end:20,text:'第一句'}, {time:30,end:40,text:'第二句'}]
  assert.equal(lyricPreviewText(lines,0),'前奏 · 歌词已就绪')
  assert.equal(lyricPreviewText(lines,12),'第一句')
  assert.equal(lyricPreviewText(lines,25),'间奏 · 歌词已就绪')
  assert.equal(lyricPreviewText(lines,35),'第二句')
  assert.equal(lyricPreviewText([],0),'')
})
