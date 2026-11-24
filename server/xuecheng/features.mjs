/**
 * xuecheng 扩展功能数据层（回收站 / 通知 / 评论 / 提及 / 权限申请 / 在线状态 / 投票 / 统计）
 * 设计：沿用单用户目录 JSON 文件存储 + 原子替换；无需数据库，兼容现有部署与回滚流程。
 * 所有写操作走 userStore.writeColl，读走 readColl（文件不存在返回 []）。
 *
 * 这些功能是从 xuecheng-editor 全功能版移植到 Node 单进程部署的简化实现：
 * - presence 用心跳时间戳 + 轮询，不做 WebSocket 实时推送
 * - 通知/提及/评论为文件存储，前端轮询刷新
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { writeJson } from './storage.mjs'

const nowISO = () => new Date().toISOString()
const newId = () => crypto.randomBytes(6).toString('hex')

/* ---------------- 回收站 ---------------- */
// 批次结构：{ id, at, reason, docs: [...完整文档快照...], shareTokens: [...] }
export function listTrash(store) {
  return store.readColl('trash').slice().sort((a, b) => (b.at || '').localeCompare(a.at || ''))
}
export function pushTrash(store, docs, reason = 'manual') {
  if (!docs.length) return null
  const batches = store.readColl('trash')
  const batch = {
    id: newId(),
    at: nowISO(),
    reason,
    docs: docs.map((d) => JSON.parse(JSON.stringify(d))),
    shareTokens: docs.map((d) => d.share?.token).filter(Boolean),
  }
  batches.push(batch)
  // 最多保留 50 批，避免无限增长
  while (batches.length > 50) batches.shift()
  store.writeColl('trash', batches)
  return batch
}
export function restoreTrash(store, batchId) {
  const batches = store.readColl('trash')
  const idx = batches.findIndex((b) => b.id === batchId)
  if (idx < 0) return null
  const batch = batches[idx]
  const docs = store.readDb()
  const existing = new Set(docs.map((d) => d.id))
  let restored = 0
  for (const snap of batch.docs) {
    if (existing.has(snap.id)) continue
    // 父节点若未恢复，则挂到根，避免悬空 parentId
    const parentOk = !snap.parentId || existing.has(snap.parentId) || batch.docs.some((d) => d.id === snap.parentId && !existing.has(d.id))
    docs.push({ ...snap, parentId: parentOk ? snap.parentId : null })
    existing.add(snap.id)
    restored++
  }
  store.writeDb(docs)
  batches.splice(idx, 1)
  store.writeColl('trash', batches)
  return { restored, batch }
}
export function purgeTrash(store, batchId) {
  const batches = store.readColl('trash')
  const next = batches.filter((b) => b.id !== batchId)
  store.writeColl('trash', next)
  return batches.length !== next.length
}

/* ---------------- 通知 ---------------- */
// { id, type, docId, docTitle, actor, text, read, createdAt }
export function listNotifications(store, { unreadOnly = false } = {}) {
  let list = store.readColl('notifications')
  if (unreadOnly) list = list.filter((n) => !n.read)
  return list.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
}
export function addNotification(store, note) {
  const list = store.readColl('notifications')
  const item = {
    id: newId(),
    type: note.type || 'system',
    docId: note.docId || null,
    docTitle: note.docTitle || '',
    actor: note.actor || '',
    text: String(note.text || '').slice(0, 300),
    read: false,
    createdAt: nowISO(),
  }
  list.push(item)
  while (list.length > 500) list.shift()
  store.writeColl('notifications', list)
  return item
}
export function markNotificationsRead(store, ids) {
  const list = store.readColl('notifications')
  const set = ids && ids.length ? new Set(ids) : null
  let changed = false
  for (const n of list) {
    if ((!set || set.has(n.id)) && !n.read) { n.read = true; changed = true }
  }
  if (changed) store.writeColl('notifications', list)
  return list.filter((n) => n.read).length
}

/* ---------------- 评论 ---------------- */
// { id, docId, author, authorId, text, createdAt, replies:[{id,author,authorId,text,createdAt}] }
export function listComments(store, docId) {
  return store.readColl('comments').filter((c) => !docId || c.docId === docId)
}
export function addComment(store, { docId, text, author, authorId }) {
  const list = store.readColl('comments')
  const item = {
    id: newId(), docId, author: author || '', authorId: authorId || null,
    text: String(text || '').slice(0, 2000), createdAt: nowISO(), replies: [],
  }
  list.push(item)
  store.writeColl('comments', list)
  return item
}
export function replyComment(store, commentId, { text, author, authorId }) {
  const list = store.readColl('comments')
  const c = list.find((x) => x.id === commentId)
  if (!c) return null
  c.replies = c.replies || []
  c.replies.push({ id: newId(), author: author || '', authorId: authorId || null, text: String(text || '').slice(0, 2000), createdAt: nowISO() })
  store.writeColl('comments', list)
  return c
}
export function deleteComment(store, commentId, authorId) {
  const list = store.readColl('comments')
  const c = list.find((x) => x.id === commentId)
  if (!c) return false
  if (authorId && c.authorId && String(c.authorId) !== String(authorId)) return false
  store.writeColl('comments', list.filter((x) => x.id !== commentId))
  return true
}

/* ---------------- 提及 ---------------- */
export function listMentions(store, { unreadOnly = false } = {}) {
  let list = store.readColl('mentions')
  if (unreadOnly) list = list.filter((m) => !m.read)
  return list.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
}
export function addMention(store, { docId, docTitle, by, byId, text }) {
  const list = store.readColl('mentions')
  const item = { id: newId(), docId, docTitle: docTitle || '', by: by || '', byId: byId || null, text: String(text || '').slice(0, 200), read: false, createdAt: nowISO() }
  list.push(item)
  store.writeColl('mentions', list)
  return item
}
export function markMentionsRead(store, ids) {
  const list = store.readColl('mentions')
  const set = ids && ids.length ? new Set(ids) : null
  let changed = false
  for (const m of list) if ((!set || set.has(m.id)) && !m.read) { m.read = true; changed = true }
  if (changed) store.writeColl('mentions', list)
  return list.length
}

/* ---------------- 权限申请 / 审批 ---------------- */
// { id, docId, docTitle, applicant, applicantId, role, message, status, handledBy, handledAt, createdAt }
export function listAccessRequests(store, { inbox = false } = {}) {
  let list = store.readColl('accessRequests')
  if (inbox) list = list.filter((r) => r.status === 'pending')
  return list.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
}
export function addAccessRequest(store, { docId, docTitle, applicant, applicantId, role, message }) {
  const list = store.readColl('accessRequests')
  const item = {
    id: newId(), docId, docTitle: docTitle || '', applicant: applicant || '', applicantId: applicantId || null,
    role: role || 'viewer', message: String(message || '').slice(0, 300), status: 'pending',
    handledBy: null, handledAt: null, createdAt: nowISO(),
  }
  list.push(item)
  store.writeColl('accessRequests', list)
  return item
}
export function decideAccessRequest(store, id, { approve, handledBy }) {
  const list = store.readColl('accessRequests')
  const r = list.find((x) => x.id === id)
  if (!r || r.status !== 'pending') return null
  r.status = approve ? 'approved' : 'rejected'
  r.handledBy = handledBy || null
  r.handledAt = nowISO()
  store.writeColl('accessRequests', list)
  return r
}

/* ---------------- 在线状态（心跳 + 轮询） ---------------- */
// 全局 presence 文件：{ userId: { name, at, docId } }，过期由读取时按时间过滤
const PRESENCE_TTL_MS = 60 * 1000
export function presenceFile(dataDir) { return `${dataDir}/presence.json` }
export function readPresence(readJson, dataDir) {
  const raw = readJson(presenceFile(dataDir), {})
  const now = Date.now()
  const alive = {}
  for (const [uid, v] of Object.entries(raw)) {
    if (v && Number.isFinite(v.at) && now - v.at < PRESENCE_TTL_MS) alive[uid] = v
  }
  if (Object.keys(alive).length !== Object.keys(raw).length) {
    try { writeJson(presenceFile(dataDir), alive) } catch {}
  }
  return alive
}
export function heartbeat(readJson, dataDir, user, docId) {
  const raw = readPresence(readJson, dataDir)
  raw[String(user.id)] = {
    name: user.username || String(user.id),
    at: Date.now(),
    docId: docId || null,
  }
  writeJson(presenceFile(dataDir), raw)
  return readPresence(readJson, dataDir)
}

/* ---------------- 统计 ---------------- */
export function statsOf(store) {
  const docs = store.readDb()
  const totalChars = docs.reduce((n, d) => n + JSON.stringify(d.content || '').length, 0)
  return {
    docs: docs.length,
    favorites: docs.filter((d) => d.favorite).length,
    shared: docs.filter((d) => d.share?.enabled).length,
    comments: store.readColl('comments').length,
    notifications: store.readColl('notifications').length,
    trashBatches: store.readColl('trash').length,
    totalChars,
  }
}
