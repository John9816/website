import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

// Download only existing public release assets; never build, sign, or replace them.
const [version, destination] = process.argv.slice(2)
if (!/^\d+\.\d+\.\d+$/.test(version || '') || !destination) {
  throw new Error('Usage: node deploy/mirror-music-release.mjs <version> <staging-directory>')
}
const output = resolve(destination)
await mkdir(output, { recursive: true })
const metadataPath = join(output, 'upstream-release.json')
const curl = (url, path) => execFileSync('curl', [
  '--fail', '--silent', '--show-error', '--location', '--retry', '2',
  '--connect-timeout', '15', '--max-time', '300', '--output', path, url,
], { stdio: 'inherit' })
curl(`https://api.github.com/repos/John9816/music/releases/tags/flutter-v${version}`, metadataPath)
const release = JSON.parse(await readFile(metadataPath, 'utf8'))
if (release.draft || release.prerelease || release.tag_name !== `flutter-v${version}`) {
  throw new Error('Expected the selected public stable release')
}
const suffixes = ['Windows-x64-setup.exe', 'macOS-arm64.dmg', 'macOS-x64.dmg', 'iOS-unsigned.ipa']
const manifest = { version, tag: release.tag_name, publishedAt: release.published_at, assets: [] }
for (const suffix of suffixes) {
  const name = `DuckMusic-Flutter-v${version}-${suffix}`
  const asset = release.assets.find(item => item.name === name)
  const expectedUrl = `https://github.com/John9816/music/releases/download/flutter-v${version}/${name}`
  if (!asset || asset.browser_download_url !== expectedUrl || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || '')) {
    throw new Error(`Missing asset or trusted checksum: ${name}`)
  }
  const temporary = join(output, `${name}.part`)
  curl(expectedUrl, temporary)
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(temporary)) hash.update(chunk)
  const sha256 = hash.digest('hex')
  const { size } = await stat(temporary)
  if (`sha256:${sha256}` !== asset.digest || size !== asset.size) {
    throw new Error(`Size/checksum mismatch: ${name}; partial file retained for inspection`)
  }
  await rename(temporary, join(output, name))
  manifest.assets.push({ name, size, sha256, source: expectedUrl })
  console.log(`Verified ${name}: ${size} bytes, SHA-256 ${sha256}`)
}
await writeFile(join(output, 'checksums.sha256'), manifest.assets.map(a => `${a.sha256}  ${a.name}\n`).join(''))
await writeFile(join(output, 'mirror-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
