import puppeteer from 'puppeteer-core'
import fs from 'fs'
const session = fs.readFileSync('/tmp/auth_session.json', 'utf8')
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 100)))
await page.goto('https://hi.751152.xyz/', { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.evaluate(s => localStorage.setItem('nav.auth.session', s), session)

async function whites(label) {
  const r = await page.evaluate(() => {
    const list = []
    document.querySelectorAll('.app-shell__route-view *').forEach(el => {
      const b = el.getBoundingClientRect(); if (b.width < 140 || b.height < 44) return
      const bg = getComputedStyle(el).backgroundColor
      const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
      if (m && +m[1] > 225 && +m[2] > 225 && +m[3] > 225) {
        const c = (typeof el.className === 'string' ? el.className : el.tagName).slice(0, 55)
        list.push(`${c}[${b.width | 0}x${b.height | 0}]`)
      }
    })
    return { url: location.href, whites: [...new Set(list)].slice(0, 14) }
  })
  console.log(`\n== ${label} ==`, JSON.stringify(r))
  await page.screenshot({ path: `/tmp/detail-${label}.png` })
}

// 榜单详情：进榜单页点第一张卡
await page.goto('https://hi.751152.xyz/music?view=toplist', { waitUntil: 'networkidle2', timeout: 45000 })
await new Promise(r => setTimeout(r, 1800))
const hasCard = await page.$('.music-collection-card')
if (hasCard) {
  await page.click('.music-collection-card')
  await new Promise(r => setTimeout(r, 2800))
  await whites('toplist-detail')
} else console.log('\n== 榜单无卡片 ==')

// 歌单详情：进歌单页点第一张卡
await page.goto('https://hi.751152.xyz/music?view=playlist', { waitUntil: 'networkidle2', timeout: 45000 })
await new Promise(r => setTimeout(r, 1800))
if (await page.$('.music-collection-card')) {
  await page.click('.music-collection-card')
  await new Promise(r => setTimeout(r, 2800))
  await whites('playlist-detail')
}

// 搜索结果：输入关键词
await page.goto('https://hi.751152.xyz/music?view=search', { waitUntil: 'networkidle2', timeout: 45000 })
await new Promise(r => setTimeout(r, 1200))
try {
  const input = await page.$('.music-studio-search input, .ant-input-affix-wrapper input')
  if (input) {
    await input.click(); await input.type('周杰伦', { delay: 60 })
    await new Promise(r => setTimeout(r, 500))
    await page.keyboard.press('Enter')
    await new Promise(r => setTimeout(r, 3000))
    await whites('search-result')
  } else console.log('\n== 搜索框未找到 ==')
} catch (e) { console.log('\n搜索失败:', e.message.slice(0, 80)) }

console.log('\n== JS 错误 ==', errs.length, errs.slice(0, 3).join(' | '))
await browser.close()
