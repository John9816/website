import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:5173'
const screenshotDir = process.env.SMOKE_SCREENSHOT_DIR || '/tmp'
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const pageErrors = []
const unknownApiCalls = []
const writes = []
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
const now = new Date().toISOString()

const qualityGate = {
  decision: 'pass', score: 87, publishable: true, reason: '质量门已通过',
  issues: [], hasEvidence: true, hasPlan: true, metrics: { hasCoverImage: true, readyInlineImageCount: 2 },
}
const inlineImages = [1, 2].map(index => ({
  slotId: `image-${index}`, sectionKey: `section-${index}`, sectionTitle: `第 ${index} 节`,
  alt: `配图 ${index}`, sourceType: 'ai', sourceUrl: png, status: 'READY',
}))
const article = (id, status) => ({
  id,
  title: id === 900001 ? 'QA 已提交待微信确认' : 'QA 微信发布失败',
  digest: '用于隔离测试公众号内容生产状态的摘要，正文和素材均为本地模拟数据。',
  contentHtml: '<p>公众号内容预览</p><script>window.__qaXss = true</script><img src="' + png + '" onerror="window.__qaXss = true">',
  contentMarkdown: '公众号内容预览',
  category: '科技 / 互联网', layoutTheme: 'clean', imageMode: 'generate',
  coverImageUrl: png, inlineImages, topics: [], tags: [], riskTips: [],
  evidenceSources: [{ title: 'QA source' }], plan: { outline: [] }, qualityScore: 87,
  status, wechatMediaId: `qa-media-${id}`, wechatPublishId: `qa-publish-${id}`,
  errorMessage: status === 'PUBLISH_FAILED' ? '微信返回发布失败' : null,
  createdAt: now, updatedAt: now,
  automation: {
    currentStage: 'publish', qualityGate,
    logs: [{ id: `log-${id}`, stage: 'publish', status: status === 'PUBLISH_FAILED' ? 'FAILED' : 'PENDING', message: status === 'PUBLISH_FAILED' ? '微信发布失败' : '等待微信确认', createdAt: now }],
    jobs: status === 'PUBLISH_FAILED' ? [{ id: `${id}-publish-job`, stage: 'publish', status: 'FAILED', attempts: 1, maxAttempts: 3, errorMessage: '微信返回发布失败', createdAt: now }] : [],
    publishRecords: [{ id: `record-${id}`, action: 'publish', status: status === 'PUBLISH_FAILED' ? 'FAILED' : 'PENDING', mediaId: `qa-media-${id}`, publishId: `qa-publish-${id}`, errorMessage: status === 'PUBLISH_FAILED' ? '微信返回发布失败' : null, createdAt: now }],
  },
})
let articles = [article(900001, 'PUBLISH_SUBMITTED'), article(900002, 'PUBLISH_FAILED')]
let autopilot = {
  enabled: false, times: ['08:00', '20:00'], categories: ['科技 / 互联网'],
  autoPublish: true, generateCover: true, nextRunAt: null,
  blockers: ['The official account has no freepublish permission'],
}
const status = {
  aiReady: true, imageReady: true, wechatReady: true,
  configs: [
    { key: 'ai.chat.baseUrl', label: '文章模型地址', ready: true },
    { key: 'ai.chat.apiKey', label: '文章模型密钥', ready: true },
    { key: 'image.api.baseUrl', label: '封面图片地址', ready: true },
    { key: 'image.api.key', label: '封面图片密钥', ready: true },
    { key: 'wechat.appId', label: '公众号 AppID', ready: true },
    { key: 'wechat.appSecret', label: '公众号 AppSecret', ready: true },
    { key: 'wechat.coverMediaId', label: '默认微信封面素材', ready: true },
    { key: 'wechat.freePublishEnabled', label: '微信一键发布权限', ready: false },
    { key: 'content.autopilot.enabled', label: '自动流水线运行中', ready: false },
    { key: 'content.autopilot.autoPublish', label: '自动群发', ready: true },
  ],
}

await context.addInitScript(() => {
  localStorage.setItem('nav.auth.session', JSON.stringify({
    token: 'isolated-content-test', tokenType: 'Bearer', username: 'qa-admin',
    refreshToken: null, sessionId: 'isolated-content-test',
  }))
})

// Every API call is intercepted before it reaches the Vite proxy or a backend.
await context.route(/^https?:\/\/[^/]+\/api\//, async route => {
  const request = route.request()
  const url = new URL(request.url())
  const path = url.pathname
  const method = request.method()
  const send = data => route.fulfill({ json: { code: 0, message: 'ok', data } })
  if (method !== 'GET') writes.push({ path, method, body: request.postDataJSON?.() })
  if (path === '/api/user/me') return send({ id: 900001, username: 'qa-admin', role: 'ADMIN', canManageSystemConfig: true, credits: 0 })
  if (path === '/api/user/credits') return send({ credits: 0, checkedInToday: false, dailyCheckInReward: 5 })
  if (path === '/api/admin/content/status') return send(status)
  if (path === '/api/admin/content/hot') return send({ capturedAt: now, sources: [], items: [] })
  if (path === '/api/admin/content/articles') return send({ items: articles, total: articles.length, page: 0, size: 12 })
  if (path === '/api/admin/content/autopilot') {
    if (method === 'PUT') {
      const body = request.postDataJSON()
      autopilot = {
        ...autopilot, ...body,
        blockers: body.autoPublish ? ['The official account has no freepublish permission'] : [],
        nextRunAt: body.enabled ? new Date(Date.now() + 3600000).toISOString() : null,
      }
    }
    return send(autopilot)
  }
  if (path === '/api/admin/content/autopilot/run' && method === 'POST') {
    return send({ jobId: 'qa-run', status: 'PENDING', stage: 'queued' })
  }
  if (path === '/api/admin/content/automation/run/qa-run') {
    return send({ jobId: 'qa-run', status: 'SUCCESS', stage: 'done', article: articles[0], automation: articles[0].automation, draft: { mediaId: articles[0].wechatMediaId, mode: 'wechat' } })
  }
  if (path === '/api/admin/content/automation') {
    const id = Number(url.searchParams.get('articleId'))
    return send((articles.find(item => item.id === id) || articles[0]).automation)
  }
  const detail = path.match(/^\/api\/admin\/content\/articles\/(\d+)$/)
  if (detail && method === 'GET') return send(articles.find(item => item.id === Number(detail[1])))
  if (path === '/api/admin/content/automation/jobs/retry' && method === 'POST') {
    return send(articles[1].automation)
  }
  unknownApiCalls.push(`${method} ${path}`)
  return route.fulfill({ status: 404, json: { code: 404, message: 'Unexpected mocked API call', data: null } })
})

const page = await context.newPage()
page.setDefaultTimeout(20000)
page.on('pageerror', error => pageErrors.push(error.stack || error.message))

try {
  await page.goto(`${base}/admin/content`, { waitUntil: 'domcontentloaded' })
  await page.getByText('自动驾驶计划', { exact: true }).waitFor()
  await page.getByText('当前公众号没有接口发布权限，请关闭自动群发').waitFor()
  const schedule = page.locator('.content-factory__autopilot-form')
  const enabledSwitch = schedule.locator('.ant-form-item').filter({ hasText: '定时运行' }).getByRole('switch')
  assert.equal(await enabledSwitch.isDisabled(), true, 'Blockers must prevent enabling the schedule')
  assert.equal(await schedule.getByRole('button', { name: '立即运行' }).isDisabled(), true, 'Blockers must prevent a manual run')

  await schedule.locator('.ant-form-item').filter({ hasText: '自动群发' }).getByRole('switch').click()
  await schedule.getByRole('button', { name: '保存计划' }).click()
  await page.getByText('启用条件尚未满足').waitFor({ state: 'hidden' })
  assert.equal(writes.at(-1).body.autoPublish, false, 'Saving draft-only mode must reach the API')
  assert.equal(await enabledSwitch.isEnabled(), true)
  await enabledSwitch.click()
  await schedule.getByRole('button', { name: '保存计划' }).click()
  await page.getByText('定时运行中', { exact: true }).first().waitFor()
  assert.equal(writes.at(-1).body.enabled, true, 'The enabled plan must be persisted')

  await page.getByText('QA 已提交待微信确认').first().click()
  await page.getByRole('button', { name: '刷新发布状态' }).waitFor()
  assert.equal(await page.getByRole('button', { name: '等待微信确认' }).isDisabled(), true)
  await page.getByRole('tab', { name: '预览' }).click()
  const preview = page.locator('.content-factory__preview')
  await preview.waitFor()
  assert.equal(await preview.locator('script, img[onerror]').count(), 0, 'HTML preview must be sanitized')
  assert.equal(await page.evaluate(() => window.__qaXss === true), false, 'Preview scripts must not execute')
  await page.locator('.content-factory-drawer-root .ant-drawer-close').click()
  await page.getByText('QA 微信发布失败').first().click()
  await page.getByText('微信发布失败').first().waitFor()
  await page.locator('.content-factory-drawer-root .ant-drawer-close').click()

  await mkdir(screenshotDir, { recursive: true })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.waitForTimeout(250)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    assert.ok(overflow <= 1, `Horizontal overflow at ${width}px: ${overflow}px`)
    await page.screenshot({ path: `${screenshotDir}/content-factory-${width}.png`, fullPage: true })
  }
  await page.getByText('QA 已提交待微信确认').first().click()
  await page.waitForFunction(() => {
    const drawer = document.querySelector('.content-factory-drawer-root .ant-drawer-content-wrapper')
    return drawer && drawer.getBoundingClientRect().x <= 1
  })
  const drawerBox = await page.locator('.content-factory-drawer-root .ant-drawer-content-wrapper').boundingBox()
  assert.ok(drawerBox && drawerBox.x <= 1 && drawerBox.width >= 389, `Article drawer must fill 390px viewport: ${JSON.stringify(drawerBox)}`)
  const drawerOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  assert.ok(drawerOverflow <= 1, `Drawer overflow at 390px: ${drawerOverflow}px`)
  await page.screenshot({ path: `${screenshotDir}/content-factory-drawer-390.png`, fullPage: true })

  assert.deepEqual(pageErrors, [], 'Browser runtime errors')
  assert.deepEqual(unknownApiCalls, [], 'Unexpected API calls')
  assert.equal(writes.filter(item => item.path === '/api/admin/content/autopilot' && item.method === 'PUT').length, 2)
  console.log(JSON.stringify({
    result: 'passed',
    checks: ['autopilot-blockers', 'draft-only-save', 'enable-plan', 'publish-states', 'preview-sanitization', 'desktop-mobile-overflow'],
    screenshots: [1440, 390, 'drawer-390'].map(item => `${screenshotDir}/content-factory-${item}.png`),
  }))
} catch (error) {
  console.error('Browser errors:', pageErrors)
  console.error('Unknown API calls:', unknownApiCalls)
  await page.screenshot({ path: `${screenshotDir}/content-factory-failure.png`, fullPage: true })
  throw error
} finally {
  await browser.close()
}
