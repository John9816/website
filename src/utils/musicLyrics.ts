export type LyricWord = { time: number; end: number; text: string }
export type TimedLyricLine = { time: number; end?: number; text: string; words?: LyricWord[]; translation?: string; romanization?: string }
const MAX_TIME = 24 * 60 * 60
export function parseTtmlTime(value: string): number {
  const s = value.trim()
  let time = NaN
  const offset = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/.exec(s)
  if (offset) time = Number(offset[1]) * ({ ms: .001, s: 1, m: 60, h: 3600 }[offset[2]] ?? 1)
  else if (/^\d{1,3}:\d{2}(?:\.\d+)?$/.test(s) || /^\d{1,2}:\d{2}:\d{2}(?:\.\d+)?$/.test(s)) {
    const parts = s.split(':').map(Number)
    if (parts[parts.length - 1] < 60 && (parts.length === 2 || parts[1] < 60)) time = parts.reduce((n, v) => n * 60 + v, 0)
  }
  if (!Number.isFinite(time) || time < 0 || time > MAX_TIME) throw new Error('不支持的歌词时间')
  return time
}
export function activeLyricIndex(lines: TimedLyricLine[], time: number): number {
  let lo = 0, hi = lines.length - 1, result = -1
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (lines[mid].time <= time) { result = mid; lo = mid + 1 } else hi = mid - 1 }
  return result >= 0 && lines[result].end != null && time >= lines[result].end! ? -1 : result
}
export function lyricMediaTitle(song: string, lyric: string | undefined, enabled: boolean) {
  return enabled && lyric?.trim() ? `${lyric.trim().slice(0, 200)} · ${song}` : song
}
export function parseYrc(text?: string | null): TimedLyricLine[] {
  if (!text || text.length > 1024 * 1024) return []
  const result: TimedLyricLine[] = []
  for (const row of text.split(/\r?\n/).slice(0, 3000)) {
    const line = /^\[(\d+),(\d+)\](.*)$/.exec(row)
    if (!line) continue
    const words: LyricWord[] = []
    const re = /\((\d+),(\d+),\d+\)([^()]*)/g
    let word: RegExpExecArray | null
    while ((word = re.exec(line[3])) && words.length < 1000) {
      const time = Number(word[1]) / 1000, end = time + Number(word[2]) / 1000
      if (end <= MAX_TIME) words.push({ time, end, text: word[3] })
    }
    const time = Number(line[1]) / 1000, end = time + Number(line[2]) / 1000
    if (words.length && end <= MAX_TIME) result.push({ time, end, text: words.map(w => w.text).join(''), words })
  }
  return result.sort((a,b) => a.time - b.time)
}
export function parseTtml(xml: string): TimedLyricLine[] {
  if (xml.length > 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('歌词文件过大或包含不支持的 XML 声明')
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length || doc.documentElement.localName !== 'tt') throw new Error('TTML 文件格式无效')
  const all = Array.from(doc.getElementsByTagName('*'))
  if (all.length > 30000) throw new Error('歌词节点过多')
  for (const el of all) {
    let depth = 0, parent: Element | null = el
    while (parent) { if (++depth > 32) throw new Error('歌词层级过深'); parent = parent.parentElement }
    if (el.attributes.length > 32) throw new Error('歌词属性过多')
  }
  const paragraphs = all.filter(e => e.localName === 'p')
  if (paragraphs.length > 3000) throw new Error('歌词行数过多')
  const role = (el: Element) => Array.from(el.attributes).find(a => a.localName === 'role')?.value ?? ''
  const lines: TimedLyricLine[] = []
  for (const p of paragraphs) {
    if (!p.hasAttribute('begin')) continue
    const time = parseTtmlTime(p.getAttribute('begin')!)
    const end = p.hasAttribute('end') ? parseTtmlTime(p.getAttribute('end')!) : p.hasAttribute('dur') ? time + parseTtmlTime(p.getAttribute('dur')!) : undefined
    if (end != null && (end < time || end > MAX_TIME)) throw new Error('歌词结束时间无效')
    const words: LyricWord[] = []; const translations: string[] = [], romanizations: string[] = []
    function visit(node: Node, start: number, stop: number | undefined) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? ''
        if (text && !(text.includes('\n') && !text.trim())) words.push({ time: start, end: stop ?? start, text })
        return
      }
      if (!(node instanceof Element)) return
      const r = role(node)
      if (r.includes('translation')) { translations.push(node.textContent ?? ''); return }
      if (r.includes('roman')) { romanizations.push(node.textContent ?? ''); return }
      if (node.localName === 'br') { words.push({time:start,end:stop ?? start,text:'\n'}); return }
      const begin = node.hasAttribute('begin') ? parseTtmlTime(node.getAttribute('begin')!) : start
      const finish = node.hasAttribute('end') ? parseTtmlTime(node.getAttribute('end')!) : node.hasAttribute('dur') ? begin + parseTtmlTime(node.getAttribute('dur')!) : stop
      if (finish != null && finish < begin) throw new Error('逐字歌词时间无效')
      for (const child of Array.from(node.childNodes)) visit(child, begin, finish)
    }
    for (const node of Array.from(p.childNodes)) visit(node, time, end)
    const text = words.map(w => w.text).join('').trim()
    if (text) lines.push({time,end,text,words,translation:translations.join('\n') || undefined,romanization:romanizations.join('\n') || undefined})
  }
  if (!lines.length) throw new Error('文件中没有可用的定时歌词')
  return lines.sort((a,b) => a.time - b.time)
}
