import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) }
  catch (error) {
    if (error.code === 'ENOENT') return fallback
    throw new Error('文档存储无法读取，请联系管理员恢复备份')
  }
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const tmp = `${file}.${crypto.randomBytes(8).toString('hex')}.tmp`
  try {
    fs.writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 })
    fs.renameSync(tmp, file)
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
  }
}

export function userStore(root, userId) {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error('无效用户')
  const dir = path.join(root, 'users', String(userId))
  const read = name => {
    const value = readJson(path.join(dir, name), [])
    if (!Array.isArray(value)) throw new Error('文档存储格式无效')
    return value
  }
  return {
    readDb: () => read('docs.json'),
    writeDb: value => writeJson(path.join(dir, 'docs.json'), value),
    readTpl: () => read('templates.json'),
    writeTpl: value => writeJson(path.join(dir, 'templates.json'), value),
  }
}
