import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'

const MIRROR = '/tmp/25mirror'
const settingsBody = fs.readFileSync('/tmp/25settings-light.json', 'utf8')
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium', headless: 'new',
  args: ['--no-sandbox','--disable-gpu','--proxy-server=socks5://127.0.0.1:11080','--mute-audio'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
const errs = []
page.on('pageerror', e => errs.push(String(e).slice(0, 160)))

await page.setRequestInterception(true)
page.on('request', (req) => {
  const url = req.url()
  if (url.includes('/api/v1/settings/site')) {
    return req.respond({ status: 200, contentType: 'application/json', body: settingsBody,
      headers: { 'Access-Control-Allow-Origin': '*' } })
  }
  const m = url.match(/ios\.25pan\.com\/(assets\/[^\?]+)/)
  if (m) {
    const local = path.join(MIRROR, m[1])
    if (fs.existsSync(local)) {
      const ext = path.extname(local)
      const ct = ext === '.css' ? 'text/css' : ext === '.js' ? 'text/javascript' : 'application/octet-stream'
      return req.respond({ status: 200, contentType: ct, body: fs.readFileSync(local) })
    }
  }
  req.continue()
})

await page.goto('https://ios.25pan.com/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => console.log('goto', String(e).slice(0, 120)))
for (const [i, t] of [4, 8, 15, 25, 35].entries()) {
  await new Promise(r => setTimeout(r, i === 0 ? 4000 : i === 1 ? 4000 : i === 2 ? 7000 : i === 3 ? 10000 : 10000))
  const s = await page.evaluate(() => ({
    appLen: document.querySelector('#app')?.innerHTML?.length || 0,
    loading: !!document.querySelector('#app-loading'),
    fail: document.querySelector('#app-startup-failure')?.innerText?.slice(0, 80) || null,
    text: document.body.innerText.slice(0, 250),
  }))
  console.log(`t=${t}s`, JSON.stringify(s))
}
await page.screenshot({ path: '/tmp/25pan-final.png' })
console.log('JS错误', errs.length, errs.slice(0, 4).join(' | '))
await browser.close()
