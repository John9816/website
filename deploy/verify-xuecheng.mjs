import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import http from 'node:http'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const dir = await mkdtemp(join(tmpdir(), 'xuecheng-ui-'))
const outputDir = process.env.SMOKE_OUTPUT_DIR || 'output/xuecheng'
await mkdir(outputDir, { recursive: true })
const profile = { id: 90101, username: 'qa-editor', role: 'USER', enabled: true, canManageSystemConfig: false }
const auth = http.createServer((req, res) => {
  const token = req.headers.authorization
  const valid = ['Bearer isolated-editor-ui', 'Bearer refreshed-editor-ui'].includes(token)
  res.writeHead(valid ? 200 : 401, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ code: valid ? 0 : 401, message: 'ok', data: req.url === '/api/user/me' ? profile : [] }))
})
const listen = async s => { s.listen(0, '127.0.0.1'); await once(s, 'listening'); return s.address().port }
const authPort = await listen(auth)
const probe = http.createServer(), port = await listen(probe)
await new Promise(r => probe.close(r))
const child = spawn(process.execPath, ['server/ecs-server.mjs'], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', BACKEND_URL: `http://127.0.0.1:${authPort}`, EDITOR_DATA_DIR: dir }, stdio: ['ignore', 'pipe', 'pipe'] })
let logs = ''; child.stdout.on('data', b => logs += b); child.stderr.on('data', b => logs += b)
const base = `http://127.0.0.1:${port}`
let browser
async function api(path, method = 'GET', body) {
  const res = await fetch(base + '/editor/api' + path, { method, headers: { Authorization: 'Bearer isolated-editor-ui', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const result = await res.json(); assert.equal(result.code, 0, result.message); return result.data
}
const docContent = text => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
async function waitFor(check, message) {
  for (let i = 0; i < 80; i++) { if (await check()) return; await new Promise(r => setTimeout(r, 100)) }
  throw new Error(message)
}
try {
  await waitFor(() => fetch(base + '/healthz').then(r => r.ok).catch(() => false), 'Server failed to start: ' + logs)
  const a = await api('/docs', 'POST', { title: 'UI Alpha', content: docContent('Alpha original') })
  const b = await api('/docs', 'POST', { title: 'UI Beta', content: docContent('Beta original') })
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addInitScript(() => localStorage.setItem('nav.auth.session', JSON.stringify({ token: 'isolated-editor-ui', tokenType: 'Bearer', username: 'qa-editor', refreshToken: null, sessionId: 'qa-editor' })))
  const page = await context.newPage(), errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.setDefaultTimeout(15000)
  await page.goto(`${base}/editor/#/doc/${a.id}`)
  const pm = page.locator('.ProseMirror[contenteditable="true"]')
  await pm.waitFor()
  assert.equal(await pm.innerText(), 'Alpha original')
  await page.locator('.doc-h1').fill('UI Alpha Edited')
  await pm.fill('Alpha updated before immediate switch')
  await page.locator('.tree-row', { hasText: 'UI Beta' }).click()
  await waitFor(async () => (await pm.innerText()).includes('Beta original'), 'Beta did not open')
  assert.equal((await api(`/docs/${a.id}`)).content.content[0].content[0].text, 'Alpha updated before immediate switch')
  assert.equal((await api(`/docs/${a.id}`)).title, 'UI Alpha Edited')
  assert.equal((await api(`/docs/${b.id}`)).content.content[0].content[0].text, 'Beta original')
  await pm.fill('Beta persisted after reload')
  await page.locator('.save-state').filter({ hasText: '已保存' }).waitFor()
  await page.reload()
  await pm.waitFor()
  assert.equal(await pm.innerText(), 'Beta persisted after reload')
  console.log('PASS editing, immediate switching, autosave and reload persistence')

  // A token refresh must not remount the editor while an unsaved write is delayed.
  let releaseSave;
  const heldSave = new Promise(resolve => releaseSave = resolve);
  await page.route(`**/editor/api/docs/${b.id}`, async route => {
    if (route.request().method() === 'PUT') await heldSave;
    await route.continue();
  });
  await pm.fill('Unsaved text survives token refresh');
  await page.evaluate(() => {
    const session = JSON.parse(localStorage.getItem('nav.auth.session'));
    session.token = 'refreshed-editor-ui';
    localStorage.setItem('nav.auth.session', JSON.stringify(session));
    window.dispatchEvent(new Event('nav-auth-change'));
  });
  await new Promise(r => setTimeout(r, 350));
  assert.equal(await pm.innerText(), 'Unsaved text survives token refresh');
  releaseSave();
  await page.locator('.save-state').filter({ hasText: '已保存' }).waitFor();
  await page.unroute(`**/editor/api/docs/${b.id}`);
  console.log('PASS pending edits survive token refresh');

  let releaseOpen, signalOpen;
  const heldOpen = new Promise(resolve => releaseOpen = resolve);
  const openStarted = new Promise(resolve => signalOpen = resolve);
  await page.route(`**/editor/api/docs/${a.id}`, async route => {
    if (route.request().method() === 'GET') { signalOpen(); await heldOpen; }
    await route.continue();
  });
  await page.locator('.tree-row', { hasText: 'UI Alpha Edited' }).first().click();
  await openStarted;
  await page.locator('.tree-row', { hasText: 'UI Beta' }).first().click();
  await page.locator('main[aria-busy="false"]').waitFor();
  releaseOpen();
  await page.waitForResponse(r => r.url().endsWith(`/editor/api/docs/${a.id}`) && r.request().method() === 'GET');
  await page.unroute(`**/editor/api/docs/${a.id}`);
  assert.equal(await page.locator('.doc-h1').inputValue(), 'UI Beta');
  assert.equal(await pm.innerText(), 'Unsaved text survives token refresh');
  await page.locator('.side-nav-item', { hasText: '模板市场' }).click();
  await page.locator('.tpl-card').first().waitFor();
  await page.goBack();
  await pm.waitFor();
  assert.equal(await pm.innerText(), 'Unsaved text survives token refresh');
  console.log('PASS stale document responses and browser history');

  await page.locator('.top-ai').click()
  await page.locator('.ai-panel').waitFor()
  assert.equal(await page.locator('.ai-tabs').getByRole('button', { name: 'MCP', exact: true }).count(), 0)
  await page.locator('.ai-x').click()
  await page.locator('.side-nav-item', { hasText: '模板市场' }).click()
  await page.locator('.tpl-card').first().click()
  await page.getByRole('dialog', { name: '模板预览' }).waitFor()
  await page.getByRole('button', { name: /使用此模板/ }).click()
  await pm.waitFor()
  assert.ok((await pm.innerText()).length > 20)
  console.log('PASS templates and user MCP visibility')
  await page.getByRole('button', { name: '分享', exact: true }).click()
  await page.getByRole('dialog', { name: '分享文档' }).waitFor()
  await page.getByRole('button', { name: /创建分享链接/ }).click()
  const link = await page.locator('.share-modal input').inputValue()
  assert.ok(link.startsWith(base + '/editor/#/s/'))
  const anonymous = await browser.newContext()
  const shared = await anonymous.newPage()
  await shared.goto(link)
  await shared.locator('.share-paper').waitFor()
  assert.equal(await shared.locator('[contenteditable="true"]').count(), 0)
  await page.getByRole('button', { name: /关闭分享/ }).click()
  await shared.reload()
  await shared.locator('.share-empty').waitFor()
  await shared.goto(base + '/editor/')
  await shared.waitForURL('**/login')
  console.log('PASS anonymous read-only sharing, revocation and login redirect')
  await page.keyboard.press('Escape')
  await page.screenshot({ path: join(outputDir, 'desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '打开文档导航' }).click()
  await page.locator('.sidebar').waitFor({ state: 'visible' })
  await page.locator('.tree-row', { hasText: 'UI Beta' }).click()
  await pm.waitFor()
  await page.locator('.sidebar').waitFor({ state: 'hidden' })
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
  assert.ok(fits, 'Mobile viewport overflows horizontally')
  assert.ok((await pm.boundingBox()).width >= 320, 'Mobile writing area is too narrow')
  assert.equal(await page.locator('.outline').isVisible(), false)
  const savedBounds = await page.locator('.save-state').boundingBox()
  assert.ok(savedBounds.x + savedBounds.width <= 390, 'Save state is clipped on mobile')
  await page.screenshot({ path: join(outputDir, 'mobile.png'), fullPage: true })
  console.log('PASS mobile document navigation and layout')
  assert.deepEqual(errors, [])
  const kb = spawn(process.execPath, ['deploy/verify-ui.mjs'], { env: { ...process.env, SMOKE_BASE_URL: base }, stdio: 'inherit' })
  const [code] = await once(kb, 'exit')
  assert.equal(code, 0, 'Existing knowledge-base regression failed')
  console.log('PASS existing knowledge-base regression')
} finally {
  await browser?.close()
  child.kill(); if (child.exitCode === null) await once(child, 'exit')
  auth.closeAllConnections(); await new Promise(r => auth.close(r))
  await rm(dir, { recursive: true, force: true })
}
