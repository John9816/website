/**
 * React 节点视图挂载 helper
 * 把 React 组件渲染进 ProseMirror NodeView 的 dom，并在节点更新时重渲染。
 * 关键：stopEvent 把交互事件（输入/点击）交还给 React，避免被 ProseMirror 吞掉；
 *       ignoreMutation 关闭 PM 对内部 DOM 变动的校验（React 自行管理）。
 */
import { createRoot } from "react-dom/client";
import { getDocId, getShareToken } from "./docContext.js";

export function mountReact(Component) {
  return (node, view, getPos) => {
    const dom = document.createElement("div");
    dom.className = "rnv-host";
    const editable = typeof view.editable === "function" ? view.editable() : view.editable;
    let current = node;
    let root = null;
    try {
      root = createRoot(dom);
    } catch (_) {
      // 极少数情况下 createRoot 失败，降级为无交互占位
      const fallback = document.createElement("div");
      fallback.className = "rnv-fallback";
      fallback.textContent = current.attrs.question || current.attrs.title || "（互动组件）";
      return { dom: fallback };
    }

    const render = () => {
      root.render(
        <Component
          node={current}
          view={view}
          getPos={getPos}
          editable={editable}
          docId={getDocId()}
          shareToken={getShareToken()}
        />
      );
    };
    render();

    return {
      dom,
      update(updated) {
        if (updated.type !== current.type) return false;
        current = updated;
        render();
        return true;
      },
      stopEvent(e) {
        const t = e.target;
        if (!t || !t.tagName) return false;
        const tag = t.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON" || tag === "SELECT" || tag === "OPTION") {
          return true;
        }
        // 任何带 rnv-interactive 标记的容器（下拉、气泡等）都交给 React
        if (t.closest && t.closest(".rnv-interactive")) return true;
        return false;
      },
      ignoreMutation() {
        return true;
      },
      destroy() {
        try {
          root && root.unmount();
        } catch (_) {}
      },
    };
  };
}
