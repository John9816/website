/**
 * 编辑器主体 —— ProseMirror 的 React 封装
 * 包含：编辑区、悬浮工具栏、斜杠命令、块级手柄、右侧大纲
 */
import { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react";
import { EditorState, Plugin } from "prosemirror-state";
import { EditorView, Decoration, DecorationSet } from "prosemirror-view";
import { dropCursor } from "prosemirror-dropcursor";
import { gapCursor } from "prosemirror-gapcursor";
import { tableEditing, columnResizing } from "prosemirror-tables";
import { schema } from "../schema.js";
import { buildInputRules } from "../plugins/inputRules.js";
import { buildKeymap, history } from "../plugins/keymap.js";
import * as cmd from "./commands.js";
import { api } from "../api.js";
import ContextMenu, { contextMenuAt } from '../ContextMenu.jsx';
import { editorContextItems, selectContextTarget } from './contextMenu.js';
import { actions, actionState, runAction, shortcutLabel } from './actions.js';
import { Dropdown, EditorDialog, toolbarNavigation } from './EditorControls.jsx';

/* ---------- 空文档占位提示 ---------- */
const placeholderPlugin = new Plugin({
  props: {
    decorations(state) {
      const doc = state.doc;
      if (doc.childCount === 1 && doc.firstChild.type.name === "paragraph" && doc.firstChild.content.size === 0) {
        return DecorationSet.create(doc, [
          Decoration.node(0, doc.firstChild.nodeSize, {
            class: "pm-is-empty",
            "data-placeholder": "输入内容，或按 / 唤起插入菜单",
          }),
        ]);
      }
    },
  },
});

/* ---------- 工具栏状态计算 ---------- */
function inNodeType(state, name) {
  const { $from, node } = state.selection;
  // NodeSelection（选中整张表/整张图）时，$from 停在节点外侧，需单独判断
  if (node && node.type.name === name) return true;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === name) return true;
  }
  return false;
}

/** 取选区内某个 mark 的 attrs.color（用于颜色按钮回显当前色） */
function activeMarkColor(state, markType) {
  const { from, $from, empty } = state.selection;
  const marks = empty
    ? state.storedMarks || $from.marks()
    : (state.doc.nodeAt(from) && state.doc.nodeAt(from).marks) || [];
  const found = markType.isInSet(marks);
  return found ? found.attrs.color : null;
}

/** 取选区某个 mark 的任意 attr（字号回显用） */
function activeMarkAttr(state, markType, attr) {
  const { from, $from, empty } = state.selection;
  const marks = empty
    ? state.storedMarks || $from.marks()
    : (state.doc.nodeAt(from) && state.doc.nodeAt(from).marks) || [];
  const found = markType.isInSet(marks);
  return found ? found.attrs[attr] : null;
}

/** 当前光标所在块的标题级别，0 表示正文 */
function headingLevelOf(state) {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d);
    if (n.type.name === "heading") return n.attrs.level;
    if (n.type.name === "paragraph") return 0;
  }
  return 0;
}

function selectedInline(state) {
  return cmd.selectedTextblocks(state).some(({ node }) => node.type.allowsMarkType(schema.marks.textColor));
}

function computeUi(state) {
  const m = schema.marks;
  const callout = cmd.ancestor(state, "callout");
  const codeBlock = cmd.ancestor(state, "code_block");
  const toggle = cmd.ancestor(state, "toggle");
  const selNode = state.selection.node;
  const lv = headingLevelOf(state);
  const fs = activeMarkAttr(state, m.fontSize, "size");
  return {
    actions: Object.fromEntries(Object.keys(actions).map(id => [id, actionState(state, id)])),
    inline: selectedInline(state),
    canSplit: cmd.canSplit(state),
    fmt: codeBlock ? "代码块" : lv ? `标题 ${lv}` : "正文",
    fontSize: fs ? parseInt(fs, 10) : null,
    bold: cmd.markActive(state, m.strong),
    italic: cmd.markActive(state, m.em),
    underline: cmd.markActive(state, m.underline),
    strike: cmd.markActive(state, m.strikethrough),
    code: cmd.markActive(state, m.code),
    link: cmd.markActive(state, m.link),
    sup: cmd.markActive(state, m.superscript),
    sub: cmd.markActive(state, m.subscript),
    h1: cmd.blockActive(state, schema.nodes.heading, { level: 1 }),
    h2: cmd.blockActive(state, schema.nodes.heading, { level: 2 }),
    h3: cmd.blockActive(state, schema.nodes.heading, { level: 3 }),
    quote: inNodeType(state, "blockquote"),
    bullet: inNodeType(state, "bullet_list"),
    ordered: inNodeType(state, "ordered_list"),
    task: inNodeType(state, "task_list"),
    table: inNodeType(state, "table"),
    codeBlock: !!codeBlock,
    codeLang: codeBlock ? codeBlock.node.attrs.language || "" : "",
    calloutType: callout ? callout.node.attrs.type : null,
    toggleSummary: toggle ? toggle.node.attrs.summary : null,
    align: cmd.currentAlign(state),
    image: !!selNode && selNode.type.name === "image",
    imageSrc: selNode && selNode.type.name === "image" ? selNode.attrs.src : "",
    canMerge: cmd.canMerge(state),
    color: activeMarkColor(state, m.textColor),
    bg: activeMarkColor(state, m.bgColor),
  };
}

function computeOutline(doc) {
  const items = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "heading") {
      items.push({ pos, level: node.attrs.level, text: node.textContent || "未命名标题" });
      return false;
    }
    return true;
  });
  return items;
}

export default function Editor({ initialDoc, onChange, onSelectionInfo, title, onTitleChange, words, onViewReady, onError }) {
  const [contextMenu, setContextMenu] = useState(null);
  const [dialog, setDialog] = useState(null);
  const toolbarRef = useRef(null);
  const errorRef = useRef(onError);
  errorRef.current = onError;
  const openDialog = (type, replace = false) => {
    const view = viewRef.current;
    if (!view || view.composing) return;
    if (type === 'link' && !cmd.canSetLink(view.state)) return;
    setContextMenu(null); setSlash(null);
    setDialog({ type, replace, doc: view.state.doc, selection: view.state.selection,
      value: type === 'link' ? cmd.linkRange(view.state)?.href || '' : replace ? view.state.selection.node?.attrs.src || '' : '' });
  };
  const dialogHandler = useRef(openDialog);
  dialogHandler.current = openDialog;
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onViewReadyRef = useRef(onViewReady);
  onViewReadyRef.current = onViewReady;
  const rafRef = useRef(0);
  const [ui, setUi] = useState({});
  const [outline, setOutline] = useState([]);
  const [slash, setSlash] = useState(null);
  const [handle, setHandle] = useState(null);
  const [handleMenu, setHandleMenu] = useState(false);
  const [showOutline, setShowOutline] = useState(() => {
    try {
      return localStorage.getItem("xc.outline") !== "0";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("xc.outline", showOutline ? "1" : "0");
    } catch {}
  }, [showOutline]);
  const handleMenuRef = useRef(false);
  const slashRef = useRef(null);
  slashRef.current = slash;

  /* ---------- 初始化 ---------- */
  useEffect(() => {
    const state = EditorState.create({
      doc: initialDoc ? schema.nodeFromJSON(initialDoc) : schema.node("doc", null, [schema.node("paragraph")]),
      plugins: [
        buildInputRules(),
        ...buildKeymap({ link: () => dialogHandler.current("link") }),
        history(),
        dropCursor({ color: "var(--accent)", width: 2 }),
        gapCursor(),
        columnResizing({ handleWidth: 6, cellMinWidth: 40 }),
        tableEditing(),
        placeholderPlugin,
      ],
    });

    const view = new EditorView(hostRef.current, {
      state,
      dispatchTransaction(tr) {
        const next = view.state.apply(tr);
        view.updateState(next);
        if (tr.docChanged) {
          handleMenuRef.current = false; setHandle(null); setHandleMenu(false);
          onChangeRef.current?.(next.doc.toJSON());
        }
        schedule();
      },
      attributes: { class: "pm-doc", spellcheck: "false", role: "textbox", "aria-label": "文档正文", "aria-multiline": "true" },
      handleKeyDown(view, event) {
        if (event.isComposing || view.composing || event.keyCode === 229) return false;
        if (event.altKey && event.key === 'F10') { toolbarRef.current?.querySelector('button:not(:disabled)')?.focus(); return true; }
        return false;
      },
      handlePaste(viewInstance, event) {
        const items = Array.from(event.clipboardData?.items || []);
        const file = items.find((i) => i.type.startsWith("image/"))?.getAsFile();
        if (!file) return false;
        event.preventDefault();
        const snapshot = viewInstance.state;
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const r = await api.upload(reader.result, file.name);
            if (viewInstance.isDestroyed) return;
            if (viewInstance.state.doc !== snapshot.doc || !viewInstance.state.selection.eq(snapshot.selection)) {
              errorRef.current?.('图片上传期间编辑位置已改变，请重新粘贴'); return;
            }
            cmd.insertImage(viewInstance, r.url, file.name);
          } catch (e) {
            errorRef.current?.(e.message || "图片上传失败，请重试");
          }
        };
        reader.onerror = () => errorRef.current?.("读取图片失败，请重试");
        reader.readAsDataURL(file);
        return true;
      },
      handleDOMEvents: {
        // 任务项勾选：点复选框直接翻转 attrs，不进入文本选区逻辑
        mousedown(v, e) {
          if (e.button === 2) {
            e.preventDefault();
            selectContextTarget(v, e);
            return true;
          }
          if (e.button !== 0) return false;
          const cb = e.target.closest?.(".task-checkbox");
          if (!cb) return false;
          const li = cb.closest("li[data-task]");
          if (!li) return false;
          e.preventDefault();
          const pos = v.posAtDOM(li, 0);
          const $pos = v.state.doc.resolve(pos);
          for (let d = $pos.depth; d > 0; d--) {
            const node = $pos.node(d);
            if (node.type.name === "task_item") {
              const at = $pos.before(d);
              v.dispatch(
                v.state.tr.setNodeMarkup(at, null, { ...node.attrs, checked: !node.attrs.checked })
              );
              return true;
            }
          }
          return true;
        },
      },
    });

    viewRef.current = view;
    // 把 view 交给外层（AI 面板需要读写选区）
    onViewReadyRef.current?.(view);
    // 排障钩子：控制台可直接检查文档结构与选区
    if (typeof window !== "undefined") window.__pmView = view;

    let lastDoc = null;
    function schedule() {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        const st = viewRef.current?.state;
        if (!st) return;
        setUi(computeUi(st));
        if (lastDoc !== st.doc) setOutline(computeOutline(st.doc));
        detectSlash(st);
        if (lastDoc !== st.doc) onSelectionInfo?.({ words: st.doc.textContent.replace(/\s/g, "").length });
        lastDoc = st.doc;
      });
    }

    function detectSlash(st) {
      const { $from } = st.selection;
      const text = $from.parent.textContent;
      const ok =
        !viewRef.current.composing && st.selection.empty &&
        $from.parent.type.name === "paragraph" &&
        /^\/[^\s]{0,12}$/.test(text) &&
        $from.parentOffset === text.length;
      if (!ok) {
        if (slashRef.current) setSlash(null);
        return;
      }
      const coords = viewRef.current.coordsAtPos($from.pos);
      setSlash({
        query: text.slice(1),
        from: $from.start(),
        to: $from.start() + text.length,
        top: Math.max(8, Math.min(coords.bottom + 6, window.innerHeight - 380)),
        left: Math.max(8, Math.min(coords.left, window.innerWidth - 300)),
      });
    }

    schedule();

    return () => {
      cancelAnimationFrame(rafRef.current);
      onViewReadyRef.current?.(null);
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- 块手柄：跟随鼠标所在块 ---------- */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let raf = 0;

    const onMove = (e) => {
      if (raf || handleMenuRef.current) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (handleMenuRef.current) return;
        const view = viewRef.current;
        if (!view) return;
        const rect = host.getBoundingClientRect();
        // 手柄在编辑区左侧的留白里，鼠标不会命中 host，
        // 所以监听必须挂在 document 上，再按坐标判断是否进入感应区
        if (e.clientX < rect.left - 56 || e.clientX > rect.right + 8) return setHandle(null);
        if (e.clientY < rect.top - 16 || e.clientY > rect.bottom + 16) return setHandle(null);

        // 用垂直位置命中块：比 posAtCoords 更稳（左侧空白处 posAtCoords 会返回 null）
        const blocks = host.querySelectorAll(".ProseMirror > *");
        let target = null;
        for (const el of blocks) {
          const r = el.getBoundingClientRect();
          if (e.clientY >= r.top - 3 && e.clientY <= r.bottom + 3) {
            target = el;
            break;
          }
        }
        if (!target) return setHandle(null);

        let pos;
        try {
          const $pos = view.state.doc.resolve(view.posAtDOM(target, 0));
          pos = $pos.depth ? $pos.before(1) : $pos.pos;
        } catch (_) {
          return setHandle(null);
        }
        if (!view.state.doc.nodeAt(pos)) return setHandle(null);
        const r = target.getBoundingClientRect();
        setHandle({ pos, top: r.top, left: rect.left - 52 });
      });
    };

    const onLeave = (e) => {
      if (handleMenuRef.current) return;
      if (e.clientY <= 0 || e.clientY >= window.innerHeight - 1) setHandle(null);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseleave", onLeave);
    const onScroll = () => { handleMenuRef.current = false; setHandle(null); setHandleMenu(false); };
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      window.removeEventListener('scroll', onScroll, true);
      cancelAnimationFrame(raf);
    };
  }, []);

  /* ---------- 斜杠菜单键盘操作 ---------- */
  useEffect(() => {
    if (!slash) return;
    const items = SLASH_ITEMS.filter((it) => matches(it, slash.query));
    let idx = 0;
    const onKey = (e) => {
      if (e.isComposing || e.keyCode === 229 || viewRef.current?.composing || !viewRef.current?.dom.contains(e.target)) return;
      if (e.key === "Escape") {
        e.preventDefault(); e.stopPropagation();
        setSlash(null);
      } else if (e.key === "ArrowDown" && items.length) {
        e.preventDefault(); e.stopPropagation();
        idx = (idx + 1) % items.length;
        highlight(items[idx]);
      } else if (e.key === "ArrowUp" && items.length) {
        e.preventDefault(); e.stopPropagation();
        idx = (idx - 1 + items.length) % items.length;
        highlight(items[idx]);
      } else if (e.key === "Enter" && items.length) {
        e.preventDefault(); e.stopPropagation();
        if (items[idx]) pick(items[idx]);
      }
    };
    const highlight = (item) => {
      document.querySelectorAll(".slash-item").forEach((el) => el.classList.remove("active"));
      const selected = document.querySelector(`.slash-item[data-key="${item.key}"]`);
      selected?.classList.add("active"); selected?.scrollIntoView({ block: "nearest" });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [slash]);

  const pick = useCallback((item) => {
    const view = viewRef.current;
    if (!view || !slashRef.current) return;
    const { from, to } = slashRef.current;
    const tr = view.state.tr.delete(from, to);
    view.dispatch(tr);
    setSlash(null);
    if (item.key === "img") dialogHandler.current("image");
    else item.run(view);
    view.focus();
  }, []);

  const exec = (fn) => () => {
    const view = viewRef.current;
    if (view && !view.composing) fn(view);
    view?.focus();
  };

  const btn = (active, extra = "") => "tb-btn" + (active ? " active" : "") + (extra ? " " + extra : "");
  const openContextMenu = event => {
    const view = viewRef.current;
    if (!view || view.composing) return;
    if (event.clientX || event.clientY) selectContextTarget(view, event);
    setSlash(null);
    setHandleMenu(false);
    handleMenuRef.current = false;
    const menu = contextMenuAt(event, '编辑操作', editorContextItems(view, {
      link: () => openDialog('link'), image: replace => openDialog('image', replace), help: () => openDialog('help'),
    }), () => { if (!view.isDestroyed) view.focus(); });
    if (!event.clientX && !event.clientY) { const caret = view.coordsAtPos(view.state.selection.from); menu.x = caret.left; menu.y = caret.bottom + 4; }
    setContextMenu(menu);
  };

  const actionProps = id => ({
    'aria-label': actions[id].label,
    'aria-pressed': actions[id].mark || actions[id].node ? !!ui.actions?.[id]?.active : undefined,
    'data-tip': `${actions[id].label} ${shortcutLabel(actions[id].shortcut)}`,
    disabled: !ui.actions?.[id]?.enabled,
    onClick: () => runAction(viewRef.current, id),
  });
  useLayoutEffect(() => {
    const buttons = [...(toolbarRef.current?.querySelectorAll('button') || [])].filter(button => !button.closest('.dd-panel'));
    const focused = buttons.find(button => button === document.activeElement && !button.disabled) || buttons.find(button => !button.disabled);
    for (const button of buttons) button.tabIndex = button === focused ? 0 : -1;
  }, [ui]);

  return (
    <div className="editor-wrap">
      {dialog && <EditorDialog dialog={dialog} viewRef={viewRef} onClose={() => setDialog(null)} />}
      <ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} onError={onError} />
      {/* 工具栏：按下按钮时阻止抢焦点，否则会丢失编辑器选区 */}
      <div
        className="toolbar" ref={toolbarRef} role="toolbar" aria-label="文档工具栏"
        onKeyDown={event => toolbarNavigation(event, viewRef.current)}
        onFocusCapture={event => {
          if (event.target.closest('.dd-panel')) return;
          toolbarRef.current.querySelectorAll('button').forEach(button => { if (!button.closest('.dd-panel')) button.tabIndex = button === event.target ? 0 : -1; });
        }}
        onMouseDown={(e) => {
          if (e.target.closest("button")) e.preventDefault();
        }}
      >
        <div className="tb-group">
          <button className={btn(false)} {...actionProps("undo")}>
            <Ico name="undo" />
          </button>
          <button className={btn(false)} {...actionProps("redo")}>
            <Ico name="redo" />
          </button>
          <button className={btn(false)} {...actionProps("clear")}>
            <Ico name="eraser" />
          </button>
        </div>
        <span className="tb-sep" />

        <div className="tb-group">
          <Dropdown
            title="段落格式"
            label={
              <span className="tb-fmt">
                {ui.fmt || "正文"}
                <span className="dd-caret">▾</span>
              </span>
            }
          >
            {(close) => (
              <div className="dd-list fmt-list">
                {FORMATS.map((f) => (
                  <button
                    key={f.key}
                    className={"fmt-item lv" + f.level + ((ui.fmt || "正文") === f.label ? " active" : "")}
                    onClick={() => {
                      if (f.level) exec((v) => cmd.setHeading(v, f.level))();
                      else exec(cmd.setParagraph)();
                      close();
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
          </Dropdown>

          <Dropdown
            title="字号" disabled={!ui.inline}
            label={
              <span className="tb-size">
                {ui.fontSize || 14}
                <span className="dd-caret">▾</span>
              </span>
            }
          >
            {(close) => (
              <div className="dd-list size-list">
                {FONT_SIZES.map((s) => (
                  <button
                    key={s}
                    className={"dd-item" + (ui.fontSize === s ? " active" : "")}
                    onClick={() => {
                      cmd.setFontSize(viewRef.current, s);
                      close();
                    }}
                  >
                    <span style={{ fontSize: 13 }}>{s}</span>
                  </button>
                ))}
                <div className="dd-divider" />
                <button
                  className="dd-item"
                  onClick={() => {
                    cmd.clearFontSize(viewRef.current);
                    close();
                  }}
                >
                  <span style={{ fontSize: 13 }}>默认字号</span>
                </button>
              </div>
            )}
          </Dropdown>
        </div>
        <span className="tb-sep" />

        <div className="tb-group">
          <button className={btn(ui.bold, "tb-b")} {...actionProps("bold")} >B</button>
          <button className={btn(ui.italic, "tb-i")} {...actionProps("italic")} >I</button>
          <button className={btn(ui.strike, "tb-s")} {...actionProps("strike")} >S</button>
          <button className={btn(ui.underline, "tb-u")} {...actionProps("underline")} >U</button>
        </div>
        <span className="tb-sep" />

        <div className="tb-group">
          <Dropdown
            title="文字颜色" disabled={!ui.inline}
            active={!!ui.color}
            label={<span className="tb-color" style={{ borderBottomColor: ui.color || "currentColor" }}>A</span>}
          >
            {(close) => (
              <div className="color-grid">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c}
                    className="color-cell"
                    title={c}
                    aria-label={`颜色 ${c}`}
                    style={{ background: c }}
                    onClick={() => {
                      cmd.setTextColor(viewRef.current, c);
                      close();
                    }}
                  />
                ))}
                <button
                  className="color-none"
                  onClick={() => {
                    cmd.clearTextColor(viewRef.current);
                    close();
                  }}
                >
                  默认
                </button>
              </div>
            )}
          </Dropdown>

          <Dropdown
            title="背景色" disabled={!ui.inline}
            active={!!ui.bg}
            label={<span className="tb-color tb-bg"><Ico name="marker" /><span className="dd-caret">▾</span></span>}
          >
            {(close) => (
              <div className="color-grid">
                {BG_COLORS.map((c) => (
                  <button
                    key={c}
                    className="color-cell"
                    title={c}
                    aria-label={`颜色 ${c}`}
                    style={{ background: c }}
                    onClick={() => {
                      cmd.setBgColor(viewRef.current, c);
                      close();
                    }}
                  />
                ))}
                <button
                  className="color-none"
                  onClick={() => {
                    cmd.clearBgColor(viewRef.current);
                    close();
                  }}
                >
                  无
                </button>
              </div>
            )}
          </Dropdown>

          <Dropdown
            title="上标 / 下标" disabled={!ui.inline}
            active={ui.sup || ui.sub}
            label={<span className="tb-color tb-supsub">x₂<span className="dd-caret">▾</span></span>}
          >
            {(close) => (
              <div className="dd-list">
                <button
                  className={"dd-item" + (ui.sup ? " active" : "")}
                  onClick={() => { cmd.toggleSup(viewRef.current); close(); }}
                >
                  <span className="sup-demo">上标 x²</span>
                </button>
                <button
                  className={"dd-item" + (ui.sub ? " active" : "")}
                  onClick={() => { cmd.toggleSub(viewRef.current); close(); }}
                >
                  <span className="sup-demo">下标 x₂</span>
                </button>
              </div>
            )}
          </Dropdown>

          <Dropdown title="对齐方式" active={ui.align !== "left"} label={<AlignIcon type={ui.align} withCaret />}>
            {(close) => (
              <div className="dd-list">
                {ALIGNS.map((a) => (
                  <button
                    key={a.key}
                    className={"dd-item" + (ui.align === a.key ? " active" : "")}
                    onClick={() => {
                      cmd.setAlign(viewRef.current, a.key);
                      close();
                    }}
                  >
                    <AlignIcon type={a.key} />
                    <span>{a.label}</span>
                  </button>
                ))}
              </div>
            )}
          </Dropdown>
        </div>
        <span className="tb-sep" />

        <div className="tb-group">
          <button className={btn(ui.bullet)} {...actionProps("bullet")} >
            <Ico name="bullet" />
          </button>
          <button className={btn(ui.ordered)} {...actionProps("ordered")} >
            <Ico name="ordered" />
          </button>
          <button className={btn(ui.task)} {...actionProps("task")} >
            <Ico name="task" />
          </button>
          <button className={btn(false)} {...actionProps('outdent')}><span aria-hidden="true">⇤</span></button>
          <button className={btn(false)} {...actionProps('indent')}><span aria-hidden="true">⇥</span></button>
          <button className={btn(ui.quote)} {...actionProps("quote")} >
            <Ico name="quote" />
          </button>
          <button className={btn(ui.code)} {...actionProps("code")} >
            <Ico name="code" />
          </button>
        </div>
        <span className="tb-sep" />

        <div className="tb-group">
          <button
            className={btn(ui.link)}
            aria-label="编辑链接" data-tip={`链接 ${shortcutLabel('Mod-k')}`}
            disabled={!ui.inline} onClick={() => openDialog('link')}
          >
            <Ico name="link" />
          </button>
          <button className={btn(false)} aria-label="插入表格" data-tip="表格 3 × 3" onClick={exec((v) => cmd.insertTable(v, 3, 3))}>
            <Ico name="table" />
          </button>
          <button
            className={btn(false)}
            aria-label="插入图片" data-tip="图片" disabled={!ui.inline} onClick={() => openDialog('image')}
          >
            <Ico name="image" />
          </button>
        </div>
        <span className="tb-sep" />

        <div className="tb-group">
          <Dropdown title="插入元素" label={<span className="tb-insert"><Ico name="plus" /><span className="dd-caret">▾</span></span>}>
            {(close) => (
              <div className="dd-list">
                <button className="dd-item" onClick={() => { cmd.insertCodeBlock(viewRef.current); close(); }}>
                  <i className="dd-ico">{"{ }"}</i><span>代码块</span>
                </button>
                <button className="dd-item" onClick={() => { cmd.insertTable(viewRef.current, 3, 3); close(); }}>
                  <i className="dd-ico">▦</i><span>表格 3 × 3</span>
                </button>
                <button
                  className="dd-item"
                  onClick={() => {
                    openDialog('image');
                    close();
                  }}
                >
                  <i className="dd-ico">🖼</i><span>图片</span>
                </button>
                <div className="dd-divider" />
                {cmd.CALLOUT_TYPES.map((t) => (
                  <button
                    key={t.key}
                    className="dd-item"
                    onClick={() => {
                      cmd.insertCallout(viewRef.current, t.key);
                      close();
                    }}
                  >
                    <i className="dd-ico dd-dot" style={{ background: t.color }} />
                    <span>提示块 · {t.label}</span>
                  </button>
                ))}
                <button className="dd-item" onClick={() => { cmd.insertToggle(viewRef.current); close(); }}>
                  <i className="dd-ico">▸</i><span>折叠块</span>
                </button>
                <button className="dd-item" onClick={() => { cmd.insertHr(viewRef.current); close(); }}>
                  <i className="dd-ico">—</i><span>分割线</span>
                </button>
              </div>
            )}
          </Dropdown>
        </div>
        <button className="tb-btn xc-shortcut-trigger" aria-label="快捷键速查" data-tip="快捷键速查" onClick={() => openDialog('help')}>⌨</button>
      </div>

      {/* 上下文工具条：按光标所在节点切换 */}
      <ContextBar ui={ui} viewRef={viewRef} exec={exec} onImage={() => openDialog("image", true)} />

      {/* 编辑区 + 大纲 */}
      <div className="editor-body">
        <div className="editor-canvas">
          <div className="editor-page">
            <div className="doc-head">
              <input
                className="doc-h1"
                value={title || ""}
                placeholder="未命名文档"
                onChange={onTitleChange}
                disabled={!onTitleChange}
              />
              <div className="doc-meta">
                <button className="meta-ai" type="button">
                  <Ico name="sparkle" />
                  AI 速览
                </button>
                <span className="meta-sep" />
                <span className="meta-item">正文 {words || 0} 字（{((words || 0) / 130).toFixed(1)} 页）</span>
                <span className="meta-sep" />
                <span className="meta-item">浏览 1 次（1 人）</span>
                <span className="meta-sep" />
                <button className="meta-more" type="button">全部<span className="dd-caret">▾</span></button>
              </div>
            </div>
            <div ref={hostRef} className="pm-host" onContextMenu={openContextMenu} onKeyDown={event => {
              if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) openContextMenu(event);
            }} />
          </div>
          {!showOutline && (
            <button
              className="show-outline-btn"
              title="显示大纲"
              onClick={() => setShowOutline(true)}
            >
              ≡ 大纲
            </button>
          )}
        </div>
        {showOutline && (
          <aside className="outline">
            <div className="outline-head">
              <span className="outline-title">目录</span>
              <button
                className="outline-toggle"
                title="隐藏大纲"
                onClick={() => setShowOutline(false)}
              >
                ×
              </button>
            </div>
            {outline.length === 0 ? (
              <div className="outline-empty">添加标题后自动生成</div>
            ) : (
              outline.map((h) => (
                <button
                  key={h.pos}
                  className={"outline-item lv" + h.level}
                  style={{ paddingLeft: 8 + (h.level - 1) * 12 }}
                  onClick={() => {
                    const view = viewRef.current;
                    if (!view) return;
                    const dom = view.nodeDOM(h.pos);
                    dom?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                >
                  {h.text}
                </button>
              ))
            )}
          </aside>
        )}
      </div>

      {/* 块手柄 */}
      {handle && (
        <div
          className="block-handle"
          onMouseDown={event => event.preventDefault()}
          style={{ top: handle.top, left: handle.left }}
          onMouseEnter={() => {
            handleMenuRef.current = true;
            setHandleMenu(true);
          }}
          onMouseLeave={() => {
            handleMenuRef.current = false;
            setHandleMenu(false);
          }}
        >
          <button
            className="bh-btn"
            title="在下方插入段落"
            onClick={() => {
              const view = viewRef.current;
              if (!view) return;
              const block = cmd.currentBlock(view.state, handle.pos);
              if (!block) return;
              const pos = block.pos + block.node.nodeSize;
              cmd.insertParagraphAt(view, pos);
              view.focus();
            }}
          >
            +
          </button>
          <button className="bh-btn bh-drag" title="块操作">⠿</button>
          {handleMenu && (
            <div className="bh-menu">
              <button onClick={() => { cmd.moveBlock(viewRef.current, -1, handle.pos); setHandle(null); }}>上移</button>
              <button onClick={() => { cmd.moveBlock(viewRef.current, 1, handle.pos); setHandle(null); }}>下移</button>
              <button onClick={() => { cmd.duplicateBlock(viewRef.current, handle.pos); setHandle(null); }}>复制</button>
              <button className="danger" onClick={() => { cmd.deleteBlock(viewRef.current, handle.pos); setHandle(null); }}>删除</button>
            </div>
          )}
        </div>
      )}

      {/* 斜杠菜单 */}
      {slash && (
        <div className="slash-menu" style={{ top: slash.top, left: slash.left }}>
          {SLASH_ITEMS.filter((it) => matches(it, slash.query)).map((it, i) => (
            <button
              key={it.key}
              data-key={it.key}
              className={"slash-item" + (i === 0 ? " active" : "")}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(it);
              }}
            >
              <span className="slash-icon">{it.icon}</span>
              <span className="slash-text">
                <b>{it.label}</b>
                <i>{it.desc}</i>
              </span>
            </button>
          ))}
          {SLASH_ITEMS.filter((it) => matches(it, slash.query)).length === 0 && (
            <div className="slash-empty">没有匹配的插入项</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ================= 工具栏组件 ================= */

/* 线框图标：统一 20 网格、1.5 描边，贴近学城工具栏的细腻风格 */
const ICONS = {
  undo: (
    <>
      <path d="M7.5 4.5 3.5 8.5l4 4" />
      <path d="M3.5 8.5h7.2a4.3 4.3 0 0 1 0 8.6H8.4" />
    </>
  ),
  redo: (
    <>
      <path d="M12.5 4.5l4 4-4 4" />
      <path d="M16.5 8.5H9.3a4.3 4.3 0 0 0 0 8.6h2.3" />
    </>
  ),
  eraser: (
    <>
      <path d="M3.2 13.4 9.9 6.7a2 2 0 0 1 2.8 0l2.3 2.3a2 2 0 0 1 0 2.8l-4.6 4.6H7.1l-3.9-3.9z" />
      <path d="M7.6 17h9" />
    </>
  ),
  marker: (
    <>
      <path d="M5.2 14.8 12 8l2.4 2.4-6.8 6.8H5.2z" />
      <path d="M11.6 5.2 13.6 3l3.4 3.4-2.2 2" />
      <path d="M4 18h4.6" />
    </>
  ),
  bullet: (
    <>
      <path d="M8 5.5h8.5M8 10h8.5M8 14.5h8.5" />
      <circle cx="4.6" cy="5.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.6" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.6" cy="14.5" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  ordered: (
    <>
      <path d="M8 5.5h8.5M8 10h8.5M8 14.5h8.5" />
      <path d="M3.4 4.6 4.6 4v3.2" />
      <path d="M3.2 9.6h2.2L3.3 12h2.2" />
    </>
  ),
  task: (
    <>
      <rect x="3.4" y="4.4" width="4.6" height="4.6" rx="1.1" />
      <path d="M4.5 6.7l1.1 1.1 1.7-1.9" />
      <path d="M10.6 6.7h6.2M10.6 13h6.2M3.4 13h4.6" />
    </>
  ),
  quote: (
    <>
      <path d="M4 8.2h3.4v3.1c0 1.9-1.1 3.2-3 3.9" />
      <path d="M11 8.2h3.4v3.1c0 1.9-1.1 3.2-3 3.9" />
    </>
  ),
  code: (
    <>
      <path d="M7.2 6 3.4 10l3.8 4" />
      <path d="M12.8 6l3.8 4-3.8 4" />
    </>
  ),
  link: (
    <>
      <path d="M8.4 11.6a3 3 0 0 0 4.3 0l2-2a3 3 0 0 0-4.3-4.3l-1 1" />
      <path d="M11.6 8.4a3 3 0 0 0-4.3 0l-2 2a3 3 0 0 0 4.3 4.3l1-1" />
    </>
  ),
  table: (
    <>
      <rect x="3.4" y="4.4" width="13.2" height="11.2" rx="1.4" />
      <path d="M3.4 8.4h13.2M8.2 8.4v7.2" />
    </>
  ),
  image: (
    <>
      <rect x="3.4" y="4.4" width="13.2" height="11.2" rx="1.4" />
      <path d="M4.4 13.4 8 9.8l2.6 2.6 1.8-1.8 3.2 3.2" />
      <circle cx="7" cy="7.4" r="1.1" />
    </>
  ),
  sparkle: (
    <>
      <path d="M10 3.2l1.5 4.1 4.1 1.5-4.1 1.5L10 14.4 8.5 10.3 4.4 8.8l4.1-1.5z" />
      <path d="M15.6 13.6l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7z" />
    </>
  ),
  plus: <path d="M10 4.4v11.2M4.4 10h11.2" />,
  /* ---- 表格操作图标 ---- */
  rowUp: (
    <>
      <path d="M10 3.5v7" />
      <path d="M7.3 6.2 10 3.5l2.7 2.7" />
      <path d="M4 13.5h12" />
    </>
  ),
  rowDown: (
    <>
      <path d="M10 16.5V9.5" />
      <path d="M7.3 13.8 10 16.5l2.7-2.7" />
      <path d="M4 6.5h12" />
    </>
  ),
  colLeft: (
    <>
      <path d="M3.5 10h7" />
      <path d="M6.2 7.3 3.5 10l2.7 2.7" />
      <path d="M13.5 4v12" />
    </>
  ),
  colRight: (
    <>
      <path d="M16.5 10h-7" />
      <path d="M13.8 7.3 16.5 10l-2.7 2.7" />
      <path d="M6.5 4v12" />
    </>
  ),
  merge: (
    <>
      <path d="M3.5 10h4.5M5.5 7.5 8 10l-2.5 2.5" />
      <path d="M16.5 10h-4.5M14.5 7.5 12 10l2.5 2.5" />
    </>
  ),
  split: (
    <>
      <path d="M9 10H4.5M6.5 7.5 4 10l2.5 2.5" />
      <path d="M11 10h4.5M13.5 7.5 16 10l-2.5 2.5" />
    </>
  ),
  headerRow: (
    <>
      <path d="M3.5 4.5h13v11h-13z" fill="currentColor" stroke="none" opacity=".12" />
      <rect x="3.5" y="4.5" width="13" height="11" rx="1.4" />
      <path d="M3.5 8.8h13" />
      <path d="M10 8.8v7.2" />
    </>
  ),
  headerCol: (
    <>
      <path d="M3.5 4.5h13v11h-13z" fill="currentColor" stroke="none" opacity=".12" />
      <rect x="3.5" y="4.5" width="13" height="11" rx="1.4" />
      <path d="M7.8 4.5v11" />
      <path d="M7.8 10h8.7" />
    </>
  ),
  delRow: (
    <>
      <rect x="3.5" y="8" width="8.5" height="4" rx="1" />
      <path d="M13.3 8.7l3 3M16.3 8.7l-3 3" />
    </>
  ),
  delCol: (
    <>
      <rect x="8" y="3.5" width="4" height="8.5" rx="1" />
      <path d="M13.3 13.3l3 3M16.3 13.3l-3 3" />
    </>
  ),
  delTable: (
    <>
      <rect x="3.5" y="4.5" width="13" height="11" rx="1.4" />
      <path d="M6.5 7.5 13.5 14.5M13.5 7.5 6.5 14.5" />
    </>
  ),
};

function Ico({ name }) {
  return (
    <svg
      className="ico"
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}

/* 段落格式（学城：正文 + 标题 1~6） */
const FORMATS = [
  { key: "p", label: "正文", level: 0 },
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ key: `h${n}`, label: `标题 ${n}`, level: n })),
];

const FONT_SIZES = [11, 12, 13, 14, 16, 18, 20, 24, 28, 36];

const TEXT_COLORS = [
  "#1f2329", "#5c6570", "#8f959e",
  "#d93026", "#f5a623", "#2fbf71",
  "#1668dc", "#7b61ff", "#eb2f96",
];

const BG_COLORS = ["#fff3b0", "#ffe3e3", "#e8f1ff", "#ecf9f1", "#f3e8ff", "#f2f3f5"];

const ALIGNS = [
  { key: "left", label: "左对齐" },
  { key: "center", label: "居中" },
  { key: "right", label: "右对齐" },
  { key: "justify", label: "两端对齐" },
];

const LANGS = [
  { key: "", label: "纯文本" },
  { key: "javascript", label: "JavaScript" },
  { key: "typescript", label: "TypeScript" },
  { key: "python", label: "Python" },
  { key: "java", label: "Java" },
  { key: "go", label: "Go" },
  { key: "sql", label: "SQL" },
  { key: "json", label: "JSON" },
  { key: "bash", label: "Shell" },
  { key: "html", label: "HTML" },
  { key: "css", label: "CSS" },
];

/** 三条横线表示对齐方向 */
function AlignIcon({ type, withCaret }) {
  const mid =
    type === "center"
      ? { x: 4, w: 8 }
      : type === "right"
      ? { x: 6, w: 8 }
      : type === "justify"
      ? { x: 2, w: 12 }
      : { x: 2, w: 8 };
  return (
    <span className="align-icon">
      <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <rect x="2" y="3.5" width="12" height="1.5" rx="0.75" />
        <rect x={mid.x} y="7.25" width={mid.w} height="1.5" rx="0.75" />
        <rect x="2" y="11" width="12" height="1.5" rx="0.75" />
      </svg>
      {withCaret ? <span className="dd-caret">▾</span> : null}
    </span>
  );
}

/** 上下文工具条：光标落在表格/代码块/提示块/折叠块/图片上时出现 */
function ContextBar({ ui, viewRef, exec, onImage }) {
  const has = ui.image || ui.table || ui.codeBlock || !!ui.calloutType || ui.toggleSummary != null;
  const [addCount, setAddCount] = useState(1);
  if (!has) return null;

  return (
    <div
      className="ctx-bar"
      onMouseDown={(e) => {
        if (e.target.closest("button")) e.preventDefault();
      }}
    >
      {ui.image && (
        <>
          <span className="ctx-label">图片</span>
          {ALIGNS.slice(0, 3).map((a) => (
            <button key={a.key} className="ctx-btn ctx-icon" title={a.label} onClick={exec((v) => cmd.imageAlign(v, a.key))}>
              <AlignIcon type={a.key} />
            </button>
          ))}
          <span className="ctx-sep" />
          <button
            className="ctx-btn"
            onClick={onImage}
          >
            替换
          </button>
          <button className="ctx-btn danger" onClick={exec(cmd.deleteSelectionNode)}>
            删除
          </button>
        </>
      )}

      {ui.table && (
        <>
          <span className="ctx-label">表格</span>
          <button className="ctx-btn ctx-icon" aria-label="在上方插入行" data-tip="在上方插入行" onClick={exec((v) => cmd.tableAddRowsBefore(v, addCount))}>
            <Ico name="rowUp" />
          </button>
          <button className="ctx-btn ctx-icon" aria-label="在下方插入行" data-tip="在下方插入行" onClick={exec((v) => cmd.tableAddRowsAfter(v, addCount))}>
            <Ico name="rowDown" />
          </button>
          <button className="ctx-btn ctx-icon" aria-label="在左侧插入列" data-tip="在左侧插入列" onClick={exec((v) => cmd.tableAddColsBefore(v, addCount))}>
            <Ico name="colLeft" />
          </button>
          <button className="ctx-btn ctx-icon" aria-label="在右侧插入列" data-tip="在右侧插入列" onClick={exec((v) => cmd.tableAddColsAfter(v, addCount))}>
            <Ico name="colRight" />
          </button>
          <select
            className="ctx-count"
            value={addCount}
            title="一次插入的行/列数"
            onChange={(e) => setAddCount(Number(e.target.value))}
          >
            {[1, 2, 3, 5, 10].map((n) => (
              <option key={n} value={n}>
                ×{n}
              </option>
            ))}
          </select>
          <span className="ctx-sep" />
          <button
            className="ctx-btn ctx-icon"
            aria-label="合并单元格（需先选中多个单元格）" data-tip="合并单元格（需先选中多个单元格）"
            disabled={!ui.canMerge}
            onClick={exec(cmd.tableMerge)}
          >
            <Ico name="merge" />
          </button>
          <button className="ctx-btn ctx-icon" aria-label="拆分单元格" disabled={!ui.canSplit} data-tip="拆分单元格" onClick={exec(cmd.tableSplit)}>
            <Ico name="split" />
          </button>
          <button className="ctx-btn ctx-icon" aria-label="切换表头行" data-tip="切换表头行" onClick={exec(cmd.tableToggleHeaderRow)}>
            <Ico name="headerRow" />
          </button>
          <button className="ctx-btn ctx-icon" aria-label="切换表头列" data-tip="切换表头列" onClick={exec(cmd.tableToggleHeaderCol)}>
            <Ico name="headerCol" />
          </button>
          <span className="ctx-sep" />
          <button className="ctx-btn ctx-icon danger" aria-label="删除整行" data-tip="删除整行" onClick={exec(cmd.tableDeleteRow)}>
            <Ico name="delRow" />
          </button>
          <button className="ctx-btn ctx-icon danger" aria-label="删除整列" data-tip="删除整列" onClick={exec(cmd.tableDeleteCol)}>
            <Ico name="delCol" />
          </button>
          <button className="ctx-btn ctx-icon danger" aria-label="删除整个表格" data-tip="删除整个表格" onClick={exec(cmd.tableDelete)}>
            <Ico name="delTable" />
          </button>
        </>
      )}

      {ui.codeBlock && (
        <>
          <span className="ctx-label">代码块</span>
          <select
            className="ctx-select"
            value={ui.codeLang}
            onChange={(e) => cmd.setCodeLanguage(viewRef.current, e.target.value)}
          >
            {LANGS.map((l) => (
              <option key={l.key} value={l.key}>
                {l.label}
              </option>
            ))}
          </select>
        </>
      )}

      {ui.calloutType && (
        <>
          <span className="ctx-label">提示块</span>
          {cmd.CALLOUT_TYPES.map((t) => (
            <button
              key={t.key}
              data-cmd={"callout-" + t.key}
              className={"ctx-chip" + (ui.calloutType === t.key ? " active" : "")}
              onClick={exec((v) => cmd.setCalloutType(v, t.key))}
            >
              <i className="ctx-dot" style={{ background: t.color }} />
              {t.label}
            </button>
          ))}
        </>
      )}

      {ui.toggleSummary != null && (
        <>
          <span className="ctx-label">折叠块</span>
          <button
            className="ctx-btn"
            onClick={exec((v) => {
              const s = window.prompt("折叠标题", ui.toggleSummary);
              if (s !== null) cmd.setToggleSummary(v, s);
            })}
          >
            标题：{ui.toggleSummary}
          </button>
        </>
      )}
    </div>
  );
}

/* ---------- 斜杠菜单数据 ---------- */
const SLASH_ITEMS = [
  { key: "p", label: "正文", desc: "普通段落", icon: "¶", keywords: "zhengwen 正文 段落 text p", run: cmd.setParagraph },
  { key: "h1", label: "一级标题", desc: "大标题", icon: "H1", keywords: "h1 biaoti 一级标题 标题", run: (v) => cmd.setHeading(v, 1) },
  { key: "h2", label: "二级标题", desc: "中标题", icon: "H2", keywords: "h2 biaoti 二级标题 标题", run: (v) => cmd.setHeading(v, 2) },
  { key: "h3", label: "三级标题", desc: "小标题", icon: "H3", keywords: "h3 biaoti 三级标题 标题", run: (v) => cmd.setHeading(v, 3) },
  { key: "ul", label: "无序列表", desc: "项目符号列表", icon: "•", keywords: "ul liebiao 无序 列表 项目符号 list", run: cmd.toggleBulletList },
  { key: "ol", label: "有序列表", desc: "带序号的列表", icon: "1.", keywords: "ol liebiao 有序 列表 编号 list", run: cmd.toggleOrderedList },
  { key: "task", label: "任务列表", desc: "可勾选的待办", icon: "☑", keywords: "task todo renwu 任务 待办 清单 todo", run: cmd.toggleTaskList },
  { key: "quote", label: "引用", desc: "引用一段话", icon: "❝", keywords: "quote yinyong 引用", run: cmd.toggleQuote },
  { key: "code", label: "代码块", desc: "等宽字体代码段", icon: "{ }", keywords: "code daima 代码 代码块", run: (v) => cmd.insertCodeBlock(v) },
  { key: "table", label: "表格", desc: "3 × 3 表格", icon: "▦", keywords: "table biaoge 表格", run: (v) => cmd.insertTable(v, 3, 3) },
  { key: "callout", label: "提示块", desc: "高亮重点内容", icon: "💡", keywords: "callout tishi 提示 高亮 警告", run: (v) => cmd.insertCallout(v, "info") },
  { key: "toggle", label: "折叠块", desc: "收纳长内容", icon: "▸", keywords: "toggle zhedie 折叠 收起", run: cmd.insertToggle },
  { key: "hr", label: "分割线", desc: "视觉分隔", icon: "—", keywords: "hr fenge 分割线 分隔", run: cmd.insertHr },
  { key: "img", label: "图片", desc: "通过链接插入", icon: "🖼", keywords: "image tupian img 图片 图像", run: (v) => {
    const url = window.prompt("输入图片地址");
    if (url) cmd.insertImage(v, url.trim());
  } },
];

function matches(item, q) {
  if (!q) return true;
  const s = q.toLowerCase();
  return item.label.includes(q) || item.keywords.toLowerCase().includes(s);
}
