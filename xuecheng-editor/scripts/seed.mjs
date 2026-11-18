/**
 * 从线上学城（music-replica 网关，含登录）拉取全部文档（含正文）与模板，
 * 生成 data/seed.json。后续用 scripts/gen-sql.mjs 转成 D1 导入 SQL。
 *
 * 用法：
 *   XC_BASE=http://111.91.20.67:8787 XC_USER=1255542159 XC_PASS='lijunxuan1314.' node scripts/seed.mjs
 * 默认已填当前网关地址与凭据，直接 `node scripts/seed.mjs` 即可。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const BASE = process.env.XC_BASE || 'http://111.91.20.67:8787'
const USER = process.env.XC_USER || '1255542159'
const PASS = process.env.XC_PASS || 'lijunxuan1314.'

async function main() {
  console.log('[*] 登录网关', BASE)
  const loginRes = await fetch(BASE + '/editor/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }),
  })
  const setCookie = loginRes.headers.get('set-cookie') || ''
  const m = /xc_session=([^;]+)/.exec(setCookie)
  const cookie = m ? `xc_session=${m[1]}` : ''
  if (!cookie) throw new Error('登录失败：未拿到 xc_session（检查 XC_BASE/XC_USER/XC_PASS）')
  console.log('[*] 已登录，xc_session 长度', cookie.length)

  const api = (p) => fetch(BASE + p, { headers: { cookie } }).then((r) => r.json())

  console.log('[*] 拉取文档列表')
  const list = await api('/editor/api/docs')
  const docsMeta = list.data || []
  console.log('    列表文档数', docsMeta.length)

  const docs = []
  for (const d of docsMeta) {
    const full = await api('/editor/api/docs/' + d.id)
    if (full && full.data) docs.push(full.data)
    else console.warn('    ! 拉取失败', d.id)
  }
  console.log('[*] 拉取模板')
  const tpl = await api('/editor/api/templates')
  const templates = tpl.data || []

  const out = { exportedAt: new Date().toISOString(), base: BASE, docs, templates }
  fs.writeFileSync(path.join(ROOT, 'data', 'seed.json'), JSON.stringify(out, null, 2))
  const size = fs.statSync(path.join(ROOT, 'data', 'seed.json')).size
  console.log(`[✓] 已写入 data/seed.json（docs=${docs.length}, templates=${templates.length}, ${size} bytes）`)
  console.log('    下一步：node scripts/gen-sql.mjs  生成 migrations/seed.sql，再 wrangler d1 execute 导入')
}

main().catch((e) => { console.error('[x] 失败:', e.message); process.exit(1) })
