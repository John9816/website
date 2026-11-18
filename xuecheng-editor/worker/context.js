// 学城编辑器 · Workers 运行上下文
// 设计：每请求把 D1 中全部集合载入 CTX 内存快照，处理期间所有 read*/write* 同步操作
// 都作用于 CTX，请求结束再整体落库。仓库业务逻辑（auth.js / index.js）因此可原样保留。

// ===== 环境（替代 process.env）=====
export const ENV = {};
export function setEnv(e) {
  if (e && typeof e === "object") Object.assign(ENV, e);
}

// ===== 当前请求上下文（模块级；单用户 KM 并发低，可接受）=====
let _CTX = null;
export function setCtx(c) { _CTX = c; }
export function getCtx() { return _CTX; }

// ===== 随机数（替代 node:crypto.randomBytes）=====
export function rndHex(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}
export function rndB64(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  let s = "";
  for (const b of a) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ===== 密码哈希（Web Crypto PBKDF2-SHA256，dkLen=64）=====
async function pbkdf2Hex(plain, salt) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(String(plain)), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(String(salt)), iterations: 100000, hash: "SHA-256" },
    key, 512
  );
  return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(plain) {
  const salt = rndB64(16);
  const hash = await pbkdf2Hex(plain, salt);
  return { salt, hash };
}
export async function verifyPassword(plain, salt, hash) {
  try {
    const h = await pbkdf2Hex(plain, salt);
    return timingSafeEqualHex(h, String(hash || ""));
  } catch (_) {
    return false;
  }
}
export function timingSafeEqualHex(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
// 明文 token 比较（替代 Buffer 版 safeEqual）
export function safeEqual(a, b) {
  return timingSafeEqualHex(String(a ?? ""), String(b ?? ""));
}
// Workers 无 Buffer：base64 → Uint8Array（用于图片 dataUrl 上传）
export function b64ToBytes(s) {
  const bin = atob(String(s).replace(/\s/g, ""));
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

// ===== 同步存储函数（绑定 CTX，签名与仓库一致）=====
const COLLECTIONS = [
  "docs", "users", "sessions", "prefs", "accessRequests",
  "notifications", "templates", "trash", "interactions", "visitors", "presence", "loginFails",
];

// 大集合（文档/模板）按体积拆成多个 kv 行，避免单值超过 D1 上限（SQLITE_TOOBIG）。
// 存储形态：<name>#meta = {chunks:N}，<name>#0..N-1 = JSON 数组切片。
// 业务层（readDocs/writeDocs 等）始终看到完整数组，拆分/重组对它们透明。
const CHUNKED = new Set(["docs", "templates"]);
const CHUNK_TARGET = 60000; // 单块原始 JSON 目标字节，远低于 D1 单值上限

function splitIntoChunks(arr) {
  const chunks = [];
  let cur = [];
  let curBytes = 2;
  for (const item of arr) {
    const b = Buffer.byteLength(JSON.stringify(item), "utf8");
    if (cur.length && curBytes + b > CHUNK_TARGET) {
      chunks.push(cur);
      cur = [];
      curBytes = 2;
    }
    cur.push(item);
    curBytes += b + 1;
  }
  if (cur.length) chunks.push(cur);
  return chunks.length ? chunks : [[]];
}
function ensure() {
  if (!_CTX) _CTX = { dirty: {} };
  for (const k of COLLECTIONS) if (_CTX[k] === undefined) _CTX[k] = defaultFor(k);
  return _CTX;
}
function defaultFor(k) {
  if (k === "sessions" || k === "prefs" || k === "interactions" || k === "visitors" || k === "presence" || k === "loginFails") return {};
  if (k === "trash") return { batches: [] };
  return []; // docs/users/accessRequests/notifications/templates
}
function mark(k) { ensure(); _CTX.dirty[k] = true; }

export function readDocs() { return ensure().docs || []; }
export function writeDocs(v) { ensure().docs = v; mark("docs"); }
export function readUsers() { return ensure().users || []; }
export function writeUsers(v) { ensure().users = v; mark("users"); }
export function readSessions() { return ensure().sessions || {}; }
export function writeSessions(v) { ensure().sessions = v; mark("sessions"); }
export function readPrefs() { return ensure().prefs || {}; }
export function writePrefs(v) { ensure().prefs = v; mark("prefs"); }
export function readAccessRequests() { return ensure().accessRequests || []; }
export function writeAccessRequests(v) { ensure().accessRequests = v; mark("accessRequests"); }
export function readNotifications() { return ensure().notifications || []; }
export function writeNotifications(v) { ensure().notifications = v; mark("notifications"); }
// 自建模板（仓库 server/index.js 的 readTpl/writeTpl 别名到 templates）
export function readTpl() { return ensure().templates || []; }
export function writeTpl(v) { ensure().templates = v; mark("templates"); }
export function readTrash() { const t = ensure().trash; return t && Array.isArray(t.batches) ? t : { batches: [] }; }
export function writeTrash(v) { ensure().trash = v && Array.isArray(v.batches) ? v : { batches: [] }; mark("trash"); }
export function readInteractions() { return ensure().interactions || {}; }
export function writeInteractions(v) { ensure().interactions = v; mark("interactions"); }
export function readVisitors() { return ensure().visitors || {}; }
export function writeVisitors(v) { ensure().visitors = v; mark("visitors"); }
export function readPresence() { return ensure().presence || {}; }
export function writePresence(v) { ensure().presence = v; mark("presence"); }
export function readLoginFails() { return ensure().loginFails || {}; }
export function writeLoginFails(v) { ensure().loginFails = v; mark("loginFails"); }

// ===== D1 加载 / 落库（全部集合存于单张 kv 表）=====
export async function loadContext(env) {
  const ctx = { dirty: {} };
  for (const k of COLLECTIONS) ctx[k] = defaultFor(k);
  try {
    const { results } = await env.DB.prepare("SELECT key, value FROM kv").all();
    for (const r of results || []) {
      try { ctx[r.key] = JSON.parse(r.value); } catch (_) { /* 忽略坏行 */ }
    }
  } catch (_) { /* 表可能尚未初始化 */ }
  // 重组被分块的大集合
  for (const k of CHUNKED) {
    const meta = ctx[k + "#meta"];
    if (meta && typeof meta === "object" && Number.isInteger(meta.chunks)) {
      const arr = [];
      for (let i = 0; i < meta.chunks; i++) {
        const part = ctx[k + "#" + i];
        if (Array.isArray(part)) arr.push(...part);
      }
      ctx[k] = arr;
    }
    delete ctx[k + "#meta"];
    if (meta && Number.isInteger(meta.chunks)) {
      for (let i = 0; i < meta.chunks; i++) delete ctx[k + "#" + i];
    }
  }
  _CTX = ctx;
  return ctx;
}
export async function saveContext(env) {
  const ctx = _CTX;
  if (!ctx || !env || !env.DB) return;
  const ops = [];
  for (const k of COLLECTIONS) {
    if (!ctx.dirty || !ctx.dirty[k]) continue;
    const val = ctx[k] ?? defaultFor(k);
    if (CHUNKED.has(k)) {
      const chunks = splitIntoChunks(val);
      ops.push(env.DB.prepare("DELETE FROM kv WHERE key LIKE ?").bind(k + "#%"));
      ops.push(
        env.DB.prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)").bind(k + "#meta", JSON.stringify({ chunks: chunks.length }))
      );
      for (let i = 0; i < chunks.length; i++) {
        ops.push(
          env.DB.prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)").bind(k + "#" + i, JSON.stringify(chunks[i]))
        );
      }
    } else {
      ops.push(
        env.DB.prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)").bind(k, JSON.stringify(val))
      );
    }
  }
  if (ops.length) {
    try { await env.DB.batch(ops); } catch (e) { console.error("saveContext failed", e); }
  }
  ctx.dirty = {};
}
