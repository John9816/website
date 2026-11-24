import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import http from 'node:http'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const serverScript = fileURLToPath(new URL('./ecs-server.mjs', import.meta.url))

test('API proxy preserves a normal upstream response', async (t) => {
  const upstream = http.createServer((_req, res) => {
    res.writeHead(201, {
      'content-type': 'application/json; charset=utf-8',
      'x-upstream-test': 'ok',
    })
    res.end(JSON.stringify({ ok: true }))
  })
  const upstreamPort = await listen(upstream)
  t.after(() => closeServer(upstream))

  const proxy = await startProxy(upstreamPort, 1000)
  t.after(() => stopProxy(proxy))

  const response = await fetch(`http://127.0.0.1:${proxy.port}/api/test`)
  assert.equal(response.status, 201)
  assert.equal(response.headers.get('x-upstream-test'), 'ok')
  assert.deepEqual(await response.json(), { ok: true })
})

test('API proxy returns the existing 502 payload when the upstream times out', async (t) => {
  let closeUpstream
  const upstreamClosed = new Promise((resolve) => {
    closeUpstream = resolve
  })
  const upstream = http.createServer((_req, res) => {
    res.once('close', closeUpstream)
  })
  const upstreamPort = await listen(upstream)
  t.after(() => closeServer(upstream))

  const proxy = await startProxy(upstreamPort, 100)
  t.after(() => stopProxy(proxy))

  const response = await fetch(`http://127.0.0.1:${proxy.port}/api/slow`)
  assert.equal(response.status, 502)
  assert.deepEqual(await response.json(), { message: 'Failed to fetch upstream API.' })
  await withTimeout(upstreamClosed, 1000, 'proxy did not close the timed-out upstream request')
})

test('API proxy aborts the upstream request when the client disconnects', async (t) => {
  let markUpstreamStarted
  const upstreamStarted = new Promise((resolve) => {
    markUpstreamStarted = resolve
  })
  let markUpstreamClosed
  const upstreamClosed = new Promise((resolve) => {
    markUpstreamClosed = resolve
  })
  const upstream = http.createServer((_req, res) => {
    markUpstreamStarted()
    res.once('close', markUpstreamClosed)
  })
  const upstreamPort = await listen(upstream)
  t.after(() => closeServer(upstream))

  const proxy = await startProxy(upstreamPort, 5000)
  t.after(() => stopProxy(proxy))

  const request = http.get(`http://127.0.0.1:${proxy.port}/api/v1/music/play`)
  request.on('error', () => {})
  await withTimeout(upstreamStarted, 1000, 'upstream request did not start')

  request.destroy()
  await withTimeout(upstreamClosed, 1000, 'client disconnect did not close the upstream request')

  const health = await fetch(`http://127.0.0.1:${proxy.port}/healthz`)
  assert.equal(health.status, 200)
})

test('API proxy aborts an active upstream response stream when the client disconnects', async (t) => {
  let markUpstreamClosed
  const upstreamClosed = new Promise((resolve) => {
    markUpstreamClosed = resolve
  })
  const upstream = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write('data: ready\n\n')
    res.once('close', markUpstreamClosed)
  })
  const upstreamPort = await listen(upstream)
  t.after(() => closeServer(upstream))

  const proxy = await startProxy(upstreamPort, 5000)
  t.after(() => stopProxy(proxy))

  const responseStarted = new Promise((resolve, reject) => {
    const request = http.get(`http://127.0.0.1:${proxy.port}/api/stream`, (response) => {
      response.once('data', () => {
        response.destroy()
        resolve()
      })
    })
    request.once('error', reject)
  })

  await withTimeout(responseStarted, 1000, 'proxied response stream did not start')
  await withTimeout(upstreamClosed, 1000, 'client disconnect did not close the upstream stream')
})

// 读取渲染后 HTML 中某个 <meta> 标签的 content，便于精确断言注入结果。
function readMeta(html, attr, key) {
  const tagPrefix = `<meta ${attr}="${key}"`
  const start = html.indexOf(tagPrefix)
  if (start === -1) return null
  const end = html.indexOf('>', start)
  if (end === -1) return null
  const match = /content="([^"]*)"/.exec(html.slice(start, end))
  return match ? match[1] : null
}

const SHARE_PATH = '/music/share/TESTTOKEN123'
const DEFAULT_SHARE_TITLE = /<title>音乐 - 个人导航<\/title>/

test('音乐分享页成功注入歌名、歌手与封面等动态 meta', async (t) => {
  const metaRequests = []
  const upstream = http.createServer((req, res) => {
    metaRequests.push(req.url)
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({
      code: 0,
      message: 'ok',
      data: {
        token: 'TESTTOKEN123',
        source: 'qq',
        songId: '123',
        name: '夜曲',
        artist: '周杰伦',
        album: '',
        coverUrl: 'https://cdn.example.com/covers/night.jpg',
        durationSec: 258,
      },
    }))
  })
  const upstreamPort = await listen(upstream)
  t.after(() => closeServer(upstream))

  const proxy = await startProxy(upstreamPort, 1000)
  t.after(() => stopProxy(proxy))

  const response = await fetch(`http://127.0.0.1:${proxy.port}${SHARE_PATH}`)
  assert.equal(response.status, 200)
  const html = await response.text()

  assert.deepEqual(metaRequests, ['/api/public/music/share/TESTTOKEN123/meta'])
  assert.match(html, /<title>夜曲 - 周杰伦<\/title>/)
  assert.equal(readMeta(html, 'property', 'og:title'), '夜曲 - 周杰伦')
  assert.equal(readMeta(html, 'name', 'twitter:title'), '夜曲 - 周杰伦')
  assert.equal(readMeta(html, 'property', 'og:image'), 'https://cdn.example.com/covers/night.jpg')
  assert.equal(readMeta(html, 'name', 'twitter:image'), 'https://cdn.example.com/covers/night.jpg')
  assert.equal(readMeta(html, 'name', 'twitter:card'), 'summary_large_image')
  assert.equal(readMeta(html, 'property', 'og:url'), 'https://hi.751152.xyz/music/share/TESTTOKEN123')
  assert.equal(readMeta(html, 'name', 'robots'), 'noindex,nofollow')
  for (const [attr, key] of [
    ['name', 'description'],
    ['property', 'og:description'],
    ['name', 'twitter:description'],
  ]) {
    const value = readMeta(html, attr, key) || ''
    assert.ok(value.includes('无需登录，点开即听'), `${key} 缺少固定文案`)
    assert.ok(value.includes('夜曲') && value.includes('周杰伦'), `${key} 缺少歌名/歌手`)
  }
})

test('分享页 meta 接口失败(404/410/500) 时静默回退到默认 meta', async (t) => {
  const statuses = [404, 410, 500]
  let call = 0
  const upstream = http.createServer((_req, res) => {
    const status = statuses[call++ % statuses.length]
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ code: status, message: 'error', data: null }))
  })
  const upstreamPort = await listen(upstream)
  t.after(() => closeServer(upstream))

  const proxy = await startProxy(upstreamPort, 1000)
  t.after(() => stopProxy(proxy))

  for (let i = 0; i < statuses.length; i += 1) {
    const response = await fetch(`http://127.0.0.1:${proxy.port}${SHARE_PATH}`)
    assert.equal(response.status, 200)
    const html = await response.text()
    assert.match(html, DEFAULT_SHARE_TITLE)
    assert.equal(readMeta(html, 'name', 'robots'), 'noindex,nofollow')
    assert.ok(!html.includes('夜曲'))
    assert.ok(!html.includes('无需登录，点开即听'))
    // 默认页已带品牌 twitter:image；回退时只需保证没有注入歌曲封面
    assert.ok(!(readMeta(html, 'name', 'twitter:image') || '').includes('cdn.example.com'))
    assert.ok(!(readMeta(html, 'name', 'twitter:title') || '').includes('夜曲'))
    assert.ok(!(readMeta(html, 'property', 'og:image') || '').includes('cdn.example.com'))
  }
})

test('分享页 meta 接口超时时静默回退到默认 meta', async (t) => {
  // 故意不响应，触发服务端 AbortController 超时
  const upstream = http.createServer(() => {})
  const upstreamPort = await listen(upstream)
  t.after(() => closeServer(upstream))

  const proxy = await startProxy(upstreamPort, 5000, { SHARE_META_TIMEOUT_MS: '120' })
  t.after(() => stopProxy(proxy))

  const response = await fetch(`http://127.0.0.1:${proxy.port}${SHARE_PATH}`)
  assert.equal(response.status, 200)
  const html = await response.text()
  assert.match(html, DEFAULT_SHARE_TITLE)
  assert.ok(!html.includes('无需登录，点开即听'))
  assert.ok(!(readMeta(html, 'name', 'twitter:image') || '').includes('cdn.example.com'))
})

test('普通路径不请求分享 meta 接口且逐路由 meta 保持不变', async (t) => {
  const requests = []
  const upstream = http.createServer((req, res) => {
    requests.push(req.url)
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end('{}')
  })
  const upstreamPort = await listen(upstream)
  t.after(() => closeServer(upstream))

  const proxy = await startProxy(upstreamPort, 1000)
  t.after(() => stopProxy(proxy))

  for (const path of ['/', '/music', '/music/app', '/kb']) {
    const response = await fetch(`http://127.0.0.1:${proxy.port}${path}`)
    assert.ok([200, 410].includes(response.status), `${path} 返回异常状态`)
  }
  assert.equal(requests.length, 0, '普通路径不应产生任何后端请求')
  assert.ok(!requests.some((url) => String(url).includes('/api/public/music/share')))

  const home = await (await fetch(`http://127.0.0.1:${proxy.port}/`)).text()
  assert.match(home, /<title>首页 - 个人导航<\/title>/)
  const app = await (await fetch(`http://127.0.0.1:${proxy.port}/music/app`)).text()
  assert.match(app, /<title>柒伍壹壹音乐 App - 个人导航<\/title>/)
})

test('分享页对注入值做 HTML 转义并拒绝危险封面协议', async (t) => {
  const upstream = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({
      code: 0,
      message: 'ok',
      data: {
        name: '月光"<script>&',
        artist: '歌手A',
        coverUrl: 'javascript:alert(1)',
      },
    }))
  })
  const upstreamPort = await listen(upstream)
  t.after(() => closeServer(upstream))

  const proxy = await startProxy(upstreamPort, 1000)
  t.after(() => stopProxy(proxy))

  const response = await fetch(`http://127.0.0.1:${proxy.port}${SHARE_PATH}`)
  assert.equal(response.status, 200)
  const html = await response.text()

  assert.equal(readMeta(html, 'property', 'og:title'), '月光&quot;&lt;script&gt;&amp; - 歌手A')
  assert.ok(!html.includes('月光"<script>&'), '标题未做 HTML 转义')
  assert.equal(readMeta(html, 'property', 'og:image'), 'https://hi.751152.xyz/share-cover.png')
  assert.equal(readMeta(html, 'name', 'twitter:image'), 'https://hi.751152.xyz/share-cover.png')
})

async function listen(server) {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return server.address().port
}

async function closeServer(server) {
  server.closeAllConnections?.()
  if (!server.listening) return
  server.close()
  await once(server, 'close')
}

async function startProxy(upstreamPort, timeoutMs, extraEnv = {}) {
  const port = await reservePort()
  const child = spawn(process.execPath, [serverScript], {
    env: {
      ...process.env,
      API_PROXY_TIMEOUT_MS: String(timeoutMs),
      BACKEND_URL: `http://127.0.0.1:${upstreamPort}`,
      HOST: '127.0.0.1',
      PORT: String(port),
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let output = ''
  child.stdout.on('data', (chunk) => {
    output += chunk
  })
  child.stderr.on('data', (chunk) => {
    output += chunk
  })

  try {
    await waitForHealth(port, child)
  } catch (error) {
    child.kill('SIGTERM')
    throw new Error(`${error.message}\n${output}`)
  }

  return { child, port, getOutput: () => output }
}

async function stopProxy(proxy) {
  if (proxy.child.exitCode !== null) return
  proxy.child.kill('SIGTERM')
  await withTimeout(once(proxy.child, 'exit'), 1000, `proxy did not stop:\n${proxy.getOutput()}`)
}

async function reservePort() {
  const server = http.createServer()
  const port = await listen(server)
  await closeServer(server)
  return port
}

async function waitForHealth(port, child) {
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`proxy exited with code ${child.exitCode}`)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`)
      if (response.ok) return
    } catch {
      // The child may still be binding its listening socket.
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('proxy did not become healthy')
}

async function withTimeout(promise, timeoutMs, message) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
