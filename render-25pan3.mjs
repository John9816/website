import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({
  executablePath:'/usr/bin/chromium',headless:'new',
  args:['--no-sandbox','--disable-gpu','--proxy-server=socks5://127.0.0.1:11080','--autoplay-policy=no-user-gesture-required','--mute-audio'],
})
const page = await browser.newPage()
await page.setViewport({width:1440,height:900,deviceScaleFactor:1})
await page.goto('https://ios.25pan.com/',{waitUntil:'domcontentloaded',timeout:60000}).catch(()=>{})
await new Promise(r=>setTimeout(r,6000))
// 检查启动失败提示 与 app 内容
const before=await page.evaluate(()=>({
  fail: document.querySelector('#app-startup-failure')?.innerText?.slice(0,500)||null,
  appHTML: document.querySelector('#app')?.innerHTML?.slice(0,300)||'(empty)',
  globals: Object.keys(window).filter(k=>/tabos|dismiss|loading|splash|startup/i.test(k)).slice(0,30),
  localStorage: Object.keys(localStorage).slice(0,30),
}))
console.log('=== 启动失败提示 ===\n',before.fail)
console.log('=== app 内容 ===\n',before.appHTML)
console.log('=== 全局函数 ===\n',before.globals)
await browser.close()
