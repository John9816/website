import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium', headless: 'new',
  args: ['--no-sandbox','--disable-gpu','--proxy-server=socks5://127.0.0.1:11080','--autoplay-policy=no-user-gesture-required','--mute-audio'],
})
const page = await browser.newPage()
await page.setViewport({width:1440,height:900,deviceScaleFactor:1})
const logs=[]; const errs=[]
page.on('pageerror',e=>errs.push(String(e).slice(0,200)))
page.on('console',m=>{ if(m.type()==='error') logs.push(m.text().slice(0,200)) })
await page.goto('https://ios.25pan.com/',{waitUntil:'domcontentloaded',timeout:60000}).catch(e=>console.log('goto',String(e).slice(0,120)))
for (const t of [3,8,15,25]) {
  await new Promise(r=>setTimeout(r, t*1000 - (t===3?0:[3,8,15][[3,8,15,25].indexOf(t)-1]*1000)))
  const s=await page.evaluate(()=>{
    const d=document
    const walk=(el)=>{ const out=[]; for(const c of el.children){ out.push(c.tagName.toLowerCase()+(c.id?'#'+c.id:'')+(c.className&&typeof c.className==='string'?'.'+c.className.split(' ')[0]:'')); if(out.length>25)break } return out }
    return {title:d.title, bodyChildren:walk(d.body), htmlLen:d.documentElement.outerHTML.length, hasCanvas:!!d.querySelector('canvas'), loaders:[...d.querySelectorAll('[class*=load],[class*=splash],[class*=boot],[id*=loading]')].map(e=>e.tagName+'.'+(e.className||e.id)).slice(0,10)}
  })
  console.log(`\n--- t=${t}s ---`,JSON.stringify(s))
}
console.log('\nJS错误',errs.length,errs.slice(0,5).join(' | '))
console.log('console.error',logs.length,logs.slice(0,5).join(' | '))
await page.screenshot({path:'/tmp/25pan-t25.png'})
await browser.close()
