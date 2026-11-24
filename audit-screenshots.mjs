import puppeteer from 'puppeteer-core'
import fs from 'fs'

const session = fs.readFileSync('/tmp/auth_session.json', 'utf8')
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'],
})

const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
const errs = []
page.on('pageerror', (e) => errs.push(String(e).slice(0, 100)))

// 注入登录态
await page.goto('https://hi.751152.xyz/', { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.evaluate((s) => localStorage.setItem('nav.auth.session', s), session)

// 探测一个页面：截图 + 采样所有卡片/面板类元素的背景色，找出浅色残留
async function audit(name, url, waitMs = 2000) {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {})
  await new Promise((r) => setTimeout(r, waitMs))
  await page.screenshot({ path: `/tmp/audit-${name}.png` })
  const sample = await page.evaluate(() => {
    // 收集音乐区常见容器类，采样背景色
    const sels = [
      '.music-collection-card', '.music-toplist-card', '.daily-track', '.ab-continue-card',
      '.ab-scene', '.music-card', '.music-song-row', '.music-track-row', '.now-upnext',
      '.music-context-panel', '.music-context-card', '.music-search-collection-card',
      '.music-playlist-row', '.music-empty-state', '.music-page-heading', '.ant-segmented-item-selected',
    ]
    const out = {}
    for (const sel of sels) {
      const el = document.querySelector(sel)
      if (!el) continue
      const cs = getComputedStyle(el)
      out[sel] = { bg: cs.backgroundColor, color: cs.color }
    }
    // 找出 body 内 background 接近白色的可见块（粗略扫描大元素）
    const whites = []
    document.querySelectorAll('.music-v4 *').forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.width < 120 || r.height < 60) return
      const bg = getComputedStyle(el).backgroundColor
      const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
      if (m && Number(m[1]) > 225 && Number(m[2]) > 225 && Number(m[3]) > 225) {
        const cls = (el.className && typeof el.className === 'string') ? el.className.slice(0, 60) : el.tagName
        whites.push(`${cls}[${r.width | 0}x${r.height | 0}] ${bg}`)
      }
    })
    return { url: location.href, sample: out, whites: [...new Set(whites)].slice(0, 12), title: document.title }
  })
  console.log(`\n===== ${name} =====`)
  console.log(JSON.stringify(sample, null, 1))
  return sample
}

const base = 'https://hi.751152.xyz'
const pages = [
  ['discover', `${base}/music?view=discover`],
  ['roaming', `${base}/music?view=roaming`],
  ['toplist', `${base}/music?view=toplist`],
  ['playlist', `${base}/music?view=playlist`],
  ['new', `${base}/music?view=new`],
  ['favorites', `${base}/music?view=favorites`],
  ['history', `${base}/music?view=history`],
  ['my-playlists', `${base}/music?view=my-playlists`],
  ['search', `${base}/music?view=search`],
  ['app', `${base}/music/app`],
]
for (const [name, url] of pages) await audit(name, url)

// 站点其他页面（确认未被 :has() 深色皮肤污染）
await audit('home', `${base}/`)
await audit('knowledge', `${base}/doc`)
await audit('ai-chat', `${base}/ai-chat`)
await audit('ai-image', `${base}/ai-image`)
await audit('monitor', `${base}/monitor`)
await audit('login', `${base}/login`)

console.log('\n\n===== JS 错误 =====', errs.length, errs.slice(0, 5).join(' | '))
await browser.close()
