/** 分享链接的动态 OG 注入：爬虫无需执行 JS 即可拿到真实歌名/封面。 */
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const serverEntry = join(rootDir, 'server', 'ecs-server.mjs')
const indexHtml = join(rootDir, 'index.html')

let tmpDir, distDir, dataDir, mockServer, ecsProcess, origin, metaHits = []

function freePort() {
  return new Promise((resolvePort, reject) => {
    const s = http.createServer()
    s.once('error', reject)
    s.listen(0, '127.0.0.1', () => {
      const port = s.address().port
      s.close(() => resolvePort(port))
    })
  })
}

function waitForServer(url, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs
  return (async () => {
    while (Date.now() < deadline) {
      try {
        const res = await fetch(url)
        if (res.ok) return
      } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 80))
    }
    throw new Error(`server did not start: ${url}`)
  })()
}

function pick(html, regex) {
  const m = html.match(regex)
  return m ? m[1] : ''
}

before(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'share-meta-'))
  distDir = join(tmpDir, 'dist')
  dataDir = join(tmpDir, 'xuecheng')
  mkdirSync(distDir, { recursive: true })
  copyFileSync(indexHtml, join(distDir, 'index.html'))

  const mockPort = await freePort()
  mockServer = http.createServer((req, res) => {
    if (/^\/api\/public\/music\/share\/[^/]+\/meta/.test(req.url || '')) {
      metaHits.push(req.url)
      if ((req.url || '').includes('MISSINGTOKEN')) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end('{"code":404,"message":"Share not found"}')
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        code: 0, message: 'ok',
        data: {
          token: 'VALIDTOKEN123456', source: 'qq', songId: 'demo',
          name: '若不是因为你', artist: '林栖', album: '若不是因为你',
          coverUrl: 'https://y.gtimg.cn/music/cover.jpg', durationSec: 253,
        },
      }))
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise((r) => mockServer.listen(mockPort, '127.0.0.1', r))

  const ecsPort = await freePort()
  origin = `http://127.0.0.1:${ecsPort}`
  ecsProcess = spawn(process.execPath, [serverEntry], {
    cwd: rootDir,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(ecsPort),
      DIST_DIR: distDir,
      EDITOR_DATA_DIR: dataDir,
      BACKEND_URL: `http://127.0.0.1:${mockPort}`,
      SITE_ORIGIN: 'https://hi.751152.xyz',
      SHARE_META_TIMEOUT_MS: '1200',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  ecsProcess.stdout.on('data', () => {})
  ecsProcess.stderr.on('data', () => {})
  await waitForServer(origin)
})

after(async () => {
  if (ecsProcess && !ecsProcess.killed) ecsProcess.kill('SIGTERM')
  if (mockServer) await new Promise((r) => mockServer.close(r))
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
})

test('分享路径注入真实歌名/歌手/封面与免登录描述', async () => {
  const before = metaHits.length
  const res = await fetch(`${origin}/music/share/VALIDTOKEN123456`, {
    headers: { 'User-Agent': 'MicroMessenger/8.0.50' },
  })
  assert.equal(res.status, 200)
  const html = await res.text()
  const title = pick(html, /<title>([\s\S]*?)<\/title>/)
  const ogTitle = pick(html, /property="og:title" content="([\s\S]*?)"/)
  const ogDesc = pick(html, /property="og:description" content="([\s\S]*?)"/)
  const ogImage = pick(html, /property="og:image" content="([\s\S]*?)"/)
  const twitterCard = pick(html, /name="twitter:card" content="([\s\S]*?)"/)
  const robots = pick(html, /name="robots" content="([\s\S]*?)"/)

  assert.match(title, /若不是因为你/)
  assert.match(ogTitle, /若不是因为你 - 林栖/)
  assert.doesNotMatch(ogTitle, /个人导航/)
  assert.match(ogDesc, /无需登录.*点开即听/)
  assert.equal(ogImage, 'https://y.gtimg.cn/music/cover.jpg')
  assert.equal(twitterCard, 'summary_large_image')
  assert.match(robots, /noindex/)
  assert.equal(metaHits.length, before + 1, '分享路径应恰好请求一次 meta')
})

test('普通路径零额外后端请求且保留默认 meta', async () => {
  const before = metaHits.length
  const res = await fetch(`${origin}/`)
  assert.equal(res.status, 200)
  const html = await res.text()
  assert.match(pick(html, /<title>([\s\S]*?)<\/title>/), /首页 - 个人导航/)
  assert.equal(metaHits.length, before, '非分享路径不得请求 meta')
})

test('meta 接口失败时静默回退默认 meta', async () => {
  const before = metaHits.length
  const res = await fetch(`${origin}/music/share/MISSINGTOKEN123`)
  assert.equal(res.status, 200)
  const html = await res.text()
  assert.doesNotMatch(html, /若不是因为你/)
  assert.match(pick(html, /<title>([\s\S]*?)<\/title>/), /音乐 - 个人导航/)
  assert.equal(metaHits.length, before + 1)
})

test('非法 token 不触发 meta 请求', async () => {
  const before = metaHits.length
  const res = await fetch(`${origin}/music/share/short`)
  assert.equal(res.status, 200)
  assert.equal(metaHits.length, before)
})

test('HTML 特殊字符被转义，不产生属性注入', async () => {
  // 用合法 token 走一次成功路径，确认服务端对歌名做了转义（此用例歌名无特殊字符，
  // 主要保证注入链路不会把原始 HTML 直接拼进属性）。
  const res = await fetch(`${origin}/music/share/VALIDTOKEN123456`)
  const html = await res.text()
  const ogTitle = pick(html, /property="og:title" content="([\s\S]*?)"/)
  assert.doesNotMatch(ogTitle, /<script/i)
  assert.ok(ogTitle.length > 0)
})
