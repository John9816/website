// Run against Vite: PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/music-capabilities.browser.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.MUSIC_TEST_URL || 'http://127.0.0.1:5173'
const browser = await chromium.launch({headless:true,args:['--disable-features=LocalNetworkAccessChecks']})
const ttml = `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><body><div><p begin="2s" end="10s"><span begin="2s" end="4s">你</span><span begin="4s" end="10s">好</span><span ttm:role="x-translation">Hello</span><span ttm:role="x-roman">Ni hao</span></p></div></body></tt>`
const html = `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true;
await import('/src/index.css'); await import('/src/styles/music.css');
const React = (await import('/node_modules/.vite/deps/react.js')).default; const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default; const {App,ConfigProvider}=await import('/node_modules/.vite/deps/antd.js');
const {AuthProvider}=await import('/src/context/AuthContext.tsx');const {MusicPlayerProvider,useMusicPlayer,useMusicBrowse}=await import('/src/context/MusicPlayerContext.tsx');const {default:Player}=await import('/src/components/MusicPlayerBar.tsx');const {default:Search}=await import('/src/components/MusicSearchInput.tsx');const {default:Settings}=await import('/src/components/MusicLyricsSettings.tsx');
const h=React.createElement;
const BrowseProbe=React.memo(()=>{useMusicBrowse();window.browseRenders=(window.browseRenders||0)+1;return null});
function Harness(){const p=useMusicPlayer();const [q,setQ]=React.useState('');window.testPlayer=p;return h('div',{},h(BrowseProbe),h(Search,{source:'qishui',value:q,onChange:setQ,onSearch:v=>{window.searchCalls=(window.searchCalls||[]).concat(v)},placeholder:'测试搜索',enterButton:'搜索'}),h(Settings),h('button',{onClick:()=>p.playResolvedSong({id:'186016',source:'netease',name:'Song A',artist:'Artist',availableQualities:[]},{id:'186016',source:'netease',name:'Song A',artist:'Artist',durationSec:20,playUrl:'/test.wav',requestedQuality:'320k',lyric:{lineLyrics:'[00:00.00]Original A',karaokeLyrics:null}})},'Track A'),h('button',{onClick:()=>p.playResolvedSong({id:'2',source:'netease',name:'Song B',artist:'Artist',availableQualities:[]},{id:'2',source:'netease',name:'Song B',artist:'Artist',durationSec:20,playUrl:'/test.wav?b',requestedQuality:'320k',lyric:{lineLyrics:'[00:00.00]Original B',karaokeLyrics:null}})},'Track B'),h(Player))}
createRoot(document.getElementById('root')).render(h(ConfigProvider,{},h(App,{},h(AuthProvider,{},h(MusicPlayerProvider,{},h(Harness))))));
</script></body></html>`
const wav = Buffer.alloc(44+8000*20*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40)
try {
 for(const viewport of [{width:1440,height:900},{width:390,height:844}]) {
  const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.message)});page.on('console',m=>{if(m.type()==='error')console.error('CONSOLE',m.text())})
  await page.addInitScript(()=>{localStorage.setItem('nav.token','test-token');localStorage.setItem('nav.username','test')})
  let slow=false;const suggestionQueries=[]
  await page.route('**/__music_capabilities_test__',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:html}))
  await page.route('**/test.wav*',r=>r.fulfill({contentType:'audio/wav',body:wav}))
  await page.route(url => url.pathname.startsWith('/api/'),async r=>{const u=new URL(r.request().url());let data={};
    if(u.pathname.endsWith('/suggestions')){const q=u.searchParams.get('keyword');suggestionQueries.push(q);await new Promise(r=>setTimeout(r,q==='旧'?500:20));data=[q+'建议']}
    else if(u.pathname.endsWith('/ttml')){const id=u.searchParams.get('id');if(slow&&id==='186016')await new Promise(r=>setTimeout(r,600));data=id==='186016'?{available:true,content:ttml}:{available:false,content:null}}
    else if(u.pathname.endsWith('/status'))data=[]
    else if(u.pathname.includes('/user'))data={id:1,username:'test',roles:[]}
    await r.fulfill({contentType:'application/json',body:JSON.stringify({code:0,data,message:'ok'})}).catch(()=>{})
  })
  await page.goto(base+'/__music_capabilities_test__');await page.getByPlaceholder('测试搜索').waitFor()
  const parsed=await page.evaluate(async xml=>{const {parseTtml}=await import('/src/utils/musicLyrics.ts');const lines=parseTtml(xml);let blocked=0;for(const bad of ['<!DOCTYPE tt><tt/>','<tt><p></tt>','<tt><body><p begin="NaNs">bad</p></body></tt>'])try{parseTtml(bad)}catch{blocked++}return{lines,blocked}},ttml)
  assert.equal(parsed.lines[0].text,'你好');assert.equal(parsed.lines[0].translation,'Hello');assert.equal(parsed.lines[0].romanization,'Ni hao');assert.equal(parsed.blocked,3)
  const input=page.getByPlaceholder('测试搜索');await input.fill('旧');await page.waitForTimeout(300);await input.fill('新');await page.waitForTimeout(700)
  await page.locator('.ant-select-item-option-content').filter({hasText:'新建议'}).waitFor();assert.equal(await page.getByText('旧建议',{exact:true}).count(),0)
  await input.press('ArrowDown');await input.press('Enter');await page.waitForTimeout(100)
  assert.deepEqual(await page.evaluate(()=>window.searchCalls),['新建议'])
  await page.getByText('Track A',{exact:true}).click();await page.waitForFunction(()=>window.testPlayer.lyricFormat==='TTML')
  assert.equal(await page.evaluate(()=>window.testPlayer.lyricLines[0].text),'你好')
  await page.waitForTimeout(200);const browseBefore=await page.evaluate(()=>window.browseRenders);await page.waitForTimeout(1100);assert.equal(await page.evaluate(()=>window.browseRenders),browseBefore,'audio clock must not rerender browsing consumers')
  assert.equal(await page.evaluate(()=>window.testPlayer.lyricPreview),'前奏 · 歌词已就绪')
  await page.getByRole('button',{name:'歌词设置',exact:true}).first().click()
  await page.getByRole('switch',{name:'蓝牙歌词 / 系统歌词',exact:true}).click()
  await page.waitForFunction(()=>navigator.mediaSession.metadata?.title.includes('你好'))
  await page.getByRole('switch',{name:'蓝牙歌词 / 系统歌词',exact:true}).click()
  await page.waitForFunction(()=>navigator.mediaSession.metadata?.title==='Song A')
  await page.getByRole('switch',{name:'优先使用在线 TTML',exact:true}).click()
  await page.waitForFunction(()=>window.testPlayer.lyricLines[0]?.text==='Original A')
  slow=true;await page.getByRole('switch',{name:'优先使用在线 TTML',exact:true}).click();await page.getByRole('button',{name:'歌词设置',exact:true}).first().click()
  await page.getByText('Track B',{exact:true}).click();await page.waitForTimeout(900)
  assert.equal(await page.evaluate(()=>window.testPlayer.lyricLines[0].text),'Original B')
  assert.equal(await page.evaluate(()=>navigator.mediaSession.metadata.title),'Song B')
  await page.evaluate(()=>window.testPlayer.setLocalLyrics('[00:00.00]Local B','test.lrc'))
  assert.equal(await page.evaluate(()=>window.testPlayer.lyricFormat),'本地歌词')
  await page.getByText('Track A',{exact:true}).click();await page.waitForFunction(()=>window.testPlayer.lyricFormat==='TTML')
  assert.equal(await page.evaluate(()=>window.testPlayer.hasLocalLyrics),false)
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'打开全屏播放器',exact:true}).click()
  await page.locator('.music-player-fullscreen__lyrics-text').first().waitFor()
  assert.equal(await page.locator('.music-lyric-translation').first().textContent(),'Hello')
  if(viewport.width===390)assert.ok((await page.locator('.music-player-fullscreen__lyrics-shell').boundingBox()).height>=130,'mobile lyrics need usable height')
  await fs.mkdir('/tmp/music-capabilities-qa',{recursive:true});await page.screenshot({path:'/tmp/music-capabilities-qa/'+viewport.width+'.png',fullPage:true})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)
  assert.deepEqual(errors,[]);console.log('PASS',viewport.width,'parser, suggestions keyboard/race, TTML fallback/race, media metadata, local lyrics, layout');await page.close()
 }
} finally {await browser.close()}
