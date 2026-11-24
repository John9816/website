import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({
  executablePath:'/usr/bin/chromium',headless:'new',
  args:['--no-sandbox','--disable-gpu','--proxy-server=socks5://127.0.0.1:11080','--mute-audio'],
})
const page = await browser.newPage()
await page.setViewport({width:1440,height:900})
const pending=new Map(); const done=[]; const failed=[]
page.on('request',r=>pending.set(r.url(),Date.now()))
page.on('requestfinished',r=>{pending.delete(r.url());done.push(r.url())})
page.on('requestfailed',r=>{pending.delete(r.url());failed.push(r.url().slice(0,120)+' '+(r.failure()?.errorText||''))})
await page.goto('https://ios.25pan.com/',{waitUntil:'domcontentloaded',timeout:60000}).catch(()=>{})
await new Promise(r=>setTimeout(r,20000))
console.log('=== 请求总数 finished',done.length,'failed',failed.length,'pending',pending.size)
console.log('=== 失败请求 ===\n'+failed.slice(0,20).join('\n'))
console.log('=== 仍挂起(>5s) ===')
const now=Date.now()
for(const [url,t] of pending){ if(now-t>5000) console.log(Math.round((now-t)/1000)+'s',url.slice(0,130)) }
await browser.close()
