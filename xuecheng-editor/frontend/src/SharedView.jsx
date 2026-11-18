/**
 * 收到的分享（对方空间）视图。
 * 与「我的空间」完全分离：这里只列「别人分享给我、我有权限看」的文档，
 * 列表带出所有者名字与权限，语义上属于「对方空间」。点开复用既有 Editor，顶栏不加归属标识。
 */
import { useMemo } from "react";
import { buildTreeMenuItems } from "./treeMenu.jsx";

function relTime(iso) {
  if (!iso) return "未知时间";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "未知时间";
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前`;
  return new Date(t).toLocaleDateString("zh-CN");
}

const noop = () => {};

export default function SharedView({ docs, onOpen, onTogglePin, onRowMenu, loading }) {
  const list = useMemo(() => {
    return [...(docs || [])].sort((a, b) =>
      String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))
    );
  }, [docs]);

  if (!loading && !list.length) {
    return (
      <div className="view shared-view">
        <div className="view-head">
          <h1>收到的分享</h1>
          <p className="view-sub">别人分享给你、你有权限查看的文档会出现在这里（属于对方空间）</p>
        </div>
        <div className="view-empty">还没有人分享文档给你。当他人把文档权限授予你并通过申请后，这里就会出现对应文档。</div>
      </div>
    );
  }

  return (
    <div className="view shared-view">
      <div className="view-head">
        <h1>收到的分享</h1>
        <p className="view-sub">{loading ? "加载中…" : `共 ${list.length} 篇来自他人空间的文档`}</p>
      </div>

      {loading && !list.length ? (
        <div className="view-empty">加载中…</div>
      ) : (
        <div className="shared-list">
          {list.map((d) => (
            <div
              key={d.id}
              className={"shared-row" + (d.pinned ? " pinned" : "")}
              onClick={() => onOpen && onOpen(d.id)}
            >
              <span className="shared-ico">▤</span>
              <div className="shared-main">
                <div className="shared-title">{d.title || "未命名文档"}</div>
                <div className="shared-meta">
                  <span className="shared-owner">{d.ownerName ? `${d.ownerName} 的空间` : "他人空间"}</span>
                  <span className={"shared-perm" + (d.canEdit ? " edit" : "")}>
                    {d.canEdit ? "可编辑" : "可查看"}
                  </span>
                  <span className="shared-time">编辑于 {relTime(d.updatedAt)}</span>
                </div>
              </div>
              {onRowMenu && (
                <button
                  className="shared-more"
                  title="更多"
                  onClick={(e) => {
                    e.stopPropagation();
                    const items = buildTreeMenuItems(d, {
                      onTogglePin,
                      onAdd: noop,
                      onDelete: noop,
                      onPermission: noop,
                    });
                    onRowMenu(e.clientX, e.clientY, items);
                  }}
                >
                  ⋯
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
