/**
 * API 客户端 —— 迁入 website 后统一前缀 /api/editor，由 website 的 Pages Functions
 * 代理到 website-backend 的 EditorController。
 * 鉴权从原 httpOnly Cookie 会话改为 website 的 JWT（localStorage nav.auth.session）。
 */
import { EDITOR_API_BASE as BASE, readAuthToken, redirectToSiteLogin } from "./config.js";

async function request(path, { method = "GET", body, silent401 = false, keepalive = false } = {}) {
  const headers = {};
  const token = readAuthToken();
  if (token) headers["Authorization"] = "Bearer " + token;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + path, {
    method,
    keepalive,
    credentials: "same-origin",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch (_) {}
  if (!res.ok || !json || json.code !== 0) {
    // 会话失效时通知 App 切回登录页；登录/注册/首屏 me 的 401 是预期内，不广播
    if (res.status === 401 && !silent401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event("xc:unauthorized"));
      redirectToSiteLogin("登录状态已失效，请重新登录后再使用编辑器。");
    }
    const err = new Error((json && json.message) || `请求失败 (${res.status})`);
    err.status = res.status;
    // 403 等错误也可能带业务上下文（如「无权限但可申请」），交给调用方判断
    err.data = json && json.data !== undefined ? json.data : null;
    throw err;
  }
  return json.data;
}

export const api = {
  listDocs: () => request("/docs"),
  getDoc: (id) => request("/docs/" + encodeURIComponent(id)),
  createDoc: (title, content, parentId) =>
    request("/docs", { method: "POST", body: { title, content, parentId: parentId || null } }),
  saveDoc: (id, payload) =>
    request("/docs/" + encodeURIComponent(id), { method: "PUT", body: payload }),
  renameDoc: (id, title) =>
    request("/docs/" + encodeURIComponent(id), { method: "PATCH", body: { title } }),
  // 通用局部更新：收藏开关、记录最近访问（标题/正文编辑走 saveDoc）
  updateDoc: (id, patch) =>
    request("/docs/" + encodeURIComponent(id), { method: "PATCH", body: patch }),
  // 删除是软删除：文档与子孙一起进回收站，可在 /trash 恢复
  deleteDoc: (id) => request("/docs/" + encodeURIComponent(id), { method: "DELETE" }),
  /* ---------- 回收站 ---------- */
  trash: {
    list: () => request("/trash"),
    restore: (batchId) =>
      request("/trash/" + encodeURIComponent(batchId) + "/restore", { method: "POST" }),
    purge: (batchId) => request("/trash/" + encodeURIComponent(batchId), { method: "DELETE" }),
    clear: () => request("/trash", { method: "DELETE" }),
  },
  /* ---------- 我的模板（把文档存成模板） ---------- */
  templates: {
    list: () => request("/templates"),
    get: (id) => request("/templates/" + encodeURIComponent(id)),
    create: (body) => request("/templates", { method: "POST", body }),
    update: (id, body) => request("/templates/" + encodeURIComponent(id), { method: "PATCH", body }),
    remove: (id) => request("/templates/" + encodeURIComponent(id), { method: "DELETE" }),
  },
  /* ---------- 分享（只读链接） ---------- */
  shareDoc: (id) => request("/docs/" + encodeURIComponent(id) + "/share", { method: "POST" }),
  unshareDoc: (id) => request("/docs/" + encodeURIComponent(id) + "/share", { method: "DELETE" }),
  getShareState: (id) => request("/docs/" + encodeURIComponent(id) + "/share"),
  getShared: (token) => request("/share/" + encodeURIComponent(token)),
  shareHeartbeat: (token) =>
    request("/share/" + encodeURIComponent(token) + "/heartbeat", { method: "POST" }),
  shareStats: (token) => request("/share/" + encodeURIComponent(token) + "/stats"),
  /* ---------- 在线协作者（顶栏头像组） ---------- */
  presence: {
    ping: (id) => request("/docs/" + encodeURIComponent(id) + "/presence", { method: "POST" }),
    leave: (id) =>
      request("/docs/" + encodeURIComponent(id) + "/presence", { method: "DELETE", keepalive: true }),
    sharePing: (token) =>
      request("/share/" + encodeURIComponent(token) + "/presence", { method: "POST" }),
    shareLeave: (token) =>
      request("/share/" + encodeURIComponent(token) + "/presence", { method: "DELETE", keepalive: true }),
  },
  upload: (dataUrl, name) =>
    request("/upload", { method: "POST", body: { dataUrl, name } }),
  uploadAudio: (dataUrl, name) =>
    request("/upload/audio", { method: "POST", body: { dataUrl, name } }),
  health: () => request("/health"),

  /* ---------- 账号 / 会话 ---------- */
  auth: {
    bootstrapStatus: () => request("/auth/bootstrap-status", { silent401: true }),
    // 首屏探测：未登录返回 null 而不是抛错，也不广播登出事件
    me: async () => {
      try {
        return await request("/auth/me", { silent401: true });
      } catch (e) {
        if (e.status === 401) return null;
        throw e;
      }
    },
    register: (body) => request("/auth/register", { method: "POST", body, silent401: true }),
    login: (body) => request("/auth/login", { method: "POST", body, silent401: true }),
    logout: () => request("/auth/logout", { method: "POST" }),
    updatePassword: (oldPassword, newPassword) =>
      request("/auth/password", { method: "POST", body: { oldPassword, newPassword } }),
    users: (q = "") => request("/users?q=" + encodeURIComponent(q)),
    setDisabled: (id, disabled) =>
      request(
        "/users/" + encodeURIComponent(id) + (disabled ? "/disable" : "/enable"),
        { method: "POST" }
      ),
    setRole: (id, role) =>
      request("/users/" + encodeURIComponent(id) + "/role", { method: "POST", body: { role } }),
    removeUser: (id) => request("/users/" + encodeURIComponent(id), { method: "DELETE" }),
    resetPassword: (id, newPassword) =>
      request("/users/" + encodeURIComponent(id) + "/reset-password", {
        method: "POST",
        body: { newPassword },
      }),
  },

  /* ---------- 管理员数据导出（不含密码哈希 / 会话） ---------- */
  admin: {
    exportData: () => request("/admin/export"),
  },

  /* ---------- 文档权限（ACL） ---------- */
  docsAcl: {
    get: (id) => request("/docs/" + encodeURIComponent(id) + "/acl"),
    set: (id, acl) =>
      request("/docs/" + encodeURIComponent(id) + "/acl", { method: "PUT", body: { acl } }),
  },

  /* ---------- 权限申请（指定人授权 + 审批） ---------- */
  accessRequests: {
    create: (docId, body) =>
      request("/docs/" + encodeURIComponent(docId) + "/access-request", { method: "POST", body }),
    mine: () => request("/access-requests"),
    inbox: () => request("/access-requests/inbox"),
    decide: (rid, action, role) =>
      request("/access-requests/" + encodeURIComponent(rid), {
        method: "POST",
        body: { action, role },
      }),
    cancel: (rid) =>
      request("/access-requests/" + encodeURIComponent(rid), { method: "DELETE" }),
  },

  /* ---------- 站内通知 ---------- */
  notifications: {
    list: () => request("/notifications"),
    read: (id) => request("/notifications/" + encodeURIComponent(id) + "/read", { method: "POST" }),
    readAll: () => request("/notifications/read-all", { method: "POST" }),
    mention: (docId, text) =>
      request("/docs/" + encodeURIComponent(docId) + "/mention", { method: "POST", body: { text } }),
  },

  /* ---------- 互动数据（投票 / 问卷） ---------- */
  interactions: {
    get: (id, detail = false) =>
      request(`/docs/${encodeURIComponent(id)}/interactions?detail=${detail ? 1 : 0}`),
    submit: (id, body) =>
      request(`/docs/${encodeURIComponent(id)}/interactions`, { method: "POST", body }),
  },
  /* 公开分享页：用 token 而非内部 docId，服务端只回聚合、不回原始回答 */
  shareInteractions: {
    get: (token) => request(`/share/${encodeURIComponent(token)}/interactions`),
    submit: (token, body) =>
      request(`/share/${encodeURIComponent(token)}/interactions`, { method: "POST", body }),
  },

  /* ---------- MCP（模型上下文协议） ---------- */
  mcp: {
    meta: () => request("/mcp/meta"),
    list: () => request("/mcp/servers"),
    create: (body) => request("/mcp/servers", { method: "POST", body }),
    update: (id, body) => request("/mcp/servers/" + encodeURIComponent(id), { method: "PATCH", body }),
    remove: (id) => request("/mcp/servers/" + encodeURIComponent(id), { method: "DELETE" }),
    connect: (id) => request("/mcp/servers/" + encodeURIComponent(id) + "/connect", { method: "POST" }),
    disconnect: (id) => request("/mcp/servers/" + encodeURIComponent(id) + "/disconnect", { method: "POST" }),
    call: (id, name, args) =>
      request("/mcp/servers/" + encodeURIComponent(id) + "/call", {
        method: "POST",
        body: { name, arguments: args || {} },
      }),
  },
};
