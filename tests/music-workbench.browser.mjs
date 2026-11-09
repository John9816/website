import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser=await chromium.launch({headless:true,args:['--disable-features=LocalNetworkAccessChecks']})
const base=process.env.MUSIC_TEST_URL || 'http://127.0.0.1:5173'
const wav=Buffer.alloc(44+8000*60*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40)
function song(id,name='夜色里的风'){return {id:String(id),source:'qishui',name,artist:'陈默',artistId:'800',artistIds:['800'],album:'夜行',albumId:'900',coverUrl:base+'/fixture-cover.svg',durationSec:60,availableQualities:[]}}
const songs=[song(101),song(102,'路过人间'),song(103,'晴天之后'),song(104,'慢慢喜欢你')]
try {
 for(const [width,theme] of [[1440,'light'],[1440,'dark'],[390,'light'],[390,'dark']]){
  const page=await browser.newPage({viewport:{width,height:width===390?844:1000}});const errors=[];const nextSequences=[];let playCount=0;let failNext=true
  page.on('console',m=>{if(m.type()==='error')console.log('console',m.text().slice(0,180))});page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message)})
  await page.addInitScript(theme=>{localStorage.setItem('nav.token','test-token');localStorage.setItem('nav.username','tester');localStorage.setItem('nav.theme',theme)},theme)
  await page.route('**/fixture-cover.svg',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#355a62"/><circle cx="205" cy="230" r="120" fill="#71918b"/><path d="M0 300L400 120V400H0Z" fill="#193841"/><text x="40" y="80" font-size="34" fill="white">NIGHT WALK</text></svg>'}))
  await page.route('**/test.wav*',r=>r.fulfill({contentType:'audio/wav',body:wav}))
  await page.route(u=>u.pathname.startsWith('/api/'),async r=>{
    const u=new URL(r.request().url()),p=u.pathname;let data={};
    if(p==='/api/user/me')data={id:1,username:'tester',role:'USER',membershipActive:true,credits:100}
    else if(p.endsWith('/credits'))data={credits:100,checkedInToday:true}
    else if(p.endsWith('/qishui/discovery'))data={source:'qishui',list:songs}
    else if(p.endsWith('/qishui/account'))data={bound:true,status:'bound',nickname:'测试听众'}
    else if(p.endsWith('/roaming/modes'))data=[{id:'recommended',name:'为你推荐',group:'推荐'},{id:'drive',name:'公路驾驶',group:'场景'}]
    else if(p.includes('/roaming/sessions')){
      const next=p.endsWith('/next');const seq=Number(u.searchParams.get('sequence') || 0);if(next){nextSequences.push(seq);await new Promise(r=>setTimeout(r,200));if(failNext){failNext=false;await r.fulfill({status:502,contentType:'application/json',body:JSON.stringify({code:502,message:'fixture network failure'})});return}}
      data=r.request().method()==='DELETE'?null:{sessionId:'test-radio',source:'qishui',modeId:'drive',sequence:seq,nextSequence:seq+1,hasMore:true,expiresAt:'2030-01-01T00:00:00Z',list:[song(201+seq,'漫游歌曲 '+seq),song(301+seq,'下一首漫游 '+seq)]}
    }
    else if(p.endsWith('/music/play')){playCount++;data={id:u.searchParams.get('id'),source:'qishui',actualSource:'qishui',playUrl:'/test.wav?id='+u.searchParams.get('id'),requestedQuality:'320k',durationSec:60}}
    else if(p.endsWith('/qishui/song'))data=song(u.searchParams.get('id'),'补齐后的歌名')
    else if(p.endsWith('/music/lyric'))data={id:u.searchParams.get('id'),source:'qishui',lineLyrics:'[00:00.00]汽水歌词已加载',karaokeLyrics:'[0,60000](0,10000,0)汽水(10000,50000,0)歌词已加载'}
    else if(p.endsWith('/lyrics/ttml'))data={available:false,content:null}
    else if(p.endsWith('/music/artist'))data=[{id:'800',source:'qishui',name:'陈默',songCount:35,albumCount:2,description:'测试歌手资料'}]
    else if(p.endsWith('/artist/works'))data={artistId:'800',source:'qishui',type:u.searchParams.get('type'),page:1,pageSize:30,total:2,songs:[song(801,'歌手作品一'),song(802,'歌手作品二')],albums:[{id:'900',source:'qishui',name:'夜行',coverUrl:base+'/fixture-cover.svg'}]}
    else if(p.endsWith('/status'))data=[]
    else if(p.endsWith('/music/search'))data={source:'qishui',type:'song',list:[song(999,'搜索结果')],total:1}
    else if(p.endsWith('/suggestions'))data=['周杰伦']
    else if(p.includes('/music/'))data={items:[],list:[],total:0}
    else if(p==='/api/public/nav')data=[]
    await r.fulfill({contentType:'application/json; charset=utf-8',body:JSON.stringify({code:0,message:'ok',data})})
  })
  await page.goto(base+'/music');console.log('opened',width,theme);await page.getByRole('heading',{name:'发现音乐，从这一首开始。'}).waitFor()
  console.log('home loaded');await page.getByRole('button',{name:'开始收听',exact:true}).click();console.log('play clicked')
  await page.getByRole('heading',{name:'补齐后的歌名',exact:true}).waitFor()
  await page.locator('.music-home__lyric').filter({hasText:'汽水歌词已加载'}).waitFor()
  const audioLoads=await page.evaluate(()=>document.querySelector('audio').currentTime)
  await page.waitForTimeout(300);assert.ok(await page.evaluate(()=>document.querySelector('audio').currentTime)>=audioLoads)
  await page.locator('.music-home__listening').getByRole('button',{name:'陈默',exact:true}).click()
  await page.getByRole('dialog').getByText('歌手作品一',{exact:true}).waitFor()
  await page.getByRole('dialog').getByText('专辑',{exact:true}).click();await page.getByRole('dialog').getByText('夜行',{exact:true}).waitFor()
  await page.locator('.ant-drawer-close').click()
  await page.getByRole('button',{name:'音乐漫游',exact:true}).click()
  await page.getByLabel('漫游场景',{exact:true}).selectOption('drive')
  await page.getByRole('button',{name:'开始漫游',exact:true}).click()
  await page.getByRole('heading',{name:'当前漫游队列',exact:true}).waitFor()
  await page.getByRole('button',{name:'换一批',exact:true}).evaluate(el=>{el.click();el.click()})
  await page.getByText('漫游加载失败，可重试当前批次。',{exact:true}).waitFor()
  assert.deepEqual(nextSequences,[1])
  await page.getByRole('button',{name:/^重\s*试$/}).click()
  await page.getByText('漫游歌曲 1',{exact:true}).waitFor()
  assert.deepEqual(nextSequences,[1,1])
  await page.getByText('漫游歌曲 1',{exact:true}).waitFor()
  await page.getByRole('button',{name:'搜索',exact:true}).first().click()
  await page.getByRole('button',{name:'音乐漫游',exact:true}).click()
  await page.getByText('漫游歌曲 1',{exact:true}).waitFor()
  await page.waitForFunction(()=>!document.querySelector('[aria-label="漫游场景"]')?.disabled)
  if(width===390)assert.ok((await page.locator('.music-player-bar').boundingBox()).height<145,'mobile player should stay compact')
  await fs.mkdir('/tmp/music-workbench-qa',{recursive:true})
  await page.screenshot({path:`/tmp/music-workbench-qa/${width}-${theme}.png`,fullPage:true})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)
  await page.locator('.music-player-bar').getByRole('button',{name:'下一首',exact:true}).click()
  await page.waitForFunction(()=>new URL(document.querySelector('audio').src).searchParams.get('id')==='302')
  await page.evaluate(()=>document.querySelector('audio').dispatchEvent(new Event('ended')))
  await page.getByText('漫游歌曲 2',{exact:true}).waitFor()
  assert.deepEqual(nextSequences,[1,1,2])
  await page.getByRole('button',{name:'换一批',exact:true}).click()
  await page.getByRole('button',{name:'结束',exact:true}).click();await page.waitForTimeout(350);await page.getByRole('heading',{name:'当前漫游队列',exact:true}).waitFor({state:'hidden'})
  assert.deepEqual(errors,[]);console.log('PASS',width,theme,'official lyrics/metadata, artist songs/albums, roaming duplicate prevention/retry/auto-next/navigation/cancellation; play requests',playCount)
  await page.close()
 }
}finally{for(const p of browser.contexts().flatMap(c=>c.pages()))await p.screenshot({path:'/tmp/music-workbench-last.png',fullPage:true}).catch(()=>{});await browser.close()}
