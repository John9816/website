/**
 * 备选迁移：把 data/seed.json 直接写入 D1（逐条 API 插入）。
 * 当 migrations/seed.sql 因体积被 `wrangler d1 execute` 拒绝时使用。
 *
 * 前提：
 *   export CF_ACCOUNT_ID=xxxx
 *   export CF_API_TOKEN=xxxx        # 具有 D1 编辑权限的 API Token
 *   （database_id 从 wrangler.toml 读取；也可用 XC_D1_ID 覆盖）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const ACCOUNT_ID = process.env.CF_ACCOUNT_ID
const API_TOKEN = process.env.CF_API_TOKEN
if (!ACCOUNT_ID || !API_TOKEN) {
  console.error('[x] 需设置 CF_ACCOUNT_ID 与 CF_API_TOKEN')
  process.exit(1)
}

// 读 database_id：优先 env，其次 wrangler.toml
let DATABASE_ID = process.env.XC_D1_ID
if (!DATABASE_ID) {
  const toml = fs.readFileSync(path.join(ROOT, 'wrangler.toml'), 'utf8')
  const m = toml.match(/database_id\s*=\s*"([^"]+)"/)
  DATABASE_ID = m && m[1]
}
if (!DATABASE_ID || DATABASE_ID.includes('REPLACE')) {
  console.error('[x] 未在 wrangler.toml 或 XC_D1_ID 中找到有效的 database_id')
  process.exit(1)
}

const q = (s) => "'" + String(s ?? '').replace(/'/g, "''") + "'"
const qn = (s) => (s == null || s === '' ? 'NULL' : q(s))

function docInsert(d) {
  return `INSERT OR IGNORE INTO docs (id,title,content,parentId,favorite,lastVisitedAt,share,createdAt,updatedAt) VALUES (` +
    `${q(d.id)},${q(d.title)},${q(JSON.stringify(d.content ?? null))},${qn(d.parentId)},` +
    `${d.favorite ? 1 : 0},${qn(d.lastVisitedAt)},${q(JSON.stringify(d.share ?? null))},${q(d.createdAt)},${q(d.updatedAt)});`
}
function tplInsert(t) {
  return `INSERT OR IGNORE INTO templates (id,name,desc,icon,accent,fromDoc,content,createdAt,updatedAt) VALUES (` +
    `${q(t.id)},${q(t.name)},${qn(t.desc)},${qn(t.icon)},${qn(t.accent)},${qn(t.fromDoc)},` +
    `${q(JSON.stringify(t.content))},${q(t.createdAt)},${q(t.updatedAt)});`
}

const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'seed.json'), 'utf8'))
const statements = [
  ...(seed.docs || []).map(docInsert),
  ...(seed.templates || []).map(tplInsert),
]

const BATCH = 20
const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`
let done = 0
for (let i = 0; i < statements.length; i += BATCH) {
  const chunk = statements.slice(i, i + BATCH)
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ statements: chunk }),
  })
  const j = await res.json()
  if (!j.success) {
    console.error('[x] 批次失败:', JSON.stringify(j.errors || j).slice(0, 300))
    process.exit(1)
  }
  done += chunk.length
  console.log(`[✓] 已插入 ${done}/${statements.length}`)
}
console.log(`[✓] 迁移完成：${seed.docs?.length || 0} 文档 + ${seed.templates?.length || 0} 模板`)
