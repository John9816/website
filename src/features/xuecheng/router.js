/**
 * 极简哈希路由
 * 目的：让地址栏真实反映「当前在哪」，可刷新直达、可收藏、可分享。
 * 形态：
 *   #/doc/<id>     打开某篇文档
 *   #/home         主页
 *   #/templates    模板市场
 *   #/square       知识广场
 *   #/favspace     收藏空间
 *   #/s/<token>    只读分享页
 *
 * 用 hash 而不是 history：静态托管 / 反代（/editor 子路径）下都不用改服务端规则，
 * 且和已有的 SPA 兜底天然兼容。
 */
import { useCallback, useEffect, useState } from "react";

export const PAGES = ["home", "templates", "square", "favspace"];

export function parseHash(hash) {
  const raw = String(hash || "").replace(/^#\/?/, "");
  if (!raw) return { name: "root" };
  const seg = raw.split("/").filter(Boolean);
  if (seg[0] === "doc" && seg[1]) return { name: "doc", id: seg[1] };
  if (seg[0] === "s" && seg[1]) return { name: "share", token: seg[1] };
  if (PAGES.includes(seg[0])) return { name: "page", page: seg[0] };
  return { name: "root" };
}

/** 生成某个文档的 hash 路径 */
export const docHash = (id) => `#/doc/${encodeURIComponent(id)}`;
export const shareHash = (token) => `#/s/${encodeURIComponent(token)}`;

export function useHashRoute() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));

  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  /**
   * replace=true 时不新增历史记录（用于「自动跳到上一篇」这类被动跳转）
   * 注意：replaceState 不会触发 hashchange，需手动同步一次 state
   */
  const navigate = useCallback((hash, { replace = false } = {}) => {
    const h = hash.startsWith("#") ? hash : "#" + hash;
    if (window.location.hash === h) {
      setRoute(parseHash(h));
      return;
    }
    if (replace) {
      const url = window.location.pathname + window.location.search + h;
      window.history.replaceState(null, "", url);
      setRoute(parseHash(h));
    } else {
      window.location.hash = h; // 触发 hashchange → setRoute
    }
  }, []);

  return { route, navigate };
}
