// 学城编辑器 · API 处理（Workers 版；逻辑来自仓库 index.js，存储走 context.js）
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

const PREFIX = "/editor";
const MAX_BODY = 20 * 1024 * 1024; // 20MB，够放 base64 图片

/* 图床：巡回寺 API 的公开上传接口（无需 Key）。
   - 图片只存图床，不落本机磁盘；失败返回 502，不静默降级
   - XUECHENG_IMAGE_HOST 可整体替换 endpoint
   - XUECHENG_IMAGE_HOST_TIMEOUT 控制超时（默认 30s） */
const IMAGE_HOST_URL =
  ENV.XUECHENG_IMAGE_HOST || "https://api.xunhuisi.store/API/Tuchuang/Tc.php";
const IMAGE_HOST_TIMEOUT = Number(ENV.XUECHENG_IMAGE_HOST_TIMEOUT || 30000);

// FILES_DIR 不再主动创建：/files/* 仅作只读兼容（旧备份里的图片），新上传不会写入

// MCP 工具依赖本地子进程，Cloudflare Workers 不支持；以桩优雅降级。
const mcp = {
  list: () => [],
  find: () => null,
  add: () => { throw new Error("MCP 工具在 Cloudflare Workers 上不可用"); },
  connect: async () => {},
  disconnect: async () => {},
  update: () => {},
  remove: async () => {},
  callTool: async () => { throw new Error("MCP 工具在 Cloudflare Workers 上不可用"); },
};

/* ---------------- 存储 ----------------
   docs.json 的读写统一由 auth.js 提供（readDocs/writeDocs 已别名为 readDb/writeDb），
   这样「首个注册者迁移历史文档」「离线 bootstrap」与在线服务只有一份实现。 */

/* 自建模板（用户把某篇文档存成模板），与文档库分离存放 */


/* 分享访问统计：匿名访客明细单独存盘，避免污染 docs.json / 减小写压力
   结构：{ [token]: [ { id, ip, device, browser, os, firstAt, lastActiveAt, count } ] } */
const VISITOR_TTL = 5 * 60 * 1000; // 在线判定窗口：5 分钟内有活动算「正在浏览」
const MAX_VISITORS_PER_DOC = 500; // 单篇最多保留的访客明细条数



/* ---------------- 回收站 ----------------
   一次删除（含级联子孙）记为一个批次，保存完整文档快照与关联数据，
   因此恢复后正文、父子关系、分享链接、投票数据、个人偏好都能原样回来。
   结构：{ batches: [ { id, deletedAt, deletedBy, ownerId, rootId, rootTitle,
                        docs:[...], interactions:{}, visitors:{}, prefs:{} } ] } */


/** 批次投影：列表接口不回完整正文，减小响应体积 */
function trashBatchView(b) {
  return {
    id: b.id,
    deletedAt: b.deletedAt,
    deletedBy: b.deletedBy || null,
    ownerId: b.ownerId || null,
    rootId: b.rootId,
    rootTitle: b.rootTitle,
    count: (b.docs || []).length,
    titles: (b.docs || []).map((d) => d.title || "未命名文档").slice(0, 8),
    hasShare: (b.docs || []).some((d) => d.share && d.share.enabled),
  };
}

/* ---------------- 互动数据（投票 / 问卷） ----------------
   结构：{ [docId]: { [blockId]: { type, voters?:{optId:[vid]}, responses?:[{id,vid,answers,ts}] } } }
   与文档分离存储：避免污染 docs.json / 减小写压力；按 xc_visitor 匿名身份去重。 */



/** 计算某个互动块的聚合数据（poll / survey） */
function tallyFor(docId, blockId, visitorId, detail) {
  const map = readInteractions();
  const blk = map[docId] && map[docId][blockId];
  if (!blk) {
    return blk && blk.type === "survey"
      ? { type: "survey", submitted: false, total: 0 }
      : { type: "poll", counts: {}, total: 0, myVote: null };
  }
  if (blk.type === "poll") {
    const counts = {};
    let total = 0;
    let myVote = null;
    for (const optId of Object.keys(blk.voters || {})) {
      const vids = blk.voters[optId] || [];
      counts[optId] = vids.length;
      total += vids.length;
      if (vids.includes(visitorId)) myVote = optId;
    }
    return { type: "poll", counts, total, myVote };
  }
  // survey
  const responses = blk.responses || [];
  const submitted = responses.some((r) => r.vid === visitorId);
  const out = { type: "survey", submitted, total: responses.length };
  if (detail) out.responses = responses;
  return out;
}

const nowISO = () => new Date().toISOString();
const newId = () => rndHex(6);

/** 从 ProseMirror JSON 提取纯文本摘要（列表接口给卡片预览用，避免回传整篇正文） */
function excerptOf(content, max = 120) {
  if (!content) return "";
  let s = "";
  const walk = (nd) => {
    if (!nd || s.length >= max) return;
    if (typeof nd === "string") {
      s += nd;
      return;
    }
    if (Array.isArray(nd)) {
      nd.forEach(walk);
      return;
    }
    if (nd.type === "text") s += nd.text || "";
    else if (nd.content) walk(nd.content);
  };
  if (content.content) walk(content.content);
  return s.replace(/\s+/g, " ").trim().slice(0, max);
}

/* ---------------- 分享访问统计（匿名访客追踪） ---------------- */

/** 解析 Cookie（零依赖） */
function parseCookies(req) {
  const h = req.headers.cookie || "";
  const out = {};
  h.split(";").forEach((kv) => {
    const i = kv.indexOf("=");
    if (i > 0) out[kv.slice(0, i).trim()] = decodeURIComponent(kv.slice(i + 1).trim());
  });
  return out;
}

/** 取/发匿名访客 ID（cookie 持久化，前端无需读取） */
function getVisitorId(req, res) {
  const c = parseCookies(req);
  let id = c.xc_visitor;
  if (!id || id.length < 8) {
    id = rndB64(16);
    // appendCookie 而非 setHeader：同一请求里可能已下发了 xc_session，不能被覆盖
    appendCookie(res, `xc_visitor=${id}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly`);
  }
  return id;
}

/** 取真实 IP（兼容反代 x-forwarded-for） */
function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim();
  return req.socket?.remoteAddress || "0.0.0.0";
}

/** IP 脱敏：仅保留前两段网段，避免精确到主机 */
function maskIp(ip) {
  const v = String(ip || "").replace(/^::ffff:/, "").split(".");
  if (v.length === 4) return `${v[0]}.${v[1]}.*.*`;
  return "未知";
}

/** 轻量 UA 解析：设备 / 浏览器 / 系统（零依赖，覆盖常见场景） */
function parseUa(ua) {
  ua = String(ua || "");
  let device = "桌面";
  if (/iPhone|Android.*Mobile|MicroMessenger|Mobile/i.test(ua)) device = "手机";
  else if (/iPad|Android(?!.*Mobile)|Tablet/i.test(ua)) device = "平板";
  let browser = "其他";
  if (/MicroMessenger/i.test(ua)) browser = "微信";
  else if (/DingTalk/i.test(ua)) browser = "钉钉";
  else if (/Feishu|Lark/i.test(ua)) browser = "飞书";
  else if (/Weibo/i.test(ua)) browser = "微博";
  else if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua)) browser = "Safari";
  let os = "未知";
  if (/iPhone|iPad|Mac OS|Macintosh/i.test(ua)) os = "Apple";
  else if (/Windows/i.test(ua)) os = "Windows";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Linux/i.test(ua)) os = "Linux";
  return { device, browser, os };
}

/** 触达访客明细：更新/新增一条访客记录。countVisit=true 时累加访问次数并刷新文档计数 */
function touchVisitor(token, req, res, { countVisit = false } = {}) {
  const id = getVisitorId(req, res);
  const ip = maskIp(clientIp(req));
  const ua = parseUa(req.headers["user-agent"]);
  const now = nowISO();
  const map = readVisitors();
  const list = (map[token] = map[token] || []);
  let rec = list.find((v) => v.id === id);
  if (rec) {
    rec.lastActiveAt = now;
    rec.ip = ip;
    rec.browser = ua.browser;
    rec.os = ua.os;
    rec.device = ua.device;
    if (countVisit) rec.count += 1;
  } else {
    rec = { id, ip, device: ua.device, browser: ua.browser, os: ua.os, firstAt: now, lastActiveAt: now, count: 1 };
    list.push(rec);
  }
  // 限制单篇明细条数：按活跃时间保留最近 MAX_VISITORS_PER_DOC 条
  if (list.length > MAX_VISITORS_PER_DOC) {
    list.sort((a, b) => new Date(a.lastActiveAt) - new Date(b.lastActiveAt));
    list.splice(0, list.length - MAX_VISITORS_PER_DOC);
  }
  writeVisitors(map);
  if (countVisit) {
    const db = readDb();
    const idx = db.findIndex((d) => d.share && d.share.enabled && d.share.token === token);
    if (idx >= 0) {
      db[idx].share.views = (db[idx].share.views || 0) + 1;
      db[idx].share.visitors = list.length; // 去重人数
      writeDb(db);
    }
  }
  return rec;
}

/** 计算统计指标 */
function computeStats(token) {
  const map = readVisitors();
  const list = map[token] || [];
  const nowMs = Date.now();
  const online = list.filter((v) => nowMs - new Date(v.lastActiveAt).getTime() <= VISITOR_TTL).length;
  // 按天聚合（最近 14 天）
  const days = {};
  for (const v of list) {
    const day = v.lastActiveAt.slice(0, 10);
    days[day] = (days[day] || 0) + v.count;
  }
  const daily = Object.keys(days)
    .sort()
    .slice(-14)
    .map((d) => ({ date: d, count: days[d] }));
  const recent = [...list]
    .sort((a, b) => new Date(b.lastActiveAt) - new Date(a.lastActiveAt))
    .slice(0, 20)
    .map((v) => ({
      device: v.device,
      browser: v.browser,
      os: v.os,
      ip: v.ip,
      firstAt: v.firstAt,
      lastActiveAt: v.lastActiveAt,
      count: v.count,
    }));
  return { online, unique: list.length, daily, recent };
}

/* ---------------- 在线协作者（presence） ----------------
   顶栏「正在看的人」头像组的数据源。内存态按文档聚合：
   - 登录用户按 userId 去重（同人多标签只算一个人）
   - 匿名访客按 xc_visitor 去重，且只回传数量，不泄露访客标识
   - 文档页与分享页共用同一份 map，因此两边能互相看到对方
   TTL 40s、前端 15s 心跳；服务重启自动清空，在线状态无需落盘。 */
const PRESENCE_TTL = 40 * 1000;


function presenceIdentity(req, res, user) {
  if (user) {
    const name = user.displayName || user.username || "?";
    return {
      key: "u:" + user.id,
      kind: "user",
      id: user.id,
      name,
      color: user.avatarColor || "#1668dc",
      initial: name.slice(0, 1).toUpperCase(),
      role: user.role || "member",
    };
  }
  return {
    key: "v:" + getVisitorId(req, res),
    kind: "guest",
    id: null,
    name: "访客",
    color: "#8f959e",
    initial: "访",
    role: "",
  };
}

/** 回收过期条目，返回仍有效的 map（空则顺手删掉，避免内存里堆空桶） */
function presenceStore(docId) {
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

/* ---------------- HTTP 工具 ---------------- */
function json(res, status, data, message = "ok") {
  res.status = status;
  res.body = { code: status === 200 ? 0 : status, message, data };
  return res;
}

/** 从请求 URL 解析 query（handleApi 内无外层 parsed 作用域时复用） */
function getDetail(req) {
  try {
    return new URL(req.url, "http://localhost").searchParams;
  } catch (_) {
    return new URLSearchParams();
  }
}

async function readBody(req) {
  try {
    const text = await req.__request.text();
    if (!text) return null;
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

/* 静态资源传输压缩
   ------------------------------------------------------------------
   3Mbps 固定带宽下，未压缩的 JS/CSS 是首屏最大瓶颈。按客户端 Accept-Encoding
   返回 brotli（优先）或 gzip，压缩结果按「路径 + mtime + 编码」缓存在内存中，
   服务长驻进程只对每个版本的文件压缩一次。文件名带内容 hash，版本更新时
   mtime 变化会自动失效，缓存上限 64 条避免无限增长。 */
const COMPRESSIBLE = new Set([".js", ".css", ".html", ".json", ".svg", ".txt", ".map"]);
const compressedCache = new Map();





function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

/**
 * 分享页 HTML：把文章标题/摘要注入到 <title> 与 Open Graph 标签里。
 * IM（微信/钉钉/飞书）/爬虫只抓取静态 HTML、不执行 JS，只有服务端把真实
 * 标题写进 HTML，粘贴链接时预览卡片才会显示文章标题而不是默认的「学城 · 文档编辑器」。
 */


/* ---------------- 路由 ---------------- */

/**
 * 投票 / 问卷读写的共享实现：按内部 docId 存取。
 * 登录态与公开分享页共用这一份逻辑，但分享页永远不把 docId 回给客户端，
 * 且 detailAllowed=false 强制忽略 ?detail=1（问卷原始回答不能匿名获取）。
 */
async function handleInteractions(req, res, method, docId, { detailAllowed = true } = {}) {
  const detailOf = () => detailAllowed && getDetail(req).get("detail") === "1";

  if (method === "GET") {
    const visitorId = getVisitorId(req, res);
    const blocks = readInteractions()[docId] || {};
    const out = {};
    for (const blockId of Object.keys(blocks)) {
      out[blockId] = tallyFor(docId, blockId, visitorId, detailOf());
    }
    return json(res, 200, out);
  }

  if (method === "POST") {
    const visitorId = getVisitorId(req, res);
    const body = (await readBody(req)) || {};
    const blockId = String(body.blockId || "").slice(0, 40);
    const type = body.type === "survey" ? "survey" : "poll";
    if (!blockId) return json(res, 400, null, "缺少 blockId");
    const map = readInteractions();
    if (!map[docId]) map[docId] = {};
    if (!map[docId][blockId]) map[docId][blockId] = { type, voters: {}, responses: [] };
    const blk = map[docId][blockId];
    blk.type = type;

    if (type === "poll") {
      if (body.action !== "vote" || !body.vote) return json(res, 400, null, "投票缺少选项");
      const vote = String(body.vote).slice(0, 40);
      // 迁移该访客在本块其它选项的旧票到新选项（允许改票，且天然去重）
      for (const optId of Object.keys(blk.voters || {})) {
        const vids = (blk.voters[optId] = (blk.voters[optId] || []).filter((v) => v !== visitorId));
        if (vids.length === 0 && optId !== vote) delete blk.voters[optId];
      }
      if (!blk.voters[vote]) blk.voters[vote] = [];
      if (!blk.voters[vote].includes(visitorId)) blk.voters[vote].push(visitorId);
    } else {
      if (body.action !== "submit") return json(res, 400, null, "问卷缺少 submit 动作");
      if ((blk.responses || []).some((r) => r.vid === visitorId)) {
        return json(res, 409, null, "你已提交过该问卷");
      }
      if (!blk.responses) blk.responses = [];
      blk.responses.push({
        id: newId(),
        vid: visitorId,
        answers: body.answers && typeof body.answers === "object" ? body.answers : {},
        ts: nowISO(),
      });
    }
    writeInteractions(map);
    return json(res, 200, tallyFor(docId, blockId, visitorId, detailOf()));
  }
  return json(res, 405, null, "方法不允许");
}

/** MCP 全局配置只有 admin 能改（普通用户仍可 list / call 已批准的工具） */
function requireAdmin(user, res) {
  if (user && user.role === "admin") return true;
  json(res, 403, null, "仅管理员可管理 MCP 服务");
  return false;
}

async function handleApi(req, res, route) {
  const method = req.method;

  /* ===== 统一鉴权钩子（唯一真相）=====
     白名单之外的所有 /api/* 一律要求会话或 Bearer API Token。
     放在任何业务分支之前，避免逐分支补漏。非 /api 路径不经过这里，
     保证登录页 / 分享页的静态资源与 SPA 入口可以匿名加载。 */
  const user = getSessionUser(req);
  if (!isPublicRoute(method, route) && !user) {
    return json(res, 401, null, "请先登录");
  }

  if (route === "/api/health") {
    return json(res, 200, { ok: true, docs: readDb().length, uptime: Math.round(process.uptime()) });
  }

  /* ---------------- 账号 / 会话 ----------------
     开放注册：users 为空时首个账号需引导码（或由 bootstrap.js 离线创建），
     之后任何人可自助注册、无需码，且权限完全平等。 */
  if (route === "/api/auth/bootstrap-status" && method === "GET") {
    return json(res, 200, bootstrapStatus());
  }

  if (route === "/api/auth/me" && method === "GET") {
    // 「查询当前身份」本身就是匿名可调用的：未登录返回 200 + null，
    // 避免登录页 / 分享页每次首屏探测都在浏览器 console 留一条 401 噪音。
    // 真正需要身份的接口仍由顶层钩子统一 401 拦截。
    if (!user) return json(res, 200, null);
    return json(res, 200, { ...user, canManageMcp: user.role === "admin" });
  }

  if (route === "/api/auth/register" && method === "POST") {
    const body = (await readBody(req)) || {};
    const r = await registerUser(body);
    if (r.error) return json(res, r.status || 400, null, r.error);
    createUserSession(res, r.user, req);
    return json(res, 200, r.user);
  }

  if (route === "/api/auth/login" && method === "POST") {
    const body = (await readBody(req)) || {};
    const key = clientIp(req) + "|" + String(body.username || "").toLowerCase();
    if (loginBlocked(key)) return json(res, 429, null, "尝试过于频繁，请 10 分钟后再试");
    const r = await loginUser(body);
    if (r.error) {
      noteLoginFail(key);
      return json(res, r.status || 401, null, r.error);
    }
    clearLoginFail(key);
    createUserSession(res, r.user, req);
    return json(res, 200, r.user);
  }

  if (route === "/api/auth/logout" && method === "POST") {
    revokeSession(req, res);
    return json(res, 200, { ok: true });
  }

  if (route === "/api/auth/password" && method === "POST") {
    const body = (await readBody(req)) || {};
    const r = await changePassword(user.id, body.oldPassword, body.newPassword);
    if (r.error) return json(res, r.status || 400, null, r.error);
    // changePassword 会让该用户所有会话失效（含当前），这里为当前请求补发新会话
    createUserSession(res, r.user, req);
    return json(res, 200, { ok: true });
  }

  if (route === "/api/users" && method === "GET") {
    // 权限面板的成员搜索只回最小投影；管理员的「用户管理」额外看到停用账号与角色
    const isAdmin = !!user && user.role === "admin";
    return json(res, 200, listUsers(getDetail(req).get("q"), { includeDisabled: isAdmin, withRole: isAdmin }));
  }

  const userM = route.match(/^\/api\/users\/([A-Za-z0-9_-]+)\/(disable|enable)$/);
  if (userM && method === "POST") {
    if (!requireAdmin(user, res)) return;
    const r = setUserDisabled(userM[1], userM[2] === "disable", user.id);
    if (r.error) return json(res, r.status || 400, null, r.error);
    return json(res, 200, { id: userM[1], disabled: userM[2] === "disable" });
  }

  const roleM = route.match(/^\/api\/users\/([A-Za-z0-9_-]+)\/role$/);
  if (roleM && method === "POST") {
    if (!requireAdmin(user, res)) return;
    const body = (await readBody(req)) || {};
    const r = setUserRole(roleM[1], body.role, user.id);
    if (r.error) return json(res, r.status || 400, null, r.error);
    return json(res, 200, { id: roleM[1], role: r.user.role });
  }

  const resetPwM = route.match(/^\/api\/users\/([A-Za-z0-9_-]+)\/reset-password$/);
  if (resetPwM && method === "POST") {
    if (!requireAdmin(user, res)) return;
    const body = (await readBody(req)) || {};
    const r = await resetUserPassword(resetPwM[1], body.newPassword);
    if (r.error) return json(res, r.status || 400, null, r.error);
    return json(res, 200, { id: resetPwM[1], reset: true });
  }

  const userDelM = route.match(/^\/api\/users\/([A-Za-z0-9_-]+)$/);
  if (userDelM && method === "DELETE") {
    if (!requireAdmin(user, res)) return;
    const r = deleteUser(userDelM[1], user.id);
    if (r.error) return json(res, r.status || 400, null, r.error);
    // 被删账号名下回收站批次一并转交，避免变成谁都恢复不了的孤儿记录
    const trash = readTrash();
    let tDirty = false;
    for (const b of trash.batches) {
      if (b.ownerId === userDelM[1]) { b.ownerId = user.id; tDirty = true; }
    }
    if (tDirty) writeTrash(trash);
    return json(res, 200, { id: userDelM[1], deleted: true, transferredDocs: r.transferredDocs });
  }

  /* ---------------- 回收站（软删除 / 恢复 / 彻底删除） ----------------
     鉴权只看批次 ownerId：删除时已逐篇复核 canManage，因此批次内文档都属同一人。
     管理员也不能恢复他人的批次，保持「admin 不越权看私有文档」的约定。 */
  if (route === "/api/trash" && method === "GET") {
    const all = readTrash().batches;
    const batches = all.filter((b) => b.ownerId === user.id).map(trashBatchView);
    return json(res, 200, { batches, total: batches.length });
  }

  if (route === "/api/trash" && method === "DELETE") {
    const trash = readTrash();
    const before = trash.batches.length;
    trash.batches = trash.batches.filter((b) => b.ownerId !== user.id);
    writeTrash(trash);
    return json(res, 200, { removed: before - trash.batches.length });
  }

  const trashRestoreM = route.match(/^\/api\/trash\/([A-Za-z0-9_-]+)\/restore$/);
  if (trashRestoreM && method === "POST") {
    const trash = readTrash();
    const b = trash.batches.find((x) => x.id === trashRestoreM[1]);
    if (!b) return json(res, 404, null, "回收站记录不存在");
    if (b.ownerId !== user.id) return json(res, 403, null, "无权恢复这条记录");

    const list = readDb();
    const existing = new Set(list.map((d) => d.id));
    const docs = b.docs || [];
    if (docs.some((d) => existing.has(d.id))) {
      return json(res, 409, null, "已存在相同文档，无法恢复");
    }
    // 父文档若不在本批次、也不在现有文档里，说明父已被单独删除 → 恢复为根文档，避免孤儿
    const batchIds = new Set(docs.map((d) => d.id));
    const restored = docs.map((d) => {
      const c = JSON.parse(JSON.stringify(d));
      if (c.parentId && !batchIds.has(c.parentId) && !existing.has(c.parentId)) c.parentId = null;
      return c;
    });
    writeDb(list.concat(restored));

    // 关联数据按「不覆盖期间新增」的方式合并回来
    const interSnap = b.interactions || {};
    if (Object.keys(interSnap).length) {
      const cur = readInteractions();
      for (const [did, v] of Object.entries(interSnap)) if (!cur[did]) cur[did] = v;
      writeInteractions(cur);
    }
    const visitorSnap = b.visitors || {};
    if (Object.keys(visitorSnap).length) {
      const cur = readVisitors();
      for (const [t, v] of Object.entries(visitorSnap)) if (!cur[t]) cur[t] = v;
      writeVisitors(cur);
    }
    const prefSnap = b.prefs || {};
    if (Object.keys(prefSnap).length) {
      const cur = readPrefs();
      for (const [uid, m] of Object.entries(prefSnap)) {
        if (!cur[uid]) cur[uid] = {};
        for (const [did, v] of Object.entries(m)) if (!cur[uid][did]) cur[uid][did] = v;
      }
      writePrefs(cur);
    }

    trash.batches = trash.batches.filter((x) => x.id !== b.id);
    writeTrash(trash);
    return json(res, 200, { count: restored.length, ids: restored.map((d) => d.id) });
  }

  const trashOneM = route.match(/^\/api\/trash\/([A-Za-z0-9_-]+)$/);
  if (trashOneM && method === "DELETE") {
    const trash = readTrash();
    const b = trash.batches.find((x) => x.id === trashOneM[1]);
    if (!b) return json(res, 404, null, "回收站记录不存在");
    if (b.ownerId !== user.id) return json(res, 403, null, "无权删除这条记录");
    trash.batches = trash.batches.filter((x) => x.id !== b.id);
    writeTrash(trash);
    return json(res, 200, { id: b.id, purged: true });
  }

  /* 管理员导出：留底用，刻意不含密码哈希、会话 token 与 MCP 服务配置 */
  if (route === "/api/admin/export" && method === "GET") {
    if (!user || user.role !== "admin") return json(res, 403, null, "仅管理员可导出数据");
    return json(res, 200, {
      generatedAt: nowISO(),
      app: "xuecheng-editor",
      version: 1,
      note: "不含密码哈希与会话凭据；账号仅保留 uid 映射，导入时需重新设置密码。图片存于第三方图床，备份只包含图片直链。",
      users: readUsers().map((u) => ({
        id: u.id, username: u.username, displayName: u.displayName,
        role: u.role, avatarColor: u.avatarColor, createdAt: u.createdAt, disabled: !!u.disabled,
      })),
      docs: readDb(),
      trash: readTrash().batches,
      templates: readTpl(),
      interactions: readInteractions(),
      prefs: readPrefs(),
      shareVisitors: readVisitors(),
    });
  }

  /* ---------------- MCP（模型上下文协议）服务管理 ---------------- */
  if (route === "/api/mcp/meta" && method === "GET") {
    const raw = ENV.MCP_STDIO_ALLOWLIST;
    return json(res, 200, {
      transports: [
        { key: "stdio", label: "stdio · 本地进程" },
        { key: "http", label: "HTTP · 远程服务" },
      ],
      timeout: Number(ENV.MCP_TIMEOUT || 25000),
      allowlist:
        raw === undefined
          ? ["npx", "node", "nodejs", "python3", "python", "uvx", "uv", "deno", "bun", "docker"]
          : raw.split(",").map((s) => s.trim()).filter(Boolean),
      protocolVersion: "2024-11-05",
    });
  }

  if (route === "/api/mcp/servers") {
    if (method === "GET") return json(res, 200, mcp.list());
    if (method === "POST") {
      if (!requireAdmin(user, res)) return;
      try {
        const body = (await readBody(req)) || {};
        const created = mcp.add(body);
        if (body.connect !== false) {
          await mcp.connect(created.id).catch(() => {});
        }
        return json(res, 200, mcp.list().find((x) => x.id === created.id));
      } catch (e) {
        return json(res, 400, null, e.message || "添加失败");
      }
    }
  }

  const mcpMatch = route.match(
    /^\/api\/mcp\/servers\/([A-Za-z0-9_-]+)(?:\/(connect|disconnect|tools|call))?$/
  );
  if (mcpMatch) {
    const id = mcpMatch[1];
    const action = mcpMatch[2] || "";
    // 写操作统一在「存在性检查」之前鉴权：既不泄露服务是否存在，也避免遗漏
    const adminAction =
      ((action === "connect" || action === "disconnect") && method === "POST") ||
      (!action && (method === "PATCH" || method === "PUT" || method === "DELETE"));
    if (adminAction && !requireAdmin(user, res)) return;
    if (!mcp.find(id)) return json(res, 404, null, "MCP 服务不存在");
    try {
      if (!action) {
        if (method === "GET") return json(res, 200, mcp.list().find((x) => x.id === id));
        if (method === "PATCH" || method === "PUT") {
          if (!requireAdmin(user, res)) return;
          const body = (await readBody(req)) || {};
          mcp.update(id, body);
          await mcp.disconnect(id);
          if (body.connect) await mcp.connect(id).catch(() => {});
          return json(res, 200, mcp.list().find((x) => x.id === id));
        }
        if (method === "DELETE") {
          if (!requireAdmin(user, res)) return;
          await mcp.remove(id);
          return json(res, 200, { id });
        }
      }
      if (action === "connect" && method === "POST") {
        if (!requireAdmin(user, res)) return;
        await mcp.connect(id);
        return json(res, 200, mcp.list().find((x) => x.id === id));
      }
      if (action === "disconnect" && method === "POST") {
        if (!requireAdmin(user, res)) return;
        await mcp.disconnect(id);
        return json(res, 200, { id, connected: false });
      }
      if (action === "tools" && method === "GET") {
        return json(res, 200, mcp.list().find((x) => x.id === id).tools);
      }
      if (action === "call" && method === "POST") {
        const body = (await readBody(req)) || {};
        const r = await mcp.callTool(id, body.name || body.tool, body.arguments || body.args || {});
        return json(res, 200, r);
      }
      return json(res, 405, null, "方法不允许");
    } catch (e) {
      return json(res, 400, null, e.message || "MCP 操作失败");
    }
  }

  /* ---------------- 我的模板（自建） ----------------
     把任意文档「存为模板」，之后新建文档时可直接选用。
     与文档库分库存放：改模板不影响源文档，删源文档也不影响模板。 */
  if (route === "/api/templates" && method === "GET") {
    return json(res, 200, readTpl());
  }

  if (route === "/api/templates" && method === "POST") {
    const body = (await readBody(req)) || {};
    const name = String(body.name || "").trim().slice(0, 60);
    if (!name) return json(res, 400, null, "模板名称不能为空");
    if (!body.content || typeof body.content !== "object" || body.content.type !== "doc") {
      return json(res, 400, null, "模板内容缺失或格式不正确");
    }
    const tpl = {
      id: newId(),
      name,
      desc: String(body.desc || "").trim().slice(0, 120),
      icon: String(body.icon || "📄").slice(0, 8),
      accent: String(body.accent || "#2f6fed").slice(0, 16),
      fromDoc: body.fromDoc ? String(body.fromDoc).slice(0, 40) : null,
      content: body.content,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    const list = readTpl();
    list.unshift(tpl);
    writeTpl(list);
    return json(res, 200, tpl);
  }

  const tplM = route.match(/^\/api\/templates\/([A-Za-z0-9_-]+)$/);
  if (tplM) {
    const id = tplM[1];
    const list = readTpl();
    const idx = list.findIndex((x) => x.id === id);
    if (idx < 0) return json(res, 404, null, "模板不存在");

    if (method === "GET") return json(res, 200, list[idx]);

    if (method === "PATCH") {
      // 先消费 body 再读盘：原先在 await 之前读 list，并发时会用旧快照覆盖别人的写入
      const body = (await readBody(req)) || {};
      const fresh = readTpl();
      const i = fresh.findIndex((x) => x.id === id);
      if (i < 0) return json(res, 404, null, "模板不存在");
      const next = { ...fresh[i] };
      if (body.name != null) {
        const nn = String(body.name).trim().slice(0, 60);
        if (!nn) return json(res, 400, null, "模板名称不能为空");
        next.name = nn;
      }
      if (body.desc != null) next.desc = String(body.desc).trim().slice(0, 120);
      if (body.icon != null) next.icon = String(body.icon).slice(0, 8);
      if (body.content && typeof body.content === "object") next.content = body.content;
      next.updatedAt = nowISO();
      fresh[i] = next;
      writeTpl(fresh);
      return json(res, 200, next);
    }

    if (method === "DELETE") {
      list.splice(idx, 1);
      writeTpl(list);
      return json(res, 200, { id });
    }
  }

  /* 列表 —— 返回扁平数组（含 parentId），由前端构建树。
     保持存储顺序（不按时间排序），保证同父下的子文档顺序稳定、可控。
     多用户：只回当前用户可查看的文档；被过滤的祖先以「掩码占位」补回，
     避免树断裂，且占位项绝不带正文 / 摘要 / 权限 / 分享等真实信息。 */
  if (route === "/api/docs" && method === "GET") {
    const list = readDb();
    const prefs = readPrefs();
    const byId = new Map(list.map((d) => [d.id, d]));
    const normParent = (d) => (d.parentId && byId.has(d.parentId) ? d.parentId : null);

    const visible = new Set();
    for (const d of list) if (canView(user, d, list)) visible.add(d.id);

    // 沿 parent 链把不可见的祖先补成占位（带环保护）
    const placeholders = new Map();
    for (const id of visible) {
      let cur = byId.get(id);
      const seen = new Set();
      let depth = 0;
      while (cur && depth < 64 && !seen.has(cur.id)) {
        seen.add(cur.id);
        const pid = normParent(cur);
        if (!pid) break;
        const p = byId.get(pid);
        if (!p || visible.has(p.id)) break;
        if (!placeholders.has(p.id)) {
          placeholders.set(p.id, {
            id: p.id,
            title: "受限文档",
            parentId: normParent(p),
            placeholder: true,
            canEdit: false,
            canManage: false,
            favorite: false,
            pinned: false,
            pinnedAt: null,
            lastVisitedAt: null,
            updatedAt: null,
            createdAt: null,
            // 刻意不回 excerpt / shared / content / ownerId / acl：
            // 占位只为保持树结构，不能泄露任何真实内容或分享状态
          });
        }
        cur = p;
        depth += 1;
      }
    }

    const out = [];
    for (const d of list) {
      if (visible.has(d.id)) {
        const proj = {
          id: d.id,
          title: d.title,
          parentId: normParent(d),
          updatedAt: d.updatedAt,
          createdAt: d.createdAt,
          shared: canManage(user, d, list) ? !!(d.share && d.share.enabled) : false,
          excerpt: excerptOf(d.content),
          canEdit: canEdit(user, d, list),
          canManage: canManage(user, d, list),
          visibility: effectiveAcl(d, list).visibility,
          inherit: normalizeAcl(d).inherit,
        };
        mergePrefsInto(proj, user.id, d.id, prefs);
        out.push(proj);
      } else if (placeholders.has(d.id)) {
        out.push(placeholders.get(d.id));
      }
    }
    return json(res, 200, out);
  }

  /* 新建 —— 支持 parentId（子文档）。新建文档默认继承父文档权限（inherit:true） */
  if (route === "/api/docs" && method === "POST") {
    const body = (await readBody(req)) || {};
    const list = readDb();
    const parentId = body.parentId || null;
    if (parentId) {
      const parent = list.find((d) => d.id === parentId);
      if (!parent) return json(res, 400, null, "目标父文档不存在");
      if (!canEdit(user, parent, list)) return json(res, 403, null, "没有在该文档下新建子文档的权限");
    }
    const doc = {
      id: newId(),
      title: (body.title || "未命名文档").slice(0, 120),
      content: body.content || null,
      parentId,
      favorite: false,
      pinned: false,
      pinnedAt: null,
      lastVisitedAt: null,
      share: null,
      ownerId: user.id,
      acl: { visibility: "private", members: {}, inherit: true },
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    list.push(doc);
    writeDb(list);
    return json(res, 200, doc);
  }

  /* ---------------- 权限申请 ----------------
     复制地址栏 /editor/doc/<id> 给同事时，对方登录后可能没有权限。
     与其让他掉进自己的第一篇文档，不如给出「向所有者申请」的明确入口：
       - 申请需登录，按 (docId,userId) 只允许一条 pending
       - 审批权 = canManage（所有者 / 被授予「可管理」的成员）
       - 批准时把成员写进「权限链源头」：文档继承目录权限时加到目录，子文档同步生效
       - 申请人不能自助申请「可管理」，避免提权 */
  const accessReqM = route.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/access-request$/);
  if (accessReqM) {
    const id = accessReqM[1];
    const list = readDb();
    const d = list.find((x) => x.id === id);
    if (!d) return json(res, 404, null, "文档不存在");
    if (method !== "POST") return json(res, 405, null, "方法不允许");
    if (canView(user, d, list)) return json(res, 400, null, "你已有该文档的访问权限，无需申请");
    const body = (await readBody(req)) || {};
    const reqs = readAccessRequests();
    if (reqs.some((r) => r.docId === id && r.userId === user.id && r.status === "pending")) {
      return json(res, 409, null, "已有待处理的申请，请等待所有者处理");
    }
    const role = body.role === "editor" ? "editor" : "viewer";
    const rec = {
      id: rndHex(8),
      docId: id,
      userId: user.id,
      role,
      message: String(body.message || "").trim().slice(0, 200),
      status: "pending",
      createdAt: nowISO(),
      handledAt: null,
      handledBy: null,
      grantedRole: null,
    };
    reqs.push(rec);
    writeAccessRequests(reqs);
    // 站内通知：通知文档 / 目录的「可管理者」（effectiveOwner）
    const ownerId = effectiveOwner(d, list);
    if (ownerId && ownerId !== user.id) {
      addNotification(ownerId, {
        type: "access_request",
        actorId: user.id,
        actorName: user.displayName || user.username,
        docId: id,
        docTitle: d.title || "未命名文档",
        role,
        message: rec.message,
      });
    }
    return json(res, 200, { ...rec, roleLabel: ROLE_LABELS[role] });
  }

  /* 划词评论 @提及 → 站内通知：解析 @用户名/@昵称，命中真实用户即通知 */
  const mentionM = route.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/mention$/);
  if (mentionM) {
    if (method !== "POST") return json(res, 405, null, "方法不允许");
    const id = mentionM[1];
    const list = readDb();
    const d = list.find((x) => x.id === id);
    if (!d) return json(res, 404, null, "文档不存在");
    if (!canView(user, d, list)) return json(res, 403, null, "无访问权限");
    const body = (await readBody(req)) || {};
    const text = String(body.text || "").slice(0, 2000);
    // 解析 @用户名 / @昵称（排除空白与中英文标点）
    const MENTION_RE = /@([^\s@，。、,.;:!！?？（）()\[\]【】"“”'‘’]+)/g;
    const tokens = (text.match(MENTION_RE) || []).map((s) => s.slice(1)).filter(Boolean);
    const users = readUsers();
    const byKey = new Map();
    for (const u of users) {
      if (u.username) byKey.set(u.username.toLowerCase(), u);
      if (u.displayName) {
        const k = u.displayName.toLowerCase();
        if (!byKey.has(k)) byKey.set(k, u);
      }
    }
    const seen = new Set();
    const notified = [];
    for (const tk of tokens) {
      const u = byKey.get(tk.toLowerCase());
      if (!u || u.id === user.id) continue; // 不能 @自己
      if (seen.has(u.id)) continue;
      seen.add(u.id);
      addNotification(u.id, {
        type: "mention",
        actorId: user.id,
        actorName: user.displayName || user.username,
        docId: id,
        docTitle: d.title || "未命名文档",
        message: text.slice(0, 120),
      });
      notified.push(u.id);
    }
    return json(res, 200, { ok: true, notified });
  }

  /* 我提交过的申请（申请页回显状态） */
  if (route === "/api/access-requests" && method === "GET") {
    const docs = readDb();
    const users = readUsers();
    const out = readAccessRequests()
      .filter((r) => r.userId === user.id)
      .map((r) => {
        const d = docs.find((x) => x.id === r.docId);
        const owner = d ? users.find((u) => u.id === d.ownerId) : null;
        return {
          ...r,
          docTitle: d ? d.title : null,
          ownerName: owner ? owner.displayName || owner.username : null,
        };
      })
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return json(res, 200, out);
  }

  /* 待审批收件箱：我可管理的所有文档中的 pending 申请（跨文档统一审批） */
  if (route === "/api/access-requests/inbox" && method === "GET") {
    const list = readDb();
    const byId = new Map(readUsers().map((u) => [u.id, u]));
    const out = [];
    for (const r of readAccessRequests()) {
      if (r.status !== "pending") continue;
      const d = list.find((x) => x.id === r.docId);
      if (!d || !canManage(user, d, list)) continue;
      const u = byId.get(r.userId);
      if (!u || u.disabled) continue;
      const src = aclSource(d, list);
      out.push({
        id: r.id,
        docId: r.docId,
        docTitle: d.title || "未命名文档",
        userId: r.userId,
        username: u.username,
        displayName: u.displayName || u.username,
        avatarColor: u.avatarColor,
        role: r.role,
        roleLabel: ROLE_LABELS[r.role] || "仅查看",
        message: r.message,
        createdAt: r.createdAt,
        scope: src.id === d.id ? "doc" : "parent",
        sourceTitle: src.title || "上级目录",
      });
    }
    out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return json(res, 200, out);
  }

  /* 审批（approve / reject）与申请人撤回 */
  const accessOneM = route.match(/^\/api\/access-requests\/([A-Za-z0-9_-]+)$/);
  if (accessOneM) {
    const rid = accessOneM[1];
    const reqs = readAccessRequests();
    const rec = reqs.find((r) => r.id === rid);
    if (!rec) return json(res, 404, null, "申请不存在");

    if (method === "DELETE") {
      if (rec.userId !== user.id) return json(res, 403, null, "只能撤回自己的申请");
      if (rec.status !== "pending") return json(res, 400, null, "该申请已处理，无法撤回");
      writeAccessRequests(reqs.filter((r) => r.id !== rid));
      return json(res, 200, { ok: true });
    }

    if (method === "POST") {
      const list = readDb();
      const d = list.find((x) => x.id === rec.docId);
      if (!d) return json(res, 404, null, "文档不存在或已被删除");
      if (!canManage(user, d, list)) return json(res, 403, null, "只有所有者或「可管理」成员可以审批申请");
      if (rec.status !== "pending") return json(res, 400, null, "该申请已处理");
      const body = (await readBody(req)) || {};
      const action = String(body.action || "");
      if (action !== "approve" && action !== "reject") return json(res, 400, null, "action 只能是 approve 或 reject");

      rec.handledAt = nowISO();
      rec.handledBy = user.id;
      rec.status = action === "approve" ? "approved" : "rejected";
      let scope = "doc";
      let sourceTitle = d.title || "当前文档";
      if (action === "approve") {
        const role = ACL_ROLES.includes(body.role) ? body.role : rec.role || "viewer";
        const fresh = readDb();
        const srcId = aclSource(d, fresh).id;
        const target = fresh.find((x) => x.id === srcId) || fresh.find((x) => x.id === d.id);
        if (!target) return json(res, 404, null, "权限来源文档不存在");
        const acl = normalizeAcl(target);
        acl.members[rec.userId] = role;
        target.acl = sanitizeAcl(acl);
        writeDb(fresh);
        rec.grantedRole = role;
        scope = target.id === d.id ? "doc" : "parent";
        sourceTitle = target.title || "上级目录";
      }
      writeAccessRequests(reqs);
      // 站内通知：通知申请人审批结果
      const actor = readUsers().find((u) => u.id === user.id);
      addNotification(rec.userId, {
        type: action === "approve" ? "access_approved" : "access_rejected",
        actorId: user.id,
        actorName: actor ? actor.displayName || actor.username : "",
        docId: rec.docId,
        docTitle: d.title || "未命名文档",
        role: rec.grantedRole || null,
      });
      return json(res, 200, { ...rec, scope, sourceTitle });
    }
    return json(res, 405, null, "方法不允许");
  }

  /* ---------------- 站内通知 ---------------- */
  if (route === "/api/notifications" && method === "GET") {
    const list = readNotifications().filter((n) => n.userId === user.id);
    list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return json(res, 200, {
      items: list.slice(0, 50),
      unread: list.filter((n) => !n.read).length,
    });
  }
  if (route === "/api/notifications/read-all" && method === "POST") {
    const list = readNotifications().map((n) => (n.userId === user.id ? { ...n, read: true } : n));
    writeNotifications(list);
    return json(res, 200, { ok: true });
  }
  const notifOneM = route.match(/^\/api\/notifications\/([A-Za-z0-9_-]+)\/read$/);
  if (notifOneM) {
    if (method !== "POST") return json(res, 405, null, "方法不允许");
    const id = notifOneM[1];
    const list = readNotifications();
    const n = list.find((x) => x.id === id && x.userId === user.id);
    if (!n) return json(res, 404, null, "通知不存在");
    n.read = true;
    writeNotifications(list);
    return json(res, 200, { ok: true });
  }

  /* ---------------- 文档权限（ACL）----------------
     visibility 只约束登录态经 /api/docs 的发现与按 id 读取；
     分享 token 是独立能力令牌，与 visibility 解耦（保证历史链接不失效）。
     这里做 UI 联动：选「公开链接只读」自动开分享，选另外两档自动关分享。 */
  const aclM = route.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/acl$/);
  if (aclM) {
    const id = aclM[1];
    const list = readDb();
    const d = list.find((x) => x.id === id);
    if (!d) return json(res, 404, null, "文档不存在");
    if (!canManage(user, d, list)) return json(res, 403, null, "只有文档所有者可以管理权限");

    if (method === "GET") {
      const own = normalizeAcl(d);
      const eff = effectiveAcl(d, list);
      const withRole = (users, members) => users.map((u) => ({ ...u, role: members[u.id] }));
      const parent = d.parentId ? list.find((x) => x.id === d.parentId) : null;
      const src = aclSource(d, list);
      return json(res, 200, {
        own,
        effective: eff,
        ownerId: d.ownerId || null,
        parentId: d.parentId || null,
        parentTitle: parent ? parent.title || "未命名文档" : null,
        canInherit: !!parent,
        childCount: list.filter((x) => x.parentId === d.id).length,
        sourceId: src.id,
        sourceTitle: src.title || "未命名文档",
        visibility: eff.visibility,
        shared: !!(d.share && d.share.enabled),
        members: withRole(publicUsersByIds(Object.keys(eff.members)), eff.members),
        ownMembers: withRole(publicUsersByIds(Object.keys(own.members)), own.members),
      });
    }

    if (method === "PUT") {
      const body = (await readBody(req)) || {};
      const fresh = readDb(); // 跨 await 后重新读，避免旧快照覆盖
      const i = fresh.findIndex((x) => x.id === id);
      if (i < 0) return json(res, 404, null, "文档不存在");
      const dd = fresh[i];
      if (!canManage(user, dd, fresh)) return json(res, 403, null, "只有文档所有者可以管理权限");
      const acl = sanitizeAcl(body.acl || body);
      const prevMembers = normalizeAcl(dd).members;
      dd.acl = acl;
      /* 可见性与分享链接彻底解耦：前端已不再提供「公开链接只读」档，
         历史已开启的 token 保持有效；只有显式 DELETE /docs/:id/share 才会关闭。
         这样调整权限不会误伤别人手里已经发出去的旧链接。 */
      // 手动添加新成员时，给新成员发一条「已获得权限」通知（只发新增、跳过自己）
      for (const [uid, role] of Object.entries(acl.members)) {
        if (uid === user.id || prevMembers[uid]) continue;
        addNotification(uid, {
          type: "access_granted",
          actorId: user.id,
          actorName: user.displayName || user.username,
          docId: id,
          docTitle: dd.title || "未命名文档",
          role,
        });
      }
      writeDb(fresh);
      return json(res, 200, {
        acl,
        shared: !!(dd.share && dd.share.enabled),
        token: dd.share ? dd.share.token : null,
      });
    }
    return json(res, 405, null, "方法不允许");
  }

  /* ---------------- 分享：给某篇文档开一个只读链接 ----------------
     设计：token 一旦生成就固定（关闭再开还是同一个链接，避免历史链接失效），
     enabled 控制是否还能访问；删除文档时随文档一起消失。
     GET 也要 canManage：否则 viewer 能取得并传播能力令牌。 */
  const shareM = route.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/share$/);
  if (shareM) {
    const id = shareM[1];
    const list = readDb();
    const idx = list.findIndex((d) => d.id === id);
    if (idx < 0) return json(res, 404, null, "文档不存在");
    if (!canManage(user, list[idx], list)) return json(res, 403, null, "只有文档所有者可以管理分享链接");
    const cur = list[idx].share || null;

    if (method === "GET") {
      return json(res, 200, {
        enabled: !!(cur && cur.enabled),
        token: cur ? cur.token : null,
        views: (cur && cur.views) || 0,
        createdAt: (cur && cur.createdAt) || null,
        path: cur ? `${PREFIX}/s/${cur.token}` : null,
      });
    }

    if (method === "POST") {
      const token = (cur && cur.token) || rndB64(12);
      list[idx].share = {
        token,
        enabled: true,
        views: (cur && cur.views) || 0,
        createdAt: (cur && cur.createdAt) || nowISO(),
        updatedAt: nowISO(),
      };
      // 分享 token 是独立能力令牌：开链接不改变登录态可见性（visibility 由 /acl 管理）
      writeDb(list);
      return json(res, 200, {
        enabled: true,
        token,
        views: list[idx].share.views,
        createdAt: list[idx].share.createdAt,
        path: `${PREFIX}/s/${token}`,
      });
    }

    if (method === "DELETE") {
      if (cur) {
        list[idx].share = { ...cur, enabled: false, updatedAt: nowISO() };
        writeDb(list);
      }
      return json(res, 200, { enabled: false, token: cur ? cur.token : null });
    }
  }

  /* 公开读取：只回标题 / 正文 / 时间 / 统计，绝不回 id、parentId、ownerId、acl 等内部字段。
     历史上这里返回过 id，配合无鉴权的写接口等于「拿到链接即可改删文档」——已移除。
     分享 token 是独立能力令牌：只校验 share.enabled，与 visibility 完全解耦。 */
  const shareReadM = route.match(/^\/api\/share\/([A-Za-z0-9_-]+)$/);
  if (shareReadM && method === "GET") {
    const token = shareReadM[1];
    const list = readDb();
    const d = list.find((x) => x.share && x.share.enabled && x.share.token === token);
    if (!d) return json(res, 404, null, "分享链接不存在或已被关闭");
    // 记录匿名访客（去重计数，修掉「刷新就 +1」）
    touchVisitor(token, req, res, { countVisit: true });
    const stats = computeStats(token);
    return json(res, 200, {
      title: d.title,
      content: d.content || null,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      views: d.share.views || 0,
      unique: stats.unique,
      online: stats.online,
    });
  }

  /* 分享访问统计：心跳（维持在线）与统计查询 */
  const shareStatM = route.match(/^\/api\/share\/([A-Za-z0-9_-]+)\/(heartbeat|stats)$/);
  if (shareStatM) {
    const token = shareStatM[1];
    const action = shareStatM[2];
    const list = readDb();
    const d = list.find((x) => x.share && x.share.enabled && x.share.token === token);
    if (!d) return json(res, 404, null, "分享链接不存在或已被关闭");
    if (action === "heartbeat" && method === "POST") {
      touchVisitor(token, req, res, { countVisit: false });
      return json(res, 200, { ok: true });
    }
    if (action === "stats" && method === "GET") {
      const stats = computeStats(token);
      const out = { online: stats.online, views: d.share.views || 0, unique: stats.unique };
      // 访客明细（设备/浏览器/脱敏 IP）只给已登录且拥有该文档管理权的人
      if (user && canManage(user, d, list)) {
        out.daily = stats.daily;
        out.recent = stats.recent;
      }
      return json(res, 200, out);
    }
    return json(res, 405, null, "方法不允许");
  }

  /* ---------------- 在线协作者头像 ----------------
     两条通道共用 presenceByDoc：文档页（需登录 + canView）与分享页（匿名放行）。
     心跳即上报也拉取，一次请求完成，避免额外轮询。 */
  const docPresenceM = route.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/presence$/);
  if (docPresenceM) {
    const id = docPresenceM[1];
    const list = readDb();
    const d = list.find((x) => x.id === id);
    if (!d) return json(res, 404, null, "文档不存在");
    if (!canView(user, d, list)) return json(res, 403, null, "没有查看该文档的权限");
    if (method === "POST") {
      const key = presenceTouch(id, req, res, user);
      return json(res, 200, presenceSnapshot(id, key));
    }
    if (method === "DELETE") {
      presenceLeave(id, req, res, user);
      return json(res, 200, { ok: true });
    }
    return json(res, 405, null, "方法不允许");
  }

  const sharePresenceM = route.match(/^\/api\/share\/([A-Za-z0-9_-]+)\/presence$/);
  if (sharePresenceM) {
    const token = sharePresenceM[1];
    const list = readDb();
    const d = list.find((x) => x.share && x.share.enabled && x.share.token === token);
    if (!d) return json(res, 404, null, "分享链接不存在或已被关闭");
    if (method === "POST") {
      // 复用既有访客统计，让分享页「N 人正在浏览」与头像组口径保持一致
      touchVisitor(token, req, res, { countVisit: false });
      const key = presenceTouch(d.id, req, res, user);
      return json(res, 200, presenceSnapshot(d.id, key));
    }
    if (method === "DELETE") {
      presenceLeave(d.id, req, res, user);
      return json(res, 200, { ok: true });
    }
    return json(res, 405, null, "方法不允许");
  }

  /* ---------------- 互动数据（投票 / 问卷） ----------------
     计数/作答存服务端，按 xc_visitor 匿名身份去重（跨设备/跨浏览器真多用户）。
     - 登录态 /api/docs/:id/interactions：需 canView；?detail=1 额外需 canEdit
     - 公开分享页 /api/share/:token/interactions：只校验 share.enabled，
       由 token 反查内部 docId（永不回传），强制 detail=false */
  const interM = route.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/interactions$/);
  if (interM) {
    const id = interM[1];
    const list = readDb();
    const d = list.find((x) => x.id === id);
    if (!d) return json(res, 404, null, "文档不存在");
    if (!canView(user, d, list)) return json(res, 403, null, "没有查看该文档的权限");
    const detailAllowed = canEdit(user, d, list);
    if (getDetail(req).get("detail") === "1" && !detailAllowed) {
      return json(res, 403, null, "只有编辑者可以查看原始回答");
    }
    return handleInteractions(req, res, method, id, { detailAllowed });
  }

  const shareInterM = route.match(/^\/api\/share\/([A-Za-z0-9_-]+)\/interactions$/);
  if (shareInterM) {
    const token = shareInterM[1];
    const d = readDb().find((x) => x.share && x.share.enabled && x.share.token === token);
    if (!d) return json(res, 404, null, "分享链接不存在或已被关闭");
    // 匿名只读：只写 interactions.json，绝不触碰 docs.json
    return handleInteractions(req, res, method, d.id, { detailAllowed: false });
  }

  /* 单篇 */
  const m = route.match(/^\/api\/docs\/([A-Za-z0-9_-]+)$/);
  if (m) {
    const id = m[1];
    const list = readDb();
    const idx = list.findIndex((d) => d.id === id);
    if (idx < 0) return json(res, 404, null, "文档不存在");

    const decorate = (d, src) => {
      const out = {
        ...d,
        canEdit: canEdit(user, d, src),
        canManage: canManage(user, d, src),
        visibility: effectiveAcl(d, src).visibility,
        inherit: normalizeAcl(d).inherit,
      };
      // 成员列表 / ownerId 只给管理者，避免向 viewer 暴露其它用户 id
      if (!out.canManage) {
        delete out.acl;
        delete out.ownerId;
      }
      mergePrefsInto(out, user.id, id);
      return out;
    };

    if (method === "GET") {
      if (!canView(user, list[idx], list)) {
        // 403 里带回最小上下文：让前端渲染「申请权限」页而不是掉进用户自己的文档。
        // 只给标题与所有者名（供申请人确认目标），绝不回正文 / 摘要 / ACL / 内部 id。
        const d = list[idx];
        const mine = readAccessRequests()
          .filter((r) => r.docId === id && r.userId === user.id)
          .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;
        const owner = readUsers().find((u) => u.id === d.ownerId);
        return json(res, 403, {
          needRequest: true,
          docId: id,
          title: d.title || "未命名文档",
          ownerName: owner ? owner.displayName || owner.username : "文档所有者",
          request: mine
            ? { id: mine.id, status: mine.status, createdAt: mine.createdAt, grantedRole: mine.grantedRole }
            : null,
        }, "没有查看该文档的权限");
      }
      return json(res, 200, decorate(list[idx], list));
    }

    if (method === "PUT" || method === "PATCH") {
      // 先消费 body，再读盘 + 鉴权：修掉原先跨 await 的 read-modify-write 丢更新窗口
      const body = (await readBody(req)) || {};
      const fresh = readDb();
      const i = fresh.findIndex((x) => x.id === id);
      if (i < 0) return json(res, 404, null, "文档不存在");
      const d = fresh[i];

      const keys = Object.keys(body).filter((k) =>
        ["title", "content", "parentId", "acl", ...PREF_KEYS].includes(k)
      );
      const prefOnly = keys.length > 0 && keys.every((k) => PREF_KEYS.includes(k));

      // 纯个人偏好：只要求 canView，写 prefs.json，绝不改 docs.json / updatedAt
      // （前端 toggleFavorite / togglePin / touchDoc 都走这里，viewer 也能收藏）
      if (prefOnly) {
        if (!canView(user, d, fresh)) return json(res, 403, null, "没有查看该文档的权限");
        writePrefFor(user.id, id, body);
        return json(res, 200, decorate(d, fresh));
      }

      if (!canEdit(user, d, fresh)) return json(res, 403, null, "没有编辑该文档的权限");
      const structural =
        Object.prototype.hasOwnProperty.call(body, "parentId") ||
        Object.prototype.hasOwnProperty.call(body, "acl");
      if (structural && !canManage(user, d, fresh)) {
        return json(res, 403, null, "只有文档所有者可以调整结构或权限");
      }

      let edited = false;
      if (typeof body.title === "string") {
        d.title = body.title.slice(0, 120);
        edited = true;
      }
      if (body.content !== undefined) {
        d.content = body.content;
        edited = true;
      }
      if (body.acl !== undefined) {
        const prevVis = normalizeAcl(d).visibility;
        d.acl = sanitizeAcl(body.acl);
        if (d.acl.visibility === "link") {
          const cur = d.share || null;
          d.share = {
            token: (cur && cur.token) || rndB64(12),
            enabled: true,
            views: (cur && cur.views) || 0,
            createdAt: (cur && cur.createdAt) || nowISO(),
            updatedAt: nowISO(),
          };
        } else if (prevVis === "link" && d.share && d.share.enabled) {
          d.share = { ...d.share, enabled: false, updatedAt: nowISO() };
        }
      }
      // 移动到其它文档下（parentId）—— 结构变更，不算内容编辑，不改 updatedAt
      if (body.parentId !== undefined) {
        const pid = body.parentId || null;
        if (pid === id) return json(res, 400, null, "不能移动到自身之下");
        if (pid !== null) {
          const parent = fresh.find((x) => x.id === pid);
          if (!parent) return json(res, 400, null, "目标文档不存在");
          if (!canEdit(user, parent, fresh)) return json(res, 403, null, "没有移动到该文档下的权限");
          // 防环：目标不能是自身的后代
          let cur = pid;
          const seen = new Set();
          while (cur) {
            if (cur === id) return json(res, 400, null, "不能移动到自身或其子文档下");
            if (seen.has(cur)) break;
            seen.add(cur);
            const p = fresh.find((x) => x.id === cur);
            cur = p ? p.parentId : null;
          }
        }
        d.parentId = pid;
      }
      // 混合 body 里的偏好字段也只落 prefs，不再污染 docs.json
      const prefPatch = {};
      for (const k of PREF_KEYS) if (Object.prototype.hasOwnProperty.call(body, k)) prefPatch[k] = body[k];
      if (Object.keys(prefPatch).length) writePrefFor(user.id, id, prefPatch);

      if (edited) d.updatedAt = nowISO();
      writeDb(fresh);
      return json(res, 200, decorate(d, fresh));
    }

    if (method === "DELETE") {
      if (!canManage(user, list[idx], list)) return json(res, 403, null, "只有文档所有者可以删除");
      // 级联收集：自身及所有子孙
      const toDelete = new Set([id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const d of list) {
          if (d.parentId && toDelete.has(d.parentId) && !toDelete.has(d.id)) {
            toDelete.add(d.id);
            changed = true;
          }
        }
      }
      // 继承子文档归父所有者管理，这里逐个复核，任一不可管则整体拒绝
      for (const did of toDelete) {
        const sub = list.find((x) => x.id === did);
        if (!sub || !canManage(user, sub, list)) {
          return json(res, 403, null, "子文档中存在无权删除的内容");
        }
      }
      const removed = list.filter((d) => toDelete.has(d.id));
      const remaining = list.filter((d) => !toDelete.has(d.id));

      /* 软删除：先把文档与关联数据完整快照写进回收站批次，再清理在线数据。
         顺序刻意「先备份后删除」——万一后续写盘失败，宁可多一条可恢复批次，
         也不能把正文直接丢掉。恢复时若 id 冲突会拒绝，避免覆盖新文档。 */
      const inter = readInteractions();
      const interSnap = {};
      for (const did of toDelete) if (inter[did]) interSnap[did] = inter[did];
      const visitors = readVisitors();
      const visitorSnap = {};
      for (const d of removed) {
        const t = d.share && d.share.token;
        if (t && visitors[t]) visitorSnap[t] = visitors[t];
      }
      const prefs = readPrefs();
      const prefSnap = {};
      for (const uid of Object.keys(prefs)) {
        for (const did of toDelete) {
          if (prefs[uid] && Object.prototype.hasOwnProperty.call(prefs[uid], did)) {
            if (!prefSnap[uid]) prefSnap[uid] = {};
            prefSnap[uid][did] = prefs[uid][did];
          }
        }
      }
      const batch = {
        id: rndHex(9),
        deletedAt: nowISO(),
        deletedBy: user.id,
        ownerId: user.id,
        rootId: id,
        rootTitle: list[idx].title || "未命名文档",
        docs: JSON.parse(JSON.stringify(removed)),
        interactions: interSnap,
        visitors: visitorSnap,
        prefs: prefSnap,
      };
      const trash = readTrash();
      trash.batches.unshift(batch);
      writeTrash(trash);

      writeDb(remaining);
      let interDirty = false;
      for (const did of Object.keys(interSnap)) {
        if (inter[did]) { delete inter[did]; interDirty = true; }
      }
      if (interDirty) writeInteractions(inter);
      let visitorDirty = false;
      for (const t of Object.keys(visitorSnap)) {
        if (visitors[t]) { delete visitors[t]; visitorDirty = true; }
      }
      if (visitorDirty) writeVisitors(visitors);
      let prefDirty = false;
      for (const [uid, m] of Object.entries(prefSnap)) {
        for (const did of Object.keys(m)) {
          if (prefs[uid] && Object.prototype.hasOwnProperty.call(prefs[uid], did)) {
            delete prefs[uid][did];
            prefDirty = true;
          }
        }
      }
      if (prefDirty) writePrefs(prefs);
      return json(res, 200, { id, count: removed.length, batchId: batch.id, trashed: true });
    }
  }

  /* 图片上传：dataUrl → 第三方图床（巡回寺 API），图片只存图床，不落本机磁盘。
     - 成功：文档里存图床直链 purl
     - 失败/超时：返回 502 + 明确原因，不写入任何本地文件、不静默降级
     - /files/* 静态路由仅保留作只读兼容（旧备份/导入数据），本接口不再产生新文件 */
  if (route === "/api/upload" && method === "POST") {
    const body = (await readBody(req)) || {};
    const m2 = /^data:(image\/(png|jpeg|jpg|gif|webp|svg\+xml));base64,(.+)$/i.exec(body.dataUrl || "");
    if (!m2) return json(res, 400, null, "仅支持图片 dataUrl");
    const extMap = { "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg" };
    const mime = m2[1].toLowerCase();
    const ext = extMap[mime] || "png";
    const buf = b64ToBytes(m2[3], "base64");

    let reason = "图床服务暂时不可用，请稍后重试";
    try {
      // 实测契约：multipart 字段名必须是 file（不是文档里写的 image/photo），
      // type=json 让接口返回 JSON；GET/POST 的 photo=<base64|URL> 也可用，但大图走 multipart 更省流量
      const form = new FormData();
      form.append("type", "json");
      form.append("file", new Blob([buf], { type: mime }), `image.${ext}`);
      const resp = await fetch(IMAGE_HOST_URL, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(IMAGE_HOST_TIMEOUT),
      });
      const text = await resp.text();
      let out = null;
      try { out = JSON.parse(text); } catch (_) { /* 非 JSON 响应按失败处理 */ }
      const purl = out && out.purl;
      if (out && out.code === 0 && typeof purl === "string" && /^https?:\/\//i.test(purl)) {
        let name = `image.${ext}`;
        try { name = new URL(purl).pathname.split("/").pop() || name; } catch (_) { /* 保留默认名 */ }
        return json(res, 200, {
          url: purl,
          name,
          source: out.host || "image-host",
          deleteUrl: out.delete_url || "",
        });
      }
      reason = "图床返回异常，请稍后重试";
      console.warn("[image-host] unexpected response:", String(text).slice(0, 300));
    } catch (e) {
      const label = String((e && e.name) || "");
      reason = /timeout|abort/i.test(label) ? "图床上传超时，请稍后重试" : "图床服务连接失败，请稍后重试";
      console.warn("[image-host] upload failed:", e && e.message);
    }
    return json(res, 502, null, reason);
  }

  return json(res, 404, null, "接口不存在");
}

export { handleApi };
