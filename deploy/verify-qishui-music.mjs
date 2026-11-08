import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:5187'
const output = process.env.QA_OUTPUT || '/tmp/website-qishui-qa'
const browser = await chromium.launch({ headless: true })
const song = { id: '7646306026912516130', source: 'qishui', name: '黑源测试歌曲', artist: '测试歌手', album: '测试专辑', availableQualities: [], durationSec: 120 }
const playlistId = '7000000000000000001:7000000000000000002:2'
const qr = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='
const errors = []
let activePage

try {
  await mkdir(output, { recursive: true })
  for (const mobile of [false, true]) {
    const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 } })
    activePage = page
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => localStorage.setItem('nav.auth.session', JSON.stringify({ token: 'test-token', tokenType: 'Bearer', username: 'test-user', sessionId: 'test-session', refreshToken: null })))
    let polls = 0, creates = 0, bound = false, confirm = true, refreshes = 0, deletes = 0
    const searches = [], playlistRequests = []
    await page.route(/^https?:\/\/[^/]+\/api\//, async route => {
      const url = new URL(route.request().url()), path = url.pathname, method = route.request().method()
      let data = []
      if (path === '/api/user/me') data = { id: 1, username: 'test-user', role: 'USER', credits: 10 }
      else if (path.includes('/credits')) data = { credits: 10, checkedInToday: true }
      else if (path === '/api/v1/music/search') {
        searches.push({ source: url.searchParams.get('source'), type: url.searchParams.get('type') || 'song' })
        data = { source: 'qishui', keyword: '测试', page: 1, pageSize: 20, total: 1, list: [song], playlists: [{ id: playlistId, source: 'qishui', type: 'playlist', name: '黑源测试歌单', trackCount: 1 }] }
      } else if (path === '/api/v1/music/playlist/detail') {
        playlistRequests.push(url.searchParams.get('id'))
        data = { id: playlistId, source: 'qishui', name: '黑源测试歌单', page: 1, pageSize: 20, total: 1, list: [song] }
      } else if (path === '/api/user/music/playlist-favorites/status') data = { source: 'qishui', playlistId, favorite: false }
      else if (path === '/api/v1/music/qishui/auth/qr') {
        assert.equal(method, 'POST')
        creates += 1; polls = 0
        data = { bound: false, status: 'new', sessionId: `session-${creates}`, qrcode: qr, pollIntervalSeconds: 2, sessionExpiresAt: new Date(Date.now() + 180000).toISOString() }
      } else if (path.startsWith('/api/v1/music/qishui/auth/qr/')) {
        polls += 1
        bound = confirm && polls >= 2
        data = { bound, status: bound ? 'confirmed' : 'scanned', sessionId: `session-${creates}`, nickname: bound ? '测试汽水账号' : null, expiresAt: new Date(Date.now() + 3600000).toISOString() }
      } else if (path === '/api/v1/music/qishui/account/refresh') {
        refreshes += 1
        data = { bound: true, status: 'bound', nickname: '刷新后的账号' }
      } else if (path === '/api/v1/music/qishui/account') {
        if (method === 'DELETE') { deletes += 1; bound = false }
        data = { bound, status: bound ? 'bound' : 'unbound', nickname: bound ? '测试汽水账号' : null }
      } else if (path === '/api/v1/music/play') {
        return route.fulfill({ status: 501, json: { code: 1012, message: 'encrypted audio' } })
      }
      return route.fulfill({ json: { code: 0, message: 'ok', data } })
    })
    await page.goto(`${base}/music?view=search&source=qishui&keyword=测试&type=album`)
    await page.getByText('黑源测试歌曲', { exact: true }).waitFor()
    assert.equal(searches.at(-1).type, 'song')
    assert.equal(searches.at(-1).source, 'qishui')
    assert.equal(await page.locator('.music-search-type-switch').getByText('专辑', { exact: true }).count(), 0)
    await page.getByRole('button', { name: '黑源授权', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByText('尚未绑定汽水账号', { exact: true }).waitFor()
    await dialog.getByRole('button', { name: '获取授权二维码', exact: true }).click()
    await dialog.getByAltText('汽水音乐授权二维码').waitFor()
    await page.screenshot({ path: `${output}/${mobile ? 'mobile' : 'desktop'}-qr.png`, fullPage: true })
    await dialog.getByText('测试汽水账号', { exact: true }).waitFor({ timeout: 10000 })
    assert.equal(creates, 1)
    assert.equal(polls, 2)
    await dialog.getByRole('button', { name: '刷新授权', exact: true }).click()
    await dialog.getByText('刷新后的账号', { exact: true }).waitFor()
    assert.equal(refreshes, 1)
    await dialog.getByRole('button', { name: '解除绑定', exact: true }).click()
    await dialog.getByText('尚未绑定汽水账号', { exact: true }).waitFor()
    assert.equal(deletes, 1)
    confirm = false
    await dialog.getByRole('button', { name: '获取授权二维码', exact: true }).click()
    await dialog.getByAltText('汽水音乐授权二维码').waitFor()
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    const closedPolls = polls
    await page.waitForTimeout(2300)
    assert.equal(polls, closedPolls, 'closing the modal must stop polling')
    await page.getByRole('button', { name: '黑源授权', exact: true }).click()
    await dialog.getByText('尚未绑定汽水账号', { exact: true }).waitFor()
    await dialog.getByRole('button', { name: '获取授权二维码', exact: true }).click()
    await dialog.getByAltText('汽水音乐授权二维码').waitFor()
    await page.evaluate(() => {
      localStorage.setItem('nav.auth.session', JSON.stringify({ token: 'other-token', tokenType: 'Bearer', username: 'other-user', sessionId: 'other-session', refreshToken: null }))
      window.dispatchEvent(new Event('nav-auth-change'))
    })
    await dialog.waitFor({ state: 'hidden' })
    const changedPolls = polls
    await page.waitForTimeout(2300)
    assert.equal(polls, changedPolls, 'changing website accounts must stop old polling')
    await page.goto(`${base}/music?view=search&source=qishui&keyword=测试&type=playlist`)
    await page.getByRole('button', { name: /黑源测试歌单/ }).click()
    await page.getByText('黑源测试歌曲', { exact: true }).waitFor()
    assert.equal(playlistRequests.at(-1), playlistId)
    assert.ok(page.url().includes(encodeURIComponent(playlistId)))
    await page.goto(`${base}/music?view=search&source=qishui&keyword=测试`)
    await page.getByText('黑源测试歌曲', { exact: true }).click()
    await page.getByText('这首歌曲使用加密音频，网页暂不支持播放。', { exact: true }).waitFor()
    await page.screenshot({ path: `${output}/${mobile ? 'mobile' : 'desktop'}-search.png`, fullPage: true })
    console.log(`${mobile ? 'Mobile' : 'Desktop'}: search, composite playlist IDs, QR confirmation, refresh, unlink, cancellation, account isolation and playback errors passed`)
    await page.close()
  }
  assert.deepEqual(errors, [])
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: `${output}/failure.png`, fullPage: true })
    console.error((await activePage.locator('body').innerText()).slice(0, 3000), errors)
  }
  throw error
} finally {
  await browser.close()
}
