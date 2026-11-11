// Build-time precompression for nginx `gzip_static on`.
//
// The ECS serves /assets/ (and /models/) directly via nginx `alias`, with a
// global `gzip on; gzip_comp_level 6;` filter that re-compresses every ~900KB
// bundle on EVERY request. On a 2C2G box shared with the Spring Boot API, frps
// and the Node frontend, that per-request CPU work is an avoidable cost during
// concurrency spikes.
//
// Emitting `.gz` (level 9) next to each asset lets nginx send the precompressed
// bytes directly (sendfile, exact Content-Length) and skip the gzip filter
// entirely. Plain files are kept: nginx `gzip_static on` only serves the `.gz`
// copy when the client sends `Accept-Encoding: gzip`, and transparently falls
// back to the original (or the live gzip filter) otherwise.
//
// Only nginx-direct-served directories are precompressed. Paths that go through
// `location / -> proxy_pass 127.0.0.1:3000` (bank-nav, music-app, ...) are
// proxied responses, where gzip_static does not apply; nginx keeps handling
// those with its live gzip filter.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const distDir = fileURLToPath(new URL('../dist/', import.meta.url))
const COMPRESSIBLE = /\.(js|css|svg|json|txt|xml|map|wasm)$/i
const MIN_BYTES = 512 // below this, precompression buys nothing measurable

function walk(dir) {
  let files = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) files = files.concat(walk(p))
    else if (st.isFile()) files.push(p)
  }
  return files
}

const targets = []
for (const sub of ['assets', 'models']) {
  const d = join(distDir, sub)
  if (existsSync(d)) targets.push(...walk(d))
}
const favicon = join(distDir, 'favicon.svg')
if (existsSync(favicon)) targets.push(favicon)

let made = 0
let kept = 0
let skipped = 0
let rawTotal = 0
let gzTotal = 0

for (const p of targets) {
  if (!COMPRESSIBLE.test(p)) {
    skipped++
    continue
  }
  const raw = readFileSync(p)
  if (raw.length < MIN_BYTES) {
    skipped++
    continue
  }
  const gzPath = p + '.gz'
  // Idempotent: only re-compress when the .gz is missing or older than the source.
  if (existsSync(gzPath) && statSync(gzPath).mtimeMs >= statSync(p).mtimeMs) {
    kept++
    continue
  }
  const gz = gzipSync(raw, { level: 9 })
  writeFileSync(gzPath, gz)
  made++
  rawTotal += raw.length
  gzTotal += gz.length
}

console.log(
  `[precompress] made=${made} kept=${kept} skipped=${skipped} ` +
    `${(rawTotal / 1024).toFixed(0)}KB -> ${(gzTotal / 1024).toFixed(0)}KB gzip(-9)`,
)
