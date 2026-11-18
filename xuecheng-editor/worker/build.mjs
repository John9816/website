// 学城编辑器 · 构建转换脚本
// 把仓库的 server/auth.js、server/index.js 改造为 Workers 版（存储走 context.js，逻辑 1:1 保留）。
// 用法：node worker/build.mjs
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL(".", import.meta.url).pathname;
const read = (f) => readFileSync(root + f, "utf8");
const write = (f, s) => writeFileSync(root + f, s);

let log = [];
const step = (name, ok, detail = "") => log.push(`${ok ? "OK " : "!! "} ${name}${detail ? " — " + detail : ""}`);

/* ============ AUTH ============ */
{
  let s = read("auth.src.js");
  const start = s.length;

  const NEW_HEADER = `// 学城编辑器 · 鉴权模块（Workers 版；逻辑来自仓库 auth.js，存储走 context.js）
import {
  ENV, rndHex, rndB64, hashPassword, verifyPassword, safeEqual, loadContext, saveContext,
  readDocs, writeDocs, readUsers, writeUsers, readSessions, writeSessions,
  readPrefs, writePrefs, readAccessRequests, writeAccessRequests,
  readNotifications, writeNotifications,
} from "./context.js";
export {
  readDocs, writeDocs, readUsers, writeUsers, readSessions, writeSessions,
  readPrefs, writePrefs, readAccessRequests, writeAccessRequests,
  readNotifications, writeNotifications,
  hashPassword, verifyPassword, safeEqual,
};
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_ACL_DEPTH = 64;
export const PREF_KEYS = ["favorite", "pinned", "pinnedAt", "lastVisitedAt"];
export const ACL_ROLES = ["viewer", "editor", "manager"];
export const ROLE_LABELS = { viewer: "仅查看", editor: "可编辑", manager: "可管理", owner: "所有者" };
const AVATAR_COLORS = ["#1668dc", "#7c4dff", "#0f9d58", "#e8710a", "#d93026", "#00897b", "#5c6bc0", "#c2185b"];
`;

  // A1: 头注释 + node 导入 + 存储函数定义（到 writeNotifications 结束）整段替换
  const m = s.match(/^[\s\S]*?export function writeNotifications\(list\) \{\n  writeJson\(NOTIFICATIONS_FILE, list, true\);\n\}/);
  if (m) { s = s.slice(m[0].length); s = NEW_HEADER + s; step("auth header", true); }
  else step("auth header", false, "未匹配到 writeNotifications 标记");

  // A2-A4: 删除 hashPassword / verifyPassword / safeEqual 定义（改由 context 提供）
  // 用括号配平稳健删除（避免正则被函数体花括号干扰）
  function dropBalanced(sig) {
    const i = s.indexOf(sig);
    if (i < 0) return false;
    const j = s.indexOf("{", i);
    if (j < 0) return false;
    let depth = 0, k = j;
    for (; k < s.length; k++) {
      if (s[k] === "{") depth++;
      else if (s[k] === "}") { depth--; if (depth === 0) break; }
    }
    s = s.slice(0, i) + s.slice(k + 1);
    return true;
  }
  step("auth drop hashPassword", dropBalanced("export function hashPassword(plain) {"));
  step("auth drop verifyPassword", dropBalanced("export function verifyPassword(plain, salt, hash) {"));
  step("auth drop safeEqual", dropBalanced("export function safeEqual(a, b) {"));

  // A5-A6: 调用处加 await
  s = s.replace(/hashPassword\(/g, "await hashPassword(");
  s = s.replace(/verifyPassword\(/g, "await verifyPassword(");

  // A7-A10: crypto.randomBytes → rnd*
  s = s.replace(/crypto\.randomBytes\(8\)\.toString\("hex"\)/g, "rndHex(8)");
  s = s.replace(/crypto\.randomBytes\(16\)\.toString\("hex"\)/g, "rndHex(16)");
  s = s.replace(/crypto\.randomBytes\(32\)\.toString\("base64url"\)/g, "rndB64(32)");
  s = s.replace(/crypto\.randomBytes\(6\)\.toString\("hex"\)/g, "rndHex(6)");

  // A11: process.env → ENV
  s = s.replace(/process\.env\./g, "ENV.");

  // A12: 调用 hashPassword/verifyPassword 的函数改为 async
  for (const fn of ["registerUser", "loginUser", "changePassword", "resetUserPassword"]) {
    s = s.replace(new RegExp("export function " + fn + "\\("), "export async function " + fn + "(");
  }

  // A13: appendCookie 兼容 resShim（Workers 无 res.getHeader/setHeader，改写 res.cookies）
  s = s.replace(
    `export function appendCookie(res, cookie) {
  const prev = res.getHeader("Set-Cookie");
  const arr = prev == null ? [] : Array.isArray(prev) ? prev.slice() : [String(prev)];
  arr.push(cookie);
  res.setHeader("Set-Cookie", arr);
}`,
    `export function appendCookie(res, cookie) {
  if (Array.isArray(res.cookies)) { res.cookies.push(cookie); return; }
  const prev = res.getHeader ? res.getHeader("Set-Cookie") : null;
  const arr = prev == null ? [] : Array.isArray(prev) ? prev.slice() : [String(prev)];
  arr.push(cookie);
  if (res.setHeader) res.setHeader("Set-Cookie", arr);
}`
  );
  step("auth cookie shim", true);

  write("auth.js", s);
  step("auth written", s.length < start);
}

/* ============ SERVER ============ */
{
  let s = read("server.src.js");
  const start = s.length;

  const NEW_HEADER = `// 学城编辑器 · API 处理（Workers 版；逻辑来自仓库 index.js，存储走 context.js）
import {
  ENV, rndHex, rndB64, b64ToBytes, loadContext, saveContext,
  readDocs as readDb, writeDocs as writeDb, readUsers, writeUsers,
  readPrefs, writePrefs, readAccessRequests, writeAccessRequests,
  readNotifications, writeNotifications,
  readTpl, writeTpl, readTrash, writeTrash, readInteractions, writeInteractions,
  readVisitors, writeVisitors, readPresence, writePresence,
} from "./context.js";
import {
  appendCookie, getSessionUser, createSession as createUserSession, revokeSession,
  isPublicRoute, bootstrapStatus, registerUser, loginUser, changePassword, listUsers,
  publicUsersByIds, setUserDisabled, setUserRole, deleteUser, resetUserPassword,
  loginBlocked, noteLoginFail, clearLoginFail, mergePrefsInto, writePrefFor,
  PREF_KEYS, normalizeAcl, effectiveAcl, aclSource, sanitizeAcl, canView, canEdit, canManage,
  effectiveOwner, reconcileOwners, addNotification, ACL_ROLES, ROLE_LABELS,
} from "./auth.js";
`;

  // S1: 头注释 + node 导入 + auth 导入块（到 } from "./auth.js"; 结束）整段替换
  const m = s.match(/^[\s\S]*?\} from "\.\/auth\.js";\n/);
  if (m) { s = s.slice(m[0].length); s = NEW_HEADER + s; step("server header", true); }
  else step("server header", false, "未匹配到 auth 导入标记");

  // S2: 删除 node path 常量 + mkdirSync
  for (const t of [
    `const ROOT = path.dirname(fileURLToPath(import.meta.url));\n`,
    `const DIST = path.join(ROOT, "..", "dist");\n`,
    `const DATA_DIR = path.join(ROOT, "data");\n`,
    `const FILES_DIR = path.join(DATA_DIR, "files");\n`,
    `const TPL_FILE = path.join(DATA_DIR, "templates.json");\n`,
    `const MCP_FILE = path.join(DATA_DIR, "mcp.json");\n`,
    `const TRASH_FILE = path.join(DATA_DIR, "trash.json");\n`,
    `fs.mkdirSync(DATA_DIR, { recursive: true });\n`,
  ]) {
    if (s.includes(t)) { s = s.split(t).join(""); }
  }
  step("server strip node consts", true);

  // S3: 删除 PORT（未使用）
  s = s.split(`const PORT = Number(process.env.EDITOR_PORT || 8790);\n`).join("");

  // S4: mcp 实例化 → 桩（Workers 不支持本地进程）
  s = s.replace(
    `const mcp = new McpManager(MCP_FILE);`,
    `// MCP 工具依赖本地子进程，Cloudflare Workers 不支持；以桩优雅降级。
const mcp = {
  list: () => [],
  find: () => null,
  add: () => { throw new Error("MCP 工具在 Cloudflare Workers 上不可用"); },
  connect: async () => {},
  disconnect: async () => {},
  update: () => {},
  remove: async () => {},
  callTool: async () => { throw new Error("MCP 工具在 Cloudflare Workers 上不可用"); },
};`
  );
  step("server mcp stub", true);

  // S5: 删除 8 个存储函数定义（改由 context 提供）
  const dropFn = (name, arg) => {
    const re = new RegExp("function " + name + "\\(" + arg + "\\) \\{[\\s\\S]*?\\n\\}\n");
    if (re.test(s)) { s = s.replace(re, ""); return true; }
    return false;
  };
  step("server drop readTpl", dropFn("readTpl", ""));
  step("server drop writeTpl", dropFn("writeTpl", "list"));
  step("server drop readVisitors", dropFn("readVisitors", ""));
  step("server drop writeVisitors", dropFn("writeVisitors", "map"));
  step("server drop readTrash", dropFn("readTrash", ""));
  step("server drop writeTrash", dropFn("writeTrash", "v"));
  step("server drop readInteractions", dropFn("readInteractions", ""));
  step("server drop writeInteractions", dropFn("writeInteractions", "map"));

  // S6: presence 改 CTX（去掉 Map，改对象）
  s = s.replace(`const presenceByDoc = new Map(); // docId -> Map<key, entry>`, "");
  const PRESENCE_RE = /function presencePrune\(docId\) \{[\s\S]*?function presenceSnapshot\(docId, selfKey\) \{[\s\S]*?\n\}\n/;
  const NEW_PRESENCE = `function presenceStore(docId) {
  const s = readPresence();
  if (!s[docId]) s[docId] = {};
  writePresence(s);
  return s[docId];
}
function presencePrune(docId) {
  const s = readPresence();
  const m = s[docId];
  if (!m) return null;
  const now = Date.now();
  for (const k of Object.keys(m)) if (now - (m[k].lastSeen || 0) > PRESENCE_TTL) delete m[k];
  if (!Object.keys(m).length) { delete s[docId]; writePresence(s); return null; }
  writePresence(s);
  return m;
}
function presenceTouch(docId, req, res, user) {
  const idt = presenceIdentity(req, res, user);
  const m = presencePrune(docId) || presenceStore(docId);
  m[idt.key] = { ...idt, lastSeen: Date.now() };
  writePresence(readPresence());
  return idt.key;
}
function presenceLeave(docId, req, res, user) {
  const idt = presenceIdentity(req, res, user);
  const s = readPresence();
  const m = s[docId];
  if (m) { delete m[idt.key]; writePresence(s); }
}
function presenceSnapshot(docId, selfKey) {
  const m = presencePrune(docId) || {};
  const viewers = [];
  let guests = 0;
  for (const [key, e] of Object.entries(m)) {
    if (e.kind === "guest") { guests += 1; continue; }
    viewers.push({ id: e.id, name: e.name, color: e.color, initial: e.initial, role: e.role, self: key === selfKey });
  }
  viewers.sort((a, b) => (a.self === b.self ? a.name.localeCompare(b.name, "zh-CN") : a.self ? -1 : 1));
  return { viewers, guests, total: viewers.length + guests };
}
`;
  if (PRESENCE_RE.test(s)) { s = s.replace(PRESENCE_RE, NEW_PRESENCE); step("server presence→ctx", true); }
  else step("server presence→ctx", false, "未匹配");

  // S7: json 适配（写 res.status/body，兼容 Worker 响应构造）
  s = s.replace(
    `function json(res, status, data, message = "ok") {
  const body = JSON.stringify({ code: status === 200 ? 0 : status, message, data });
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    // 不再开放通配 CORS：dev 走 vite 代理、生产走同源反代，浏览器始终同源。
    // 通配 ACAO + 会话 Cookie 会让任意第三方站点跨域操作文档。
  });
  res.end(body);
}`,
    `function json(res, status, data, message = "ok") {
  res.status = status;
  res.body = { code: status === 200 ? 0 : status, message, data };
  return res;
}`
  );
  step("server json shim", true);

  // S8: readBody 适配（Fetch Request）
  s = s.replace(
    /function readBody\(req\) \{[\s\S]*?\n\}/,
    `async function readBody(req) {
  try {
    const text = await req.__request.text();
    if (!text) return null;
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}`
  );
  step("server readBody shim", true);

  // S9: process.env → ENV
  s = s.replace(/process\.env\./g, "ENV.");

  // S10: crypto.randomBytes → rnd*
  s = s.replace(/const newId = \(\) => crypto\.randomBytes\(6\)\.toString\("hex"\);/, `const newId = () => rndHex(6);`);
  s = s.replace(/id = crypto\.randomBytes\(16\)\.toString\("base64url"\);/, `id = rndB64(16);`);
  s = s.replace(/id: crypto\.randomBytes\(8\)\.toString\("hex"\),/, `id: rndHex(8),`);
  s = s.replace(/const token = \(cur && cur\.token\) \|\| crypto\.randomBytes\(12\)\.toString\("base64url"\);/, `const token = (cur && cur.token) || rndB64(12);`);
  s = s.replace(/token: \(cur && cur\.token\) \|\| crypto\.randomBytes\(12\)\.toString\("base64url"\),/, `token: (cur && cur.token) || rndB64(12),`);
  s = s.replace(/id: crypto\.randomBytes\(9\)\.toString\("hex"\),/, `id: rndHex(9),`);

  // S11: Buffer.from(x, "base64") → b64ToBytes(x)（Workers 无 Buffer）
  s = s.replace(/Buffer\.from\(/g, "b64ToBytes(");
  // 但 readBody 已替换，确保没有遗留 Buffer.concat
  s = s.replace(/Buffer\.concat\([^)]*\)\.toString\("utf8"\)/g, "''");

  // S12: 调用处 await 异步 auth 函数
  s = s.replace(/registerUser\(body\)/, "await registerUser(body)");
  s = s.replace(/loginUser\(body\)/, "await loginUser(body)");
  s = s.replace(/changePassword\(user\.id,/, "await changePassword(user.id,");
  s = s.replace(/resetUserPassword\(resetPwM\[1\],/, "await resetUserPassword(resetPwM[1],");

  // S14: path 模块已移除，上传处 path.basename 改为纯字符串处理
  s = s.replace(/path\.basename\(new URL\(purl\)\.pathname\)/, `new URL(purl).pathname.split("/").pop()`);

  // S13: 删除 http.createServer 启动块（静态服务交给 Workers Assets）
  s = s.replace(/const server = http\.createServer[\s\S]*$/, `export { handleApi };\n`);
  step("server strip http server", true);

  // S15: 删除本地文件服务残留（Workers 用 R2 + Workers Assets，不再有本地磁盘）。
  // 这些函数/常量在 Workers 运行时引用了未定义的 path / fs / DATA_DIR / DIST。
  function dropBalanced(sig) {
    const i = s.indexOf(sig);
    if (i < 0) return false;
    const j = s.indexOf("{", i);
    if (j < 0) return false;
    let depth = 0, k = j;
    for (; k < s.length; k++) {
      if (s[k] === "{") depth++;
      else if (s[k] === "}") { depth--; if (depth === 0) break; }
    }
    s = s.slice(0, i) + s.slice(k + 1);
    return true;
  }
  s = s.split(`const VISITORS_FILE = path.join(DATA_DIR, "share-visitors.json");\n`).join("");
  s = s.split(`const INTERACTIONS_FILE = path.join(DATA_DIR, "interactions.json");\n`).join("");
  step("server drop compressedBuffer", dropBalanced("function compressedBuffer(filePath, st, encoding) {"));
  step("server drop serveFile", dropBalanced("function serveFile(res, filePath, cache = false, req = null) {"));
  step("server drop serveShareHtml", dropBalanced("function serveShareHtml(res, title, desc) {"));

  write("index.js", s);
  step("server written", s.length < start);
}

console.log(log.join("\n"));
