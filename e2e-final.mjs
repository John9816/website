import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const ROOT = process.cwd()
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'xc-e2e-'))
fs.mkdirSync(path.join(DATA, 'users', '2'), { recursive: true })
fs.writeFileSync(path.join(DATA, 'users', '2', 'docs.json'), JSON.stringify([
  { id: 'aaaa1111bbbb', title: '测试文档', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }] }, parentId: null, favorite: false, lastVisitedAt: null, share: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
]))
const mock = http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({code:0,data:{id:2,username:'1255542159',role:'ADMIN',enabled:true,canManageSystemConfig:true}}))})
await new Promise(r=>mock.listen(0,'127.0.0.1',r)); const bp=mock.address().port
process.env.BACKEND_URL=`http://127.0.0.1:${bp}`; process.env.EDITOR_DATA_DIR=DATA; process.env.DIST_DIR=path.join(ROOT,'dist')
const { createXuechengHandler } = await import('./server/xuecheng/index.mjs')
const handler = createXuechengHandler({ backendUrl: process.env.BACKEND_URL, dataDir: DATA })
const server = http.createServer(async (req,res)=>{ const u=new URL(req.url,'http://local'); if(!(await handler.handle(req,res,u))){res.writeHead(404);res.end('nf')} })
await new Promise(r=>server.listen(0,'127.0.0.1',r)); const port=server.address().port
const H={'Authorization':'Bearer x','Content-Type':'application/json'}
async function call(m,p,b){const r=await fetch(`http://127.0.0.1:${port}/editor/api${p}`,{method:m,headers:H,body:b?JSON.stringify(b):undefined});return {s:r.status,j:await r.json()}}
let pass=0,fail=0
const ok=(c,n)=>{c?(pass++,console.log('  ✓',n)):(fail++,console.log('  ✗',n))}
console.log('=== 端到端集成测试（新 server + 新 dist + mock 后端）===')
let r=await call('GET','/health'); ok(r.j.code===0,'health + docs='+r.j.data?.docs)
r=await call('GET','/docs'); ok(r.j.data?.length===1,'文档列表')
r=await call('POST','/comments',{docId:'aaaa1111bbbb',text:'评论'}); ok(r.j.code===0,'发表评论')
r=await call('GET','/notifications'); ok(r.j.data?.length>=1,'评论触发通知')
r=await call('DELETE','/docs/aaaa1111bbbb'); ok(r.j.data?.trashId,'删除进回收站')
const tid=r.j.data.trashId
r=await call('POST',`/trash/${tid}`); ok(r.j.data?.restored===1,'回收站恢复')
r=await call('POST','/access-request',{docId:'aaaa1111bbbb',role:'viewer',message:'申请'}); ok(r.j.code===0,'提交审批申请')
const aid=r.j.data.id
r=await call('POST',`/access-requests/${aid}`,{approve:true}); ok(r.j.data?.status==='approved','审批通过')
r=await call('POST','/heartbeat',{docId:'aaaa1111bbbb'}); ok(r.j.code===0,'心跳')
r=await call('GET','/presence'); ok(Object.keys(r.j.data||{}).length>=1,'在线列表')
r=await call('POST','/mention',{docId:'aaaa1111bbbb',text:'hi'}); ok(r.j.code===0,'提及')
r=await call('GET','/stats'); ok(r.j.data?.docs===1,'统计')
// 投票/问卷 content 保存（验证 validation 放宽生效）
const pollContent={type:'doc',content:[{type:'poll',attrs:{question:'选哪个?',options:['A','B'],votes:[[0],[0,1]],multiple:true}}]}
r=await call('PUT','/docs/aaaa1111bbbb',{content:pollContent}); ok(r.j.code===0,'保存含投票节点的文档（validation 放宽）')
// 页面能取到
const page=await fetch(`http://127.0.0.1:${port}/editor/`); ok(page.status===200,'编辑器页面 200')
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`)
await new Promise(r=>server.close(r)); await new Promise(r=>mock.close(r))
fs.rmSync(DATA,{recursive:true,force:true})
process.exit(fail?1:0)
