/**
 * 学城编辑器迁入 website 后的路径配置。
 *
 * 原独立部署：前端 /editor/* + API /editor/api/*，均由 CF Worker 同源提供。
 * 迁入 website 后：
 *   - 前端路由仍挂在 /editor/*（由 website 的 App.tsx 路由挂载 EditorApp）
 *   - API 改走 /api/editor/*（website 的 Pages Functions 只代理 /api/* 到后端）
 *   - 鉴权由 Cookie 会话改为 website 的 JWT（localStorage nav.auth.session）
 */
export const EDITOR_ROUTE_BASE = '/editor';
export const EDITOR_API_BASE = '/api/editor';

/** 读取 website 已登录用户的 JWT。与 src/api/client.ts 的 nav.auth.session 键一致。 */
export function readAuthToken() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem('nav.auth.session');
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && typeof s.token === 'string' ? s.token : null;
  } catch {
    return null;
  }
}

/** 未登录时跳转到 website 登录页，登录后回跳当前编辑器地址。 */
export function redirectToSiteLogin(notice) {
  if (typeof window === 'undefined') return;
  const back = encodeURIComponent(window.location.pathname + window.location.search);
  const q = notice ? `&editorNotice=${encodeURIComponent(notice)}` : '';
  window.location.assign(`/login?redirect=${back}${q}`);
}
