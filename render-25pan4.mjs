import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({
  executablePath:'/usr/bin/chromium',headless:'new',
  args:['--no-sandbox','--disable-gpu','--proxy-server=socks5://127.0.0.1:11080','--autoplay-policy=no-user-gesture-required','--mute-audio'],
})
const page = await browser.newPage()
await page.setViewport({width:1440,height:900,deviceScaleFactor:1})
const errs=[]; page.on('pageerror',e=>errs.push(String(e).slice(0,150)))
await page.goto('https://ios.25pan.com/',{waitUntil:'domcontentloaded',timeout:60000}).catch(()=>{})
// 反复尝试解除启动动画
for (let i=0;i<10;i++){
  await page.evaluate(()=>{
    try{ window.__dismissAppLoading?.() }catch(e){}
    try{ window.__releaseAppLoadingSplash?.() }catch(e){}
    const l=document.querySelector('#app-loading'); if(l) l.remove()
    const f=document.querySelector('#app-startup-failure'); if(f) f.remove()
  }).catch(()=>{})
  await new Promise(r=>setTimeout(r,1500))
  const st=await page.evaluate(()=>({appLen:document.querySelector('#app')?.innerHTML?.length||0, appChildren:document.querySelector('#app')?.children?.length||0, loading:!!document.querySelector('#app-loading'), fail:!!document.querySelector('#app-startup-failure')}))
  console.log(i,JSON.stringify(st))
  if(st.appLen>1000) break
}
await new Promise(r=>setTimeout(r,3000))
await page.screenshot({path:'/tmp/25pan-unlock.png'})
console.log('JS错误',errs.length,errs.slice(0,3).join(' | '))
const final=await page.evaluate(()=>({text:document.body.innerText.slice(0,2000), html:document.querySelector('#app')?.innerHTML?.slice(0,500)}))
console.log('=== 最终文本 ===\n'+final.text)
await browser.close()
