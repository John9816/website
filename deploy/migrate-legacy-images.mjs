import { execFileSync } from 'node:child_process'

// Dry run by default. The operator must back up MySQL before using --apply.
const apply = process.argv.includes('--apply')
const base = 'https://hi.751152.xyz'
const sshSocket = process.env.MIGRATION_SSH_SOCKET
if (!sshSocket) throw new Error('MIGRATION_SSH_SOCKET is required')
const sql = (query) => execFileSync('ssh', ['-S', sshSocket, 'root@8.156.95.93',
  'mysql --batch --raw --skip-column-names website_java'], { input: query, encoding: 'utf8' }).trim()
const literal = (value) => `CONVERT(0x${Buffer.from(value).toString('hex')} USING utf8mb4)`
const rows = sql(`
SELECT JSON_OBJECT('table','generated_image','column','image_url','id',id,'url',image_url)
FROM generated_image WHERE image_url IS NOT NULL
UNION ALL
SELECT JSON_OBJECT('table','users','column','avatar_url','id',id,'url',avatar_url)
FROM users WHERE avatar_url IS NOT NULL;
`).split('\n').filter(Boolean).map(JSON.parse)
const report = []
let session
try {
  if (apply) {
    if (!process.env.MIGRATION_USERNAME || !process.env.MIGRATION_PASSWORD) {
      throw new Error('MIGRATION_USERNAME and MIGRATION_PASSWORD are required')
    }
    const response = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: process.env.MIGRATION_USERNAME, password: process.env.MIGRATION_PASSWORD }),
      signal: AbortSignal.timeout(15000),
    })
    const result = await response.json()
    if (!response.ok || result.code !== 0) throw new Error('Migration login failed')
    session = result.data
  }
  for (const row of rows) {
    const item = { table: row.table, id: row.id }
    const recorded = sql(`SELECT COUNT(*) FROM image_asset WHERE BINARY image_url=BINARY ${literal(row.url)};`)
    if (Number(recorded)) {
      report.push({ ...item, status: 'already-hosted' })
      continue
    }
    if (!apply) {
      report.push({ ...item, status: 'pending' })
      continue
    }
    try {
      const source = new URL(row.url, base)
      if (!['http:', 'https:'].includes(source.protocol)) throw new Error('Unsupported reference')
      const response = await fetch(source, { signal: AbortSignal.timeout(12000) })
      if (!response.ok) throw new Error(`Source HTTP ${response.status}`)
      if (Number(response.headers.get('content-length')) > 12 * 1024 * 1024) throw new Error('Source too large')
      const reader = response.body.getReader()
      const chunks = []
      let size = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 12 * 1024 * 1024) { await reader.cancel(); throw new Error('Source too large') }
        chunks.push(value)
      }
      const type = response.headers.get('content-type')?.split(';')[0]
      if (!type?.startsWith('image/')) throw new Error('Source is not an image')
      const form = new FormData()
      form.append('file', new Blob(chunks, { type }), `legacy-${row.table}-${row.id}`)
      const upload = await fetch(`${base}/api/user/kb/assets`, {
        method: 'POST', headers: { Authorization: `Bearer ${session.token}` },
        body: form, signal: AbortSignal.timeout(90000),
      })
      const result = await upload.json()
      if (!upload.ok || result.code !== 0 || !result.data?.url?.startsWith('https://')) {
        throw new Error(`Upload rejected: HTTP ${upload.status}`)
      }
      const url = result.data.url
      // Fixed table/column allowlist plus compare-and-swap preserves concurrent edits.
      if (![['users', 'avatar_url'], ['generated_image', 'image_url']]
        .some(([table, column]) => table === row.table && column === row.column)) throw new Error('Invalid target')
      const changed = sql(`UPDATE ${row.table} SET ${row.column}=${literal(url)}
        WHERE id=${Number(row.id)} AND BINARY ${row.column}=BINARY ${literal(row.url)}; SELECT ROW_COUNT();`)
      report.push({ ...item, status: Number(changed) === 1 ? 'migrated' : 'concurrent-change', url })
    } catch (error) {
      report.push({ ...item, status: 'retained-original', reason: error.message })
    }
  }
} finally {
  if (session) await fetch(`${base}/api/auth/logout`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refreshToken }), signal: AbortSignal.timeout(10000),
  }).catch(() => undefined)
  console.log(JSON.stringify(report, null, 2))
}
