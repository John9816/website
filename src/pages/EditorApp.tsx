import { Suspense, lazy } from 'react'

/**
 * 学城编辑器挂载壳。
 *
 * editor 前端（src/editor/*）原本是独立 SPA，由 main.jsx 按路径分流：
 *   - /editor/s/<token>  -> ShareEntry（匿名只读分享页，轻量）
 *   - 其它 /editor/*      -> App（主应用，内部自有 history 路由）
 * 迁入 website 后，本组件承担原 main.jsx 的分流职责；样式也在此引入。
 *
 *   - API 走 /api/editor（见 src/editor/config.js）
 *   - 登录态复用 website JWT，未登录由编辑器内部跳 /login
 *
 * 用 lazy 动态加载，避免让主站首屏打包 prosemirror 编辑器内核。
 */
const App = lazy(() => import('../editor/App.jsx'))
const ShareEntry = lazy(() => import('../editor/ShareEntry.jsx'))

// 编辑器自带样式。作用域由 App.jsx / 各组件自身的类名约束，
// 不引入全局 reset 覆盖主站（styles.css 里主要是 .app / .auth-* 等前缀类）。
import '../editor/styles.css'

function isSharePath() {
  return /\/s\/[^/?#]+\/?$/.test(window.location.pathname)
}

export default function EditorApp() {
  const Root = isSharePath() ? ShareEntry : App
  return (
    <Suspense
      fallback={
        <div className="loading-page" style={{ padding: 32, textAlign: 'center' }}>
          正在加载学城编辑器…
        </div>
      }
    >
      <Root />
    </Suspense>
  )
}
