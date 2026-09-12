import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')

const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:5173'
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const errors = []
const writes = []
let failSave = false
let doc = {
  id: 900001, spaceId: 900001, parentId: null, title: 'QA document',
  contentHtml: '<p></p>', contentJson: '', summary: '', status: 'draft',
  sortOrder: 1, versionNo: 1, tags: [], updatedAt: new Date().toISOString(),
}
const imageUrl = 'https://qa-images.invalid/image.png'
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')

await context.addInitScript(() => {
  localStorage.setItem('nav.auth.session', JSON.stringify({
    token: 'isolated-ui-test', tokenType: 'Bearer', username: 'qa-local',
    refreshToken: null, sessionId: 'isolated-ui-test',
  }))
})
await context.route(imageUrl, route => route.fulfill({ contentType: 'image/png', body: png }))
// Every API request is intercepted. This test cannot mutate production data.
await context.route(/^https?:\/\/[^/]+\/api\//, async route => {
  const req = route.request()
  const path = new URL(req.url()).pathname
  const method = req.method()
  const send = data => route.fulfill({ json: { code: 0, message: 'ok', data } })
  if (method !== 'GET') writes.push({ path, method, body: req.postData() })
  if (path === '/api/user/me') return send({ id: 900001, username: 'qa-local', role: 'USER', credits: 0 })
  if (path === '/api/user/credits') return send({ credits: 0, checkedInToday: false, dailyCheckInReward: 5 })
  if (path === '/api/user/kb/spaces') return send([{ id: 900001, name: 'QA space', sortOrder: 1, docCount: 1 }])
  if (path.endsWith('/tree')) return send([{ ...doc, children: [] }])
  if (path === '/api/user/kb/tags') return send([])
  if (path === '/api/user/kb/assets') return send({ url: imageUrl, contentType: 'image/png', size: png.length })
  if (path === '/api/user/kb/docs' && method === 'POST') {
    doc = { ...doc, ...req.postDataJSON() }
    return send(doc)
  }
  if (path === '/api/user/kb/docs') return send({ items: [doc], total: 1, page: 0, size: 20 })
  if (path === '/api/user/kb/docs/900001') {
    if (method === 'PUT') {
      if (failSave) return route.fulfill({ status: 503, json: { code: 503, message: 'QA offline' } })
      doc = { ...doc, ...req.postDataJSON(), versionNo: doc.versionNo + 1, updatedAt: new Date().toISOString() }
    }
    return send(doc)
  }
  if (path === '/api/user/image/models') return send([{ id: 'qa-model' }])
  if (method !== 'GET') throw new Error(`Unexpected write: ${method} ${path}`)
  return send([])
})

const page = await context.newPage()
page.setDefaultTimeout(20000)
page.on('pageerror', error => errors.push(error.stack || error.message))
page.on('dialog', dialog => dialog.accept())
try {
  await page.goto(`${base}/admin/kb`, { waitUntil: 'domcontentloaded' })
  await page.locator('.kb-admin-toolbar').getByRole('button', { name: /新建文档/ }).click()
  const editor = page.locator('.ProseMirror[contenteditable="true"]')
  await editor.fill('QA paragraph')
  await page.waitForFunction(() => localStorage.getItem('kb:draft:v1:900001')?.includes('QA paragraph'))
  assert.equal(writes.filter(w => w.method === 'PUT').length, 0, 'Local draft precedes remote autosave')
  await editor.press('ControlOrMeta+A')
  await page.locator('.editor-menu-bar button[aria-label="加粗"]').click()
  assert.equal(await editor.locator('strong').innerText(), 'QA paragraph')
  await page.locator('.editor-menu-bar button[aria-label="撤销"]').click()
  assert.equal(await editor.locator('strong').count(), 0)
  await page.locator('.editor-menu-bar button[aria-label="重做"]').click()
  assert.equal(await editor.locator('strong').count(), 1)
  await editor.press('ControlOrMeta+End')
  await editor.press('Enter')
  await page.locator('.editor-menu-bar button[aria-label="插入表格"]').click()
  await page.getByRole('gridcell', { name: '插入 2 行 2 列表格', exact: true }).click()
  assert.equal(await editor.locator('table tr').count(), 2)
  await page.locator('.editor-menu-bar button[aria-label="下方插入行"]').click()
  assert.equal(await editor.locator('table tr').count(), 3)
  await page.locator('input[type="file"][accept*="image"]').setInputFiles({ name: 'qa.png', mimeType: 'image/png', buffer: png })
  await editor.locator(`img[src="${imageUrl}"]`).waitFor()
  await page.waitForFunction(() => document.querySelector('.kb-admin-editor-save-state')?.textContent?.includes('已自动保存'), null, { timeout: 20000 })
  assert.match(doc.contentHtml, /qa-images\.invalid/)
  assert.match(doc.contentJson, /qa-images\.invalid/)
  assert.equal(await editor.locator('.editor-image-placeholder').count(), 0)
  await page.mouse.move(0, 0)
  await page.waitForTimeout(500)
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.waitForTimeout(200)
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) {
      console.error('Overflow nodes', await page.evaluate(() => [...document.querySelectorAll('body *')].map(e => ({ tag: e.tagName, cls: e.className, rect: e.getBoundingClientRect(), css: getComputedStyle(e) })).filter(e => e.rect.right > innerWidth + 2 && e.rect.height > 0).slice(0,12).map(e => ({ tag: e.tag, cls: e.cls, left: e.rect.left, width: e.rect.width, overflow: e.css.overflow }))))
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow at ${width}`)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  failSave = true
  await editor.press('ControlOrMeta+End')
  await editor.press('Enter')
  await editor.pressSequentially('unsaved offline text')
  await page.waitForFunction(() => document.querySelector('.kb-admin-editor-save-state')?.textContent?.includes('自动保存失败'), null, { timeout: 20000 })
  assert.match(await editor.innerText(), /unsaved offline text/)
  assert.match(await page.evaluate(() => localStorage.getItem('kb:draft:v1:900001')), /unsaved offline text/)
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ result: 'passed', checks: ['draft-before-autosave', 'bold-undo-redo', 'table-rows', 'image-upload-html-json', 'responsive-editor', 'failed-save-retains-draft'], mockedWrites: writes.length }))
} catch (error) {
  console.error('UI exceptions:', errors)
  console.error('Captured writes:', writes.map(({ path, method }) => ({ path, method })))
  await page.screenshot({ path: '/tmp/website-ui-smoke-failure.png', fullPage: true })
  throw error
} finally {
  await browser.close()
}
