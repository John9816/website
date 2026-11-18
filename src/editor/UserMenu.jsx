/**
 * 顶栏用户菜单：身份、改密、管理员的用户管理与数据导出。
 * 复用工具栏的 .dd-panel / .dd-item 与模板面板的 .savetpl-field 样式。
 */
import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";

export default function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [pw, setPw] = useState({ oldPassword: "", newPassword: "" });
  const [users, setUsers] = useState([]);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPw, setResetPw] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) { close(); }
    };
    const onKey = (e) => {
      if (e.key === "Escape") { close(); }
    };
    const t = setTimeout(() => {
      document.addEventListener("mousedown", onDown, true);
      window.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => {
    setOpen(false); setPanel(""); setErr(""); setNotice("");
    setResetTarget(null); setResetPw("");
  };

  const doLogout = async () => {
    try { await api.auth.logout(); } catch (_) {}
    close();
    onLogout();
  };

  const reloadUsers = async () => setUsers(await api.auth.users(""));

  const openUsers = async () => {
    setPanel("users"); setErr(""); setNotice("");
    try { await reloadUsers(); }
    catch (e) { setErr(e.message); }
  };

  const changePw = async (e) => {
    e.preventDefault();
    setErr(""); setNotice("");
    if (pw.newPassword.length < 8) { setErr("新密码至少 8 位"); return; }
    setBusy(true);
    try {
      await api.auth.updatePassword(pw.oldPassword, pw.newPassword);
      setPw({ oldPassword: "", newPassword: "" });
      setNotice("密码已修改");
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  };

  /** 统一执行管理员操作并重新拉列表，保证停用状态 / 角色显示与服务端一致 */
  const doUserAction = async (fn, okMsg) => {
    setErr(""); setNotice("");
    setBusy(true);
    try {
      await fn();
      await reloadUsers();
      if (okMsg) setNotice(okMsg);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const toggleDisabled = (u) =>
    doUserAction(
      () => api.auth.setDisabled(u.id, !u.disabled),
      u.disabled ? "账号已启用" : "账号已停用"
    );

  const toggleRole = (u) =>
    doUserAction(
      () => api.auth.setRole(u.id, u.role === "admin" ? "user" : "admin"),
      u.role === "admin" ? "已取消管理员" : "已设为管理员"
    );

  const removeUser = (u) => {
    if (!window.confirm(`删除账号「${u.displayName}」？其名下文档会转交给你，文档内容全部保留。`)) return;
    doUserAction(() => api.auth.removeUser(u.id), "账号已删除");
  };

  const submitReset = (e) => {
    e.preventDefault();
    if (!resetTarget) return;
    if (resetPw.length < 8) { setErr("新密码至少 8 位"); return; }
    doUserAction(async () => {
      await api.auth.resetPassword(resetTarget.id, resetPw);
      setResetTarget(null); setResetPw("");
    }, "密码已重置，该账号需用新密码重新登录");
  };

  const exportData = async () => {
    setErr(""); setNotice(""); setBusy(true);
    try {
      const data = await api.admin.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `xuecheng-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setNotice("备份文件已下载");
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const isAdmin = user.role === "admin";
  const initial = (user.displayName || user.username || "?").slice(0, 1).toUpperCase();

  return (
    <div className="user-menu" ref={ref}>
      <button
        className={"user-trigger" + (open ? " on" : "")}
        onClick={() => setOpen((v) => !v)}
        title={user.username}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="user-avatar" style={{ background: user.avatarColor || "#1668dc" }}>{initial}</span>
        <span className="user-name">{user.displayName}</span>
        {isAdmin && <span className="user-badge">管理员</span>}
        <span className="user-caret">▾</span>
      </button>

      {open && (
        <div className="dd-panel user-panel" role="menu">
          {!panel && (
            <>
              <div className="user-panel-head">
                <span className="user-panel-avatar" style={{ background: user.avatarColor || "#1668dc" }}>{initial}</span>
                <div>
                  <div className="user-panel-name">{user.displayName}</div>
                  <div className="user-panel-sub">@{user.username}{isAdmin ? " · 管理员" : ""}</div>
                </div>
              </div>
              <div className="user-panel-sep" />
              <button className="dd-item" onClick={() => { setPanel("password"); setErr(""); setNotice(""); }}>修改密码</button>
              {isAdmin && <button className="dd-item" onClick={openUsers}>用户管理</button>}
              {isAdmin && <button className="dd-item" onClick={exportData} disabled={busy}>导出数据备份</button>}
              {notice && <div className="user-ok">{notice}</div>}
              {err && <div className="savetpl-err">{err}</div>}
              <div className="user-panel-sep" />
              <button className="dd-item danger" onClick={doLogout}>退出登录</button>
            </>
          )}

          {panel === "password" && (
            <form className="user-subpanel" onSubmit={changePw}>
              <div className="user-subpanel-title">
                <button type="button" className="user-back" onClick={() => { setPanel(""); setErr(""); }}>‹ 返回</button>
                修改密码
              </div>
              <label className="savetpl-field"><span>原密码</span>
                <input type="password" value={pw.oldPassword} onChange={(e) => setPw((p) => ({ ...p, oldPassword: e.target.value }))} />
              </label>
              <label className="savetpl-field"><span>新密码</span>
                <input type="password" value={pw.newPassword} placeholder="至少 8 位" onChange={(e) => setPw((p) => ({ ...p, newPassword: e.target.value }))} />
              </label>
              {err && <div className="savetpl-err">{err}</div>}
              {notice && <div className="user-ok">{notice}</div>}
              <button className="tpl-btn primary user-submit" type="submit" disabled={busy}>{busy ? "提交中…" : "保存"}</button>
            </form>
          )}

          {panel === "users" && (
            <div className="user-subpanel">
              <div className="user-subpanel-title">
                <button type="button" className="user-back" onClick={() => { setPanel(""); setErr(""); setNotice(""); }}>‹ 返回</button>
                用户管理
              </div>

              {resetTarget ? (
                <form className="user-reset-form" onSubmit={submitReset}>
                  <div className="user-reset-title">重置「{resetTarget.displayName}」的密码</div>
                  <label className="savetpl-field"><span>新密码</span>
                    <input
                      type="password"
                      value={resetPw}
                      placeholder="至少 8 位"
                      onChange={(e) => setResetPw(e.target.value)}
                    />
                  </label>
                  <button className="tpl-btn primary user-submit" type="submit" disabled={busy}>确认重置</button>
                  <button type="button" className="user-back" onClick={() => { setResetTarget(null); setResetPw(""); setErr(""); }}>取消</button>
                </form>
              ) : (
                <>
                  <div className="user-list">
                    {users.length === 0 && <div className="user-empty">暂无账号</div>}
                    {users.map((u) => (
                      <div className="user-row" key={u.id}>
                        <span className="user-row-avatar" style={{ background: u.avatarColor || "#1668dc" }}>
                          {(u.displayName || u.username || "?").slice(0, 1).toUpperCase()}
                        </span>
                        <span className="user-row-name">
                          <span className="user-row-display">{u.displayName}</span>
                          <span className="user-row-sub">
                            @{u.username}
                            {u.role === "admin" && <em className="role">管理员</em>}
                            {u.disabled && <em>已停用</em>}
                            {u.id === user.id && <em className="self">我</em>}
                          </span>
                        </span>
                        {u.id !== user.id && (
                          <div className="user-row-actions">
                            <button className="share-mini" disabled={busy} onClick={() => toggleDisabled(u)}>
                              {u.disabled ? "启用" : "停用"}
                            </button>
                            <button className="share-mini" disabled={busy} onClick={() => toggleRole(u)}>
                              {u.role === "admin" ? "取消管理员" : "设为管理员"}
                            </button>
                            <button className="share-mini" disabled={busy} onClick={() => { setResetTarget(u); setErr(""); setNotice(""); setResetPw(""); }}>
                              重置密码
                            </button>
                            <button className="share-mini danger" disabled={busy} onClick={() => removeUser(u)}>删除</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {err && <div className="savetpl-err">{err}</div>}
                  {notice && <div className="user-ok">{notice}</div>}
                  <div className="user-note">管理员只负责全局设置，不能查看他人的私有文档。删除账号会保留其文档并转交给你。</div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
