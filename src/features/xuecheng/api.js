import { request as websiteRequest } from '../../api/client'
const BASE = '/editor/api';
function request(path, { method = 'GET', body } = {}) {
  return websiteRequest(BASE + path, { method, body, auth: !path.startsWith('/share/'), sameOrigin: true });
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
  // 通用局部更新：用于收藏开关、记录最近访问（标题/正文编辑走 saveDoc）
  updateDoc: (id, patch) =>
    request("/docs/" + encodeURIComponent(id), { method: "PATCH", body: patch }),
  deleteDoc: (id) => request("/docs/" + encodeURIComponent(id), { method: "DELETE" }),
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
  upload: (dataUrl, name) =>
    request("/upload", { method: "POST", body: { dataUrl, name } }),
  uploadAudio: (dataUrl, name) =>
    request("/upload/audio", { method: "POST", body: { dataUrl, name } }),
  health: () => request("/health"),

  /* ---------- 回收站 ---------- */
  trash: {
    list: () => request("/trash"),
    restore: (id) => request("/trash/" + encodeURIComponent(id), { method: "POST" }),
    purge: (id) => request("/trash/" + encodeURIComponent(id), { method: "DELETE" }),
  },
  /* ---------- 通知 ---------- */
  notifications: {
    list: (unreadOnly) => request("/notifications" + (unreadOnly ? "?unread=1" : "")),
    readAll: (ids) => request("/notifications/read-all", { method: "POST", body: { ids } }),
  },
  /* ---------- 提及 ---------- */
  mentions: {
    list: (unreadOnly) => request("/mentions" + (unreadOnly ? "?unread=1" : "")),
    create: (body) => request("/mention", { method: "POST", body }),
    readAll: (ids) => request("/mentions/read-all", { method: "POST", body: { ids } }),
  },
  /* ---------- 评论 ---------- */
  comments: {
    list: (docId) => request("/comments" + (docId ? "?doc=" + encodeURIComponent(docId) : "")),
    create: (docId, text) => request("/comments", { method: "POST", body: { docId, text } }),
    reply: (id, text) => request("/comments/" + encodeURIComponent(id) + "/reply", { method: "POST", body: { text } }),
    remove: (id) => request("/comments/" + encodeURIComponent(id), { method: "DELETE" }),
  },
  /* ---------- 权限申请 / 审批 ---------- */
  access: {
    list: (inbox) => request("/access-requests" + (inbox ? "?inbox=1" : "")),
    request: (body) => request("/access-request", { method: "POST", body }),
    decide: (id, approve) => request("/access-requests/" + encodeURIComponent(id), { method: "POST", body: { approve } }),
  },
  /* ---------- 在线状态（轮询） ---------- */
  presence: {
    list: () => request("/presence"),
    heartbeat: (docId) => request("/heartbeat", { method: "POST", body: { docId } }),
  },
  stats: () => request("/stats"),

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
