/**
 * 访问申请页：当打开一篇不属于自己、且尚未获得授权的文档时展示。
 * 申请者填写理由并提交 -> 写进文档所有者的审批收件箱。
 * 已提交的申请可在此查看审批进度（等待 / 通过 / 拒绝）。
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";

function fmtTime(iso) {
  if (!iso) return "";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  return t.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const STATUS = {
  pending: "等待审批",
  approved: "已通过",
  rejected: "已拒绝",
};

export default function AccessRequest({ docId, onBack, onOpen }) {
  const [meta, setMeta] = useState(null);
  const [message, setMessage] = useState("");
  const [role, setRole] = useState("viewer");
  const [mine, setMine] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadMine = useCallback(async () => {
    try {
      const list = await api.access.mine();
      setMine((list || []).filter((r) => r.docId === docId));
    } catch (_) {}
  }, [docId]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const m = await api.access.docMeta(docId);
        if (active) setMeta(m);
        await loadMine();
      } catch (e) {
        if (active) setError(e?.message || "无法获取文档信息");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [docId, loadMine]);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api.access.request({ docId, message: message.trim(), role });
      setNotice("申请已提交，请等待文档所有者审批。");
      setMessage("");
      await loadMine();
    } catch (err) {
      setError(err?.message || "提交失败");
    } finally {
      setBusy(false);
    }
  };

  const approved = mine.some((r) => r.status === "approved");

  return (
    <div className="share-root access-root">
      <header className="share-top">
        <button className="share-brand" onClick={onBack} title="返回知识库">◀ 知识库</button>
        <div className="share-top-right">
          {approved && <button className="share-btn primary" onClick={() => onOpen?.(docId)}>打开文档</button>}
        </div>
      </header>
      <div className="share-scroll">
        <div className="access-card">
          <div className="access-ico">🔐</div>
          <h1 className="access-title">申请访问文档</h1>
          {loading ? (
            <p className="access-sub">正在获取文档信息…</p>
          ) : meta ? (
            <>
              <p className="access-sub">
                你正在申请访问 <b>{meta.ownerName || "其他用户"}</b> 的文档
              </p>
              <div className="access-doc">
                <span className="access-doc-label">文档标题</span>
                <span className="access-doc-title">{meta.title || "未命名文档"}</span>
              </div>

              {approved ? (
                <div className="access-ok">
                  <div className="access-ok-ico">✅</div>
                  <div>
                    <div className="access-ok-title">你的访问申请已通过</div>
                    <div className="access-sub">现在可以打开这篇文档了（只读）。</div>
                  </div>
                </div>
              ) : (
                <form className="access-form" onSubmit={submit}>
                  <label className="access-label">访问权限</label>
                  <div className="access-roles">
                    <label className={'access-role' + (role === 'viewer' ? ' active' : '')}>
                      <input type="radio" name="role" value="viewer" checked={role === 'viewer'} onChange={() => setRole('viewer')} />
                      只读查看
                    </label>
                    <label className={'access-role' + (role === 'editor' ? ' active' : '')}>
                      <input type="radio" name="role" value="editor" checked={role === 'editor'} onChange={() => setRole('editor')} />
                      可编辑
                    </label>
                  </div>
                  <label className="access-label">申请理由（可选）</label>
                  <textarea
                    className="access-textarea"
                    rows={3}
                    maxLength={300}
                    placeholder="简单说明你为什么需要访问这篇文档…"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                  <button className="access-submit" type="submit" disabled={busy}>
                    {busy ? "提交中…" : "提交申请"}
                  </button>
                </form>
              )}

              {notice && <div className="access-notice">{notice}</div>}
              {error && <div className="access-error">{error}</div>}

              {mine.length > 0 && (
                <div className="access-history">
                  <div className="access-history-title">我的申请记录</div>
                  {mine.map((r) => (
                    <div key={r.id} className="access-history-item">
                      <span className={'access-status st-' + (r.status || 'pending')}>{STATUS[r.status] || r.status}</span>
                      <span className="access-history-msg">{r.message || "（无理由）"}</span>
                      <span className="access-history-time">{fmtTime(r.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="access-error">{error || "文档不存在或链接已失效"}</div>
          )}
        </div>
      </div>
    </div>
  );
}
