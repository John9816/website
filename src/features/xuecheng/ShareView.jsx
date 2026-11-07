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
import { docToPlainText } from "./skills.js";
import { shareHash } from "./router.js";

/* ---------------- 小工具 ---------------- */

export function shareUrl(token) {
  if (!token) return "";
  const base = "/editor/";
  return `${window.location.origin}${base}${shareHash(token)}`;
}

/** 复制到剪贴板：优先 Clipboard API，HTTP 环境下退回到 execCommand */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (_) {
    return false;
  }
}

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

function ReadOnlyDoc({ content, onReady }) {
  const hostRef = useRef(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const docNode = content ? schema.nodeFromJSON(content) : schema.node("doc", null, [schema.node("paragraph")]);
    const view = new EditorView(hostRef.current, {
      state: EditorState.create({ doc: docNode }),
      editable: () => false,
      attributes: { class: "pm-doc pm-readonly", spellcheck: "false" },
    });
    onReady?.(view);
    return () => view.destroy();
  }, [content, onReady]);

  return <div ref={hostRef} className="pm-host" />;
}

/* ---------------- 分享阅读页 ---------------- */

export default function SharePage({ token, onHome }) {
  const [state, setState] = useState({ loading: true, doc: null, error: "" });
  const [copied, setCopied] = useState("");

  useEffect(() => {
    let alive = true;
    setState({ loading: true, doc: null, error: "" });
    api
      .getShared(token)
      .then((d) => {
        if (!alive) return;
        setState({ loading: false, doc: d, error: "" });
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
              {doc.views ? (
                <>
                  <span className="share-meta-sep" />
                  <span>浏览 {doc.views} 次</span>
                </>
              ) : null}
            </div>
            <div className="share-body">
              <ReadOnlyDoc content={doc.content} />
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
