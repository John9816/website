/**
 * 回收站视图：一次删除（含级联子文档）显示为一张卡片（一个批次）。
 * 恢复会连同正文、父子关系、分享链接、投票数据与个人偏好一起还原。
 */
import { useState } from "react";

function fmt(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString("zh-CN", { hour12: false });
}

export default function TrashView({ batches = [], busy = false, onRestore, onPurge, onClear, onGoHome }) {
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div className="view trash-view">
      <div className="trash-head">
        <div>
          <h1 className="trash-h1">回收站</h1>
          <p className="trash-sub">删除的文档会保留在这里，可随时恢复；只有「彻底删除」后才无法找回。</p>
        </div>
        {batches.length > 0 && (
          <div className="trash-head-actions">
            {confirmClear ? (
              <>
                <span className="trash-confirm-text">清空全部 {batches.length} 条？</span>
                <button
                  className="tpl-btn danger"
                  disabled={busy}
                  onClick={async () => { await onClear(); setConfirmClear(false); }}
                >
                  确定清空
                </button>
                <button className="tpl-btn" onClick={() => setConfirmClear(false)}>取消</button>
              </>
            ) : (
              <button className="tpl-btn danger" disabled={busy} onClick={() => setConfirmClear(true)}>
                清空回收站
              </button>
            )}
          </div>
        )}
      </div>

      {batches.length === 0 ? (
        <div className="trash-empty">
          <div className="trash-empty-ico">🗑</div>
          <div className="trash-empty-title">回收站是空的</div>
          <div className="trash-empty-sub">在文档树里删除文档后，会连同子文档一起出现在这里</div>
          <button className="tpl-btn primary" onClick={onGoHome}>返回主页</button>
        </div>
      ) : (
        <div className="trash-list">
          {batches.map((b) => (
            <div className="trash-card" key={b.id}>
              <div className="trash-card-ico">🗑</div>
              <div className="trash-card-main">
                <div className="trash-card-title">{b.rootTitle || "未命名文档"}</div>
                <div className="trash-card-meta">
                  共 {b.count} 篇 · 删除于 {fmt(b.deletedAt)}
                  {b.hasShare && <span className="trash-tag">含分享链接</span>}
                </div>
                <div className="trash-card-titles">
                  {(b.titles || []).map((t, i) => (
                    <span className="trash-chip" key={i}>{t}</span>
                  ))}
                  {b.count > (b.titles || []).length && <span className="trash-chip more">…</span>}
                </div>
              </div>
              <div className="trash-card-btns">
                <button className="tpl-btn primary" disabled={busy} onClick={() => onRestore(b.id)}>恢复</button>
                <button className="tpl-btn danger-ghost" disabled={busy} onClick={() => onPurge(b.id)}>彻底删除</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
