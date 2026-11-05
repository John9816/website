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

async function startProxy(upstreamPort, timeoutMs) {
  const port = await reservePort()
  const child = spawn(process.execPath, [serverScript], {
    env: {
      ...process.env,
      API_PROXY_TIMEOUT_MS: String(timeoutMs),
      BACKEND_URL: `http://127.0.0.1:${upstreamPort}`,
      HOST: '127.0.0.1',
      PORT: String(port),
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
