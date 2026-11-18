/**
 * 划词评论气泡：展示某条评论的线程，支持首评/回复、标记解决、删除（去标记）。
 * 纯展示 + 回调；线程数据由编辑器侧统一写回 comment 标记的 attrs。
 */
import { useState } from "react";

function fmt(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch (_) {
    return "";
  }
}

export default function CommentPopover({ anchor, data, editable, onAdd, onResolve, onDelete, onClose }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const thread = (data && data.thread) || [];
  const resolved = !!(data && data.resolved);

  const send = () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    onAdd(t);
    setText("");
    setBusy(false);
  };

  const style = anchor
    ? { position: "fixed", top: anchor.top, left: Math.min(anchor.left, window.innerWidth - 320) }
    : { position: "fixed", top: 80, left: 80 };

  return (
    <div className={"comment-pop rnv-interactive" + (resolved ? " resolved" : "")} style={style} onMouseDown={(e) => e.stopPropagation()}>
      <div className="comment-pop-head">
        <span className="comment-pop-title">{resolved ? "已解决评论" : "评论"}</span>
        <button className="comment-pop-x" onClick={onClose} title="关闭">
          ×
        </button>
      </div>

      <div className="comment-pop-thread">
        {thread.length === 0 ? (
          <div className="comment-pop-empty">还没有评论，写下第一条吧</div>
        ) : (
          thread.map((m, i) => (
            <div className="comment-msg" key={i}>
              <div className="comment-msg-text">{m.text}</div>
              <div className="comment-msg-meta">{fmt(m.ts)}</div>
            </div>
          ))
        )}
      </div>

      <div className="comment-pop-input">
        <textarea
          value={text}
          placeholder={thread.length ? "回复…" : "添加评论…"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
          }}
        />
        <button className="comment-pop-send" onClick={send} disabled={busy || !text.trim()}>
          发送
        </button>
      </div>

      <div className="comment-pop-foot">
        {editable && thread.length > 0 && (
          <button className="comment-pop-btn" onClick={onResolve}>
            {resolved ? "重新打开" : "标记已解决"}
          </button>
        )}
        {editable && (
          <button className="comment-pop-btn danger" onClick={onDelete}>
            删除评论
          </button>
        )}
      </div>
    </div>
  );
}
