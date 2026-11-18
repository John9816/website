import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";

/* 通知类型 → 文案与配色（铃铛常驻顶栏，纯 SVG，无重型依赖） */
const TYPE_META = {
  access_request: { color: "#1668dc", dot: "申请访问" },
  access_approved: { color: "#0f9d58", dot: "已通过" },
  access_rejected: { color: "#d93026", dot: "被拒绝" },
  access_granted: { color: "#7c4dff", dot: "已开通" },
  mention: { color: "#f59e0b", dot: "提及我" },
};
function roleLabel(r) {
  return r === "editor" ? "可编辑" : r === "manager" ? "可管理" : "仅查看";
}
function buildText(n) {
  switch (n.type) {
    case "access_request":
      return {
        title: `${n.actorName || "有人"} 申请访问《${n.docTitle || "文档"}》`,
        desc: `${roleLabel(n.role)} · ${n.message ? "留言：" + n.message : "无留言"}`,
      };
    case "access_approved":
      return {
        title: `${n.actorName || "所有者"} 已通过你对《${n.docTitle || "文档"}》的访问申请`,
        desc: n.role ? `已授予权限：${roleLabel(n.role)}` : "",
      };
    case "access_rejected":
      return {
        title: `${n.actorName || "所有者"} 拒绝了你对《${n.docTitle || "文档"}》的访问申请`,
        desc: "如需访问可重新发起申请",
      };
    case "access_granted":
      return {
        title: `${n.actorName || "所有者"} 已为你开通《${n.docTitle || "文档"}》的访问权限`,
        desc: n.role ? `权限：${roleLabel(n.role)}` : "",
      };
    case "mention":
      return {
        title: `${n.actorName || "有人"} 在《${n.docTitle || "文档"}》的评论中提到了你`,
        desc: n.message ? `“${n.message}”` : "点击查看评论",
      };
    default:
      return { title: "新的通知", desc: "" };
  }
}
function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "刚刚";
  if (s < 3600) return Math.floor(s / 60) + " 分钟前";
  if (s < 86400) return Math.floor(s / 3600) + " 小时前";
  return new Date(iso).toLocaleDateString("zh-CN");
}

export default function NotificationBell({ user, onOpenDoc, onOpenPerm }) {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const d = await api.notifications.list();
      setItems(d.items || []);
      setUnread(d.unread || 0);
    } catch (_) {
      /* 会话失效等：静默忽略，登录态会自行恢复 */
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
    const t = setInterval(load, 15000); // 15s 轮询，比权限角标的 60s 更及时
    return () => clearInterval(t);
  }, [user, load]);

  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const onItem = async (n) => {
    if (!n.read) {
      try {
        await api.notifications.read(n.id);
      } catch (_) {}
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
    }
    setOpen(false);
    if (n.type === "access_request" && onOpenPerm && n.docId) onOpenPerm(n.docId);
    else if (n.docId && onOpenDoc) onOpenDoc(n.docId);
  };

  const readAll = async () => {
    try {
      await api.notifications.readAll();
    } catch (_) {}
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    setUnread(0);
  };

  return (
    <div className="notif-bell-wrap" ref={wrapRef}>
      <button
        className="top-notif"
        data-tip={unread > 0 ? `通知 · ${unread} 条未读` : "通知"}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && <i className="notif-badge">{unread > 9 ? "9+" : unread}</i>}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-head">
            <span>通知</span>
            <button className="notif-readall" onClick={readAll} disabled={unread === 0}>
              全部已读
            </button>
          </div>
          <div className="notif-list">
            {items.length === 0 ? (
              <div className="notif-empty">暂无通知</div>
            ) : (
              items.map((n) => {
                const t = buildText(n);
                const meta = TYPE_META[n.type] || { color: "#8f959e" };
                return (
                  <div
                    key={n.id}
                    className={"notif-item" + (n.read ? " read" : "")}
                    onClick={() => onItem(n)}
                  >
                    <span className="notif-bar" style={{ background: meta.color }} />
                    <div className="notif-body">
                      <div className="notif-title">{t.title}</div>
                      {t.desc && <div className="notif-desc">{t.desc}</div>}
                      <div className="notif-time">{timeAgo(n.createdAt)}</div>
                    </div>
                    {!n.read && <span className="notif-unread" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
