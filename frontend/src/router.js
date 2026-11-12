/**
 * 路由：地址栏同时支持路径型（可分享）与 hash 型（旧链接兼容）
 *   /doc/<id>                             打开某篇文档（地址栏形态，可复制分享，IM 预览正确）
 *   /s/<token>                            只读分享页（路径型，服务端注入标题）
 *   /home /templates /square /favspace /trash  各页面
 *   #/doc/<id> 等                         旧链接形态，进入后自动规范化成路径型
 *
 * 采用 history 路由（pushState）：地址栏真实反映当前位置，刷新 / 收藏 / 分享都可用。
 * 刷新 /editor/doc/<id> 时浏览器向服务器请求该路径，服务器返回注入了标题的 SPA 入口，
 * 这样 IM / 爬虫抓取链接时无需执行 JS 也能拿到真实文章标题。
 */
import { useCallback, useEffect, useState } from "react";

export const PAGES = ["home", "templates", "square", "favspace", "trash"];

/** 解析 path 段（已去 base、无 #），如 "doc/abc" -> {name:"doc",id:"abc"} */
export function parsePath(p) {
  const raw = String(p || "").replace(/^\/+/, "").replace(/\/+$/, "");
  if (!raw) return { name: "root" };
  const seg = raw.split("/").filter(Boolean);
  if (seg[0] === "doc" && seg[1]) return { name: "doc", id: decodeURIComponent(seg[1]) };
  if (seg[0] === "s" && seg[1]) return { name: "share", token: decodeURIComponent(seg[1]) };
  if (PAGES.includes(seg[0])) return { name: "page", page: seg[0] };
  return { name: "root" };
}

/** 兼容旧的 hash 解析（#/doc/abc -> {name:"doc",id:"abc"}） */
export function parseHash(hash) {
  return parsePath(String(hash || "").replace(/^#\/?/, ""));
}

/** 当前 pathname（去掉 base，如 /editor/doc/x -> /doc/x） */
function currentPath() {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  let p = window.location.pathname || "/";
  if (base && p.startsWith(base)) p = p.slice(base.length);
  if (!p.startsWith("/")) p = "/" + p;
  return p;
}

/** 从路径型分享页解析 token（/editor/s/<token>） */
export function pathShareToken() {
  const p = currentPath();
  const m = p.match(/^\/s\/([^/?#]+)\/?$/);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * 综合判断初始路由：
 *  - path 优先（地址栏可分享形态）
 *  - 其次看 hash（兼容旧链接 / 应用内运行时）
 */
export function parseRouteFromLocation() {
  const p = currentPath();
  if (p && p !== "/") {
    const r = parsePath(p);
    if (r.name !== "root") return r;
  }
  const h = window.location.hash || "";
  if (h.length > 1) {
    const r = parseHash(h);
    if (r.name !== "root") return r;
  }
  return { name: "root" };
}

/** 生成文档的 path 形态链接（可分享，不再带 #） */
export const docHash = (id) => `/doc/${encodeURIComponent(id)}`;
/** 生成分享的 path 形态链接 */
export const shareHash = (token) => `/s/${encodeURIComponent(token)}`;

export function useHashRoute() {
  const [route, setRoute] = useState(() => parseRouteFromLocation());

  const navigate = useCallback((to, { replace = false } = {}) => {
    // 兼容旧调用：可能带 # 前缀，统一成 path 形态
    let path = typeof to === "string" ? to : "/";
    if (path.startsWith("#")) path = path.slice(1);
    if (!path.startsWith("/")) path = "/" + path;
    const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
    const full = base + path + (window.location.search || "");
    const cur = window.location.pathname + (window.location.search || "");
    if (cur === full) {
      setRoute(parsePath(path));
      return;
    }
    if (replace) window.history.replaceState(null, "", full);
    else window.history.pushState(null, "", full);
    setRoute(parsePath(path));
  }, []);

  useEffect(() => {
    const sync = () => setRoute(parseRouteFromLocation());
    window.addEventListener("popstate", sync);

    // 兼容旧 hash 链接：进入后规范化成路径型并清除 #，让地址栏变成可分享形态
    const h = window.location.hash || "";
    if (h.length > 1) {
      const r = parseHash(h);
      if (r.name === "doc") navigate(`/doc/${r.id}`, { replace: true });
      else if (r.name === "share") navigate(`/s/${r.token}`, { replace: true });
      else if (r.name === "page") navigate(`/${r.page}`, { replace: true });
    }
    return () => window.removeEventListener("popstate", sync);
  }, [navigate]);

  return { route, navigate };
}
