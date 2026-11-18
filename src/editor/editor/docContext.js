/**
 * 文档上下文：在 React 节点视图里拿到「互动接口的目标」。
 * 用模块级变量而非 window 全局，编辑页与分享只读页各自 set 一次即可。
 *
 * 编辑页：setDocId(docId) → 走 /api/docs/:id/interactions（需登录）
 * 分享页：setShareToken(token) → 走 /api/share/:token/interactions（匿名只读，
 *         服务端由 token 反查内部 docId 且永不回传，保证分享链接不泄露文档 ID）
 */
let _docId = "";
let _shareToken = "";

export function setDocId(id) {
  _docId = id || "";
}

export function getDocId() {
  return _docId;
}

export function setShareToken(token) {
  _shareToken = token || "";
}

export function getShareToken() {
  return _shareToken;
}

/** 供节点视图判断该走哪套互动接口 */
export function getInteractionsTarget() {
  if (_shareToken) return { kind: "share", token: _shareToken };
  if (_docId) return { kind: "doc", id: _docId };
  return null;
}

/* 跨层操作注册表：Editor 挂载时注册能力，App（右键菜单等）按需调用 */
const ops = {
  /* addComment(from, to, anchor) — 对选区建/开划词评论，anchor={top,left} */
  addComment: null,
};

export function registerOps(partial) {
  Object.assign(ops, partial);
}

export function getOps() {
  return ops;
}

/* 编辑器内核运行时（cmd / TextSelection / isInTable）
   ------------------------------------------------------------------
   Editor.jsx 是按需加载的 chunk，它在模块顶层把 ProseMirror 命令注册到这里，
   App 主包因此无需静态 import 任何 prosemirror 包 —— 这是首屏代码分割的关键：
   右键菜单仍然是同步构建，但真正的实现在编辑器 chunk 加载后才可用。 */
let _runtime = null;

export function registerEditorRuntime(rt) {
  _runtime = rt;
}

export function getEditorRuntime() {
  return _runtime;
}
