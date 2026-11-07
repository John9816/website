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
  health: () => request("/health"),

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
