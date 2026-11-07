// Adapted from John9816/xuecheng-editor e72dc77. Website authentication and user isolation.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { McpManager } from './mcp.mjs';
import { userStore, readJson, writeJson } from './storage.mjs';
import { authenticate } from './auth.mjs';
import { validateContent } from './validation.mjs';
const PREFIX = '/editor';
const MAX_BODY = 8 * 1024 * 1024;
const nowISO = () => new Date().toISOString();
const newId = () => crypto.randomBytes(6).toString("hex");

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

/* ---------------- HTTP 工具 ---------------- */
function json(res, status, data, message = "ok") {
  const body = JSON.stringify({ code: status === 200 ? 0 : status, message, data });
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error("请求体过大"), { status: 413 }));
        req.resume();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve(null);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (e) {
        reject(Object.assign(new Error("JSON 解析失败"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
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

function serveFile(res, filePath, cache = false) {
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Not Found");
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Content-Length": st.size,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": cache ? "public, max-age=31536000, immutable" : "no-cache",
    });
    fs.createReadStream(filePath).pipe(res);
  });
}


export function createXuechengHandler({ backendUrl, dataDir }) {
  const DATA_DIR = path.resolve(dataDir);
  const FILES_DIR = path.join(DATA_DIR, 'files');
  const SHARES_FILE = path.join(DATA_DIR, 'shares.json');
  let manager;
  const mcp = new Proxy({}, { get(_target, key) {
    if (!manager) {
      manager = new McpManager(path.join(DATA_DIR, 'mcp.json'));
      void manager.connectAuto();
    }
    const value = manager[key];
    return typeof value === 'function' ? value.bind(manager) : value;
  } });
async function handleApi(req, res, route, user) {
  const { readDb, writeDb, readTpl, writeTpl } = userStore(DATA_DIR, user.id);
  const method = req.method;
  if (route.startsWith("/api/mcp/") && (user.role !== "ADMIN" || user.canManageSystemConfig !== true)) return json(res, 403, null, "只有系统管理员可管理 MCP 工具");

  if (route === "/api/health") {
    return json(res, 200, { ok: true, docs: readDb().length, uptime: Math.round(process.uptime()) });
  }

  /* ---------------- MCP（模型上下文协议）服务管理 ---------------- */
  if (route === "/api/mcp/meta" && method === "GET") {
    const raw = process.env.MCP_STDIO_ALLOWLIST;
    return json(res, 200, {
      transports: [
        { key: "stdio", label: "stdio · 本地进程" },
        { key: "http", label: "HTTP · 远程服务" },
      ],
      timeout: Number(process.env.MCP_TIMEOUT || 25000),
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
    if (!mcp.find(id)) return json(res, 404, null, "MCP 服务不存在");
    try {
      if (!action) {
        if (method === "GET") return json(res, 200, mcp.list().find((x) => x.id === id));
        if (method === "PATCH" || method === "PUT") {
          const body = (await readBody(req)) || {};
          mcp.update(id, body);
          await mcp.disconnect(id);
          if (body.connect) await mcp.connect(id).catch(() => {});
          return json(res, 200, mcp.list().find((x) => x.id === id));
        }
        if (method === "DELETE") {
          await mcp.remove(id);
          return json(res, 200, { id });
        }
      }
      if (action === "connect" && method === "POST") {
        await mcp.connect(id);
        return json(res, 200, mcp.list().find((x) => x.id === id));
      }
      if (action === "disconnect" && method === "POST") {
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
    if (body.content !== undefined) validateContent(body.content);
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
    const body = method === "PATCH" ? (await readBody(req)) || {} : {};
    if (body.content !== undefined) validateContent(body.content);
    const list = readTpl();
    const idx = list.findIndex((x) => x.id === id);
    if (idx < 0) return json(res, 404, null, "模板不存在");

    if (method === "GET") return json(res, 200, list[idx]);

    if (method === "PATCH") {

      const next = { ...list[idx] };
      if (body.name != null) {
        const nn = String(body.name).trim().slice(0, 60);
        if (!nn) return json(res, 400, null, "模板名称不能为空");
        next.name = nn;
      }
      if (body.desc != null) next.desc = String(body.desc).trim().slice(0, 120);
      if (body.icon != null) next.icon = String(body.icon).slice(0, 8);
      if (body.content && typeof body.content === "object") next.content = body.content;
      next.updatedAt = nowISO();
      list[idx] = next;
      writeTpl(list);
      return json(res, 200, next);
    }

    if (method === "DELETE") {
      list.splice(idx, 1);
      writeTpl(list);
      return json(res, 200, { id });
    }
  }

  /* 列表 —— 返回扁平数组（含 parentId），由前端构建树。
     保持存储顺序（不按时间排序），保证同父下的子文档顺序稳定、可控。 */
  if (route === "/api/docs" && method === "GET") {
    const list = readDb().map(
      ({ id, title, parentId, updatedAt, createdAt, favorite, lastVisitedAt, share, content }) => ({
        id,
        title,
        parentId: parentId || null,
        updatedAt,
        createdAt,
        favorite: !!favorite,
        lastVisitedAt: lastVisitedAt || null,
        shared: !!(share && share.enabled),
        excerpt: excerptOf(content),
      })
    );
    return json(res, 200, list);
  }

  /* 新建 —— 支持 parentId（子文档） */
  if (route === "/api/docs" && method === "POST") {
    const body = (await readBody(req)) || {};
    if (body.content !== undefined) validateContent(body.content);
    const doc = {
      id: newId(),
      title: String(body.title || "未命名文档").slice(0, 120),
      content: body.content || null,
      parentId: body.parentId || null,
      favorite: false,
      lastVisitedAt: null,
      share: null,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    const list = readDb();
    if (doc.parentId && !list.some(d => d.id === doc.parentId)) return json(res, 400, null, "父文档不存在");
    if (list.length >= 2000) return json(res, 400, null, "文档数量已达上限");
    list.push(doc);
    writeDb(list);
    return json(res, 200, doc);
  }

  /* ---------------- 分享：给某篇文档开一个只读链接 ----------------
     设计：token 一旦生成就固定（关闭再开还是同一个链接，避免历史链接失效），
     enabled 控制是否还能访问；删除文档时随文档一起消失。 */
  const shareM = route.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/share$/);
  if (shareM) {
    const id = shareM[1];
    const list = readDb();
    const idx = list.findIndex((d) => d.id === id);
    if (idx < 0) return json(res, 404, null, "文档不存在");
    const cur = list[idx].share || null;

    if (method === "GET") {
      return json(res, 200, {
        enabled: !!(cur && cur.enabled),
        token: cur ? cur.token : null,
        views: (cur && cur.views) || 0,
        createdAt: (cur && cur.createdAt) || null,
        path: cur ? `${PREFIX}/#/s/${cur.token}` : null,
      });
    }

    if (method === "POST") {
      const token = (cur && cur.token) || crypto.randomBytes(12).toString("base64url");
      list[idx].share = {
        token,
        enabled: true,
        views: (cur && cur.views) || 0,
        createdAt: (cur && cur.createdAt) || nowISO(),
        updatedAt: nowISO(),
      };
      writeDb(list);
      const shares = readJson(SHARES_FILE, {});
      shares[token] = user.id;
      writeJson(SHARES_FILE, shares);
      return json(res, 200, {
        enabled: true,
        token,
        views: list[idx].share.views,
        createdAt: list[idx].share.createdAt,
        path: `${PREFIX}/#/s/${token}`,
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

  /* 单篇 */
  const m = route.match(/^\/api\/docs\/([A-Za-z0-9_-]+)$/);
  if (m) {
    const id = m[1];
    const body = method === "PUT" || method === "PATCH" ? (await readBody(req)) || {} : {};
    if (body.content !== undefined) validateContent(body.content);
    const list = readDb();
    const idx = list.findIndex((d) => d.id === id);
    if (idx < 0) return json(res, 404, null, "文档不存在");

    if (method === "GET") return json(res, 200, list[idx]);

    if (method === "PUT" || method === "PATCH") {

      let edited = false;
      if (typeof body.title === "string") {
        list[idx].title = body.title.slice(0, 120);
        edited = true;
      }
      if (body.content !== undefined) {
        list[idx].content = body.content;
        edited = true;
      }
      // 收藏 / 最近访问 是「元数据」更新，不应改动 updatedAt（否则会污染「最近编辑」）
      if (typeof body.favorite === "boolean") list[idx].favorite = body.favorite;
      if (body.lastVisitedAt !== undefined) list[idx].lastVisitedAt = body.lastVisitedAt || null;
      // 移动到其它文档下（parentId）—— 结构变更，不算内容编辑，不改 updatedAt
      if (body.parentId !== undefined) {
        const pid = body.parentId || null;
        if (pid === id) return json(res, 400, null, "不能移动到自身之下");
        if (pid !== null) {
          if (!list.some((d) => d.id === pid)) return json(res, 400, null, "目标文档不存在");
          // 防环：目标不能是自身的后代
          let cur = pid;
          const seen = new Set();
          while (cur) {
            if (cur === id) return json(res, 400, null, "不能移动到自身或其子文档下");
            if (seen.has(cur)) break;
            seen.add(cur);
            const p = list.find((d) => d.id === cur);
            cur = p ? p.parentId : null;
          }
        }
        list[idx].parentId = pid;
      }
      if (edited) list[idx].updatedAt = nowISO();
      writeDb(list);
      return json(res, 200, list[idx]);
    }

    if (method === "DELETE") {
      // 级联删除：把自身及所有子孙一起删
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
      const removed = list.filter((d) => toDelete.has(d.id));
      const remaining = list.filter((d) => !toDelete.has(d.id));
      const tokens = removed.map(d => d.share?.token).filter(Boolean);
      const shares = tokens.length ? readJson(SHARES_FILE, {}) : null;
      writeDb(remaining);
      if (shares) {
        for (const token of tokens) delete shares[token];
        writeJson(SHARES_FILE, shares);
      }
      return json(res, 200, { id, count: removed.length });
    }
  }

  /* 图片上传：dataUrl → 文件 */
  if (route === "/api/upload" && method === "POST") {
    const body = (await readBody(req)) || {};
    const m2 = /^data:(image\/(png|jpeg|jpg|gif|webp));base64,(.+)$/i.exec(body.dataUrl || "");
    if (!m2) return json(res, 400, null, "仅支持图片 dataUrl");
    const extMap = { "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg" };
    const ext = extMap[m2[1].toLowerCase()] || "png";
    const name = `${crypto.randomBytes(24).toString("hex")}.${ext}`;
    const bytes = Buffer.from(m2[3], "base64");
    if (bytes.length > 5 * 1024 * 1024) return json(res, 413, null, "图片不能超过 5MB");
    const valid = ext === "png" ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : ext === "jpg" ? bytes[0] === 255 && bytes[1] === 216 : ext === "gif" ? /^GIF8[79]a/.test(bytes.subarray(0, 6).toString()) : bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
    if (!valid) return json(res, 400, null, "图片格式与内容不匹配");
    fs.mkdirSync(FILES_DIR, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(FILES_DIR, name), bytes, { mode: 0o600 });
    return json(res, 200, { url: `${PREFIX}/files/${name}`, name });
  }

  return json(res, 404, null, "接口不存在");
}


  return {
    async handle(req, res, url) {
      const pathname = url.pathname;
      if (!pathname.startsWith('/editor/api/') && !pathname.startsWith('/editor/files/')) return false;
      try {
        if (pathname.startsWith('/editor/files/')) {
          const name = pathname.slice('/editor/files/'.length);
          if (!/^[a-f0-9]{48}\.(png|jpg|gif|webp)$/.test(name) || !['GET', 'HEAD'].includes(req.method)) json(res, 404, null, '文件不存在');
          else serveFile(res, path.join(FILES_DIR, name), true);
          return true;
        }
        const route = pathname.slice(PREFIX.length);
        const shareMatch = route.match(/^\/api\/share\/([A-Za-z0-9_-]+)$/);
        if (shareMatch && req.method === 'GET') {
          const token = shareMatch[1];
          const owner = readJson(SHARES_FILE, {})[token];
          if (!Number.isSafeInteger(owner) || owner <= 0) { json(res, 404, null, '分享链接不存在或已被关闭'); return true; }
          const store = userStore(DATA_DIR, owner);
          const docs = store.readDb();
          const doc = docs.find(d => d.share?.enabled && d.share.token === token);
          if (!doc) { json(res, 404, null, '分享链接不存在或已被关闭'); return true; }
          doc.share.views = (doc.share.views || 0) + 1;
          store.writeDb(docs);
          json(res, 200, { title: doc.title, content: doc.content, createdAt: doc.createdAt, updatedAt: doc.updatedAt, views: doc.share.views });
          return true;
        }
        const user = await authenticate(req, backendUrl);
        await handleApi(req, res, route, user);
      } catch (error) {
        const status = error.status || 500;
        if (status >= 500) console.error('Xuecheng request failed:', error.message);
        json(res, status, null, status === 500 ? '文档服务暂不可用，请联系管理员' : error.message);
      }
      return true;
    },
    async close() { await manager?.disposeAll(); },
  };
}
