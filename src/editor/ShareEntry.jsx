import { EDITOR_ROUTE_BASE } from "./config.js";
/**
 * 分享页轻量入口
 * ------------------------------------------------------------------
 * 匿名访客通过 /editor/s/<token> 直接进来时，只加载分享只读页所需的模块，
 * 不加载主应用外壳（侧栏、文档树、编辑器、AI 面板等），首屏体积显著更小。
 * 主应用内部的 hash 型分享路由仍由 App.jsx 里的 lazy SharePage 兜底。
 */
import { pathShareToken } from "./router.js";
import SharePage from "./ShareView.jsx";

export default function ShareEntry() {
  const token = pathShareToken();
  const base = EDITOR_ROUTE_BASE;
  return (
    <SharePage
      token={token}
      onHome={() => {
        // 独立入口没有 App 的路由上下文，回首页走整页跳转（顺带重新校验登录态）
        window.location.href = base + "/";
      }}
    />
  );
}
