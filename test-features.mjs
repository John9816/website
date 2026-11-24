// 端到端验证扩展功能：mock 后端认证 + 临时数据目录
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createXuechengHandler } from './server/xuecheng/index.mjs'

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'xc-feat-'))
fs.mkdirSync(path.join(DATA, 'users', '2'), { recursive: true })
// 放两篇初始文档
fs.writeFileSync(path.join(DATA, 'users', '2', 'docs.json'), JSON.stringify([
  { id: 'aaaa1111bbbb', title: '测试文档', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }] }, parentId: null, favorite: false, lastVisitedAt: null, share: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'cccc2222dddd', title: '子文档', content: { type: 'doc', content: [] }, parentId: 'aaaa1111bbbb', favorite: false, lastVisitedAt: null, share: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
]))

// mock 后端：任何 Bearer token 都返回 user id=2
const mockBackend = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ code: 0, data: { id: 2, username: '1255542159', role: 'ADMIN', enabled: true, canManageSystemConfig: true } }))
})
await new Promise(r => mockBackend.listen(0, '127.0.0.1', r))
const backendPort = mockBackend.address().port

const handler = createXuechengHandler({ backendUrl: `http://127.0.0.1:${backendPort}`, dataDir: DATA })
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://local')
  if (!(await handler.handle(req, res, u))) { res.writeHead(404); res.end() }
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const port = server.address().port
const base = `http://127.0.0.1:${port}/editor`
const H = { 'Authorization': 'Bearer faketoken', 'Content-Type': 'application/json' }
async function call(method, p, body) {
  const r = await fetch(base + p, { method, headers: H, body: body ? JSON.stringify(body) : undefined })
  return { status: r.status, json: await r.json() }
}
function ok(cond, msg, extra) { console.log((cond ? '  ✓ ' : '  ✗ ') + msg + (extra ? ' | ' + extra : '')); if (!cond) process.exitCode = 1 }

console.log('=== 基础 ===')
let r = await call('GET', '/api/docs')
ok(r.json.code === 0 && r.json.data.length === 2, '初始文档 2 篇', '实际 ' + (r.json.data?.length))

console.log('=== 第1层：通知 ===')
r = await call('POST', '/api/notifications', {}) // 不存在的方法占位
r = await call('POST', '/api/comments', { docId: 'aaaa1111bbbb', text: '测试评论' })
ok(r.json.code === 0, '发表评论（自动生成通知）')
r = await call('GET', '/api/notifications')
ok(r.json.code === 0 && r.json.data.length >= 1, '通知列表有记录', '条数 ' + r.json.data?.length)
r = await call('GET', '/api/notifications?unread=1')
ok(r.json.code === 0 && r.json.data.every(n => !n.read), '未读过滤正确')
r = await call('POST', '/api/notifications/read-all', {})
ok(r.json.code === 0, '全部标为已读')
r = await call('GET', '/api/notifications?unread=1')
ok(r.json.data.length === 0, '标为已读后无未读')

console.log('=== 第1层：评论 ===')
r = await call('GET', '/api/comments?doc=aaaa1111bbbb')
ok(r.json.code === 0 && r.json.data.length === 1, '按文档查评论', '条数 ' + r.json.data?.length)
const cid = r.json.data[0].id
r = await call('POST', `/api/comments/${cid}/reply`, { text: '回复内容' })
ok(r.json.code === 0 && r.json.data.replies.length === 1, '回复评论')
r = await call('DELETE', `/api/comments/${cid}`)
ok(r.json.code === 0, '删除评论')

console.log('=== 第1层：回收站 ===')
r = await call('DELETE', '/api/docs/cccc2222dddd') // 删除子文档
ok(r.json.code === 0 && r.json.data.trashId, '删除文档并进回收站', 'trashId=' + r.json.data?.trashId)
const tid = r.json.data.trashId
r = await call('GET', '/api/docs')
ok(r.json.data.length === 1, '删除后剩 1 篇')
r = await call('GET', '/api/trash')
ok(r.json.code === 0 && r.json.data.length === 1 && r.json.data[0].docs.length === 1, '回收站有 1 批含 1 文档')
r = await call('POST', `/api/trash/${tid}`, {})
ok(r.json.code === 0 && r.json.data.restored === 1, '恢复回收站文档')
r = await call('GET', '/api/docs')
ok(r.json.data.length === 2, '恢复后回到 2 篇')

console.log('=== 第2层：权限申请/审批 ===')
r = await call('POST', '/api/access-request', { docId: 'aaaa1111bbbb', role: 'viewer', message: '申请查看' })
ok(r.json.code === 0 && r.json.data.status === 'pending', '提交申请')
const aid = r.json.data.id
r = await call('GET', '/api/access-requests?inbox=1')
ok(r.json.data.length === 1, '收件箱有 1 条待处理')
r = await call('POST', `/api/access-requests/${aid}`, { approve: true })
ok(r.json.code === 0 && r.json.data.status === 'approved', '审批通过')

console.log('=== 第2层：presence/心跳 ===')
r = await call('POST', '/api/heartbeat', { docId: 'aaaa1111bbbb' })
ok(r.json.code === 0 && r.json.data['2'], '心跳写入在线状态')
r = await call('GET', '/api/presence')
ok(r.json.code === 0 && r.json.data['2']?.name === '1255542159', '读取在线状态')

console.log('=== 第2层：提及 ===')
r = await call('POST', '/api/mention', { docId: 'aaaa1111bbbb', docTitle: '测试文档', text: 'hi @all' })
ok(r.json.code === 0, '添加提及')
r = await call('GET', '/api/mentions?unread=1')
ok(r.json.data.length >= 1, '未读提及存在')

console.log('=== 第3层：统计 ===')
r = await call('GET', '/api/stats')
ok(r.json.code === 0 && r.json.data.docs === 2 && r.json.data.comments >= 0, '统计数据正确', JSON.stringify(r.json.data))

console.log('=== 收尾 ===')
await new Promise(r => server.close(r))
await new Promise(r => mockBackend.close(r))
fs.rmSync(DATA, { recursive: true, force: true })
console.log('测试目录已清理')
