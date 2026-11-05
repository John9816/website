import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:5173'
const screenshotDir = process.env.SMOKE_SCREENSHOT_DIR || '/tmp/home-orbit-qa'
const browser = await chromium.launch({ headless: true })
const errors = []
const categories = [{
  id: 1, name: '开发工具', icon: 'code', sortOrder: 0,
  links: [
    { id: 1, name: 'GitHub', description: '代码与灵感的集合', url: 'https://github.com', sortOrder: 0 },
    { id: 2, name: 'Three.js', description: '在浏览器中探索三维世界', url: 'https://threejs.org', sortOrder: 1 },
  ],
}, {
  id: 2, name: '灵感收藏', icon: 'folder', sortOrder: 1,
  links: Array.from({ length: 24 }, (_, index) => ({
    id: 10 + index, name: `灵感站点 ${index + 1}`, description: '设计、阅读与日常发现',
    url: `https://example.com/${index}`, sortOrder: index,
  })),
}]

async function createPage(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, ...options })
  await context.addInitScript(() => {
    window.__orbitDraws = 0
    window.__orbitContexts = []
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      const result = getContext.call(this, kind, ...args)
      if (kind === 'webgl2' && result) window.__orbitContexts.push(result)
      return result
    }
    for (const method of ['drawArrays', 'drawElements']) {
      const original = WebGL2RenderingContext.prototype[method]
      WebGL2RenderingContext.prototype[method] = function (...args) {
        window.__orbitDraws++
        return original.apply(this, args)
      }
    }
  })
  await context.route(/^https?:\/\/[^/]+\/api\//, route => route.fulfill({
    json: { code: 0, message: 'ok', data: route.request().url().includes('/public/nav') ? categories : [] },
  }))
  await context.route('https://i.ibb.co/ds0Zv94K/image.webp', route => route.fulfill({
    path: fileURLToPath(new URL('../public/bank-nav/static/img/logo-20260710.webp', import.meta.url)),
    contentType: 'image/webp',
  }))
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  return page
}

try {
  await mkdir(screenshotDir, { recursive: true })
  const page = await createPage()
  await page.goto(base)
  await page.getByRole('heading', { name: '我的导航' }).waitFor()
  await page.locator('.home-orbit canvas').waitFor({ timeout: 10_000 })
  await page.getByRole('button', { name: '暂停首页动画' }).waitFor()
  assert.equal(await page.locator('.home-orbit canvas').count(), 1, 'Home renders one WebGL scene')
  await page.waitForFunction(() => window.__orbitDraws > 30)
  console.log('PASS: homepage WebGL scene draws')

  const stage = page.getByRole('button', { name: /^互动导航星球/ })
  const bounds = await stage.boundingBox()
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width * 0.8, bounds.y + bounds.height * 0.6, { steps: 12 })
  await page.mouse.up()
  await stage.press('ArrowRight')
  await stage.press('Enter')
  await page.getByRole('button', { name: '暂停首页动画' }).click()
  const draws = await page.evaluate(() => window.__orbitDraws)
  await page.waitForTimeout(300)
  assert.equal(await page.evaluate(() => window.__orbitDraws), draws, 'Pause stops GPU draws')
  assert.equal(await stage.isDisabled(), true, 'Paused scene cannot accidentally animate')
  await page.screenshot({ path: `${screenshotDir}/desktop-light.png` })

  await page.getByRole('button', { name: '切换到深色主题' }).click()
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
  await page.waitForTimeout(350)
  await page.screenshot({ path: `${screenshotDir}/desktop-dark.png` })
  assert.equal(await page.locator('.home-orbit canvas').count(), 1, 'Theme change reuses the canvas')
  assert.equal(await page.evaluate(() => window.__orbitContexts.filter(context => !context.isContextLost()).length), 1)
  await page.getByRole('button', { name: '播放首页动画' }).click()
  const resumedAt = await page.evaluate(() => window.__orbitDraws)
  await page.waitForFunction(count => window.__orbitDraws > count, resumedAt)
  console.log('PASS: pointer / keyboard controls, pause, theme switch and resume')

  await page.getByRole('searchbox').fill('GitHub')
  await page.waitForFunction(() => document.querySelectorAll('.home-resource').length === 1)
  assert.match(await page.locator('.home-resource').innerText(), /GitHub/)
  await page.getByRole('searchbox').press('Escape')
  await page.getByRole('button', { name: '列表视图' }).click()
  assert.equal(await page.locator('.home-groups--list').count(), 1)
  await page.getByRole('button', { name: '网格视图' }).click()

  await page.getByRole('button', { name: '赞助', exact: true }).scrollIntoViewIfNeeded()
  await page.waitForTimeout(250)
  const offscreenDraws = await page.evaluate(() => window.__orbitDraws)
  await page.waitForTimeout(300)
  assert.equal(await page.evaluate(() => window.__orbitDraws), offscreenDraws, 'Offscreen scene stops rendering')
  await page.getByRole('heading', { name: '我的导航' }).scrollIntoViewIfNeeded()
  await page.waitForFunction(count => window.__orbitDraws > count, offscreenDraws)

  await page.getByRole('link', { name: '登录', exact: true }).click()
  await page.waitForURL('**/login')
  await page.locator('.home-orbit canvas').waitFor({ state: 'detached' })
  assert.equal(await page.locator('.home-orbit canvas').count(), 0)
  assert.equal(await page.evaluate(() => window.__orbitContexts.every(context => context.isContextLost())), true, 'Route exit releases WebGL contexts')
  await page.goBack()
  await page.getByRole('button', { name: '暂停首页动画' }).waitFor()
  assert.equal(await page.evaluate(() => window.__orbitContexts.filter(context => !context.isContextLost()).length), 1, 'Returning home has only one live context')
  console.log('PASS: search, view switching, offscreen suspension and route cleanup')

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.locator('.home-orbit canvas').waitFor({ state: 'detached' })
  assert.equal(await page.locator('.home-orbit__fallback').isVisible(), true)
  assert.equal(await stage.isDisabled(), true)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.getByRole('button', { name: '暂停首页动画' }).waitFor()
  await page.evaluate(() => {
    const active = window.__orbitContexts.find(context => !context.isContextLost())
    active.getExtension('WEBGL_lose_context').loseContext()
  })
  await page.locator('.home-orbit canvas').waitFor({ state: 'detached' })
  assert.equal(await page.locator('.home-orbit__fallback').isVisible(), true, 'Context loss has a static fallback')
  console.log('PASS: changing reduced-motion preference and WebGL context loss')

  const reduced = await createPage({ reducedMotion: 'reduce' })
  const scripts = []
  reduced.on('request', request => scripts.push(request.url()))
  await reduced.goto(base)
  await reduced.getByRole('heading', { name: '我的导航' }).waitFor()
  assert.equal(await reduced.locator('.home-orbit canvas').count(), 0)
  assert.equal(scripts.some(url => /homeOrbitScene|\/three[._]/.test(url)), false, 'Reduced motion skips the Three.js download')

  const fallback = await createPage()
  await fallback.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      if (kind === 'webgl2') { window.__webglAttempted = true; return null }
      return original.call(this, kind, ...args)
    }
  })
  await fallback.goto(base)
  await fallback.getByRole('heading', { name: '我的导航' }).waitFor()
  await fallback.waitForFunction(() => window.__webglAttempted)
  await fallback.getByRole('searchbox').fill('Three.js')
  await fallback.waitForFunction(() => document.querySelectorAll('.home-resource').length === 1)
  assert.equal(await fallback.locator('.home-orbit canvas').count(), 0)
  assert.equal(await fallback.locator('.home-orbit__fallback').isVisible(), true)
  console.log('PASS: no-WebGL and reduced-motion keep navigation usable')

  const failedRender = await createPage()
  await failedRender.addInitScript(() => {
    WebGL2RenderingContext.prototype.drawElements = () => { throw new Error('Simulated GPU draw failure') }
  })
  await failedRender.goto(base)
  await failedRender.waitForFunction(() => window.__orbitContexts.length > 0)
  assert.equal(await failedRender.locator('.home-orbit__fallback').isVisible(), true, 'First-render failure preserves the static fallback')
  assert.equal(await failedRender.getByRole('button', { name: /^互动导航星球/ }).isDisabled(), true)
  console.log('PASS: first-render GPU failure falls back safely')

  const mobile = await createPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 })
  await mobile.goto(base)
  await mobile.getByRole('button', { name: '暂停首页动画' }).waitFor()
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No mobile horizontal overflow')
  assert.equal(await mobile.locator('.home-orbit__interaction').evaluate(element => getComputedStyle(element).touchAction), 'pan-y')
  const resolution = await mobile.locator('.home-orbit canvas').evaluate(canvas => canvas.width / canvas.getBoundingClientRect().width)
  assert.ok(resolution <= 1.26, 'Mobile renderer caps pixel ratio')
  await mobile.getByRole('button', { name: /^互动导航星球/ }).tap()
  await mobile.getByRole('button', { name: '暂停首页动画' }).click()
  await mobile.screenshot({ path: `${screenshotDir}/mobile.png` })
  await mobile.setViewportSize({ width: 320, height: 740 })
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No overflow at 320px')
  console.log('PASS: touch interaction, responsive layout and mobile resolution cap')
  assert.deepEqual(errors, [], 'No uncaught browser errors')
  console.log(`Screenshots: ${screenshotDir}`)
} finally {
  await browser.close()
}
