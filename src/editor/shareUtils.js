import { EDITOR_ROUTE_BASE } from "./config.js";
/**
 * 分享链接与剪贴板工具（零依赖）
 * ------------------------------------------------------------------
 * 从 ShareView.jsx 拆出：PermissionDialog 等首屏模块只需要这两个纯函数，
 * 若从 ShareView 引入会连带把 ProseMirror 只读渲染器拉进主包。
 */
export function shareUrl(token) {
  if (!token) return "";
  const base = EDITOR_ROUTE_BASE || "/";
  const basePath = base === "/" ? "" : base.replace(/\/$/, "");
  // 路径形态 /s/<token>：# 不会发到服务器，只有路径能让 IM/爬虫拿到真实标题
  return `${window.location.origin}${basePath}/s/${encodeURIComponent(token)}`;
}

/** 复制到剪贴板：优先 Clipboard API，HTTP 环境下退回到 execCommand */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (_) {
    return false;
  }
}
