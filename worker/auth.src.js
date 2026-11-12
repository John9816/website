/**
 * 学城编辑器 —— 账号 / 会话 / 文档权限内核
 * - 零依赖：只用 Node 内置模块
 * - 文件存储沿用既有「临时文件 + renameSync」原子写
 * - 被 server/index.js 与 server/bootstrap.js 共用；本模块不启动任何服务
 *
 * 设计要点：
 *  1) 鉴权钩子统一放在 handleApi 入口（isPublicRoute 是白名单唯一真相）
 *  2) canView/canEdit/canManage 不检查 role —— 管理员只是「历史文档的所有者 +
 *     三个全局开关」，不是文档权限上的超级用户（开放注册、人人平等）
 *  3) visibility 只管登录态经 /api/docs 的发现；分享 token 是独立能力令牌，
 *     与 visibility 完全解耦，保证历史链接继续有效
 *  4) 项目没有「文件夹」类型，文档本身就是容器：inherit=true 时子文档读时
 *     继承父文档的有效 ACL（含 owner），父变更自动生效，无需刷子文档
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "docs.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const PREFS_FILE = path.join(DATA_DIR, "prefs.json");
const REQUESTS_FILE = path.join(DATA_DIR, "access-requests.json");
const NOTIFICATIONS_FILE = path.join(DATA_DIR, "notifications.json");

fs.mkdirSync(DATA_DIR, { recursive: true });

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天
const MAX_ACL_DEPTH = 64;
export const PREF_KEYS = ["favorite", "pinned", "pinnedAt", "lastVisitedAt"];

/* 文档权限角色：可查看 < 可编辑 < 可管理（owner 是隐含的最高角色，不在 members 里） */
export const ACL_ROLES = ["viewer", "editor", "manager"];
export const ROLE_LABELS = { viewer: "仅查看", editor: "可编辑", manager: "可管理", owner: "所有者" };

const AVATAR_COLORS = ["#1668dc", "#7c4dff", "#0f9d58", "#e8710a", "#d93026", "#00897b", "#5c6bc0", "#c2185b"];

/* ---------------- 通用 JSON 原子读写 ---------------- */
function readJson(file, fallback) {
  try {
    const v = JSON.parse(fs.readFileSync(file, "utf8"));
    return v == null ? fallback : v;
  } catch (_) {
    return fallback;
  }
}

function writeJson(file, value, pretty = false) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value));
  fs.renameSync(tmp, file);
}

/* 文档库读写（index.js 直接 import 复用，保证只有一份实现） */
export function readDocs() {
  const v = readJson(DB_FILE, []);
  return Array.isArray(v) ? v : [];
}
export function writeDocs(list) {
  writeJson(DB_FILE, list, true);
}

export function readUsers() {
  const v = readJson(USERS_FILE, []);
  return Array.isArray(v) ? v : [];
}
export function writeUsers(list) {
  writeJson(USERS_FILE, list, true);
}

export function readSessions() {
  const v = readJson(SESSIONS_FILE, {});
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}
export function writeSessions(map) {
  writeJson(SESSIONS_FILE, map);
}

export function readPrefs() {
  const v = readJson(PREFS_FILE, {});
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}
export function writePrefs(map) {
  writeJson(PREFS_FILE, map);
}

/* 权限申请（按用户 / 文档聚合，独立文件，避免污染 docs.json） */
export function readAccessRequests() {
  const v = readJson(REQUESTS_FILE, []);
  return Array.isArray(v) ? v : [];
}
export function writeAccessRequests(list) {
  writeJson(REQUESTS_FILE, list, true);
}

/* 站内通知（轻量、只落给接收者；读时按 createdAt 倒序、最多保留 100 条） */
export function readNotifications() {
  const v = readJson(NOTIFICATIONS_FILE, []);
  return Array.isArray(v) ? v : [];
}
export function writeNotifications(list) {
  writeJson(NOTIFICATIONS_FILE, list, true);
}
/**
 * 给某用户追加一条通知（幂等去重：同一 docId + type + userId + 未读 不重复插入）
 * @param {string} userId   接收者
 * @param {object} n        通知内容（type / actorId / actorName / docId / docTitle / role / message）
 */
export function addNotification(userId, n) {
  if (!userId) return;
  const list = readNotifications();
  const dup = list.find(
    (x) =>
      !x.read &&
      x.userId === userId &&
      x.docId === n.docId &&
      x.type === n.type &&
      x.actorId === n.actorId
  );
  if (dup) return; // 避免同一人重复申请 / 重复操作时刷屏
  list.push({
    id: crypto.randomBytes(8).toString("hex"),
    userId,
    type: n.type,
    actorId: n.actorId || null,
    actorName: n.actorName || "",
    docId: n.docId || null,
    docTitle: n.docTitle || "",
    role: n.role || null,
    message: String(n.message || "").slice(0, 200),
    read: false,
    createdAt: new Date().toISOString(),
  });
  // 只保留最新 100 条，避免无限制增长
  writeNotifications(list.slice(-100));
}

/* ---------------- 密码 / 常量时间比较 ---------------- */
export function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(plain), salt, 64).toString("hex");
  return { salt, hash };
}

export function verifyPassword(plain, salt, hash) {
  try {
    const a = Buffer.from(crypto.scryptSync(String(plain), String(salt), 64).toString("hex"), "hex");
    const b = Buffer.from(String(hash), "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (_) {
    return false;
  }
}

export function safeEqual(a, b) {
  const ba = Buffer.from(String(a ?? ""));
  const bb = Buffer.from(String(b ?? ""));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/* ---------------- Cookie ---------------- */
export function parseCookies(req) {
  const h = req.headers.cookie || "";
  const out = {};
  h.split(";").forEach((kv) => {
    const i = kv.indexOf("=");
    if (i > 0) out[kv.slice(0, i).trim()] = decodeURIComponent(kv.slice(i + 1).trim());
  });
  return out;
}

/** 追加 Set-Cookie（不覆盖同请求里已下发的 xc_visitor 等 cookie） */
export function appendCookie(res, cookie) {
  const prev = res.getHeader("Set-Cookie");
  const arr = prev == null ? [] : Array.isArray(prev) ? prev.slice() : [String(prev)];
  arr.push(cookie);
  res.setHeader("Set-Cookie", arr);
}

export function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  const first = typeof fwd === "string" ? fwd.split(",")[0].trim() : "";
  return first || req.socket?.remoteAddress || "";
}

/* ---------------- 会话 ---------------- */
function pruneSessions(map) {
  const now = Date.now();
  let dirty = false;
  for (const t of Object.keys(map)) {
    if (!map[t] || !new Date(map[t].expiresAt).getTime() || new Date(map[t].expiresAt).getTime() <= now) {
      delete map[t];
      dirty = true;
    }
  }
  return dirty;
}

export function createSession(res, user, req) {
  const token = crypto.randomBytes(32).toString("base64url");
  const map = readSessions();
  pruneSessions(map);
  map[token] = {
    userId: user.id,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    ua: String(req.headers["user-agent"] || "").slice(0, 200),
    ip: clientIp(req),
  };
  writeSessions(map);
  // 生产经 8787 反代是 HTTP（未注入 x-forwarded-proto），绝不能设 Secure
  appendCookie(res, `xc_session=${token}; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; SameSite=Lax; HttpOnly`);
  return token;
}

export function revokeSession(req, res) {
  const token = parseCookies(req).xc_session;
  if (token) {
    const map = readSessions();
    delete map[token];
    writeSessions(map);
  }
  appendCookie(res, "xc_session=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly");
}

export function dropSessionsOf(userId) {
  const map = readSessions();
  let dirty = false;
  for (const t of Object.keys(map)) {
    if (map[t] && map[t].userId === userId) {
      delete map[t];
      dirty = true;
    }
  }
  if (dirty) writeSessions(map);
}

export function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    avatarColor: u.avatarColor,
    createdAt: u.createdAt,
  };
}

/**
 * 解析当前请求的用户：cookie 会话优先，其次 Bearer API Token（给外部脚本用）。
 * 会话过期 / 账号被停用都会返回 null（停用即时踢下线）。
 */
export function getSessionUser(req) {
  const users = readUsers();
  const byId = (id) => users.find((u) => u.id === id);

  const token = parseCookies(req).xc_session;
  if (token) {
    const map = readSessions();
    const s = map[token];
    if (s && new Date(s.expiresAt).getTime() > Date.now()) {
      const u = byId(s.userId);
      if (u && !u.disabled) return publicUser(u);
    }
  }

  const auth = String(req.headers.authorization || "");
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const apiToken = process.env.XUECHENG_API_TOKEN || "";
  if (m && apiToken && safeEqual(m[1], apiToken)) {
    const admin = users.find((u) => u.role === "admin" && !u.disabled);
    if (admin) return publicUser(admin);
  }
  return null;
}

/** 公开白名单：未登录也放行的 /api 路由。其余一律要求会话。 */
export function isPublicRoute(method, route) {
  if (route === "/api/health") return true;
  // logout / password 不在白名单，顶层钩子会强制要求会话
  if (/^\/api\/auth\/(me|login|register|bootstrap-status)$/.test(route)) return true;
  if (/^\/api\/share\/[A-Za-z0-9_-]+$/.test(route) && method === "GET") return true;
  if (/^\/api\/share\/[A-Za-z0-9_-]+\/stats$/.test(route) && method === "GET") return true;
  if (/^\/api\/share\/[A-Za-z0-9_-]+\/heartbeat$/.test(route) && method === "POST") return true;
  if (/^\/api\/share\/[A-Za-z0-9_-]+\/interactions$/.test(route) && (method === "GET" || method === "POST")) return true;
  // 分享页在线头像：匿名访客也要能上报心跳 / 主动离开
  if (/^\/api\/share\/[A-Za-z0-9_-]+\/presence$/.test(route) && (method === "POST" || method === "DELETE")) return true;
  return false;
}

/* ---------------- 登录失败弱限流（IP 可伪造，仅作弱防护） ---------------- */
const loginFails = new Map();
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_FAILS = 5;

export function loginBlocked(key) {
  const rec = loginFails.get(key);
  if (!rec) return false;
  if (Date.now() - rec.first > LOGIN_WINDOW_MS) {
    loginFails.delete(key);
    return false;
  }
  return rec.count >= LOGIN_MAX_FAILS;
}
export function noteLoginFail(key) {
  const rec = loginFails.get(key);
  if (!rec || Date.now() - rec.first > LOGIN_WINDOW_MS) loginFails.set(key, { count: 1, first: Date.now() });
  else rec.count += 1;
}
export function clearLoginFail(key) {
  loginFails.delete(key);
}

/* ---------------- 账号操作 ---------------- */
function pickColor(seed) {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function bootstrapStatus() {
  const users = readUsers();
  return {
    initialized: users.length > 0,
    needBootstrapCode: users.length === 0,
    bootstrapConfigured: !!process.env.XUECHENG_BOOTSTRAP_CODE,
  };
}

/** 返回 { user } 或 { error, status } */
export function registerUser(body) {
  const users = readUsers();
  const username = String(body?.username || "").trim();
  const password = String(body?.password || "");
  const displayName = String(body?.displayName || "").trim().slice(0, 40) || username;

  if (!/^[A-Za-z0-9_.-]{3,30}$/.test(username)) return { error: "用户名需 3-30 位字母、数字、_ . -", status: 400 };
  if (password.length < 8 || password.length > 128) return { error: "密码长度需 8-128 位", status: 400 };
  if (users.some((u) => String(u.username).toLowerCase() === username.toLowerCase())) {
    return { error: "用户名已被注册", status: 409 };
  }

  // 空库期（首个账号 = bootstrap admin）必须提供引导码，未配置则不放行，避免公网抢注
  if (users.length === 0) {
    const code = process.env.XUECHENG_BOOTSTRAP_CODE || "";
    if (!code) return { error: "管理员尚未初始化：请先在服务器配置 XUECHENG_BOOTSTRAP_CODE 或运行 bootstrap.js", status: 403 };
    if (!safeEqual(body?.bootstrapCode, code)) return { error: "引导码不正确", status: 403 };
  }

  const { salt, hash } = hashPassword(password);
  const isFirst = users.length === 0;
  const user = {
    id: crypto.randomBytes(6).toString("hex"),
    username,
    displayName,
    salt,
    hash,
    role: isFirst ? "admin" : "user",
    avatarColor: pickColor(username),
    createdAt: new Date().toISOString(),
    disabled: false,
  };
  users.push(user);
  writeUsers(users);
  if (isFirst) migrateLegacyDocs(user.id); // 0→1 时接管历史文档
  return { user: publicUser(user) };
}

export function loginUser(body) {
  const username = String(body?.username || "").trim();
  const password = String(body?.password || "");
  const u = readUsers().find((x) => String(x.username).toLowerCase() === username.toLowerCase());
  if (!u || !verifyPassword(password, u.salt, u.hash)) return { error: "用户名或密码错误", status: 401 };
  if (u.disabled) return { error: "账号已被停用", status: 403 };
  return { user: publicUser(u) };
}

export function changePassword(userId, oldPwd, newPwd) {
  const users = readUsers();
  const u = users.find((x) => x.id === userId);
  if (!u) return { error: "账号不存在", status: 404 };
  if (!verifyPassword(oldPwd, u.salt, u.hash)) return { error: "原密码不正确", status: 400 };
  if (String(newPwd || "").length < 8 || String(newPwd || "").length > 128) {
    return { error: "新密码长度需 8-128 位", status: 400 };
  }
  const { salt, hash } = hashPassword(newPwd);
  u.salt = salt;
  u.hash = hash;
  writeUsers(users);
  dropSessionsOf(userId); // 改密后所有会话失效；调用方（index.js）会为当前请求补发新会话
  return { user: publicUser(u) };
}

/**
 * 用户列表。两种用途：
 *  - 权限面板「搜索成员」：默认行为，只回未停用账号的最小投影（不泄露角色/状态）
 *  - 管理员「用户管理」：includeDisabled + withRole，能看到停用账号并重新启用
 * includeDisabled 时不再套 10 条上限（管理员要看到全部账号）。
 */
export function listUsers(q, { includeDisabled = false, withRole = false } = {}) {
  const needle = String(q || "").trim().toLowerCase();
  const matched = readUsers().filter(
    (u) =>
      (includeDisabled || !u.disabled) &&
      (!needle || String(u.username).toLowerCase().includes(needle) || String(u.displayName).toLowerCase().includes(needle))
  );
  const rows = includeDisabled ? matched : matched.slice(0, 10);
  return rows.map((u) => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarColor: u.avatarColor,
    ...(withRole ? { role: u.role || "user", disabled: !!u.disabled, createdAt: u.createdAt || null } : {}),
  }));
}

/** 按 id 批量取用户投影（权限面板展示成员列表用，不走搜索的 10 条上限） */
export function publicUsersByIds(ids) {
  const wanted = new Set((Array.isArray(ids) ? ids : []).map(String));
  return readUsers()
    .filter((u) => wanted.has(u.id))
    .map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      avatarColor: u.avatarColor,
      disabled: !!u.disabled,
    }));
}

export function setUserDisabled(id, disabled, operatorId) {
  if (id === operatorId) return { error: "不能停用/启用自己的账号", status: 400 };
  const users = readUsers();
  const u = users.find((x) => x.id === id);
  if (!u) return { error: "用户不存在", status: 404 };
  u.disabled = !!disabled;
  writeUsers(users);
  if (disabled) dropSessionsOf(id);
  return { user: publicUser(u) };
}

/** 活跃管理员数量（防止把系统锁成「无管理员」状态） */
function activeAdminCount(users) {
  return users.filter((x) => x.role === "admin" && !x.disabled).length;
}

/** 管理员调整角色：不能改自己，不能降级唯一管理员 */
export function setUserRole(id, role, operatorId) {
  if (id === operatorId) return { error: "不能修改自己的角色", status: 400 };
  if (role !== "admin" && role !== "user") return { error: "角色只能是 admin 或 user", status: 400 };
  const users = readUsers();
  const u = users.find((x) => x.id === id);
  if (!u) return { error: "用户不存在", status: 404 };
  if (u.role === "admin" && role !== "admin" && activeAdminCount(users) <= 1) {
    return { error: "不能降级唯一的管理员", status: 400 };
  }
  u.role = role;
  writeUsers(users);
  return { user: publicUser(u) };
}

/**
 * 管理员删除账号：不能删自己 / 唯一管理员。
 * 其名下文档归属转交操作者（避免产生无主文档），并清理 ACL 成员引用、偏好与会话。
 * 注意：文档内容一律保留，删除账号不等于删除文档。
 */
export function deleteUser(id, operatorId) {
  if (id === operatorId) return { error: "不能删除自己的账号", status: 400 };
  const users = readUsers();
  const u = users.find((x) => x.id === id);
  if (!u) return { error: "用户不存在", status: 404 };
  if (u.role === "admin" && !u.disabled && activeAdminCount(users) <= 1) {
    return { error: "不能删除唯一的管理员", status: 400 };
  }

  const docs = readDocs();
  let transferred = 0;
  let aclDirty = false;
  for (const d of docs) {
    if (d.ownerId === id) { d.ownerId = operatorId; transferred += 1; }
    const m = d.acl && d.acl.members;
    if (m && Object.prototype.hasOwnProperty.call(m, id)) { delete m[id]; aclDirty = true; }
  }
  if (transferred || aclDirty) writeDocs(docs);

  const prefs = readPrefs();
  if (prefs[id]) { delete prefs[id]; writePrefs(prefs); }
  const reqs = readAccessRequests().filter((r) => r.userId !== id);
  writeAccessRequests(reqs);
  dropSessionsOf(id);
  writeUsers(users.filter((x) => x.id !== id));
  return { transferredDocs: transferred };
}

/** 管理员重置任意账号密码：会让该账号所有会话失效 */
export function resetUserPassword(id, newPassword) {
  const pwd = String(newPassword || "");
  if (pwd.length < 8 || pwd.length > 128) return { error: "密码长度需 8-128 位", status: 400 };
  const users = readUsers();
  const u = users.find((x) => x.id === id);
  if (!u) return { error: "用户不存在", status: 404 };
  const { salt, hash } = hashPassword(pwd);
  u.salt = salt;
  u.hash = hash;
  writeUsers(users);
  dropSessionsOf(id);
  return { user: publicUser(u) };
}

export function findAdmin() {
  return readUsers().find((u) => u.role === "admin" && !u.disabled) || null;
}

/* ---------------- 个人偏好（按用户隔离） ---------------- */
/**
 * 把 favorite/pinned/pinnedAt/lastVisitedAt 从 prefs.json 合并进返回的文档投影。
 * prefs 可预先读入后传入，避免列表循环里反复读盘。
 */
export function mergePrefsInto(proj, uid, docId, prefs = readPrefs()) {
  const p = prefs[uid] && prefs[uid][docId];
  proj.favorite = !!(p && p.favorite);
  proj.pinned = !!(p && p.pinned);
  proj.pinnedAt = p ? p.pinnedAt || null : null;
  proj.lastVisitedAt = p ? p.lastVisitedAt || null : null;
  return proj;
}

export function writePrefFor(uid, docId, patch) {
  const prefs = readPrefs();
  if (!prefs[uid]) prefs[uid] = {};
  const cur = prefs[uid][docId] || { favorite: false, pinned: false, pinnedAt: null, lastVisitedAt: null };
  for (const k of PREF_KEYS) if (Object.prototype.hasOwnProperty.call(patch, k)) cur[k] = patch[k];
  prefs[uid][docId] = cur;
  writePrefs(prefs);
  return cur;
}

export function clearPrefsForDoc(docId) {
  const prefs = readPrefs();
  let dirty = false;
  for (const uid of Object.keys(prefs)) {
    if (prefs[uid] && Object.prototype.hasOwnProperty.call(prefs[uid], docId)) {
      delete prefs[uid][docId];
      dirty = true;
    }
  }
  if (dirty) writePrefs(prefs);
}

/* ---------------- 文档 ACL ----------------
   两级开关共同决定「目录权限是否下发到子文档」：
     inherit    （子视角）本页是否接受父文档的权限，默认 true
     propagate  （父视角）本页权限是否应用到子文档，默认 true（兼容历史继承链）
   只有两者同时为 true，子文档才递归取父的有效 ACL；任一为 false 即用自身 ACL。
   这样「在文档加权限只作用于单文档」，而「在目录加权限可勾选是否下发」。 */
export function normalizeAcl(doc) {
  const a = doc && doc.acl && typeof doc.acl === "object" ? doc.acl : {};
  const visibility = ["private", "logged-in", "link"].includes(a.visibility) ? a.visibility : "private";
  const members = {};
  if (a.members && typeof a.members === "object") {
    for (const [uid, role] of Object.entries(a.members)) {
      if (ACL_ROLES.includes(role)) members[uid] = role;
    }
  }
  return {
    visibility,
    members,
    inherit: a.inherit !== false,
    propagate: a.propagate !== false,
  };
}

/** 权限链的源头文档：从 doc 沿 parent 链向上，直到不再继承为止。 */
export function aclSource(doc, list) {
  let cur = doc;
  const seen = new Set();
  let depth = 0;
  while (cur && depth < MAX_ACL_DEPTH && !seen.has(cur.id)) {
    seen.add(cur.id);
    const own = normalizeAcl(cur);
    if (own.inherit === false || !cur.parentId) break;
    const parent = list.find((d) => d.id === cur.parentId);
    if (!parent || normalizeAcl(parent).propagate === false) break;
    cur = parent;
    depth += 1;
  }
  return cur || doc;
}

/** 读时计算有效 ACL：子继承 + 父下发同时成立才递归取父；防环 / 孤儿 / 超深度退回自身。 */
export function effectiveAcl(doc, list, seen = new Set(), depth = 0) {
  const own = normalizeAcl(doc);
  if (depth >= MAX_ACL_DEPTH || seen.has(doc.id)) return own;
  seen.add(doc.id);
  if (own.inherit === false || !doc.parentId) return own;
  const parent = list.find((d) => d.id === doc.parentId);
  if (!parent || normalizeAcl(parent).propagate === false) return own;
  return effectiveAcl(parent, list, seen, depth + 1);
}

/** 有效所有者：与 effectiveAcl 同链，保证继承子文档归父所有者管理。 */
export function effectiveOwner(doc, list) {
  return aclSource(doc, list)?.ownerId || null;
}

/** 某用户对文档的有效角色：owner / manager / editor / viewer / null */
export function roleOf(user, doc, list) {
  if (!user || !doc) return null;
  if (effectiveOwner(doc, list) === user.id) return "owner";
  return effectiveAcl(doc, list).members[user.id] || null;
}

/* 三个判定函数体内完全不出现 role —— 系统管理员不越权访问他人私有文档 */
export function canManage(user, doc, list) {
  const r = roleOf(user, doc, list);
  return r === "owner" || r === "manager";
}

export function canEdit(user, doc, list) {
  const r = roleOf(user, doc, list);
  return r === "owner" || r === "manager" || r === "editor";
}

export function canView(user, doc, list) {
  if (!user || !doc) return false;
  const r = roleOf(user, doc, list);
  if (r) return true;
  // "link" 视为 "logged-in" 的超集：登录用户不该反而看不到公开链接文档
  const v = effectiveAcl(doc, list).visibility;
  return v === "logged-in" || v === "link";
}

/** 规范化前端提交的 acl（丢弃非法值、只保留存在的用户） */
export function sanitizeAcl(input) {
  const src = input && typeof input === "object" ? input : {};
  const acl = normalizeAcl({ acl: src });
  const users = readUsers();
  const members = {};
  if (src.members && typeof src.members === "object") {
    for (const [uid, role] of Object.entries(src.members)) {
      if (ACL_ROLES.includes(role) && users.some((u) => u.id === uid && !u.disabled)) {
        members[uid] = role;
      }
    }
  }
  acl.members = members;
  return acl;
}

/* ---------------- 历史数据迁移 ---------------- */
/**
 * 首个注册者（bootstrap admin）接管全部无主文档。
 * - visibility 一律 private：历史文档默认只对所有者可见，符合「人人平等」
 * - share 原样保留、token 不变；历史链接靠「独立能力令牌」继续有效
 *   （token 端点只校验 share.enabled，与 visibility 完全解耦，无需设 link）
 * - docs.json 里的旧偏好字段「复制」进 prefs，但不删除（回滚时旧代码仍能跑）
 * - 纯增量字段，幂等，可重复调用
 */
export function migrateLegacyDocs(adminUid) {
  const list = readDocs();
  const prefs = readPrefs();
  if (!prefs[adminUid]) prefs[adminUid] = {};
  let changed = false;
  for (const d of list) {
    if (d.ownerId == null) {
      d.ownerId = adminUid;
      d.acl = { visibility: "private", members: {}, inherit: true, propagate: true };
      prefs[adminUid][d.id] = {
        favorite: !!d.favorite,
        pinned: !!d.pinned,
        pinnedAt: d.pinnedAt || null,
        lastVisitedAt: d.lastVisitedAt || null,
      };
      changed = true;
    }
  }
  if (changed) {
    writeDocs(list);
    writePrefs(prefs);
  }
  return changed;
}

/** 启动时兜底：users 已存在但 docs.json 后来被恢复/新增了无主文档 */
export function reconcileOwners() {
  const admin = findAdmin();
  if (admin) return migrateLegacyDocs(admin.id);
  return false;
}
