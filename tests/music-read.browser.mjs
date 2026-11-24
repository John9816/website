import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ headless: true })
const base = process.env.MUSIC_TEST_URL || 'http://127.0.0.1:5173'
try {
  const page = await browser.newPage()
  let calls = 0
  await page.route('**/__music_read_test__', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Music read test</title>',
    }),
  )
  await page.route(
    (u) => u.pathname === '/api/v1/music/search',
    async (r) => {
      calls++
      const token = r.request().headers().authorization
      await new Promise((resolve) => setTimeout(resolve, 80))
      await r
        .fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            code: 0,
            data: { list: [{ id: token }], total: 1 },
          }),
        })
        .catch(() => {})
    },
  )
  await page.goto(base + '/__music_read_test__')
  const result = await page.evaluate(async () => {
    const { setAuthSession } = await import('/src/api/client.ts')
    const { musicSearch } = await import('/src/api/music.ts')
    setAuthSession('a', 'Bearer', 'a', { newSession: true })
    const start = performance.now()
    const a = await musicSearch('qishui', 'cache')
    const cold = performance.now() - start
    const warmStart = performance.now()
    const cached = await musicSearch('qishui', 'cache')
    const warm = performance.now() - warmStart
    a.list.push({ id: 'mutation' })
    if (cached.list.length !== 1) throw Error('shared mutable cache')
    const c = new AbortController()
    const p1 = musicSearch('qishui', 'shared', 1, 20, 'song', c.signal)
    const p2 = musicSearch('qishui', 'shared')
    c.abort()
    const cancel = await p1.then(
      () => false,
      (e) => e.name === 'AbortError',
    )
    await p2
    const refreshing = musicSearch('qishui', 'token-refresh')
    setAuthSession('a-refreshed', 'Bearer', 'a')
    await refreshing
    setAuthSession('b', 'Bearer', 'b', { newSession: true })
    const second = await musicSearch('qishui', 'cache')
    return {
      cold,
      warm,
      cancel,
      first: cached.list[0].id,
      second: second.list[0].id,
    }
  })
  assert.equal(calls, 4)
  assert.ok(result.cancel)
  assert.equal(result.first, 'Bearer a')
  assert.equal(result.second, 'Bearer b')
  assert.ok(result.warm < 20)
  console.log(
    'PASS read cache: network calls',
    calls,
    'cold',
    result.cold.toFixed(1),
    'ms / cached',
    result.warm.toFixed(1),
    'ms; independent cancellation and account isolation',
  )
} finally {
  await browser.close()
}
