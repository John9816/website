/**
 * 把 data/seed.json 转成 migrations/seed.sql（SQLite INSERT），用于：
 *   wrangler d1 execute xuecheng --remote --file=./migrations/seed.sql
 * 若 seed.sql 过大导致 wrangler 超时，可改用 scripts/migrate.mjs（逐条 API 插入）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const q = (s) => "'" + String(s ?? '').replace(/'/g, "''") + "'"
const qn = (s) => (s == null || s === '' ? 'NULL' : q(s))

const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'seed.json'), 'utf8'))
const lines = []

for (const d of seed.docs || []) {
  lines.push(
    `INSERT OR IGNORE INTO docs (id,title,content,parentId,favorite,lastVisitedAt,share,createdAt,updatedAt) VALUES (` +
    `${q(d.id)},${q(d.title)},${q(JSON.stringify(d.content ?? null))},${qn(d.parentId)},` +
    `${d.favorite ? 1 : 0},${qn(d.lastVisitedAt)},${q(JSON.stringify(d.share ?? null))},${q(d.createdAt)},${q(d.updatedAt)});`
  )
}
for (const t of seed.templates || []) {
  lines.push(
    `INSERT OR IGNORE INTO templates (id,name,desc,icon,accent,fromDoc,content,createdAt,updatedAt) VALUES (` +
    `${q(t.id)},${q(t.name)},${qn(t.desc)},${qn(t.icon)},${qn(t.accent)},${qn(t.fromDoc)},` +
    `${q(JSON.stringify(t.content))},${q(t.createdAt)},${q(t.updatedAt)});`
  )
}

const sql = lines.join('\n') + '\n'
fs.writeFileSync(path.join(ROOT, 'migrations', 'seed.sql'), sql)
console.log(`[✓] 已生成 migrations/seed.sql（docs=${seed.docs?.length || 0}, templates=${seed.templates?.length || 0}, ${sql.length} bytes）`)
console.log('    导入：wrangler d1 execute xuecheng --remote --file=./migrations/seed.sql')
