/**
 * 登录 / 注册页（未登录时 App 直接 early return 渲染，不占路由）。
 * 表单复用 TemplateUI 的 .savetpl-field / .tpl-btn 范式，外层用 .auth-* 版式。
 *
 * 开放注册：users 为空时首个账号需「管理员引导码」（或由 bootstrap.js 离线创建），
 * 之后任何人可自助注册、无需码，且账号权限完全平等。
 */
import { useEffect, useState } from "react";
import { api } from "./api.js";

export default function AuthView({ onAuthed, notice = "" }) {
  const [tab, setTab] = useState("login");
  const [bootstrap, setBootstrap] = useState(null);
  const [form, setForm] = useState({ username: "", password: "", displayName: "", bootstrapCode: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    api.auth.bootstrapStatus()
      .then((s) => { if (alive) setBootstrap(s); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const switchTab = (t) => { setTab(t); setErr(""); };

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    const username = form.username.trim();
    if (!username || !form.password) { setErr("请填写用户名和密码"); return; }
    if (tab === "register" && form.password.length < 8) { setErr("密码至少需要 8 位"); return; }
    setBusy(true);
    try {
      const user = tab === "login"
        ? await api.auth.login({ username, password: form.password })
        : await api.auth.register({
            username,
            password: form.password,
            displayName: form.displayName.trim(),
            bootstrapCode: form.bootstrapCode.trim(),
          });
      onAuthed(user);
    } catch (e2) {
      setErr(e2.message || "操作失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  const needCode = tab === "register" && bootstrap?.needBootstrapCode;

  return (
    <div className="auth-page">
      <div className="auth-card" role="dialog" aria-modal="true" aria-label="登录学城编辑器">
        <div className="auth-brand">
          <span className="auth-mark">学</span>
          <div>
            <h1>学城编辑器</h1>
            <p>登录后查看与管理你的文档</p>
          </div>
        </div>

        <div className="auth-tabs">
          <button type="button" className={"auth-tab" + (tab === "login" ? " on" : "")} onClick={() => switchTab("login")}>登录</button>
          <button type="button" className={"auth-tab" + (tab === "register" ? " on" : "")} onClick={() => switchTab("register")}>注册</button>
        </div>

        {notice && <div className="auth-notice">{notice}</div>}

        <form className="auth-form" onSubmit={submit}>
          <label className="savetpl-field">
            <span>用户名</span>
            <input
              value={form.username}
              maxLength={30}
              autoFocus
              autoComplete="username"
              placeholder="3-30 位字母、数字、_ . -"
              onChange={(e) => set("username", e.target.value)}
            />
          </label>

          {tab === "register" && (
            <label className="savetpl-field">
              <span>显示名<span className="savetpl-opt">选填</span></span>
              <input
                value={form.displayName}
                maxLength={40}
                placeholder="其它成员看到的名字"
                onChange={(e) => set("displayName", e.target.value)}
              />
            </label>
          )}

          <label className="savetpl-field">
            <span>密码</span>
            <input
              type="password"
              value={form.password}
              maxLength={128}
              autoComplete={tab === "login" ? "current-password" : "new-password"}
              placeholder={tab === "register" ? "至少 8 位" : "请输入密码"}
              onChange={(e) => set("password", e.target.value)}
            />
          </label>

          {needCode && (
            <label className="savetpl-field">
              <span>管理员引导码</span>
              <input
                value={form.bootstrapCode}
                placeholder="仅首个账号需要，由服务器配置"
                onChange={(e) => set("bootstrapCode", e.target.value)}
              />
            </label>
          )}
          {needCode && bootstrap && !bootstrap.bootstrapConfigured && (
            <div className="auth-warn">服务器尚未配置引导码，请联系管理员先运行 bootstrap.js 初始化。</div>
          )}

          {err && <div className="savetpl-err auth-err">{err}</div>}

          <button className="tpl-btn primary auth-submit" type="submit" disabled={busy}>
            {busy ? "请稍候…" : tab === "login" ? "登录" : "注册并进入"}
          </button>
        </form>

        <div className="auth-foot">
          首个注册的账号将成为管理员并接管已有文档；之后开放注册，所有账号权限平等。
        </div>
      </div>
    </div>
  );
}
