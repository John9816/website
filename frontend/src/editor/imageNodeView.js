/**
 * 图片 NodeView：在原生 <img> 外包裹一层，右下角加一个拖拽缩放手柄。
 * - 宽度/边框通过节点属性持久化（写入 width / border），与 schema.toDOM 共用 imageStyle
 * - 仅 editable 视图可拖拽；只读分享页不注册本 NodeView，直接用 schema.toDOM 渲染（无手柄）
 * - 保持 inline，兼容现有「图片内嵌段落」的文档结构
 */
import { imageStyle } from "../schema.js";

function applyStyle(img, attrs) {
  const s = imageStyle(attrs);
  img.style.cssText = s || "";
  if (!s) img.removeAttribute("style");
}

export function imageNodeView(node, view, getPos) {
  const span = document.createElement("span");
  span.className = "img-embed";
  span.setAttribute("data-img-embed", "1");

  const img = document.createElement("img");
  img.src = node.attrs.src;
  img.alt = node.attrs.alt || "";
  img.title = node.attrs.title || "";
  applyStyle(img, node.attrs);
  span.appendChild(img);

  const handle = document.createElement("span");
  handle.className = "img-resize-handle";
  handle.setAttribute("contenteditable", "false");
  handle.setAttribute("draggable", "false");
  handle.title = "拖拽调整宽度";
  span.appendChild(handle);

  handle.addEventListener("mousedown", (e) => {
    if (!view.editable) return; // 只读视图不响应
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = img.offsetWidth || img.naturalWidth || 80;
    const maxW = span.parentElement ? span.parentElement.clientWidth : startW;
    const onMove = (ev) => {
      const dw = ev.clientX - startX;
      let w = Math.max(40, Math.min(startW + dw, maxW || startW + dw));
      img.style.width = w + "px";
      img.style.height = "auto";
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      const finalW = img.offsetWidth;
      if (typeof getPos === "function" && view.editable) {
        const pos = getPos();
        if (typeof pos === "number") {
          const tr = view.state.tr.setNodeMarkup(pos, null, {
            ...node.attrs,
            width: finalW + "px",
          });
          view.dispatch(tr);
        }
      }
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  return {
    dom: span,
    // 属性变化（气泡菜单设宽度/边框）时同步样式
    update(updated) {
      if (updated.type !== node.type) return false;
      node = updated;
      applyStyle(img, node.attrs);
      return true;
    },
  };
}
