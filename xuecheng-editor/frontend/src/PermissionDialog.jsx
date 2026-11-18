/**
 * 文档权限面板 —— 以「指定人授权」为中心，不再提供一键生成分享链接。
 *
 * 布局沿用 ShareDialog 的 .share-mask > .share-modal > head/body/foot 版式。
 *
 * 权限模型（与 server/auth.js 对齐）：
 *   - 角色三级：仅查看 viewer / 可编辑 editor / 可管理 manager（owner 是隐含最高角色）
 *   - visibility 两档：仅指定成员 private / 所有登录用户 logged-in
 *   - inherit   （子视角）本页是否接受父文档权限
 *   - propagate （父视角）本页权限是否应用到子文档
 *   只有 inherit && 父.propagate 同时成立，子文档才继承；否则权限只作用于单文档。
 *   - 权限申请由所有者 / manager 在此审批，批准时成员写入「权限链源头」。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";

const VISIBILITIES = [
  { key: "private", icon: "🔒", title: "仅指定成员", desc: "只有你与下方成员名单中的人能查看" },
  { key: "logged-in", icon: "👥", title: "所有登录用户", desc: "任何已登录的人都能阅读，仍不能编辑" },
];

const ROLES = [
  { key: "viewer", label: "仅查看", desc: "只能阅读内容" },
  { key: "editor", label: "可编辑", desc: "可以修改内容，不能管理成员" },
  { key: "manager", label: "可管理", desc: "可编辑并管理成员、审批申请" },
];
const roleLabel = (r) => (ROLES.find((x) => x.key === r)?.label || "仅查看");

export default function PermissionDialog({ doc, onClose, onChanged }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [acl, setAcl] = useState({ visibility: "private", members: {}, inherit: true, propagate: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [addRole, setAddRole] = useState("viewer");
  const [inbox, setInbox] = useState([]);
  const [decideRole, setDecideRole] = useState({});
  const [deciding, setDeciding] = useState("");
  const aliveRef = useRef(true);

  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);

  const loadAcl = useCallback(async () => {
    const a = await api.docsAcl.get(doc.id);
    if (!aliveRef.current) return;
    setData(a);
    setAcl(a.own || { visibility: a.visibility, members: {}, inherit: true, propagate: true });
  }, [doc.id]);

  const loadInbox = useCallback(async () => {
    try {
      const list = await api.accessRequests.inbox();
      if (aliveRef.current) setInbox(Array.isArray(list) ? list : []);
    } catch (_) {}
  }, []);

  useEffect(() => {
    (async () => {
      try { await Promise.all([loadAcl(), loadInbox()]); }
      catch (e) { if (aliveRef.current) setErr(e.message || "加载权限失败"); }
      finally { if (aliveRef.current) setLoading(false); }
    })();
    const t = setInterval(loadInbox, 20000);
    return () => clearInterval(t);
  }, [loadAcl, loadInbox]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async (next) => {
    if (!doc.canManage || busy) return;
    setBusy(true); setErr("");
    try {
      const r = await api.docsAcl.set(doc.id, next);
      setAcl(r.acl || next);
      onChanged?.();
      await loadAcl();
    } catch (e) {
      setErr(e.message || "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const search = async (text) => {
    setQ(text);
    if (!text.trim()) { setResults([]); return; }
    try { setResults(await api.auth.users(text.trim())); }
    catch (_) { setResults([]); }
  };

  const addMember = (u) => {
    if (!u || acl.members[u.id]) return;
    setResults([]); setQ("");
    save({ ...acl, members: { ...acl.members, [u.id]: addRole } });
  };

  /* 手动指定用户名：搜索没结果时按精确用户名再试一次 */
  const addByExactName = async () => {
    const name = q.trim();
    if (!name) return;
    try {
      const found = await api.auth.users(name);
      const exact = found.find((u) => String(u.username).toLowerCase() === name.toLowerCase()) || found[0];
      if (exact) addMember(exact);
      else setErr(`没有找到用户「${name}」，请确认对方已注册`);
    } catch (e) {
      setErr(e.message || "查找用户失败");
    }
  };

  const setRole = (uid, role) => save({ ...acl, members: { ...acl.members, [uid]: role } });
  const removeMember = (uid) => {
    const members = { ...acl.members };
    delete members[uid];
    save({ ...acl, members });
  };

  const decide = async (r, action) => {
    if (deciding) return;
    setDeciding(r.id); setErr("");
    try {
      const role = decideRole[r.id] || r.role || "viewer";
      await api.accessRequests.decide(r.id, action, role);
      await Promise.all([loadInbox(), loadAcl()]);
      onChanged?.();
    } catch (e) {
      setErr(e.message || "处理失败");
    } finally {
      setDeciding("");
    }
  };

  const readonly = !doc.canManage;
  const canInherit = !!data?.canInherit;
  const childCount = data?.childCount || 0;
  // inherit 生效时本页自身成员不生效，禁用编辑；展示目录的有效成员
  const inherited = !!acl.inherit && canInherit;
  const memberEditable = !readonly && !inherited;
  const displayMembers = memberEditable
    ? (data?.ownMembers || []).map((u) => ({ ...u, role: acl.members[u.id] || u.role }))
    : (data?.members || []);
  // 历史「公开链接只读」文档归到「所有登录用户」，避免面板出现无选中项
  const visKey = acl.visibility === "link" ? "logged-in" : acl.visibility || "private";

  return (
    <div className="share-mask" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="share-modal perm-modal" role="dialog" aria-modal="true" aria-label="文档权限">
        <div className="share-modal-head">
          <div>
            <h3>权限与成员</h3>
            <p className="share-modal-sub">{doc.title || "未命名文档"}</p>
          </div>
          <button className="share-x" onClick={onClose} title="关闭">×</button>
        </div>

        <div className="perm-body">
          {loading && <div className="share-tip">正在加载…</div>}
          {err && <div className="share-err">{err}</div>}

          {!loading && (
            <>
              <section className="perm-section">
                <div className="perm-label">谁可以查看</div>
                <div className="perm-vis">
                  {VISIBILITIES.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      className={"perm-vis-item" + (visKey === v.key ? " on" : "")}
                      disabled={readonly || busy || inherited}
                      onClick={() => save({ ...acl, visibility: v.key })}
                    >
                      <span className="perm-vis-ico">{v.icon}</span>
                      <span className="perm-vis-txt"><b>{v.title}</b><em>{v.desc}</em></span>
                    </button>
                  ))}
                </div>
                {readonly && <div className="perm-hint">你不是该文档的所有者，权限设置仅供查看。</div>}
                {inherited && <div className="perm-hint">本页继承《{data?.sourceTitle || "上级目录"}》的可见性与成员，如需单独设置请关闭下方「继承目录权限」。</div>}
              </section>

              <section className="perm-section">
                <div className="perm-label">
                  成员
                  <span className="perm-tag">指定人授权</span>
                  {inherited && <span className="perm-tag">继承自目录</span>}
                </div>
                {memberEditable && (
                  <div className="perm-add-row">
                    <div className="perm-search">
                      <input
                        value={q}
                        placeholder="输入用户名 / 显示名，手动指定可访问的人"
                        onChange={(e) => { search(e.target.value); setErr(""); }}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addByExactName())}
                      />
                      {results.length > 0 && (
                        <div className="perm-results">
                          {results
                            .filter((u) => !acl.members[u.id])
                            .map((u) => (
                              <button key={u.id} type="button" onClick={() => addMember(u)}>
                                <span className="perm-mini-avatar" style={{ background: u.avatarColor || "#1668dc" }}>
                                  {(u.displayName || u.username).slice(0, 1).toUpperCase()}
                                </span>
                                {u.displayName} <em>@{u.username}</em>
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                    <select className="perm-role perm-add-role" value={addRole} onChange={(e) => setAddRole(e.target.value)}>
                      {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                    </select>
                    <button className="share-btn primary perm-add-btn" disabled={busy || !q.trim()} onClick={addByExactName}>添加</button>
                  </div>
                )}
                <div className="perm-members">
                  {displayMembers.length === 0 && <div className="perm-empty">暂无成员，只有所有者能访问</div>}
                  {displayMembers.map((u) => (
                    <div className="perm-member" key={u.id}>
                      <span className="perm-mini-avatar" style={{ background: u.avatarColor || "#1668dc" }}>
                        {(u.displayName || u.username || "?").slice(0, 1).toUpperCase()}
                      </span>
                      <span className="perm-member-name">{u.displayName}<em>@{u.username}</em></span>
                      {memberEditable ? (
                        <>
                          <select
                            className="perm-role"
                            value={u.role || "viewer"}
                            disabled={busy}
                            onChange={(e) => setRole(u.id, e.target.value)}
                          >
                            {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                          </select>
                          <button className="share-mini perm-remove" disabled={busy} onClick={() => removeMember(u.id)}>移除</button>
                        </>
                      ) : (
                        <span className="perm-role-static">{roleLabel(u.role)}</span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="perm-legend">
                  {ROLES.map((r) => (
                    <span key={r.key}><b>{r.label}</b> {r.desc}</span>
                  ))}
                </div>
              </section>

              <section className="perm-section">
                <div className="perm-label">权限范围</div>
                {childCount > 0 && (
                  <>
                    <label className="perm-switch">
                      <input
                        type="checkbox"
                        checked={!!acl.propagate}
                        disabled={readonly || busy}
                        onChange={(e) => save({ ...acl, propagate: e.target.checked })}
                      />
                      <span>将本目录权限应用到子文档（{childCount} 篇）</span>
                    </label>
                    <div className="perm-hint">
                      {acl.propagate
                        ? "已勾选：所有子文档自动拥有本页的成员与可见性，改一处即可全量生效。"
                        : "未勾选：本页权限只作用于当前目录，子文档各自独立，互不影响。"}
                    </div>
                  </>
                )}
                {childCount === 0 && (
                  <div className="perm-hint">当前文档没有子文档，此处添加的权限<strong>只作用于这一篇文档</strong>，不会影响其它文档。</div>
                )}
                {canInherit && (
                  <label className="perm-switch perm-switch-gap">
                    <input
                      type="checkbox"
                      checked={!!acl.inherit}
                      disabled={readonly || busy}
                      onChange={(e) => save({ ...acl, inherit: e.target.checked })}
                    />
                    <span>继承目录《{data?.parentTitle || "上级文档"}》的权限</span>
                  </label>
                )}
                {canInherit && (
                  <div className="perm-hint">
                    {acl.inherit
                      ? "已继承：本页成员由目录决定，关闭后可单独设置本页权限。"
                      : "已关闭：本页使用自己的成员名单，目录权限变更不再影响本页。"}
                  </div>
                )}
              </section>

              <section className="perm-section">
                <div className="perm-label">
                  权限申请
                  {inbox.length > 0 && <span className="perm-count">{inbox.length} 条待处理</span>}
                </div>
                {inbox.length === 0 ? (
                  <div className="perm-empty">暂无待处理的申请。别人打开你没有授权的文档链接时，可以在线向你申请。</div>
                ) : (
                  <div className="perm-requests">
                    {inbox.map((r) => (
                      <div className="perm-request" key={r.id}>
                        <span className="perm-mini-avatar" style={{ background: r.avatarColor || "#1668dc" }}>
                          {(r.displayName || r.username || "?").slice(0, 1).toUpperCase()}
                        </span>
                        <div className="perm-req-main">
                          <div className="perm-req-head">
                            <b>{r.displayName}</b><em>@{r.username}</em>
                            <span>申请《{r.docTitle}》· {r.roleLabel}</span>
                          </div>
                          {r.message && <div className="perm-req-msg">“{r.message}”</div>}
                          <div className="perm-req-time">
                            {new Date(r.createdAt).toLocaleString("zh-CN")}
                            {r.scope === "parent" && <span className="perm-req-scope">批准后加入目录《{r.sourceTitle}》，其子文档同步生效</span>}
                          </div>
                        </div>
                        <div className="perm-req-actions">
                          <select
                            className="perm-role"
                            value={decideRole[r.id] || r.role || "viewer"}
                            disabled={busy || deciding === r.id}
                            onChange={(e) => setDecideRole((p) => ({ ...p, [r.id]: e.target.value }))}
                          >
                            {ROLES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                          </select>
                          <button
                            className="share-btn primary"
                            disabled={busy || deciding === r.id}
                            onClick={() => decide(r, "approve")}
                          >同意</button>
                          <button
                            className="share-mini perm-remove"
                            disabled={busy || deciding === r.id}
                            onClick={() => decide(r, "reject")}
                          >拒绝</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        <div className="share-modal-foot">
          <span className="perm-foot-tip">{busy || deciding ? "处理中…" : "权限修改即时生效，无需发布"}</span>
          <button className="share-btn primary" onClick={onClose}>完成</button>
        </div>
      </div>
    </div>
  );
}
