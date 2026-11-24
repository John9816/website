import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium', headless: 'new',
  args: ['--no-sandbox','--disable-gpu','--proxy-server=socks5://127.0.0.1:11080','--autoplay-policy=no-user-gesture-required'],
})
const page = await browser.newPage()
await page.setViewport({width:1440,height:900,deviceScaleFactor:1})
const errs=[]
page.on('pageerror',e=>errs.push(String(e).slice(0,150)))
await page.goto('https://ios.25pan.com/',{waitUntil:'domcontentloaded',timeout:60000}).catch(e=>console.log('goto err',String(e).slice(0,100)))
console.log('页面已加载，等待启动动画…')
await new Promise(r=>setTimeout(r,15000))
const info=await page.evaluate(()=>({title:document.title,url:location.href,text:document.body.innerText.slice(0,1500)}))
console.log('=== 页面文本 ===\n'+info.text)
console.log('=== JS错误 ===',errs.length,errs.slice(0,3).join(' | '))
await page.screenshot({path:'/tmp/25pan-desktop.png'})
console.log('=== 截图 /tmp/25pan-desktop.png ===')
await browser.close()
