import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import http from 'node:http'
import test from 'node:test'

const paragraph = text => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const profiles = {
  alice: { id: 101, username: 'alice', role: 'USER', enabled: true, canManageSystemConfig: false },
  bob: { id: 102, username: 'bob', role: 'USER', enabled: true, canManageSystemConfig: false },
  admin: { id: 103, username: 'admin', role: 'ADMIN', enabled: true, canManageSystemConfig: true },
}
const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port }

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'website-xuecheng-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const auth = http.createServer((req, res) => {
    const user = profiles[req.headers.authorization?.replace('Bearer ', '')]
    const valid = req.url === '/api/user/me' && user
    res.writeHead(valid ? 200 : 401, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ code: valid ? 0 : 401, data: valid ? user : null }))
  })
  const authPort = await listen(auth)
  t.after(() => { auth.closeAllConnections(); auth.close() })
  const portServer = http.createServer()
  const port = await listen(portServer)
  await new Promise(resolve => portServer.close(resolve))
  const child = spawn(process.execPath, ['server/ecs-server.mjs'], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', BACKEND_URL: `http://127.0.0.1:${authPort}`, EDITOR_DATA_DIR: dir },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', b => output += b)
  child.stderr.on('data', b => output += b)
  t.after(async () => { if (child.exitCode === null) { child.kill(); await once(child, 'exit') } })
  const base = `http://127.0.0.1:${port}`
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(output)
    if (await fetch(base + '/healthz').then(r => r.ok).catch(() => false)) break
    await new Promise(r => setTimeout(r, 30))
  }
  async function call(path, user, method = 'GET', body) {
    const res = await fetch(base + '/editor/api' + path, {
      method, headers: { ...(user ? { Authorization: `Bearer ${user}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    let json; try { json = JSON.parse(text) } catch { json = {} }
    return { status: res.status, ...json }
  }
  return { call, dir, base }
}

test('editor rejects anonymous and invalid sessions; MCP requires the system administrator', async t => {
  const { call } = await fixture(t)
  assert.equal((await call('/docs')).status, 401)
  assert.equal((await call('/templates', 'invalid')).status, 401)
  assert.equal((await call('/mcp/servers', 'alice')).status, 403)
  assert.equal((await call('/mcp/servers', 'admin')).status, 200)
})

test('documents, templates and parent moves are isolated by the authenticated user', async t => {
  const { call } = await fixture(t)
  const a = await call('/docs', 'alice', 'POST', { title: 'Private A', content: paragraph('only Alice') })
  assert.equal(a.status, 200)
  const id = a.data.id
  assert.deepEqual((await call('/docs', 'bob')).data, [])
  for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) {
    assert.equal((await call(`/docs/${id}`, 'bob', method, ['PUT', 'PATCH'].includes(method) ? { title: 'stolen' } : undefined)).status, 404)
  }
  assert.equal((await call(`/docs/${id}/share`, 'bob', 'POST')).status, 404)
  assert.equal((await call('/docs', 'bob', 'POST', { title: 'Bad parent', parentId: id })).status, 400)
  const b = (await call('/docs', 'bob', 'POST', { title: 'Private B' })).data
  assert.equal((await call(`/docs/${b.id}`, 'bob', 'PATCH', { parentId: id })).status, 400)
  const tpl = (await call('/templates', 'alice', 'POST', { name: 'My template', content: paragraph('template') })).data
  assert.deepEqual((await call('/templates', 'bob')).data, [])
  assert.equal((await call(`/templates/${tpl.id}`, 'bob')).status, 404)
  const saved = await call(`/docs/${id}`, 'alice', 'PUT', { content: paragraph('updated') })
  assert.equal(saved.data.content.content[0].content[0].text, 'updated')
  assert.equal((await call(`/docs/${id}`, 'alice')).data.title, 'Private A')
})

test('public sharing exposes only the selected document and revokes access immediately', async t => {
  const { call } = await fixture(t)
  const doc = (await call('/docs', 'alice', 'POST', { title: 'Shared', content: paragraph('hello') })).data
  const shared = await call(`/docs/${doc.id}/share`, 'alice', 'POST')
  assert.equal(shared.status, 200)
  const token = shared.data.token
  const publicDoc = await call(`/share/${token}`)
  assert.equal(publicDoc.status, 200)
  assert.equal(publicDoc.data.title, 'Shared')
  assert.equal(publicDoc.data.id, undefined)
  assert.equal(publicDoc.data.userId, undefined)
  await call(`/docs/${doc.id}/share`, 'alice', 'DELETE')
  assert.equal((await call(`/share/${token}`)).status, 404)
  assert.equal((await call(`/share/${token}`, undefined, 'POST')).status, 401)
  await call(`/docs/${doc.id}/share`, 'alice', 'POST')
  assert.equal((await call(`/share/${token}`)).status, 200)
  await call(`/docs/${doc.id}`, 'alice', 'DELETE')
  assert.equal((await call(`/share/${token}`)).status, 404)
})

test('uploads require login and reject active SVG; stored JSON fails closed when corrupted', async t => {
  const { call, base, dir } = await fixture(t)
  const image = { dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=' }
  assert.equal((await call('/upload', undefined, 'POST', image)).status, 401)
  assert.equal((await call('/upload', 'alice', 'POST', { dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+' })).status, 400)
  const upload = await call('/upload', 'alice', 'POST', image)
  assert.equal(upload.status, 200)
  const file = await fetch(base + upload.data.url)
  assert.equal(file.status, 200)
  assert.equal(file.headers.get('content-type'), 'image/png')
  assert.ok((await file.arrayBuffer()).byteLength > 0)
  await call('/docs', 'alice', 'POST', { title: 'Persisted' })
  const storage = join(dir, 'users', '101', 'docs.json')
  assert.equal(JSON.parse(await readFile(storage, 'utf8'))[0].title, 'Persisted')
  await writeFile(storage, 'corrupt')
  assert.equal((await call('/docs', 'alice', 'POST', { title: 'Must not overwrite' })).status, 500)
  assert.equal(await readFile(storage, 'utf8'), 'corrupt')
})

test('document validation rejects executable links and cycles without damaging saved content', async t => {
  const { call } = await fixture(t)
  const doc = (await call('/docs', 'alice', 'POST', { title: 'Root', content: paragraph('safe') })).data
  const child = (await call('/docs', 'alice', 'POST', { title: 'Child', parentId: doc.id })).data
  assert.equal((await call(`/docs/${doc.id}`, 'alice', 'PATCH', { parentId: child.id })).status, 400)
  const evil = paragraph('click')
  evil.content[0].content[0].marks = [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]
  assert.equal((await call(`/docs/${doc.id}`, 'alice', 'PUT', { content: evil })).status, 400)
  assert.equal((await call(`/docs/${doc.id}`, 'alice')).data.content.content[0].content[0].text, 'safe')
  assert.equal((await call('/docs', 'alice', 'POST', { content: { type: 'doc', content: [{ type: 'unknown_node' }] } })).status, 400)
  const deleted = await call(`/docs/${doc.id}`, 'alice', 'DELETE')
  assert.equal(deleted.data.count, 2)
  assert.deepEqual((await call('/docs', 'alice')).data, [])
})

test('upstream rich text marks and built-in templates are accepted by the website storage', async t => {
  const { call } = await fixture(t)
  const { starterDoc } = await import('../src/features/xuecheng/schema.js')
  const { TEMPLATES } = await import('../src/features/xuecheng/templates.js')
  const rich = paragraph('styled')
  rich.content[0].content[0].marks = [{ type: 'strikethrough' }, { type: 'underline' }, { type: 'textColor', attrs: { color: '#ff0000' } }]
  for (const content of [rich, starterDoc().toJSON(), ...TEMPLATES.map(tpl => tpl.build())]) {
    const created = await call('/docs', 'alice', 'POST', { title: 'Compatibility', content })
    assert.equal(created.status, 200, created.message)
    assert.deepEqual((await call(`/docs/${created.data.id}`, 'alice')).data.content, JSON.parse(JSON.stringify(content)))
  }
})
