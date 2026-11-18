/**
 * 无权限访问页 —— 复制地址栏 /editor/doc/<id> 给同事时的落点。
 *
 * 曾经这里会静默退回「用户自己的第一篇文档」，导致分享链接打开的不是那篇内容。
 * 现在由服务端 403 带上最小上下文（标题 / 所有者名 / 我的申请状态），
 * 在此给出「申请权限」入口：提交后所有者在权限面板审批，批准即自动获得角色。
 */
import { useEffect, useState } from "react";
import { api } from "./api.js";

const ROLE_OPTIONS = [
  { key: "viewer", label: "仅查看", desc: "只能阅读文档内容" },
  { key: "editor", label: "可编辑", desc: "可以修改内容，但不能管理成员与权限" },
];

const STATUS_TEXT = {
  pending: "申请已提交，等待所有者处理",
  approved: "申请已通过，你现在可以打开这篇文档",
  rejected: "上一次申请未通过",
  cancelled: "申请已撤回",
};

export default function AccessRequestView({ docId, denied, onGranted, onHome }) {
  const [request, setRequest] = useState(denied?.request || null);
  const [role, setRole] = useState("viewer");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");

  /* 轮询「我的申请」：所有者在另一端批准后，无需刷新就能看到「打开文档」。 */
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const list = await api.accessRequests.mine();
        if (!alive) return;
        const mine = list.find((r) => r.docId === docId);
        if (mine) {
          setRequest((prev) =>
            prev && prev.id === mine.id && prev.status === mine.status ? prev : mine
          );
        }
      } catch (_) {}
    };
    poll();
    const t = setInterval(poll, 12000);
    return () => { alive = false; clearInterval(t); };
  }, [docId]);

  const submit = async () => {
    if (busy) return;
    setBusy(true); setErr(""); setNotice("");
    try {
      const r = await api.accessRequests.create(docId, { role, message });
      setRequest(r);
      setNotice("申请已发送，所有者会在权限面板里看到。");
    } catch (e) {
      setErr(e.message || "提交失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    if (!request || busy) return;
    setBusy(true); setErr("");
    try {
      await api.accessRequests.cancel(request.id);
      setRequest(null);
      setNotice("已撤回申请，可以重新提交。");
    } catch (e) {
      setErr(e.message || "撤回失败");
    } finally {
      setBusy(false);
    }
  };

  const status = request?.status || "";
  const canApply = !request || status === "rejected" || status === "cancelled";

  return (
    <div className="access-page">
      <div className="access-card" role="dialog" aria-label="申请文档权限">
        <div className="access-ico" aria-hidden="true">🔒</div>
        <h2>你没有权限查看这篇文档</h2>
        <p className="access-sub">
          《{denied?.title || "未命名文档"}》归 <b>{denied?.ownerName || "文档所有者"}</b> 所有。
          需要由所有者或「可管理」成员把你加入成员名单，才能查看内容。
        </p>

        {err && <div className="access-msg error">{err}</div>}
        {notice && <div className="access-msg ok">{notice}</div>}

        {status && !canApply && (
          <div className={"access-status " + status}>
            <span className="access-status-dot" />
            <div>
              <b>{STATUS_TEXT[status] || "申请已处理"}</b>
              {request?.grantedRole && (
                <em>已授予：{request.grantedRole === "editor" ? "可编辑" : request.grantedRole === "manager" ? "可管理" : "仅查看"}</em>
              )}
              {request?.createdAt && <em>申请时间：{new Date(request.createdAt).toLocaleString("zh-CN")}</em>}
            </div>
          </div>
        )}

        {status === "approved" ? (
          <button className="tpl-btn primary access-main" onClick={() => onGranted?.()}>
            打开文档
          </button>
        ) : status === "pending" ? (
          <div className="access-actions">
            <button className="tpl-btn primary access-main" disabled={busy} onClick={() => onGranted?.()}>
              我已获授权，重试打开
            </button>
            <button className="access-link" disabled={busy} onClick={withdraw}>撤回申请</button>
          </div>
        ) : (
          <>
            {status === "rejected" && (
              <div className="access-reapply">可以修改申请内容后重新提交。</div>
            )}
            <div className="access-field">
              <span>申请权限</span>
              <div className="access-roles">
                {ROLE_OPTIONS.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    className={"access-role" + (role === o.key ? " on" : "")}
                    onClick={() => setRole(o.key)}
                  >
                    <b>{o.label}</b><em>{o.desc}</em>
                  </button>
                ))}
              </div>
            </div>
            <label className="access-field">
              <span>留言<span className="savetpl-opt">选填</span></span>
              <textarea
                className="access-textarea"
                maxLength={200}
                rows={3}
                value={message}
                placeholder="说明一下你的用途，方便所有者判断"
                onChange={(e) => setMessage(e.target.value)}
              />
            </label>
            <button className="tpl-btn primary access-main" disabled={busy} onClick={submit}>
              {busy ? "提交中…" : "申请权限"}
            </button>
          </>
        )}

        <div className="access-foot">
          <button className="access-link" onClick={() => onHome?.()}>返回我的空间</button>
          <span>地址栏链接可以直接复制给已获授权的成员</span>
        </div>
      </div>
    </div>
  );
}
