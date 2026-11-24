/**
 * 模板相关 UI
 *  - ReadOnlyDoc：ProseMirror 只读渲染（与编辑器同一套 schema，保证版式一致）
 *  - TemplatePreviewDialog：模板市场里点卡片后的预览弹层
 *  - NewDocDialog：新建文档面板（空白 / 模板市场 / 我的模板，右侧实时预览）
 *  - SaveTemplateDialog：把当前文档存为模板
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "./schema.js";
import { docToPlainText } from "./skills.js";

/* ---------------- 只读渲染 ---------------- */

export function ReadOnlyDoc({ content, className = "" }) {
  const hostRef = useRef(null);

  useEffect(() => {
    if (!hostRef.current) return;
    let docNode;
    try {
      docNode = content ? schema.nodeFromJSON(content) : schema.node("doc", null, [schema.node("paragraph")]);
    } catch (_) {
      docNode = schema.node("doc", null, [schema.node("paragraph")]);
    }
    const view = new EditorView(hostRef.current, {
      state: EditorState.create({ doc: docNode }),
      editable: () => false,
      attributes: { class: "pm-doc pm-readonly", spellcheck: "false" },
    });
    return () => view.destroy();
  }, [content]);

  return <div ref={hostRef} className={"pm-host " + className} />;
}

/* ---------------- 小工具 ---------------- */

/** 模板正文：内置模板用 build()，自建模板存的是 content 快照 */
export function tplContent(tpl) {
  if (!tpl) return null;
  if (typeof tpl.build === "function") return tpl.build();
  return tpl.content || null;
}

/** 模板统计：字数 + 摘要（用于卡片与预览头部） */
export function tplStat(tpl) {
  const text = docToPlainText(tplContent(tpl) || { type: "doc", content: [] }).replace(/\s+/g, " ").trim();
  return { chars: text.replace(/\s/g, "").length, excerpt: text.slice(0, 60) };
}

const ACCENT = ["#2f6fed", "#0f9d6b", "#7a4ddb", "#e8833a", "#d6336c", "#1170cf", "#1aa7c0"];

function accentOf(tpl) {
  return tpl?.accent || ACCENT[0];
}

/** Esc 关闭弹层 */
function useEsc(onClose) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

/* ---------------- 模板预览弹层 ---------------- */

export function TemplatePreviewDialog({ template, onClose, onUse, onDelete }) {
  useEsc(onClose);
  const [del, setDel] = useState(false);
  const content = useMemo(() => tplContent(template), [template]);
  const stat = useMemo(() => (template ? tplStat(template) : { chars: 0 }), [template]);
  if (!template) return null;

  return (
    <div className="tplv-mask" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="tplv" role="dialog" aria-modal="true" aria-label="模板预览">
        <header className="tplv-head">
          <div className="tplv-id" style={{ "--accent": accentOf(template) }}>
            <span className="tplv-ico">{template.icon || "📄"}</span>
            <div className="tplv-txt">
              <h3>{template.name}</h3>
              <p>{template.desc || "你自己的文档模板"}</p>
            </div>
          </div>
          <div className="tplv-head-right">
            <span className="tplv-badge">{template.builtin ? "内置模板" : "我的模板"}</span>
            <button className="tplv-x" onClick={onClose} title="关闭预览">
              ×
            </button>
          </div>
        </header>

        <div className="tplv-meta">
          <span>正文 {stat.chars} 字</span>
          <span className="tplv-dot" />
          <span>以下为只读预览，使用后会生成一份可自由编辑的副本</span>
        </div>

        <div className="tplv-body">
          <div className="tplv-paper">
            <ReadOnlyDoc content={content} />
          </div>
        </div>

        <footer className="tplv-foot">
          {onDelete &&
            (del ? (
              <span className="tplv-confirm">
                删除后不可恢复
                <button className="tplv-link danger" onClick={() => onDelete(template)}>
                  确认删除
                </button>
                <button className="tplv-link" onClick={() => setDel(false)}>
                  取消
                </button>
              </span>
            ) : (
              <button className="tplv-link danger" onClick={() => setDel(true)}>
                删除模板
              </button>
            ))}
          <span className="tplv-spacer" />
          <button className="tpl-btn ghost" onClick={onClose}>
            关闭
          </button>
          <button className="tpl-btn primary" onClick={() => onUse(template)}>
            使用此模板
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ---------------- 新建文档面板 ---------------- */

export function NewDocDialog({ builtins = [], mine = [], parentTitle, onClose, onCreate }) {
  useEsc(onClose);
  const [tab, setTab] = useState("blank");
  const [pickedId, setPickedId] = useState("");
  const [busy, setBusy] = useState(false);

  const list = tab === "market" ? builtins : tab === "mine" ? mine : [];
  const picked = list.find((x) => x.id === pickedId) || list[0] || null;
  const stat = useMemo(() => (picked ? tplStat(picked) : { chars: 0 }), [picked]);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onCreate({ template: tab === "blank" ? null : picked });
    } finally {
      setBusy(false);
    }
  };

  const tabs = [
    { key: "blank", label: "空白文档", count: null },
    { key: "market", label: "模板市场", count: builtins.length },
    { key: "mine", label: "我的模板", count: mine.length },
  ];

  return (
    <div className="ndlg-mask" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ndlg" role="dialog" aria-modal="true" aria-label="新建文档">
        <header className="ndlg-head">
          <div>
            <h3>新建文档</h3>
            <p className="ndlg-sub">
              {parentTitle ? `将创建在「${parentTitle}」下` : "从空白开始，或者挑一个模板省掉排版"}
            </p>
          </div>
          <button className="tplv-x" onClick={onClose} title="关闭">
            ×
          </button>
        </header>

        <div className="ndlg-tabs">
          {tabs.map((t) => (
            <button
              key={t.key}
              className={"ndlg-tab" + (tab === t.key ? " on" : "")}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {t.count != null && <i className="ndlg-tab-num">{t.count}</i>}
            </button>
          ))}
        </div>

        <div className="ndlg-body">
          {tab === "blank" ? (
            <div className="ndlg-blank">
              <div className="ndlg-blank-ico">📄</div>
              <h4>空白文档</h4>
              <p>
                创建后是一张干净的白纸，可以随时用 <b>/</b> 唤起插入菜单，加标题、表格、待办、提示块等结构。
              </p>
              <p className="ndlg-blank-hint">
                想让以后每次新建都带上固定结构？把整理好的文档「存为模板」即可。
              </p>
            </div>
          ) : (
            <>
              <div className="ndlg-list">
                {list.length ? (
                  list.map((x) => {
                    const on = picked?.id === x.id;
                    return (
                      <button
                        key={x.id}
                        className={"ndlg-item" + (on ? " on" : "")}
                        style={{ "--accent": accentOf(x) }}
                        onClick={() => setPickedId(x.id)}
                        onDoubleClick={() => onCreate({ template: x })}
                      >
                        <span className="ndlg-item-ico">{x.icon || "📄"}</span>
                        <span className="ndlg-item-main">
                          <span className="ndlg-item-name">{x.name}</span>
                          <span className="ndlg-item-desc">{x.desc || "你自己的文档模板"}</span>
                        </span>
                        {on && <span className="ndlg-item-on">已选</span>}
                      </button>
                    );
                  })
                ) : (
                  <div className="ndlg-empty">
                    <p>还没有自建模板</p>
                    <p className="ndlg-empty-hint">
                      打开任意一篇整理好的文档，点顶栏的「存为模板」，之后就能在这里一键复用它的结构。
                    </p>
                  </div>
                )}
              </div>

              <div className="ndlg-preview">
                {picked ? (
                  <>
                    <div className="ndlg-preview-head">
                      <span className="ndlg-preview-name">{picked.name}</span>
                      <span className="ndlg-preview-meta">{stat.chars} 字 · 只读预览</span>
                    </div>
                    <div className="ndlg-paper">
                      <ReadOnlyDoc content={tplContent(picked)} />
                    </div>
                  </>
                ) : (
                  <div className="ndlg-preview-empty">选一个模板查看效果</div>
                )}
              </div>
            </>
          )}
        </div>

        <footer className="ndlg-foot">
          <span className="ndlg-foot-tip">
            {tab === "blank" ? "创建后自动进入编辑器" : picked ? `已选「${picked.name}」` : "先选一个模板"}
          </span>
          <button className="tpl-btn ghost" onClick={onClose}>
            取消
          </button>
          <button
            className="tpl-btn primary"
            disabled={busy || (tab !== "blank" && !picked)}
            onClick={submit}
          >
            {busy ? "创建中…" : tab === "blank" ? "创建空白文档" : picked ? `用「${picked.name}」创建` : "创建"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ---------------- 存为模板 ---------------- */

const ICON_CHOICES = ["📄", "📝", "📊", "🗂️", "📚", "📐", "👤", "✅", "✈️", "💡", "🎯", "🧾", "🧩", "🔖"];

export function SaveTemplateDialog({ docTitle, charCount, onClose, onSave }) {
  useEsc(onClose);
  const [name, setName] = useState(docTitle || "未命名模板");
  const [desc, setDesc] = useState("");
  const [icon, setIcon] = useState("📝");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e?.preventDefault();
    if (busy) return;
    if (!name.trim()) {
      setErr("请填写模板名称");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await onSave({ name: name.trim(), desc: desc.trim(), icon });
    } catch (ex) {
      setErr(ex.message || "保存失败");
      setBusy(false);
    }
  };

  return (
    <div className="ndlg-mask" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="ndlg savetpl" onSubmit={submit} role="dialog" aria-modal="true" aria-label="存为模板">
        <header className="ndlg-head">
          <div>
            <h3>存为模板</h3>
            <p className="ndlg-sub">
              把当前文档的结构保存成模板（正文 {charCount || 0} 字），之后新建时可直接选用
            </p>
          </div>
          <button className="tplv-x" type="button" onClick={onClose} title="关闭">
            ×
          </button>
        </header>

        <div className="savetpl-body">
          <label className="savetpl-field">
            <span>模板名称</span>
            <input
              value={name}
              maxLength={60}
              autoFocus
              placeholder="例如：周会纪要（研发组）"
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <label className="savetpl-field">
            <span>一句话说明<span className="savetpl-opt">选填</span></span>
            <input
              value={desc}
              maxLength={120}
              placeholder="这个模板适合什么场景？"
              onChange={(e) => setDesc(e.target.value)}
            />
          </label>

          <div className="savetpl-field">
            <span>图标</span>
            <div className="savetpl-icons">
              {ICON_CHOICES.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  className={"savetpl-icon" + (icon === ic ? " on" : "")}
                  onClick={() => setIcon(ic)}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>

          <p className="savetpl-note">
            保存的是<strong>当前内容的快照</strong>：之后修改文档不会影响模板，修改模板也不会影响这篇文档。
          </p>
        </div>

        <footer className="ndlg-foot">
          <span className="ndlg-foot-tip">{err ? <span className="savetpl-err">{err}</span> : ""}</span>
          <button className="tpl-btn ghost" type="button" onClick={onClose}>
            取消
          </button>
          <button className="tpl-btn primary" type="submit" disabled={busy}>
            {busy ? "保存中…" : "保存为模板"}
          </button>
        </footer>
      </form>
    </div>
  );
}
