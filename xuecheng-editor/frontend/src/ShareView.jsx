/**
 * 分享相关 UI
 *  - SharePage：只读文章页（#/s/<token>），无侧栏、无工具栏、不可编辑
 *  - ShareDialog：编辑页的分享弹层（开启/关闭链接、复制、预览）
 *  - ReadOnlyDoc：ProseMirror 只读渲染器（复用同一套 schema，保证版式一致）
 */
import { useEffect, useRef, useState } from "react";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "./schema.js";
import { api } from "./api.js";
import { docToPlainText } from "./plainText.js";
import { mountReact } from "./editor/reactNodeView.jsx";
import PollView from "./editor/PollView.jsx";
import SurveyView from "./editor/SurveyView.jsx";
import { setDocId, setShareToken } from "./editor/docContext.js";
import PresenceAvatars from "./PresenceAvatars.jsx";
import { shareUrl, copyText } from "./shareUtils.js";
export { shareUrl, copyText };

/* ---------------- 小工具 ---------------- */

function countChars(content) {
  try {
    return docToPlainText(content || { type: "doc", content: [] }).replace(/\s/g, "").length;
  } catch (_) {
    return 0;
  }
}

function fmtTime(iso) {
  if (!iso) return "";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  return t.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/* ---------------- 只读渲染 ---------------- */

function ReadOnlyDoc({ content, shareToken, onReady }) {
  const hostRef = useRef(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const docNode = content ? schema.nodeFromJSON(content) : schema.node("doc", null, [schema.node("paragraph")]);
    // 公开分享页只暴露 token：服务端由 token 反查内部 docId 且永不回传，
    // 保证「拿到链接的人」无法定位文档去调用写接口。只读页仍可投票/作答。
    setDocId("");
    setShareToken(shareToken);
    const view = new EditorView(hostRef.current, {
      state: EditorState.create({ doc: docNode }),
      editable: () => false,
      attributes: { class: "pm-doc pm-readonly", spellcheck: "false" },
      nodeViews: { poll: mountReact(PollView), survey: mountReact(SurveyView) },
    });
    onReady?.(view);
    return () => {
      view.destroy();
      setShareToken("");
      setDocId("");
    };
  }, [content, shareToken, onReady]);

  return <div ref={hostRef} className="pm-host" />;
}

/* ---------------- 分享阅读页 ---------------- */

export default function SharePage({ token, onHome }) {
  const [state, setState] = useState({ loading: true, doc: null, error: "" });
  const [copied, setCopied] = useState("");
  const [stats, setStats] = useState({ online: 0, unique: 0, views: 0 });

  useEffect(() => {
    let alive = true;
    setState({ loading: true, doc: null, error: "" });
    setStats({ online: 0, unique: 0, views: 0 });
    api
      .getShared(token)
      .then((d) => {
        if (!alive) return;
        setState({ loading: false, doc: d, error: "" });
        setStats({ online: d.online || 0, unique: d.unique || 0, views: d.views || 0 });
        document.title = `${d.title || "未命名文档"} · 学城分享`;
      })
      .catch((e) => {
        if (!alive) return;
        setState({ loading: false, doc: null, error: e.message });
        document.title = "分享不可用 · 学城";
      });
    return () => {
      alive = false;
    };
  }, [token]);

  /* 心跳：维持「正在浏览」，并轮询在线/读过人数（每 30s） */
  useEffect(() => {
    if (!token) return;
    let alive = true;
    const beat = async () => {
      if (!alive) return;
      try {
        await api.shareHeartbeat(token);
        const s = await api.shareStats(token);
        if (alive) setStats({ online: s.online || 0, unique: s.unique || 0, views: s.views || 0 });
      } catch (_) {}
    };
    const t = setInterval(beat, 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [token]);

  const copy = async () => {
    const ok = await copyText(window.location.href);
    setCopied(ok ? "已复制链接" : "复制失败，请手动选中地址栏");
    setTimeout(() => setCopied(""), 2200);
  };

  const { loading, doc, error } = state;

  return (
    <div className="share-root">
      <header className="share-top">
        <button className="share-brand" onClick={onHome} title="打开学城编辑器">
          <span className="brand-mark">学</span>
          <span className="brand-name">学城</span>
        </button>
        <div className="share-top-right">
          <PresenceAvatars shareToken={token} compact />
          <span className="share-badge">
            <i className="share-dot" />
            只读分享
          </span>
          {copied && <span className="share-toast">{copied}</span>}
          <button className="share-btn ghost" onClick={copy}>
            复制链接
          </button>
          {onHome && (
            <button className="share-btn primary" onClick={onHome}>
              打开编辑器
            </button>
          )}
        </div>
      </header>

      <div className="share-scroll">
        {loading && <div className="share-tip">正在打开…</div>}

        {!loading && error && (
          <div className="share-empty">
            <div className="share-empty-ico">🔒</div>
            <h2>这个分享链接不可用</h2>
            <p>{error}</p>
            <p className="share-empty-hint">可能是作者关闭了分享，或者链接不完整。</p>
          </div>
        )}

        {!loading && doc && (
          <article className="share-paper">
            <h1 className="share-title">{doc.title || "未命名文档"}</h1>
            <div className="share-meta">
              <span>{fmtTime(doc.updatedAt) ? `更新于 ${fmtTime(doc.updatedAt)}` : "尚无更新时间"}</span>
              <span className="share-meta-sep" />
              <span>正文 {countChars(doc.content)} 字</span>
              <span className="share-meta-sep" />
              <span className="share-online">
                <i className="share-online-dot" />
                {stats.online} 人正在浏览
              </span>
              <span className="share-meta-sep" />
              <span>{stats.unique} 人读过</span>
              {stats.views ? (
                <>
                  <span className="share-meta-sep" />
                  <span>累计 {stats.views} 次浏览</span>
                </>
              ) : null}
            </div>
            <div className="share-body">
              <ReadOnlyDoc content={doc.content} shareToken={token} />
            </div>
          </article>
        )}

        <footer className="share-foot">
          由 <b>学城编辑器</b> 分享 · 此链接仅可查看，内容以原作者发布的最新版本为准
        </footer>
      </div>
    </div>
  );
}

/* ---------------- 分享弹层（编辑页用） ---------------- */

export function ShareDialog({ doc, onClose, onUpdate }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  const share = doc?.share || null;
  const enabled = !!(share && share.enabled);
  const token = share?.token || "";
  const url = shareUrl(token);
  const [stats, setStats] = useState(null);

  /* 作者侧：定时拉取分享统计（在线 / 累计 / 去重 / 最近访客） */
  useEffect(() => {
    if (!enabled || !token) {
      setStats(null);
      return;
    }
    let alive = true;
    const load = async () => {
      try {
        const s = await api.shareStats(token);
        if (alive) setStats(s);
      } catch (_) {}
    };
    load();
    const t = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [enabled, token]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const enable = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await api.shareDoc(doc.id);
      onUpdate({ share: { ...(doc.share || {}), ...r } });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setErr("");
    try {
      await api.unshareDoc(doc.id);
      onUpdate({ share: { ...(doc.share || {}), enabled: false } });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    const ok = await copyText(url);
    setCopied(ok);
    if (!ok) setErr("复制失败，请手动选中链接复制");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="share-mask" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="share-modal" role="dialog" aria-modal="true" aria-label="分享文档">
        <div className="share-modal-head">
          <div>
            <h3>分享文档</h3>
            <p className="share-modal-sub">生成一个只读链接，拿到链接的人无需登录即可查看</p>
          </div>
          <button className="share-x" onClick={onClose} title="关闭">
            ×
          </button>
        </div>

        {!enabled ? (
          <div className="share-off">
            <div className="share-off-ico">🔗</div>
            <p>这篇文档还没有开启分享。开启后，任何持有链接的人都能查看当前内容。</p>
            <button className="share-btn primary lg" disabled={busy} onClick={enable}>
              {busy ? "生成中…" : "创建分享链接"}
            </button>
          </div>
        ) : (
          <>
            <div className="share-link-row">
              <input className="share-link" readOnly value={url} onFocus={(e) => e.target.select()} />
              <button className="share-btn primary" onClick={copy}>
                {copied ? "已复制" : "复制"}
              </button>
            </div>
            <div className="share-link-actions">
              <a className="share-mini" href={url} target="_blank" rel="noreferrer">
                在新窗口预览 ↗
              </a>
              <span className="share-mini-sep" />
              <span className="share-mini-muted">
                {share?.views ? `已被浏览 ${share.views} 次` : "还没有人访问"}
              </span>
            </div>

            <div className="share-stats">
              <div className="stat-cards">
                <div className="stat-card">
                  <div className="stat-num">{stats ? stats.online : "—"}</div>
                  <div className="stat-label">正在浏览</div>
                </div>
                <div className="stat-card">
                  <div className="stat-num">{stats ? stats.views : share?.views || 0}</div>
                  <div className="stat-label">累计浏览</div>
                </div>
                <div className="stat-card">
                  <div className="stat-num">{stats ? stats.unique : 0}</div>
                  <div className="stat-label">读过人数</div>
                </div>
              </div>

              {stats && stats.recent && stats.recent.length > 0 ? (
                <div className="visitor-block">
                  <div className="visitor-title">最近访客（匿名）</div>
                  <div className="visitor-list">
                    {stats.recent.map((v, i) => (
                      <div className="visitor-row" key={i}>
                        <span className="visitor-ico">
                          {v.device === "手机" ? "📱" : v.device === "平板" ? "📟" : "💻"}
                        </span>
                        <span className="visitor-main">
                          <span className="visitor-b">{v.browser} · {v.os}</span>
                          <span className="visitor-sub">{v.ip} · 最后活跃 {fmtTime(v.lastActiveAt)}</span>
                        </span>
                        <span className="visitor-count">{v.count} 次</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="share-note">
              <b>注意</b>：链接开启期间，文档的后续修改会实时体现在分享页上；关闭分享后链接立即失效。
            </div>

            <div className="share-modal-foot">
              <button className="share-btn ghost danger" disabled={busy} onClick={disable}>
                关闭分享
              </button>
              <button className="share-btn ghost" onClick={onClose}>
                完成
              </button>
            </div>
          </>
        )}

        {err && <div className="share-err">{err}</div>}
      </div>
    </div>
  );
}
