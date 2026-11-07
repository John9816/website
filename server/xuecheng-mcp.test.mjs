import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { McpManager } from './xuecheng/mcp.mjs'

test('corrupt MCP configuration is reported rather than replaced with an empty configuration', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'xuecheng-mcp-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const file = join(dir, 'mcp.json')
  await writeFile(file, 'corrupt')
  assert.throws(() => new McpManager(file))
})

test('MCP children do not inherit website secrets and disconnect kills a child ignoring SIGTERM', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'xuecheng-mcp-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const script = join(dir, 'child.mjs')
  await writeFile(script, `import readline from 'node:readline';
process.on('SIGTERM', () => {});
setInterval(() => {}, 1000);
readline.createInterface({ input: process.stdin }).on('line', line => {
  const m = JSON.parse(line); if (m.id === undefined) return;
  const result = m.method === 'initialize' ? { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'fixture', version: '1' } }
    : m.method === 'tools/list' ? { tools: [{ name: 'probe', inputSchema: { type: 'object' } }] }
    : { content: [{ type: 'text', text: String(process.env.XUECHENG_TEST_WEBSITE_SECRET) }] };
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result }) + '\\n');
});`)
  process.env.XUECHENG_TEST_WEBSITE_SECRET = 'must-not-be-inherited'
  t.after(() => delete process.env.XUECHENG_TEST_WEBSITE_SECRET)
  const manager = new McpManager(join(dir, 'mcp.json'))
  t.after(() => manager.disposeAll())
  const server = manager.add({ name: 'fixture', transport: 'stdio', command: process.execPath, args: [script] })
  await manager.connect(server.id)
  const pid = manager.list()[0].status.pid
  t.after(() => { try { process.kill(pid, 'SIGKILL') } catch {} })
  assert.equal((await manager.callTool(server.id, 'probe', {})).text, 'undefined')
  await manager.disconnect(server.id)
  await new Promise(r => setTimeout(r, 1700))
  assert.throws(() => process.kill(pid, 0), 'child remained alive after disconnect')
})
