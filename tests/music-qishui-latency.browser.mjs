import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.MUSIC_TEST_URL || 'http://127.0.0.1:5173'
const browser = await chromium.launch({ headless: true, args: ['--disable-features=LocalNetworkAccessChecks'] })
const html = `<!doctype html><html><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true;
const React=(await import('/node_modules/.vite/deps/react.js')).default;
const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
const {App}=await import('/node_modules/.vite/deps/antd.js');
const {AuthProvider}=await import('/src/context/AuthContext.tsx');
const {MusicPlayerProvider,useMusicPlayer}=await import('/src/context/MusicPlayerContext.tsx');
const h=React.createElement;
function Harness(){window.player=useMusicPlayer();return h('div',{},window.player.current?.name || 'Ready')}
createRoot(document.getElementById('root')).render(h(App,{},h(AuthProvider,{},h(MusicPlayerProvider,{},h(Harness)))));
</script></body></html>`
const song = id => ({ id, source: 'qishui', name: 'Song ' + id, artist: 'Singer', artistId: 'artist', artistIds: ['artist'], album: 'Album', albumId: 'album', durationSec: 120, coverUrl: '/cover.svg', availableQualities: [] })
const wav = Buffer.alloc(44 + 8000 * 120 * 2)
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40)
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const calls = [], errors = []
    page.on('pageerror', e => { errors.push(e.message); console.error('PAGE ERROR', e.message) })
    page.on('console', m => { if (m.type() === 'error') console.error(m.text()) })
    await page.addInitScript(() => { localStorage.setItem('nav.token', 'test'); localStorage.setItem('nav.username', 'test') })
    await page.route('**/__qishui_latency__', r => r.fulfill({ contentType: 'text/html', body: html }))
    await page.route('**/test.wav*', r => r.fulfill({ contentType: 'audio/wav', body: wav }))
    await page.route(u => u.pathname.startsWith('/api/'), async r => {
      const url = new URL(r.request().url()), path = url.pathname, id = url.searchParams.get('id')
      calls.push({ path, id })
      let data = {}
      if (path.endsWith('/user/me')) data = { id: 1, username: 'test', role: 'USER' }
      else if (path.endsWith('/play')) data = { ...song(id), actualSource: 'qishui', actualId: id, playUrl: '/test.wav?id=' + id, requestedQuality: '320k', expireSec: 1080, ...(id === '1' ? { lyric: { lineLyrics: '[00:01.00]Inline lyric', karaokeLyrics: '[1000,2000](1000,2000,0)Inline lyric' } } : {}) }
      else if (path.endsWith('/lyric')) { await new Promise(resolve => setTimeout(resolve, 300)); data = { id, source: 'qishui', lineLyrics: '[00:01.00]Fetched ' + id } }
      else if (path.endsWith('/qishui/song')) { await new Promise(resolve => setTimeout(resolve, 800)); data = { ...song(id), name: 'Enriched ' + id } }
      else if (path.endsWith('/status')) data = []
      await r.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 0, data }) }).catch(() => {})
    })
    await page.goto(base + '/__qishui_latency__')
    await page.waitForFunction(() => !!window.player)
    await page.evaluate(rows => window.player.playPlaylist(rows), [song('1'), song('2')])
    await page.waitForFunction(() => window.player.lyricLines[0]?.text === 'Inline lyric')
    await page.waitForTimeout(400)
    assert.equal(calls.filter(c => c.path.endsWith('/lyric') && c.id === '1').length, 0, 'embedded official Qishui lyrics must not trigger a duplicate read')
    assert.equal(calls.filter(c => c.path.endsWith('/qishui/song') && c.id === '1').length, 0, 'complete list metadata should appear without another request')
    assert.equal(calls.filter(c => c.path.endsWith('/lyric') && c.id === '2').length, 1, 'prepare next-track lyrics when its play response has none')
    await page.waitForTimeout(200)
    await page.evaluate(() => { const now = Date.now; Date.now = () => now() + 120_000 })
    const elapsed = await page.evaluate(async () => { const start = performance.now(); window.player.playNext(); while (window.player.lyricLines[0]?.text !== 'Fetched 2') await new Promise(r => setTimeout(r, 5)); return performance.now() - start })
    assert.ok(elapsed < 250, 'prepared lyrics should not wait for the 300ms network fixture: ' + elapsed)
    assert.equal(calls.filter(c => c.path.endsWith('/lyric') && c.id === '2').length, 1, 'lyrics survive more than one minute')
    await page.evaluate(() => window.player.retryLyrics())
    await page.waitForTimeout(450)
    assert.equal(calls.filter(c => c.path.endsWith('/lyric') && c.id === '2').length, 2, 'explicit retry bypasses the read cache')
    await page.evaluate(async () => { const { setAuthSession } = await import('/src/api/client.ts'); setAuthSession('renewed', 'Bearer', 'test') })
    await page.waitForTimeout(400)
    assert.equal(calls.filter(c => c.path.endsWith('/lyric') && c.id === '2').length, 2, 'token renewal must not reload lyrics')
    await page.evaluate(row => window.player.playPlaylist([row]), { ...song('3'), artistId: null, artistIds: [], albumId: null })
    await page.waitForTimeout(40)
    await page.evaluate(row => window.player.playPlaylist([row]), song('4'))
    await page.waitForFunction(() => window.player.lyricLines[0]?.text === 'Fetched 4')
    await page.waitForTimeout(900)
    assert.equal(await page.evaluate(() => window.player.current.id), '4')
    assert.equal(await page.evaluate(() => window.player.current.name), 'Song 4')
    assert.ok(calls.some(c => c.path.endsWith('/qishui/song') && c.id === '3'), 'incomplete metadata must still be enriched')
    await page.evaluate(row => window.player.playPlaylist([row]), song('2'))
    await page.waitForTimeout(400)
    assert.equal(calls.filter(c => c.path.endsWith('/lyric') && c.id === '2').length, 2, 'an earlier manual retry must not force another reload on revisit')
    assert.deepEqual(errors, [])
    console.log('PASS', width, 'inline lyrics, metadata reuse, next lyrics in', Math.round(elapsed), 'ms, cache lifetime, explicit retry, token renewal and rapid switching')
    await page.close()
  }
} finally { await browser.close() }
