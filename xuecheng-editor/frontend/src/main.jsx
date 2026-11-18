import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const App = lazy(() => import("./App.jsx"));
const ShareEntry = lazy(() => import("./ShareEntry.jsx"));

/* 分享链接走独立轻量入口：匿名访客只需要只读渲染器，
   不必下载主应用外壳（侧栏、文档树、编辑器、AI 面板等）。 */
const isSharePath = /\/s\/[^/?#]+\/?$/.test(window.location.pathname);

createRoot(document.getElementById("root")).render(
  <Suspense fallback={<div className="loading-page">正在加载…</div>}>
    {isSharePath ? <ShareEntry /> : <App />}
  </Suspense>
);
