import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4173'
const screenshotDir = process.env.SMOKE_SCREENSHOT_DIR || '/tmp/website-membership-qa'
const browser = await chromium.launch({ headless: true })

try {
  await mkdir(screenshotDir, { recursive: true })
  for (const role of ['USER', 'ADMIN']) {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } })
      const membershipRequests = []
      const pageErrors = []
      await context.addInitScript(() => {
        localStorage.setItem('nav.auth.session', JSON.stringify({
          token: 'isolated-membership-test', tokenType: 'Bearer', username: 'qa-member',
          refreshToken: null, sessionId: 'isolated-membership-test',
        }))
      })
      await context.route(/^https?:\/\/[^/]+\/api\//, async route => {
        const path = new URL(route.request().url()).pathname
        const send = data => route.fulfill({ json: { code: 0, message: 'ok', data } })
        if (/membership|redeem-codes/.test(path)) membershipRequests.push(path)
        if (path === '/api/user/me') return send({ id: 900001, username: 'qa-member', role, canManageSystemConfig: role === 'ADMIN', credits: 0 })
        if (path === '/api/user/credits') return send({ credits: 0, checkedInToday: false, dailyCheckInReward: 5 })
        if (path === '/api/public/nav' || path.endsWith('/categories')) return send([])
        if (path === '/api/admin/content/status') return send({ aiReady: false, imageReady: false, wechatReady: false, configs: [] })
        if (path === '/api/admin/content/hot') return send({ capturedAt: new Date().toISOString(), sources: [], items: [] })
        if (path === '/api/admin/content/articles') return send({ items: [], total: 0, page: 0, size: 12 })
        if (path === '/api/admin/content/autopilot') return send({ enabled: false, times: [], categories: [], autoPublish: false, generateCover: false, blockers: [] })
        return route.fulfill({ status: 404, json: { code: 404, message: 'Not configured in isolated UI test', data: null } })
      })
      const page = await context.newPage()
      page.on('pageerror', error => pageErrors.push(error.message))
      await page.goto(base)
      await page.getByRole('button', { name: '查看个人资料' }).click()
      await page.getByText('退出登录', { exact: true }).waitFor()
      assert.equal(await page.getByText('会员状态', { exact: true }).count(), 0)
      assert.equal(await page.getByText(/兑换会员卡|领兑换码/).count(), 0)
      await page.screenshot({ path: `${screenshotDir}/${role.toLowerCase()}-${width}.png` })
      await page.goto(`${base}/admin/categories`)
      await page.getByRole('heading', { name: '分类管理' }).waitFor()
      assert.equal(await page.locator('a[href="/admin/redeem-codes"]').count(), 0)
      await page.goto(`${base}/admin/redeem-codes`)
      await page.waitForURL(url => !url.pathname.includes('redeem-codes'))
      assert.equal(await page.getByText('兑换码管理', { exact: true }).count(), 0)
      assert.deepEqual(membershipRequests, [], 'Hidden UI must not fetch or mutate membership')
      assert.deepEqual(pageErrors, [], 'Pages must remain usable with membership hidden')
      console.log(`PASS: ${role} ${width}px — profile, navigation, direct route and API isolation`)
      await context.close()
    }
  }
} finally {
  await browser.close()
}
