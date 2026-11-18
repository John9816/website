/**
 * 经 wrangler 的 --command 通道写入 kv 种子数据（绕过不稳定的 --file 上传端点）。
 * 大集合（docs）按与 worker/context.js 完全一致的 splitIntoChunks 切片，
 * 以 docs#meta / docs#0..N-1 多行写入，避免单值超过 D1 上限（SQLITE_TOOBIG）。
 *
 * 凭据：从 .env.deploy 读取 CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// 读取 .env.deploy
const envPath = path.join(ROOT, ".env.deploy");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}
if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
  console.error("[x] 需要 .env.deploy 中的 CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID");
  process.exit(1);
}

// ===== 与 context.js 一致的随机/哈希/分块 =====
function rndHex(n) { return crypto.randomBytes(n).toString("hex"); }
function rndB64(n) {
  return crypto.randomBytes(n).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function hashPassword(plain) {
  const salt = rndB64(16);
  const hash = crypto.pbkdf2Sync(String(plain), Buffer.from(salt, "utf8"), 100000, 64, "sha256").toString("hex");
  return { salt, hash };
}
function pickColor(username) {
  const colors = ["#1668dc", "#7c4dff", "#0f9d58", "#e8710a", "#d93026", "#00897b", "#5c6bc0", "#c2185b"];
  let h = 0;
  for (const ch of String(username)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return colors[h % colors.length];
}
const CHUNK_TARGET = 60000;
function splitIntoChunks(arr) {
  const chunks = [];
  let cur = [];
  let curBytes = 2;
  for (const item of arr) {
    const b = Buffer.byteLength(JSON.stringify(item), "utf8");
    if (cur.length && curBytes + b > CHUNK_TARGET) { chunks.push(cur); cur = []; curBytes = 2; }
    cur.push(item); curBytes += b + 1;
  }
  if (cur.length) chunks.push(cur);
  return chunks.length ? chunks : [[]];
}
const esc = (s) => String(s).replace(/'/g, "''");
function sqlKV(key, val) {
  return `INSERT OR REPLACE INTO kv (key, value) VALUES ('${key}', '${esc(JSON.stringify(val))}');`;
}

// ===== 构造数据 =====
const PW_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
function genPassword(len) {
  const b = crypto.randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += PW_ALPHABET[b[i] % PW_ALPHABET.length];
  return s;
}
const adminPassword = process.env.XC_ADMIN_PASSWORD || genPassword(16);
const adminId = rndHex(6);
const { salt, hash } = hashPassword(adminPassword);
const adminUser = { id: adminId, username: "admin", displayName: "管理员", salt, hash, role: "admin", avatarColor: pickColor("admin"), createdAt: new Date().toISOString(), disabled: false };

const seed = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "seed.json"), "utf8"));
const docs = (seed.docs || []).map((d) => ({ ...d, ownerId: adminId }));
const templates = seed.templates || [];

// 组装语句
const statements = [sqlKV("users", [adminUser])];
const docChunks = splitIntoChunks(docs);
statements.push(sqlKV("docs#meta", { chunks: docChunks.length }));
docChunks.forEach((c, i) => statements.push(sqlKV("docs#" + i, c)));
const tplChunks = splitIntoChunks(templates);
statements.push(sqlKV("templates#meta", { chunks: tplChunks.length }));
tplChunks.forEach((c, i) => statements.push(sqlKV("templates#" + i, c)));

// ===== 经 wrangler --command 逐条写入（带重试）=====
function runWrangler(sql) {
  return new Promise((resolve, reject) => {
    const p = spawn("npx", ["wrangler", "d1", "execute", "xuecheng", "--remote", "--command", sql], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error("exit " + code + ": " + out.slice(-300)))));
  });
}
async function withRetry(fn, label, max = 8) {
  for (let i = 1; i <= max; i++) {
    try {
      const o = await fn();
      if (/error|ERROR|🚫|not found/i.test(o) && !/num_tables|changes|success/i.test(o)) {
        if (i < max) { console.warn(`  ! ${label} 疑似失败 重试(${i})`); await new Promise((r) => setTimeout(r, 6000)); continue; }
      }
      return o;
    } catch (e) {
      if (i < max) { console.warn(`  ! ${label} 异常 重试(${i}): ${e.message.slice(0, 120)}`); await new Promise((r) => setTimeout(r, 6000)); continue; }
      throw e;
    }
  }
}

console.log(`[*] 共 ${statements.length} 条语句（docs 分 ${docChunks.length} 块）`);
for (let i = 0; i < statements.length; i++) {
  const label = `stmt#${i}`;
  await withRetry(() => runWrangler(statements[i]), label);
  process.stdout.write(`  [✓] ${i + 1}/${statements.length}\r`);
}
console.log("");

fs.writeFileSync(path.join(ROOT, ".admin-creds.json"), JSON.stringify({ username: "admin", password: adminPassword, userId: adminId, generatedAt: new Date().toISOString() }, null, 2));
console.log(`\n[✓] 种子写入完成。管理员 用户名 admin  密码 ${adminPassword}`);
console.log("[✓] 凭据已写入 .admin-creds.json");
