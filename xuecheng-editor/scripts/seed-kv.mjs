/**
 * 生成适用于「单表 kv」架构的 D1 种子数据：migrations/seed.sql
 *
 * 与旧版（docs/templates 独立表）不同，本仓库 Workers 版把所有集合存进一张 kv 表，
 * 每个集合是一行：INSERT OR REPLACE INTO kv (key, value) VALUES (?, JSON)。
 *
 * 本脚本产出：
 *   - users：1 个 bootstrap 管理员（密码用与 context.js 完全一致的 PBKDF2 哈希）
 *   - docs ：data/seed.json 里的 16 篇真实文档，ownerId 改为新管理员
 *   - templates：空数组（seed.json 里模板数为 0）
 *
 * 用法：node scripts/seed-kv.mjs
 * 生成的密码会打印到控制台，并写入 .admin-creds.json（已被 .gitignore 忽略）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ===== 与 worker/context.js 完全一致的随机/哈希实现 =====
function rndHex(n) {
  return crypto.randomBytes(n).toString("hex");
}
function rndB64(n) {
  return crypto
    .randomBytes(n)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
// context.js 用 crypto.subtle.deriveBits(..., 512) + 对「salt 字符串的 UTF-8」做 PBKDF2
function hashPassword(plain) {
  const salt = rndB64(16); // 与 context.js hashPassword 同形
  const hash = crypto
    .pbkdf2Sync(String(plain), Buffer.from(salt, "utf8"), 100000, 64, "sha256")
    .toString("hex");
  return { salt, hash };
}
function pickColor(username) {
  const colors = ["#1668dc", "#7c4dff", "#0f9d58", "#e8710a", "#d93026", "#00897b", "#5c6bc0", "#c2185b"];
  let h = 0;
  for (const ch of String(username)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return colors[h % colors.length];
}

// ===== 生成管理员账号 =====
const ADMIN_USER = "admin";
// 16 位强密码（去除易混淆字符）
const PW_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
function genPassword(len) {
  const b = crypto.randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += PW_ALPHABET[b[i] % PW_ALPHABET.length];
  return s;
}
const adminPassword = genPassword(16);
const adminId = rndHex(6);
const { salt, hash } = hashPassword(adminPassword);

const adminUser = {
  id: adminId,
  username: ADMIN_USER,
  displayName: "管理员",
  salt,
  hash,
  role: "admin",
  avatarColor: pickColor(ADMIN_USER),
  createdAt: new Date().toISOString(),
  disabled: false,
};

// ===== 迁移 16 篇真实文档 =====
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "seed.json"), "utf8"));
const docs = (seed.docs || []).map((d) => ({
  ...d,
  ownerId: adminId, // 原 ownerId 是旧库账号，统一改为新管理员
}));

const templates = seed.templates || [];

// ===== 组装 kv 行 =====
const rows = [
  ["users", adminUser ? [adminUser] : []],
  ["docs", docs],
  ["templates", templates],
];
const stmts = rows.map(
  ([k, v]) =>
    `INSERT OR REPLACE INTO kv (key, value) VALUES ('${k}', '${JSON.stringify(v).replace(/'/g, "''")}');`
);

const sql = stmts.join("\n") + "\n";
const outPath = path.join(ROOT, "migrations", "seed.sql");
fs.writeFileSync(outPath, sql);

// 凭据落盘（不进 git）
const credsPath = path.join(ROOT, ".admin-creds.json");
fs.writeFileSync(credsPath, JSON.stringify({ username: ADMIN_USER, password: adminPassword, userId: adminId, generatedAt: new Date().toISOString() }, null, 2));

console.log(`[✓] 已生成 migrations/seed.sql（users=1, docs=${docs.length}, templates=${templates.length}, ${sql.length} bytes）`);
console.log(`[✓] 管理员账号：用户名 ${ADMIN_USER}  密码 ${adminPassword}`);
console.log(`[✓] 凭据已写入 .admin-creds.json（请勿提交，已被 .gitignore 忽略）`);
console.log("    导入：wrangler d1 execute xuecheng --remote --file=./migrations/seed.sql");
