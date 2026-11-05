import assert from 'node:assert/strict'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ headless: true })
const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:5178'
const mirror = 'https://hi.751152.xyz/downloads/music/'
const androidUrl = 'https://api.751152.xyz/updates/DuckMusic-Flutter-v1.1.46-Android-arm64-v8a.apk'
const nextAndroidUrl = 'https://api.751152.xyz/updates/DuckMusic-Flutter-v1.2.0-Android-arm64-v8a.apk'
const errors = []

async function checkPage({ offline = false, mobile = false } = {}) {
  const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 } })
  page.on('pageerror', error => errors.push(error.message))
  await page.route(/^https?:\/\/[^/]+\/api\//, route => {
    if (route.request().url().includes('/public/music/installer/latest')) {
      return offline ? route.abort() : route.fulfill({ json: { code: 0, data: {
        version: '1.2.0', buildNumber: 60, title: 'DuckMusic', fileName: nextAndroidUrl.split('/').pop(),
        downloadUrl: nextAndroidUrl, releasedAt: '2026-11-06',
      } } })
    }
    return route.fulfill({ json: { code: 0, data: [] } })
  })
  await page.goto(`${base}/music/app`)
  const links = page.locator('a.music-promo__download')
  const cases = [
    ['Android', offline ? androidUrl : nextAndroidUrl],
    ['Windows', `${mirror}DuckMusic-Flutter-v1.1.46-Windows-x64-setup.exe`],
    ['iOS', `${mirror}DuckMusic-Flutter-v1.1.46-iOS-unsigned.ipa`],
    ['macOS', `${mirror}DuckMusic-Flutter-v1.1.46-macOS-arm64.dmg`],
  ]
  for (const [platform, expected] of cases) {
    await page.getByRole('tab', { name: platform, exact: true }).click()
    await page.waitForFunction(() => document.querySelector('.music-promo__version'))
    assert.equal(await links.count(), 2, `${platform}: hero and installation downloads`)
    for (const href of await links.evaluateAll(items => items.map(item => item.href))) {
      assert.equal(href, expected, `${platform}: downloads use the official direct host`)
    }
    if (platform === 'iOS') assert.match(await page.locator('.music-promo__install').innerText(), /签名/)
  }
  await page.getByRole('button', { name: 'Intel', exact: true }).click()
  for (const href of await links.evaluateAll(items => items.map(item => item.href))) {
    assert.equal(href, `${mirror}DuckMusic-Flutter-v1.1.46-macOS-x64.dmg`)
  }
  assert.equal(await page.locator('a[href*="github.com"]').count(), 0)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No horizontal overflow')
  await page.close()
  console.log(`PASS: four platforms, both macOS chips, ${offline ? 'API failure fallback' : 'live metadata'}, ${mobile ? 'mobile' : 'desktop'}`)
}

try {
  await checkPage()
  await checkPage({ offline: true, mobile: true })
  assert.deepEqual(errors, [], 'No browser runtime errors')
} finally {
  await browser.close()
}
