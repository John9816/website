import puppeteer from 'puppeteer-core'

const URL = process.env.TARGET || 'https://hi.751152.xyz/'
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
})

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

try {
  const page = await browser.newPage()
  // 无头 Chromium 默认 hover:none / pointer:coarse，hook 会按设计停用。
  // CDP 无法模拟这两个特性，故在页面脚本层覆盖 matchMedia，
  // 只对 hover/pointer 查询返回桌面真值；鼠标事件本身仍是 puppeteer 真实派发。
  await page.evaluateOnNewDocument(() => {
    const orig = window.matchMedia.bind(window)
    window.matchMedia = (q) => {
      if (q.includes('hover: hover') || q.includes('pointer: fine')) {
        return {
          matches: true, media: q, onchange: null,
          addEventListener() {}, removeEventListener() {},
          addListener() {}, removeListener() {}, dispatchEvent() { return true },
        }
      }
      return orig(q)
    }
  })
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 45000 })
  await page.waitForSelector('.home-hero', { timeout: 15000 })
  await sleep(500)

  const mq = await page.evaluate(() => ({
    combo: matchMedia('(hover: hover) and (pointer: fine)').matches,
    reduce: matchMedia('(prefers-reduced-motion: reduce)').matches,
  }))
  console.log('媒体特性(模拟桌面):', JSON.stringify(mq))

  const box = await page.$eval('.home-hero', el => {
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  })
  console.log('Hero box:', JSON.stringify(box))

  const sample = async (fx, fy) => {
    await page.mouse.move(box.x + box.w * fx, box.y + box.h * fy)
    await sleep(800)
    return await page.evaluate(() => {
      const hero = document.querySelector('.home-hero')
      const item = document.querySelector('.home-decor__pill')
      const glow = document.querySelector('.home-decor__glow--a')
      return {
        px: hero.style.getPropertyValue('--px'),
        py: hero.style.getPropertyValue('--py'),
        itemTransform: getComputedStyle(item).transform,
        glowTranslate: getComputedStyle(glow).translate,
      }
    })
  }

  const center = await sample(0.5, 0.5)
  const topLeft = await sample(0.02, 0.02)
  const bottomRight = await sample(0.98, 0.98)

  console.log('\n--- center ---\n', JSON.stringify(center))
  console.log('\n--- top-left ---\n', JSON.stringify(topLeft))
  console.log('\n--- bottom-right ---\n', JSON.stringify(bottomRight))

  const pxC = parseFloat(center.px || '0'), pxTL = parseFloat(topLeft.px || '0'), pxBR = parseFloat(bottomRight.px || '0')
  const ok = Math.abs(pxC) < 0.05 && pxTL < -0.3 && pxBR > 0.3
  console.log('\n=== 首页视差判定:', ok ? 'PASS ✅（鼠标左右移动，--px 正确负→正，装饰位移随之变化）' : 'FAIL ❌', '===')

  // 认证页
  await page.goto(URL.replace(/\/$/, '') + '/login', { waitUntil: 'networkidle2', timeout: 45000 })
  await page.waitForSelector('.account-brand', { timeout: 15000 })
  await sleep(400)
  const abox = await page.$eval('.account-brand', el => {
    const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }
  })
  await page.mouse.move(abox.x + abox.w * 0.95, abox.y + abox.h * 0.95)
  await sleep(800)
  const auth = await page.evaluate(() => {
    const brand = document.querySelector('.account-brand')
    const orb = document.querySelector('.account-brand__orb--2')
    return { px: brand.style.getPropertyValue('--px'), py: brand.style.getPropertyValue('--py'), orbTransform: getComputedStyle(orb).transform }
  })
  console.log('\n--- 认证页 orb ---\n', JSON.stringify(auth))
  const okAuth = parseFloat(auth.px || '0') > 0.3 || parseFloat(auth.py || '0') > 0.3
  console.log('=== 认证页视差判定:', okAuth ? 'PASS ✅' : 'FAIL ❌', '===')
} finally {
  await browser.close()
}
