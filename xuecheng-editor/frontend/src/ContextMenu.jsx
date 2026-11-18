/**
 * 通用右键/下拉上下文菜单。
 *
 * 对标飞书文档 / 钉钉文档 / Notion 的层级菜单规范：
 *  - 一级菜单保持精简（≤10 个可点项），低频操作收进二级子菜单
 *  - 分组标题 + 细分隔线承担信息架构，危险操作不再平铺成一片红
 *  - 悬停/点击展开子菜单，视口不足自动翻转到左侧
 *  - 完整键盘导航：↑↓ 移动、→ 进入子菜单、← 返回、Enter 执行、Esc 关闭
 *  - 统一图标、快捷键、禁用态与柔和阴影，带轻量进场动画
 *
 * item 结构（向后兼容旧调用方）：
 *   { sep: true }                       分隔线
 *   { group: "标题" }                   分组标题
 *   { label, icon, hint, danger, disabled, onClick }
 *   { label, icon, children: [...] }    二级子菜单（可递归）
 *
 * 由 App 统一挂载：位置跟随鼠标或触发元素，点击外部或 Esc 关闭。
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { RightOutlined } from "@ant-design/icons";

/* 悬停展开子菜单的延迟：避免鼠标快速划过时菜单乱闪 */
const SUB_DELAY = 90;
/* 判定右侧空间是否足够放下子菜单 */
const SUB_MIN_WIDTH = 240;

function MenuPanel({ items, x, y, anchor, onCloseAll, onBack, autoFocus = true }) {
  const ref = useRef(null);
  const itemRefs = useRef([]);
  const [pos, setPos] = useState({ left: x || 0, top: y || 0 });
  const [openIdx, setOpenIdx] = useState(null);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [subFocus, setSubFocus] = useState(false);
  const hoverTimer = useRef(null);

  const anchorKey = anchor
    ? `${anchor.left}|${anchor.right}|${anchor.top}|${anchor.preferLeft}`
    : "";

  /* 视口内定位：根菜单跟随鼠标，子菜单贴父项右侧（空间不足翻到左侧） */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left;
    let top;
    if (anchor) {
      left = anchor.preferLeft ? anchor.left - r.width + 4 : anchor.right - 4;
      top = anchor.top - 6;
      if (left < 8) left = anchor.right - 4;
      if (left + r.width > vw - 8) left = Math.max(8, vw - r.width - 8);
    } else {
      left = x;
      top = y;
      if (left + r.width > vw - 8) left = Math.max(8, vw - r.width - 8);
    }
    if (top + r.height > vh - 8) top = Math.max(8, vh - r.height - 8);
    if (top < 8) top = 8;
    setPos({ left, top });
    // anchorKey / items.length 为原始值，避免每次渲染都因新对象引用重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y, anchorKey, items.length]);

  /* 键盘触发的展开才抢焦点，鼠标悬停展开不动焦点，避免打断编辑器光标 */
  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  const actionable = () =>
    items
      .map((it, i) => ({ it, i }))
      .filter(({ it }) => !it.sep && !it.group && !it.disabled);

  const openSub = (i, byKeyboard) => {
    clearTimeout(hoverTimer.current);
    setOpenIdx(i);
    setActiveIdx(i);
    setSubFocus(!!byKeyboard);
  };

  const activate = (it, i) => {
    if (it.disabled) return;
    if (it.children?.length) {
      const next = openIdx === i ? null : i;
      clearTimeout(hoverTimer.current);
      setOpenIdx(next);
      setSubFocus(false);
      return;
    }
    onCloseAll();
    it.onClick?.();
  };

  const onItemEnter = (i, it) => {
    setActiveIdx(i);
    clearTimeout(hoverTimer.current);
    if (it.disabled) return;
    if (it.children?.length) {
      hoverTimer.current = setTimeout(() => openSub(i, false), SUB_DELAY);
    } else if (openIdx != null) {
      // 移到普通项时收起已展开的子菜单，避免菜单树残留
      setOpenIdx(null);
    }
  };

  const onKeyDown = (e) => {
    e.stopPropagation();
    const list = actionable();
    if (!list.length) return;
    const cur = list.findIndex(({ i }) => i === activeIdx);
    const step = (delta) => {
      e.preventDefault();
      const next = list[(cur + delta + list.length) % list.length];
      setActiveIdx(next.i);
      setOpenIdx(null);
    };
    if (e.key === "ArrowDown") step(1);
    else if (e.key === "ArrowUp") step(-1);
    else if (e.key === "ArrowRight") {
      const it = items[activeIdx];
      if (it?.children?.length) {
        e.preventDefault();
        openSub(activeIdx, true);
      }
    } else if (e.key === "ArrowLeft") {
      if (onBack) {
        e.preventDefault();
        onBack();
      }
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const it = items[activeIdx];
      if (it) activate(it, activeIdx);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCloseAll();
    }
  };

  /* 子菜单锚点：从已渲染的父项按钮实时量取 */
  let subAnchor = null;
  if (openIdx != null && itemRefs.current[openIdx]) {
    const r = itemRefs.current[openIdx].getBoundingClientRect();
    subAnchor = {
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
      preferLeft: window.innerWidth - r.right < SUB_MIN_WIDTH,
    };
  }

  return (
    <>
      <div
        className={"ctx-menu" + (anchor ? " ctx-menu--sub" : "")}
        ref={ref}
        tabIndex={-1}
        style={{ left: pos.left, top: pos.top }}
        role="menu"
        onKeyDown={onKeyDown}
      >
        {items.map((it, i) => {
          if (it.sep) return <div key={i} className="ctx-sep" role="separator" />;
          if (it.group) return <div key={i} className="ctx-group">{it.group}</div>;
          const hasSub = !!it.children?.length;
          return (
            <button
              key={i}
              ref={(el) => { itemRefs.current[i] = el; }}
              type="button"
              role="menuitem"
              data-label={it.label}
              className={
                "ctx-item" +
                (it.danger ? " danger" : "") +
                (it.disabled ? " disabled" : "") +
                (activeIdx === i ? " is-active" : "") +
                (openIdx === i ? " is-open" : "") +
                (hasSub ? " has-sub" : "")
              }
              disabled={it.disabled}
              onMouseEnter={() => onItemEnter(i, it)}
              onMouseLeave={() => clearTimeout(hoverTimer.current)}
              onClick={() => activate(it, i)}
            >
              <span className="ctx-ico">{it.icon || null}</span>
              <span className="ctx-text">{it.label}</span>
              {it.hint ? <span className="ctx-hint">{it.hint}</span> : null}
              {hasSub ? <span className="ctx-arrow"><RightOutlined /></span> : null}
            </button>
          );
        })}
      </div>
      {subAnchor && items[openIdx]?.children?.length ? (
        <MenuPanel
          key={openIdx}
          items={items[openIdx].children}
          anchor={subAnchor}
          onCloseAll={onCloseAll}
          onBack={() => {
            setOpenIdx(null);
            ref.current?.focus({ preventScroll: true });
          }}
          autoFocus={subFocus}
        />
      ) : null}
    </>
  );
}

export default function ContextMenu({ x, y, items, onClose }) {
  /* 在挂载前记录焦点所在（编辑器 contenteditable），关闭后还回去 */
  const restoreRef = useRef(typeof document !== "undefined" ? document.activeElement : null);

  useEffect(() => {
    const onDown = (e) => {
      if (!e.target?.closest?.(".ctx-menu")) onClose();
    };
    // 捕获阶段监听 Esc：子菜单面板会 stopPropagation，但 Esc 一律关闭整棵菜单树
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    // 延后挂监听：避免打开菜单的那次点击立刻把它关掉
    const t = setTimeout(() => {
      document.addEventListener("mousedown", onDown, true);
      document.addEventListener("keydown", onKey, true);
      window.addEventListener("blur", onClose);
      window.addEventListener("resize", onClose);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
      const el = restoreRef.current;
      if (el && el.isConnected && typeof el.focus === "function" && !el.closest?.(".ctx-menu")) {
        el.focus({ preventScroll: true });
      }
    };
  }, [onClose]);

  /* 位置或内容变化时重新挂载，清空上一份菜单的子菜单/高亮状态 */
  return (
    <MenuPanel
      key={`${x}-${y}-${items.length}`}
      items={items}
      x={x}
      y={y}
      onCloseAll={onClose}
    />
  );
}
