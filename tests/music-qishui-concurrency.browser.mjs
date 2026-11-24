import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.MUSIC_TEST_URL || 'http://127.0.0.1:5173'
let browser
before(async () => { browser = await chromium.launch({ headless: true, args: ['--disable-features=LocalNetworkAccessChecks'] }) })
after(async () => { await browser?.close() })

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

async function playerPage(width, { slowPlays = [], lateCanceledPlay = false, connection } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  const calls = [], errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => { localStorage.setItem('nav.token', 'test'); localStorage.setItem('nav.username', 'test') })
  if (connection) await page.addInitScript(value => Object.defineProperty(navigator, 'connection', { value }), connection)
  if (lateCanceledPlay) await page.addInitScript(() => {
    const fetch = window.fetch
    window.fetch = (input, options) => {
      const url = new URL(String(input), location.origin)
      // Model a response already being decoded when cancellation arrives.
      if (url.pathname.endsWith('/play') && url.searchParams.get('id') === '8') return fetch(input, { ...options, signal: undefined })
      return fetch(input, options)
    }
  })
  await page.route('**/__qishui_concurrency__', route => route.fulfill({ contentType: 'text/html', body: html }))
  await page.route('**/test.wav*', route => route.fulfill({ contentType: 'audio/wav', body: wav }))
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const url = new URL(route.request().url()), path = url.pathname, id = url.searchParams.get('id')
    calls.push({ path, id })
    let data = {}
    if (path.endsWith('/user/me')) data = { id: 1, username: 'test', role: 'USER' }
    else if (path.endsWith('/play')) {
      const attempt = calls.filter(call => call.path.endsWith('/play') && call.id === id).length
      if (slowPlays.includes(id)) await new Promise(resolve => setTimeout(resolve, 300))
      if (lateCanceledPlay && id === '8') await new Promise(resolve => setTimeout(resolve, attempt === 1 ? 150 : 500))
      data = { ...song(id), actualSource: 'qishui', actualId: id, playUrl: '/test.wav?id=' + id, requestedQuality: '320k', expireSec: 1080,
        ...(lateCanceledPlay && id === '8' ? { name: 'Attempt ' + attempt } : {}),
        ...(id !== '2' ? { lyric: { lineLyrics: '[00:01.00]Inline ' + id } } : {}) }
    } else if (path.endsWith('/lyric')) {
      await new Promise(resolve => setTimeout(resolve, 800))
      data = { id, source: 'qishui', lineLyrics: '[00:01.00]Fetched ' + id }
    } else if (path.endsWith('/status')) data = []
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 0, data }) }).catch(() => {})
  })
  await page.goto(base + '/__qishui_concurrency__')
  await page.waitForFunction(() => !!window.player)
  return { page, calls, errors }
}

for (const width of [1440, 390]) {
  test(`${width}: switching while next-track lyrics are loading retains the existing request`, async () => {
    const { page, calls, errors } = await playerPage(width)
    try {
      const prefetched = page.waitForRequest(url => url.url().includes('/lyric?') && new URL(url.url()).searchParams.get('id') === '2')
      await page.evaluate(rows => window.player.playPlaylist(rows), [song('1'), song('2')])
      await prefetched
      await page.waitForTimeout(250)
      const elapsed = await page.evaluate(async () => {
        const start = performance.now()
        window.player.playNext()
        while (window.player.lyricLines[0]?.text !== 'Fetched 2') {
          if (performance.now() - start > 10_000) throw new Error('Timed out waiting for next-track lyrics after playback handoff')
          await new Promise(resolve => setTimeout(resolve, 5))
        }
        return performance.now() - start
      })
      console.log(width, 'in-flight lyric handoff:', Math.round(elapsed), 'ms')
      assert.equal(calls.filter(call => call.path.endsWith('/lyric') && call.id === '2').length, 1, 'switching must not cancel and restart the pending lyrics')
      assert.deepEqual(errors, [])
    } finally { await page.close() }
  })

  test(`${width}: rapid A to B to A switching never adopts a canceled play request`, async () => {
    const { page, errors } = await playerPage(width, { slowPlays: ['8', '9'] })
    try {
      await page.evaluate(row => window.player.playPlaylist([row]), song('7'))
      await page.waitForFunction(() => window.player.current?.id === '7')
      await page.evaluate(async rows => {
        await Promise.all([window.player.playSong(rows[0]), window.player.playSong(rows[1]), window.player.playSong(rows[0])])
      }, [song('8'), song('9')])
      await page.waitForTimeout(50)
      assert.equal(await page.evaluate(() => window.player.current?.id), '8', 'the last selected track must play after earlier requests were canceled')
      assert.equal(await page.evaluate(() => window.player.pendingTrackKey), null)
      assert.deepEqual(errors, [])
    } finally { await page.close() }
  })

  test(`${width}: late canceled responses cannot fill the cache or remove a replacement request`, async () => {
    const { page, calls, errors } = await playerPage(width, { lateCanceledPlay: true })
    try {
      await page.evaluate(row => window.player.playPlaylist([row]), song('7'))
      const started = page.waitForRequest(request => request.url().includes('/play?') && new URL(request.url()).searchParams.get('id') === '8')
      await page.evaluate(row => { void window.player.playSong(row) }, song('8'))
      await started
      await page.evaluate(rows => { void window.player.playSong(rows[1]); void window.player.playSong(rows[0]) }, [song('8'), song('9')])
      await page.waitForTimeout(250)
      await page.evaluate(row => window.player.playSong(row), song('8'))
      await page.waitForTimeout(50)
      assert.equal(await page.evaluate(() => window.player.current?.name), 'Attempt 2', 'the canceled response must not become a cache hit')
      assert.equal(calls.filter(call => call.path.endsWith('/play') && call.id === '8').length, 2, 'the old finally must retain the replacement in-flight request')
      assert.deepEqual(errors, [])
    } finally { await page.close() }
  })

  test(`${width}: late playback records cannot restore the previous account's cache`, async () => {
    const { page, calls, errors } = await playerPage(width, { lateCanceledPlay: true })
    try {
      await page.evaluate(row => window.player.playPlaylist([row]), song('8'))
      const recording = page.waitForRequest(request => request.url().includes('/play?') && new URL(request.url()).searchParams.get('id') === '8')
      await page.evaluate(row => window.player.playSong(row), song('8'))
      await recording
      const oldResponse = page.waitForResponse(response => response.url().includes('/play?') && new URL(response.url()).searchParams.get('id') === '8')
      await page.evaluate(async () => { const { setAuthSession } = await import('/src/api/client.ts'); setAuthSession('other', 'Bearer', 'other', { newSession: true }) })
      await page.waitForFunction(() => window.player.current === null)
      await oldResponse
      await page.waitForTimeout(40)
      await page.evaluate(row => window.player.playPlaylist([row]), song('8'))
      await page.waitForFunction(() => window.player.current?.id === '8')
      assert.equal(await page.evaluate(() => window.player.current.name), 'Attempt 3', 'a new account must load its own playback ticket')
      assert.equal(calls.filter(call => call.path.endsWith('/play') && call.id === '8').length, 3)
      assert.deepEqual(errors, [])
    } finally { await page.close() }
  })

  for (const change of ['unrelated track', 'account']) {
    test(`${width}: ${change} changes cancel unused next-track lyrics`, async () => {
      const { page, errors } = await playerPage(width)
      try {
        const started = page.waitForRequest(request => request.url().includes('/lyric?') && new URL(request.url()).searchParams.get('id') === '2')
        await page.evaluate(rows => window.player.playPlaylist(rows), [song('1'), song('2')])
        await started
        if (change === 'unrelated track') {
          await page.evaluate(() => window.player.playNext())
          await page.waitForFunction(() => window.player.current?.id === '2')
          await page.waitForTimeout(50)
        }
        const canceled = page.waitForEvent('requestfailed', request => request.url().includes('/lyric?') && new URL(request.url()).searchParams.get('id') === '2')
        if (change === 'account') {
          await page.evaluate(async () => { const { setAuthSession } = await import('/src/api/client.ts'); setAuthSession('other', 'Bearer', 'other', { newSession: true }) })
          await page.waitForFunction(() => window.player.current === null)
        } else {
          await page.evaluate(row => window.player.playPlaylist([row]), song('3'))
          await page.waitForFunction(() => window.player.current?.id === '3')
        }
        await canceled
        assert.deepEqual(errors, [])
      } finally { await page.close() }
    })
  }

  for (const connection of [{ saveData: true, effectiveType: '4g' }, { saveData: false, effectiveType: '2g' }]) {
    test(`${width}: ${connection.saveData ? 'data saver' : 'slow network'} skips next-track prefetch`, async () => {
      const { page, calls, errors } = await playerPage(width, { connection })
      try {
        await page.evaluate(rows => window.player.playPlaylist(rows), [song('1'), song('2')])
        await page.waitForFunction(() => window.player.current?.id === '1')
        await page.waitForTimeout(100)
        assert.equal(calls.filter(call => call.id === '2').length, 0)
        assert.deepEqual(errors, [])
      } finally { await page.close() }
    })
  }
}
