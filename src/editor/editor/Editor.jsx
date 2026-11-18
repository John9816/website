/**
 * 编辑器主体 —— ProseMirror 的 React 封装
 * 包含：编辑区、悬浮工具栏、斜杠命令、块级手柄、右侧大纲
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { EditorState, Plugin, NodeSelection, TextSelection } from "prosemirror-state";
import { EditorView, Decoration, DecorationSet } from "prosemirror-view";
import { dropCursor } from "prosemirror-dropcursor";
import { gapCursor } from "prosemirror-gapcursor";
import { tableEditing, columnResizing, TableView, isInTable } from "prosemirror-tables";
import { schema } from "../schema.js";
import { buildInputRules } from "../plugins/inputRules.js";
import { buildKeymap, history } from "../plugins/keymap.js";
import { undo, redo } from "prosemirror-history";
import * as cmd from "./commands.js";
import { imageNodeView } from "./imageNodeView.js";
import { mountReact } from "./reactNodeView.jsx";
import PollView from "./PollView.jsx";
import SurveyView from "./SurveyView.jsx";
import CommentPopover from "./CommentPopover.jsx";
import AudioInsertDialog from "./AudioInsertDialog.jsx";
import { setDocId, setShareToken, registerOps, registerEditorRuntime } from "./docContext.js";
import { api } from "../api.js";
import {
  InsertRowAboveOutlined, InsertRowBelowOutlined,
  MergeCellsOutlined, SplitCellsOutlined, AlignLeftOutlined, AlignCenterOutlined,
  AlignRightOutlined, VerticalAlignTopOutlined, VerticalAlignMiddleOutlined, VerticalAlignBottomOutlined,
  ColumnWidthOutlined, BorderOutlined, BgColorsOutlined, DeleteRowOutlined, DeleteColumnOutlined, DeleteOutlined,
} from "@ant-design/icons";

/* 编辑器内核按需注册：主包不静态依赖 ProseMirror，右键菜单/选区工具经 docContext 同步调用。
   模块被动态导入时立即注册，早于任何编辑器交互。 */
registerEditorRuntime({ cmd, TextSelection, isInTable });

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

/**
 * 表格边框样式：columnResizing 用 TableView 渲染 <table>，会忽略 schema 里
 * table 节点的 toDOM，导致自定义属性无法落到 DOM。这里通过给 columnResizing
 * 传入自定义 View（继承官方 TableView），在 <table> 元素上写入 data-borders，
 * 使 CSS 的边框预设（全框/外框/无框）生效。
 */
class BordersTableView extends TableView {
  constructor(node, cellMinWidth, view) {
    super(node, cellMinWidth);
    this.table.setAttribute("data-borders", node.attrs.borders || "all");
  }
  update(node) {
    const ok = super.update(node);
    if (ok) this.table.setAttribute("data-borders", node.attrs.borders || "all");
    return ok;
  }
}

/**
 * 归一化文档结构：保证「每张表格之后」以及「文档末尾」都至少有一个文本块（段落）。
 * 否则当表格是最后一块、或其紧跟的是非文本块（图片 / 代码块 / 另一张表）时，
 * 光标无法停到表格之后，退格也就没法选中并删除它（用户反馈的「表格删不掉」根因）。
 */
function normalizeDoc(doc) {
  const s = doc.type.schema;
  const para = () => s.nodes.paragraph.create();
  const out = [];
  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i);
    out.push(child);
    if (child.type.name === "table") {
      const next = i < doc.childCount - 1 ? doc.child(i + 1) : null;
      if (!next || !next.isTextblock) out.push(para());
    }
  }
  if (out.length === 0 || !out[out.length - 1].isTextblock) out.push(para());
  return s.node("doc", null, out);
}

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

function computeUi(state) {
  const m = schema.marks;
  const callout = cmd.ancestor(state, "callout");
  const codeBlock = cmd.ancestor(state, "code_block");
  const toggle = cmd.ancestor(state, "toggle");
  const selNode = state.selection.node;
  const lv = headingLevelOf(state);
  const fs = activeMarkAttr(state, m.fontSize, "size");
  return {
    fmt: lv ? `标题 ${lv}` : "正文",
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
    imageWidth: selNode && selNode.type.name === "image" ? selNode.attrs.width || "" : "",
    imageBorder: selNode && selNode.type.name === "image" ? selNode.attrs.border || "" : "",
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

/**
 * 根据「块位置」计算浮动工具条所需的状态（与 computeUi 不同：computeUi 基于光标选区，
 * 而浮动条可能是在「悬停」某个块时出现，光标并不在此块上，因此需要从 pos 直接取节点）。
 */
function computeBlockUi(state, pos) {
  if (typeof pos !== "number") return null;
  const node = state.doc.nodeAt(pos);
  if (!node) return null;
  const name = node.type.name;
  if (name === "image") {
    const $p = state.doc.resolve(pos);
    let align = "left";
    for (let d = $p.depth; d > 0; d--) {
      if ($p.node(d).type.name === "paragraph") {
        align = $p.node(d).attrs.align || "left";
        break;
      }
    }
    return { type: "image", src: node.attrs.src, width: node.attrs.width || "", border: node.attrs.border || "", align };
  }
  if (name === "code_block") return { type: "code_block", lang: node.attrs.language || "" };
  if (name === "callout") return { type: "callout", calloutType: node.attrs.type };
  if (name === "toggle") return { type: "toggle", toggleSummary: node.attrs.summary };
  return null;
}

/** 由 DOM 元素反查其对应「块节点」在文档中的位置。
 *  posAtDOM(el,0) 对块级节点（表格/代码块/提示块/折叠块）会落在节点「内部」，
 *  所以需要向上找到该类型节点自身的位置（before）。图片是内联节点视图，posAtDOM 直接命中，退回 pos 即可。 */
function blockPosFromDOM(view, el, nodeName) {
  let pos = null;
  try { pos = view.posAtDOM(el, 0); } catch (_) { return null; }
  if (pos == null) return null;
  const $p = view.state.doc.resolve(pos);
  for (let d = $p.depth; d >= 0; d--) {
    if ($p.node(d).type.name === nodeName) return $p.before(d);
  }
  return pos;
}

/** 从鼠标落点判断当前悬停的是哪种「富块」，返回其 DOM 与文档位置 */
function detectBlock(view, target) {
  if (!target || !target.closest) return null;
  const imgEl = target.closest(".img-embed");
  const codeEl = target.closest("pre");
  const calloutEl = target.closest(".callout");
  const toggleEl = target.closest(".toggle");
  let el = null;
  let type = null;
  if (imgEl) { el = imgEl; type = "image"; }
  else if (codeEl) { el = codeEl; type = "code_block"; }
  else if (calloutEl) { el = calloutEl; type = "callout"; }
  else if (toggleEl) { el = toggleEl; type = "toggle"; }
  else return null;
  const pos = blockPosFromDOM(view, el, type);
  if (pos == null) return null;
  return { el, type, pos };
}

/** 浮动工具条定位：默认贴在块顶部上方；若上方空间不足则贴到块下方 */
function blockBarStyle(bar) {
  const tbH = 38;
  if (bar.top - tbH - 8 >= 4) {
    return { position: "fixed", top: bar.top, left: Math.max(8, bar.left), transform: "translateY(calc(-100% - 8px))" };
  }
  return { position: "fixed", top: bar.bottom, left: Math.max(8, bar.left), transform: "translateY(8px)" };
}

/** 在文档中查找某 comment id 标记的连续区间 [from,to] */
function findCommentRange(doc, id) {
  let from = null;
  let to = null;
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    const m = node.marks.find((mk) => mk.type.name === "comment" && mk.attrs.id === id);
    if (m) {
      if (from == null) from = pos;
      to = pos + node.nodeSize;
    }
  });
  return from == null ? null : { from, to };
}

/** 取某 comment id 标记的数据（resolved + thread） */
function getCommentData(doc, id) {
  let found = null;
  doc.descendants((node) => {
    if (found) return false;
    if (node.isText) {
      const m = node.marks.find((mk) => mk.type.name === "comment" && mk.attrs.id === id);
      if (m) {
        found = { id, resolved: !!m.attrs.resolved, thread: m.attrs.thread || [] };
        return false;
      }
    }
    return true;
  });
  return found;
}

export default function Editor({ initialDoc, onChange, onSelectionInfo, title, onTitleChange, words, onViewReady, childDocs, onOpenDoc, docId, editable = true }) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onViewReadyRef = useRef(onViewReady);
  onViewReadyRef.current = onViewReady;
  const onOpenDocRef = useRef(onOpenDoc);
  onOpenDocRef.current = onOpenDoc;
  const childDocsRef = useRef(childDocs);
  childDocsRef.current = childDocs;
  const rafRef = useRef(0);
  const [ui, setUi] = useState({});
  const [uploadTip, setUploadTip] = useState(""); // 图片上传中/失败提示（图床是外部服务，可能要几秒）
  const [audioOpen, setAudioOpen] = useState(false); // 音频/歌曲插入对话框
  const [outline, setOutline] = useState([]);
  const [slash, setSlash] = useState(null);
  const [handle, setHandle] = useState(null);
  const [handleMenu, setHandleMenu] = useState(false);
  const [blockBar, setBlockBar] = useState(null);
  const blockBarRef = useRef(null);
  const updateBar = (val) => {
    blockBarRef.current = val;
    setBlockBar(val);
  };
  /* 划词评论：选区浮按钮 + 评论气泡 */
  const [commentBtn, setCommentBtn] = useState(null); // { from, to, top, left }
  const [commentPop, setCommentPop] = useState(null); // { from, to, id, top, left }
  const commentPopRef = useRef(null);
  commentPopRef.current = commentPop;
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
    // 暴露当前文档 id 给 React 节点视图（投票/问卷调后端互动接口用）
    // 编辑页必须清掉 shareToken，避免从分享页返回后节点视图仍走 token 接口
    setShareToken("");
    setDocId(docId);

    const baseDoc = initialDoc
      ? schema.nodeFromJSON(initialDoc)
      : schema.node("doc", null, [schema.node("paragraph")]);
    const state = EditorState.create({
      doc: normalizeDoc(baseDoc),
      plugins: [
        buildInputRules(),
        ...buildKeymap(),
        history(),
        dropCursor({ color: "#1668dc", width: 2 }),
        gapCursor(),
        columnResizing({ handleWidth: 6, cellMinWidth: 40, View: BordersTableView }),
        tableEditing(),
        placeholderPlugin,
      ],
    });

    const view = new EditorView(hostRef.current, {
      state,
      // viewer（只读权限）时禁止一切编辑事务；节点视图也会据此切到读者态
      editable: () => editable,
      nodeViews: { image: imageNodeView, poll: mountReact(PollView), survey: mountReact(SurveyView) },
      dispatchTransaction(tr) {
        const next = view.state.apply(tr);
        view.updateState(next);
        if (tr.docChanged) onChangeRef.current?.(next.doc.toJSON());
        schedule();
      },
      attributes: { class: "pm-doc", spellcheck: "false" },
      handlePaste(viewInstance, event) {
        if (!editable) return false; // 只读文档不接受图片上传
        const items = Array.from(event.clipboardData?.items || []);
        const file = items.find((i) => i.type.startsWith("image/"))?.getAsFile();
        if (!file) return false;
        event.preventDefault();
        const reader = new FileReader();
        reader.onload = async () => {
          setUploadTip("正在上传图片…");
          try {
            const r = await api.upload(reader.result, file.name);
            const node = schema.nodes.image.create({ src: r.url, alt: file.name, title: file.name });
            cmd.insertBlockAfter(viewInstance, node);
            setUploadTip("");
          } catch (e) {
            console.error(e);
            setUploadTip("图片上传失败：" + (e?.message || "请稍后重试"));
            setTimeout(() => setUploadTip(""), 4200);
          }
        };
        reader.readAsDataURL(file);
        return true;
      },
      // 点击正文里的「子文档目录」链接 → 跳转到对应文档（而不是只放光标）
      handleClick(viewInstance, pos, event) {
        const a = event.target?.closest?.("a[href]");
        if (!a) return false;
        const href = a.getAttribute("href") || "";
        // 兼容 /doc/<id>、#/doc/<id>、/editor/doc/<id> 三种形态
        const norm = String(href).replace(/^#/, "").replace(/^\/editor/, "");
        if (!norm.startsWith("/doc/")) return false;
        event.preventDefault();
        const id = decodeURIComponent(norm.slice("/doc/".length));
        if (id) onOpenDocRef.current?.(id);
        return true;
      },
      handleDOMEvents: {
        // 任务项勾选：点复选框直接翻转 attrs，不进入文本选区逻辑
        mousedown(v, e) {
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

    /* 全网页键盘接管：⌘/Ctrl + 数字 → 切换段落格式（正文 / 标题 1~6）。
       即使焦点不在编辑器内（如在侧栏、正文空白处、大纲上）也生效；
       浏览器原本的「切换标签页」行为被拦截（preventDefault），实现整页接管。 */
    const onGlobalKey = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      let digit = -1;
      if (/^[0-6]$/.test(e.key)) digit = Number(e.key);
      else {
        const m = /^(?:Digit|Numpad)([0-6])$/.exec(e.code || "");
        if (m) digit = Number(m[1]);
      }
      if (digit < 0) return;
      // 无论焦点在哪都先接管：拦截浏览器切换标签页
      e.preventDefault();
      e.stopPropagation();
      const v = window.__pmView;
      if (!v || !v.editable) return;
      const ae = document.activeElement;
      // 焦点在标题输入框 / 普通输入框 / AI 文本框时不抢系统行为，交给输入框
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) return;
      if (digit === 0) cmd.setParagraph(v);
      else cmd.setHeading(v, digit);
    };
    window.addEventListener("keydown", onGlobalKey, true);

    function schedule() {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        const st = viewRef.current?.state;
        if (!st) return;
        setUi(computeUi(st));
        setOutline(computeOutline(st.doc));
        detectSlash(st);
        onSelectionInfo?.({
          words: st.doc.textContent.replace(/\s/g, "").length,
        });
        // 选中图片 / 表格（NodeSelection）时，即使鼠标移开也保持浮动工具条
        const sel = st.selection;
        if (
          sel instanceof NodeSelection &&
          sel.node &&
          (sel.node.type.name === "image" || sel.node.type.name === "table")
        ) {
          const dom = viewRef.current.nodeDOM(sel.from);
          if (dom && dom.getBoundingClientRect) {
            if (!blockBarRef.current) {
              const r = dom.getBoundingClientRect();
              updateBar({ type: sel.node.type.name, pos: sel.from, top: r.top, left: r.left, bottom: r.bottom, width: r.width });
            }
          }
        }
      });
    }

    function detectSlash(st) {
      const { $from } = st.selection;
      const text = $from.parent.textContent;
      const ok =
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
        top: Math.min(coords.bottom + 6, window.innerHeight - 380),
        left: Math.min(coords.left, window.innerWidth - 300),
      });
    }

    schedule();

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("keydown", onGlobalKey, true);
      onViewReadyRef.current?.(null);
      view.destroy();
      viewRef.current = null;
      if (window.__pmView === view) window.__pmView = null;
      setDocId("");
      setShareToken("");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- 块手柄：跟随鼠标所在块 ---------- */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let raf = 0;

    const onMove = (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
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
          pos = view.posAtDOM(target, 0);
        } catch (_) {
          return setHandle(null);
        }
        // posAtDOM 落在块内部（表格等嵌套结构会停在第一个单元格），
        // 需要向上取到「顶层块之前」的位置，否则 nodeAt(pos) 取到的是内层节点，
        // 删除/插入会作用到错误的子节点上。
        const $pos = view.state.doc.resolve(pos);
        const blockPos = $pos.depth >= 1 ? $pos.before(1) : pos;
        if (!view.state.doc.nodeAt(blockPos)) return setHandle(null);
        const r = target.getBoundingClientRect();
        setHandle({ pos: blockPos, top: r.top, left: rect.left - 52 });
      });
    };

    const onLeave = (e) => {
      if (handleMenuRef.current) return;
      if (e.clientY <= 0 || e.clientY >= window.innerHeight - 1) setHandle(null);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseleave", onLeave);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  /* ---------- 浮动块工具条：悬停 / 选中富块时出现，贴在块顶部上方 ---------- */
  useEffect(() => {
    let hideTimer = null;
    const onMove = (e) => {
      const view = viewRef.current;
      if (!view) return;
      const target = e.target;
      // 鼠标移到浮动工具条自身：保持当前条，不隐藏
      if (target && target.closest && target.closest(".block-toolbar")) {
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        return;
      }
      const info = detectBlock(view, target);
      if (info) {
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        const r = info.el.getBoundingClientRect();
        updateBar({ type: info.type, pos: info.pos, top: r.top, left: r.left, bottom: r.bottom, width: r.width });
      } else if (!hideTimer) {
        // 离开块后稍作延时再隐藏，容忍「块 → 工具条」之间的空隙
        hideTimer = setTimeout(() => { updateBar(null); hideTimer = null; }, 160);
      }
    };
    document.addEventListener("mousemove", onMove);
    return () => {
      document.removeEventListener("mousemove", onMove);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, []);

  /* ---------- 划词评论：选中正文文字 → 浮出「评论」按钮 ---------- */
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const view = viewRef.current;
      if (!view) {
        setCommentBtn(null);
        return;
      }
      // 正在输入框/文本域里（投票/问卷编辑）时不显示
      const ae = document.activeElement;
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) {
        setCommentBtn(null);
        return;
      }
      const { from, to, empty } = view.state.selection;
      if (empty || from === to) {
        setCommentBtn(null);
        return;
      }
      const $from = view.state.doc.resolve(from);
      if (!$from.parent || !$from.parent.type.isTextblock) {
        setCommentBtn(null);
        return;
      }
      let coords;
      try {
        coords = view.coordsAtPos(from);
      } catch (_) {
        setCommentBtn(null);
        return;
      }
      setCommentBtn({ from, to, top: Math.max(8, Math.round(coords.top) - 40), left: Math.round(coords.left) });
    };
    const onSel = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };
    document.addEventListener("selectionchange", onSel);
    document.addEventListener("mouseup", onSel);
    return () => {
      document.removeEventListener("selectionchange", onSel);
      document.removeEventListener("mouseup", onSel);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  /* ---------- 划词评论：点击已评论文字 → 打开气泡；点击空白 → 关闭气泡 ---------- */
  useEffect(() => {
    const onDown = (e) => {
      const view = viewRef.current;
      if (!view) return;
      const t = e.target;
      const span = t && t.closest ? t.closest("[data-comment-id]") : null;
      if (span) {
        const id = span.getAttribute("data-comment-id");
        const range = findCommentRange(view.state.doc, id);
        if (!range) return;
        const rect = span.getBoundingClientRect();
        setCommentPop({ from: range.from, to: range.to, id, top: Math.round(rect.bottom) + 6, left: Math.round(rect.left) });
        setCommentBtn(null);
        return;
      }
      // 点击气泡自身或评论按钮：不关闭
      if (t && t.closest && (t.closest(".comment-pop") || t.closest(".comment-btn"))) return;
      if (commentPopRef.current) setCommentPop(null);
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, []);

  /* ---------- 划词评论：写回评论线程 / 解决 / 删除 ---------- */
  const writeComment = (from, to, id, thread, resolved) => {
    const view = viewRef.current;
    if (!view) return;
    const tr = view.state.tr;
    tr.removeMark(from, to, schema.marks.comment);
    tr.addMark(from, to, schema.marks.comment.create({ id, resolved, thread }));
    view.dispatch(tr);
    setCommentPop((p) => (p ? { ...p, id, resolved, thread } : p));
  };
  const openCommentAt = (from, to, anchor) => {
    const view = viewRef.current;
    if (!view || from == null || to == null || from >= to) return;
    let id = null;
    const exMark = view.state.doc.rangeHasMark(from, to, schema.marks.comment);
    if (exMark) {
      const cm = exMark.find((m) => m.type.name === "comment");
      if (cm) id = cm.attrs.id;
    }
    if (!id) {
      id = cmd.genId("c_");
      view.dispatch(view.state.tr.addMark(from, to, schema.marks.comment.create({ id, resolved: false, thread: [] })));
    }
    setCommentPop({ from, to, id, top: anchor.top, left: anchor.left });
    setCommentBtn(null);
  };
  const openCommentRef = useRef(null);
  openCommentRef.current = openCommentAt;
  /* 注册到 docContext.ops：右键菜单「评论」项经此打开评论气泡 */
  useEffect(() => {
    registerOps({
      addComment: (from, to, anchor) => openCommentRef.current?.(from, to, anchor),
    });
  }, []);
  const onCommentButton = () => {
    if (!commentBtn) return;
    openCommentAt(commentBtn.from, commentBtn.to, { top: commentBtn.top - 6, left: commentBtn.left });
  };
  const onCommentAdd = (text) => {
    const p = commentPopRef.current;
    if (!p) return;
    const data = getCommentData(viewRef.current.state.doc, p.id) || { thread: [] };
    const thread = [...(data.thread || []), { author: "我", text, ts: new Date().toISOString() }];
    writeComment(p.from, p.to, p.id, thread, !!data.resolved);
    // 评论中的 @提及 → 站内通知（best-effort，失败不影响评论本身）
    if (docId && /@/.test(text)) {
      api.mention(docId, text).catch(() => {});
    }
  };
  const onCommentResolve = () => {
    const p = commentPopRef.current;
    if (!p) return;
    const data = getCommentData(viewRef.current.state.doc, p.id) || { thread: [], resolved: false };
    writeComment(p.from, p.to, p.id, data.thread || [], !data.resolved);
  };
  const onCommentDelete = () => {
    const view = viewRef.current;
    const p = commentPopRef.current;
    if (!view || !p) return;
    view.dispatch(view.state.tr.removeMark(p.from, p.to, schema.marks.comment));
    setCommentPop(null);
  };

  /* ---------- 斜杠菜单键盘操作 ---------- */
  useEffect(() => {
    if (!slash) return;
    const items = getSlashItems(childDocsRef.current).filter((it) => matches(it, slash.query));
    let idx = 0;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setSlash(null);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        idx = (idx + 1) % items.length;
        highlight(items[idx]);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        idx = (idx - 1 + items.length) % items.length;
        highlight(items[idx]);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (items[idx]) pick(items[idx]);
      }
    };
    const highlight = (item) => {
      document.querySelectorAll(".slash-item").forEach((el) => el.classList.remove("active"));
      document.querySelector(`.slash-item[data-key="${item.key}"]`)?.classList.add("active");
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
    item.run(view);
    view.focus();
  }, []);

  const exec = (fn) => () => {
    const view = viewRef.current;
    if (view) fn(view);
    view?.focus();
  };

  const btn = (active, extra = "") => "tb-btn" + (active ? " active" : "") + (extra ? " " + extra : "");

  return (
    <div className="editor-wrap">
      {/* 工具栏：按下按钮时阻止抢焦点，否则会丢失编辑器选区；只读态整体不渲染 */}
      {editable && (
      <div
        className="toolbar"
        onMouseDown={(e) => {
          if (e.target.closest("button")) e.preventDefault();
        }}
      >
        <div className="tb-group">
          <button className={btn(false)} data-tip="撤销 ⌘Z" onClick={exec((v) => undo(v.state, v.dispatch))}>
            <Ico name="undo" />
          </button>
          <button className={btn(false)} data-tip="重做 ⌘⇧Z" onClick={exec((v) => redo(v.state, v.dispatch))}>
            <Ico name="redo" />
          </button>
          <button className={btn(false)} data-tip="格式刷：清除当前选区格式" onClick={exec(cmd.clearFormat)}>
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
                    <span className="fmt-name">{f.label}</span>
                    {f.hint && <span className="fmt-hint">{f.hint}</span>}
                  </button>
                ))}
              </div>
            )}
          </Dropdown>

          <Dropdown
            title="字号"
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
          <button className={btn(ui.bold, "tb-b")} data-tip="加粗 ⌘B" onClick={exec(cmd.toggleBold)}>B</button>
          <button className={btn(ui.italic, "tb-i")} data-tip="斜体 ⌘I" onClick={exec(cmd.toggleItalic)}>I</button>
          <button className={btn(ui.strike, "tb-s")} data-tip="删除线 ⌘⇧X" onClick={exec(cmd.toggleStrike)}>S</button>
          <button className={btn(ui.underline, "tb-u")} data-tip="下划线 ⌘U" onClick={exec(cmd.toggleUnderline)}>U</button>
        </div>
        <span className="tb-sep" />

        <div className="tb-group">
          <Dropdown
            title="文字颜色"
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
            title="背景色"
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
            title="上标 / 下标"
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
          <button className={btn(ui.bullet)} data-tip="无序列表" onClick={exec(cmd.toggleBulletList)}>
            <Ico name="bullet" />
          </button>
          <button className={btn(ui.ordered)} data-tip="有序列表" onClick={exec(cmd.toggleOrderedList)}>
            <Ico name="ordered" />
          </button>
          <button className={btn(ui.task)} data-tip="任务列表" onClick={exec(cmd.toggleTaskList)}>
            <Ico name="task" />
          </button>
          <button className={btn(ui.quote)} data-tip="引用" onClick={exec(cmd.toggleQuote)}>
            <Ico name="quote" />
          </button>
          <button className={btn(ui.code)} data-tip="行内代码 ⌘E" onClick={exec(cmd.toggleCode)}>
            <Ico name="code" />
          </button>
        </div>
        <span className="tb-sep" />

        <div className="tb-group">
          <button
            className={btn(ui.link)}
            data-tip="链接"
            onClick={exec((v) => {
              const href = window.prompt("输入链接地址（留空则移除链接）", "https://");
              if (href !== null) cmd.setLink(v, href.trim());
            })}
          >
            <Ico name="link" />
          </button>
          <Dropdown title="插入表格" label={<Ico name="table" />}>
            {(close) => (
              <TableGridPicker
                onPick={(rows, cols) => {
                  const v = viewRef.current;
                  if (v) cmd.insertTable(v, rows, cols);
                  v?.focus();
                  close();
                }}
              />
            )}
          </Dropdown>
          <button
            className={btn(false)}
            data-tip="图片"
            onClick={exec((v) => {
              const url = window.prompt("输入图片地址");
              if (url) cmd.insertImage(v, url.trim());
            })}
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
                    const url = window.prompt("输入图片地址");
                    if (url) cmd.insertImage(viewRef.current, url.trim());
                    close();
                  }}
                >
                  <i className="dd-ico">🖼</i><span>图片</span>
                </button>
                <button
                  className="dd-item"
                  onClick={() => {
                    setAudioOpen(true);
                    close();
                  }}
                >
                  <i className="dd-ico">🎵</i><span>音频 / 歌曲</span>
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
      </div>
      )}

      {/* 表格工具条：固定在顶部，光标进入表格时出现（不随块浮动）
          始终挂载，靠 ctx-bar--hidden 切换显隐，进出场都有过渡动画（只读态不渲染） */}
      {editable && <TableTools ui={ui} viewRef={viewRef} />}

      {/* 浮动块工具条：悬停 / 选中富块时出现，贴在块顶部上方（图片、代码块、提示块、折叠块） */}
      {editable && blockBar && (
        <BlockToolbar bar={blockBar} viewRef={viewRef} style={blockBarStyle(blockBar)} onClose={() => updateBar(null)} />
      )}

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
            <div ref={hostRef} className="pm-host" />
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

      {/* 块手柄（只读态隐藏） */}
      {editable && handle && (
        <div
          className="block-handle"
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
              const pos = handle.pos + view.state.doc.nodeAt(handle.pos).nodeSize;
              cmd.insertParagraphAt(view, pos);
              view.focus();
            }}
          >
            +
          </button>
          <button className="bh-btn bh-drag" title="块操作">⠿</button>
          {handleMenu && (
            <div className="bh-menu">
              <button onClick={() => { cmd.moveBlock(viewRef.current, -1); setHandle(null); }}>上移</button>
              <button onClick={() => { cmd.moveBlock(viewRef.current, 1); setHandle(null); }}>下移</button>
              <button onClick={() => { cmd.duplicateBlock(viewRef.current); setHandle(null); }}>复制</button>
              <button className="danger" onClick={() => { cmd.deleteBlockAt(viewRef.current, handle.pos); setHandle(null); }}>删除</button>
            </div>
          )}
        </div>
      )}

      {/* 斜杠菜单（只读态隐藏） */}
      {editable && slash && (
        <div className="slash-menu" style={{ top: slash.top, left: slash.left }}>
          {getSlashItems(childDocsRef.current)
            .filter((it) => matches(it, slash.query))
            .map((it, i) => (
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
          {getSlashItems(childDocsRef.current).filter((it) => matches(it, slash.query)).length === 0 && (
            <div className="slash-empty">没有匹配的插入项</div>
          )}
        </div>
      )}

      {/* 划词评论：选区浮按钮（只读态隐藏创建入口） */}
      {editable && commentBtn && (
        <button
          className="comment-btn"
          style={{ position: "fixed", top: commentBtn.top, left: commentBtn.left }}
          onMouseDown={(e) => {
            e.preventDefault();
            onCommentButton();
          }}
          title="评论选中内容"
        >
          💬 评论
        </button>
      )}

      {/* 划词评论：评论气泡 */}
      {commentPop && (
        (() => {
          const v = viewRef.current;
          const isEditable = v ? (typeof v.editable === "function" ? v.editable() : v.editable) : true;
          return (
            <CommentPopover
              anchor={{ top: commentPop.top, left: commentPop.left }}
              data={getCommentData(v.state.doc, commentPop.id)}
              editable={isEditable}
              onAdd={onCommentAdd}
              onResolve={onCommentResolve}
              onDelete={onCommentDelete}
              onClose={() => setCommentPop(null)}
            />
          );
        })()
      )}

      {/* 图片上传反馈：图床是外部服务，等待期间给个明确状态，避免看起来像卡住 */}
      {uploadTip && (
        <div className="upload-tip" role="status">
          {uploadTip.startsWith("正在") && <span className="upload-spin" />}
          {uploadTip}
        </div>
      )}

      {/* 音频/歌曲插入对话框 */}
      {audioOpen && (
        <AudioInsertDialog view={viewRef.current} onClose={() => setAudioOpen(false)} />
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
  /* ---- 单元格属性图标 ---- */
  fill: (
    <>
      <rect x="3.4" y="3.4" width="13.2" height="9.2" rx="1.4" />
      <path d="M3.4 12.6h13.2v1.9a1.4 1.4 0 0 1-1.4 1.4H4.8a1.4 1.4 0 0 1-1.4-1.4z" fill="currentColor" stroke="none" opacity=".55" />
    </>
  ),
  vtop: (
    <>
      <path d="M4 4h12M10 4v11M10 15l-2.6-2.4M10 15l2.6-2.4" />
    </>
  ),
  vmiddle: (
    <>
      <path d="M4 10h12M10 3v3M10 3 7.4 5.4M10 3l2.6 2.4M10 17v-3M10 17l-2.6-2.4M10 17l2.6-2.4" />
    </>
  ),
  vbottom: (
    <>
      <path d="M4 16h12M10 16V5M10 5 7.4 7.4M10 5l2.6 2.4" />
    </>
  ),
  distribute: (
    <>
      <path d="M3.5 5.5h13M4.2 9.2h2.4M13.4 9.2h2.4M5 9.2v5.3M15 9.2v5.3" />
      <path d="M10 9.2v5.3" />
    </>
  ),
  border: (
    <>
      <rect x="3.6" y="4.6" width="12.8" height="10.8" rx="1.4" />
      <path d="M3.6 9.2h12.8M9.2 9.2v6.2" />
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

/* 段落格式（学城：正文 + 标题 1~6）；⌘/Ctrl + 数字快捷切换 */
const FORMATS = [
  { key: "p", label: "正文", level: 0, hint: "⌘0" },
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ key: `h${n}`, label: `标题 ${n}`, level: n, hint: `⌘${n}` })),
];

const FONT_SIZES = [11, 12, 13, 14, 16, 18, 20, 24, 28, 36];

const TEXT_COLORS = [
  "#1f2329", "#5c6570", "#8f959e",
  "#d93026", "#f5a623", "#2fbf71",
  "#1668dc", "#7b61ff", "#eb2f96",
];

const BG_COLORS = ["#fff3b0", "#ffe3e3", "#e8f1ff", "#ecf9f1", "#f3e8ff", "#f2f3f5"];

/* 单元格底色调色板（参考钉钉表格填色：低饱和、可辨识） */
const CELL_COLORS = [
  "#ffffff", "#fff1f0", "#fff7e6", "#f6ffed", "#e6fffb", "#e6f4ff", "#f9f0ff", "#f5f5f5",
  "#ffccc7", "#ffd591", "#b7eb8f", "#87e8de", "#91d5ff", "#d3adf8", "#d9d9d9",
  "#ff4d4f", "#fa8c16", "#52c41a", "#13c2c2", "#1677ff", "#722ed1", "#595959",
];

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

/** 对齐图标：复刻钉钉表格的水平对齐（left/center/right/justify），采用 Ant Design 图标 */
function AlignIcon({ type, withCaret }) {
  const Icon =
    type === "center" ? AlignCenterOutlined
    : type === "right" ? AlignRightOutlined
    : type === "justify" ? AlignLeftOutlined
    : AlignLeftOutlined;
  return (
    <span className="align-icon">
      <Icon />
      {withCaret ? <span className="dd-caret">▾</span> : null}
    </span>
  );
}

/** 点击外部关闭的下拉面板；children 为函数时注入 close */
function Dropdown({ label, title, active, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className="dd" ref={ref}>
      <button
        className={"tb-btn dd-trigger" + (active ? " active" : "") + (open ? " open" : "")}
        data-tip={title}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
      </button>
      {open && <div className="dd-panel">{typeof children === "function" ? children(close) : children}</div>}
    </div>
  );
}

/** 钉钉式表格插入面板：悬停网格选择行列，点击插入 */
function TableGridPicker({ onPick }) {
  const ROWS = 8;
  const COLS = 10;
  const [sel, setSel] = useState({ r: 1, c: 1 });
  const selRef = useRef(sel);
  const setBoth = (s) => {
    selRef.current = s;
    setSel(s);
  };
  const cells = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      cells.push(
        <span
          key={r + "-" + c}
          className={"tgp-cell" + (r < sel.r && c < sel.c ? " on" : "")}
          onMouseEnter={() => setBoth({ r: r + 1, c: c + 1 })}
          onMouseDown={(e) => {
            e.preventDefault();
            console.log("TGP-PICK", selRef.current.r, selRef.current.c);
            onPick(selRef.current.r, selRef.current.c);
          }}
        />
      );
    }
  }
  return (
    <div className="table-grid-picker" onMouseLeave={() => setBoth({ r: 1, c: 1 })}>
      <div className="tgp-grid" style={{ gridTemplateColumns: `repeat(${COLS}, 18px)` }}>
        {cells}
      </div>
      <div className="tgp-foot">
        <span className="tgp-preview">{sel.r} × {sel.c}</span>
        <span className="tgp-hint">点击插入表格</span>
      </div>
    </div>
  );
}

/**
 * 浮动块工具条：悬停或选中富块（图片 / 表格 / 代码块 / 提示块 / 折叠块）时出现，
 * 贴在块顶部上方。所有操作都基于 bar.pos（块在文档中的位置）直接作用于该节点，
 * 不依赖光标是否在此块上，因此悬停即可操作，体验比「固定放在顶部工具栏」更直接。
 */
function BlockToolbar({ bar, viewRef, style, onClose }) {
  const view = viewRef.current;
  const ui = view ? computeBlockUi(view.state, bar.pos) : null;
  if (!ui) return null;

  // 直接作用于 bar.pos 节点
  const run = (fn) => (e) => {
    if (e) e.preventDefault();
    const v = viewRef.current;
    if (!v) return;
    fn(v);
    v.focus();
  };

  return (
    <div
      className="block-toolbar"
      style={style}
      onMouseDown={(e) => {
        if (e.target.closest("button, select, option")) e.preventDefault();
      }}
    >
      {ui.type === "image" && (
        <>
          <span className="ctx-label">图片</span>
          {ALIGNS.slice(0, 3).map((a) => (
            <button
              key={a.key}
              className={"ctx-btn ctx-icon" + (ui.align === a.key ? " active" : "")}
              title={a.label}
              onClick={run((v) => cmd.imageAlign(v, a.key, bar.pos))}
            >
              <AlignIcon type={a.key} />
            </button>
          ))}
          <span className="ctx-sep" />
          {/* 宽度预设 */}
          <span className="ctx-label">宽</span>
          {["25%", "50%", "75%", "100%"].map((w) => (
            <button
              key={w}
              className={"ctx-btn" + (ui.width === w ? " active" : "")}
              onClick={run((v) => cmd.setImageWidth(v, w, bar.pos))}
            >
              {w}
            </button>
          ))}
          <button className={"ctx-btn" + (ui.width === "" ? " active" : "")} onClick={run((v) => cmd.setImageWidth(v, "", bar.pos))}>
            自适应
          </button>
          <span className="ctx-sep" />
          {/* 边框预设 */}
          <span className="ctx-label">框</span>
          {[
            { v: "", label: "无" },
            { v: "thin", label: "细" },
            { v: "medium", label: "中" },
            { v: "thick", label: "粗" },
          ].map((b) => (
            <button
              key={b.v || "none"}
              className={"ctx-btn" + (ui.border === b.v ? " active" : "")}
              onClick={run((v) => cmd.setImageBorder(v, b.v, bar.pos))}
            >
              {b.label}
            </button>
          ))}
          <span className="ctx-sep" />
          <button
            className="ctx-btn"
            onClick={run((v) => {
              const url = window.prompt("新的图片地址", ui.src);
              if (url && url.trim()) cmd.replaceImage(v, url.trim(), bar.pos);
            })}
          >
            替换
          </button>
          <button
            className="ctx-btn danger"
            onClick={(e) => {
              if (e) e.preventDefault();
              const v = viewRef.current;
              if (!v) return;
              cmd.deleteNodeAt(v, bar.pos);
              onClose && onClose();
            }}
          >
            删除
          </button>
        </>
      )}

      {ui.type === "code_block" && (
        <>
          <span className="ctx-label">代码块</span>
          <select
            className="ctx-select"
            value={ui.lang}
            onChange={(e) => cmd.setCodeLanguage(viewRef.current, e.target.value, bar.pos)}
          >
            {LANGS.map((l) => (
              <option key={l.key} value={l.key}>
                {l.label}
              </option>
            ))}
          </select>
        </>
      )}

      {ui.type === "callout" && (
        <>
          <span className="ctx-label">提示块</span>
          {cmd.CALLOUT_TYPES.map((t) => (
            <button
              key={t.key}
              data-cmd={"callout-" + t.key}
              className={"ctx-chip" + (ui.calloutType === t.key ? " active" : "")}
              onClick={run((v) => cmd.setCalloutType(v, t.key, bar.pos))}
            >
              <i className="ctx-dot" style={{ background: t.color }} />
              {t.label}
            </button>
          ))}
        </>
      )}

      {ui.type === "toggle" && (
        <>
          <span className="ctx-label">折叠块</span>
          <button
            className="ctx-btn"
            onClick={run((v) => {
              const s = window.prompt("折叠标题", ui.toggleSummary);
              if (s !== null) cmd.setToggleSummary(v, s, bar.pos);
            })}
          >
            标题：{ui.toggleSummary}
          </button>
        </>
      )}
    </div>
  );
}

/* 表格工具条：固定在编辑器顶部，光标进入表格时出现（不随块浮动，沿用旧版体验） */
function TableTools({ ui, viewRef }) {
  const [addCount, setAddCount] = useState(1);
  const view = viewRef.current;
  const cellAttrs = view ? cmd.currentCellAttrs(view.state) : {};
  const run = (fn) => (e) => {
    if (e) e.preventDefault();
    const v = viewRef.current;
    if (!v) return;
    fn(v);
    v.focus();
  };
  return (
    <div
      className={"ctx-bar" + (ui.table ? "" : " ctx-bar--hidden")}
      onMouseDown={(e) => {
        if (e.target.closest("button, select, option")) e.preventDefault();
      }}
    >
      <span className="ctx-label">表格</span>
      <button className="ctx-btn ctx-icon" data-tip="在上方插入行" onClick={run((v) => cmd.tableAddRowsBefore(v, addCount))}>
        <InsertRowAboveOutlined />
      </button>
      <button className="ctx-btn ctx-icon" data-tip="在下方插入行" onClick={run((v) => cmd.tableAddRowsAfter(v, addCount))}>
        <InsertRowBelowOutlined />
      </button>
      <button className="ctx-btn ctx-icon" data-tip="在左侧插入列" onClick={run((v) => cmd.tableAddColsBefore(v, addCount))}>
        <Ico name="colLeft" />
      </button>
      <button className="ctx-btn ctx-icon" data-tip="在右侧插入列" onClick={run((v) => cmd.tableAddColsAfter(v, addCount))}>
        <Ico name="colRight" />
      </button>
      <select
        className="ctx-count"
        value={addCount}
        title="一次插入的行/列数"
        onChange={(e) => setAddCount(Number(e.target.value))}
      >
        {[1, 2, 3, 5, 10].map((n) => (
          <option key={n} value={n}>×{n}</option>
        ))}
      </select>
      <span className="ctx-sep" />
      <button className="ctx-btn ctx-icon" data-tip="合并单元格（需先选中多个单元格）" disabled={!ui.canMerge} onClick={run(cmd.tableMerge)}>
        <MergeCellsOutlined />
      </button>
      <button className="ctx-btn ctx-icon" data-tip="拆分单元格" onClick={run(cmd.tableSplit)}>
        <SplitCellsOutlined />
      </button>
      <button className="ctx-btn ctx-icon" data-tip="切换表头行" onClick={run(cmd.tableToggleHeaderRow)}>
        <Ico name="headerRow" />
      </button>
      <button className="ctx-btn ctx-icon" data-tip="切换表头列" onClick={run(cmd.tableToggleHeaderCol)}>
        <Ico name="headerCol" />
      </button>
      <span className="ctx-sep" />

      {/* 单元格底色（复刻钉钉「单元格填色」） */}
      <Dropdown
        title="单元格底色"
        label={<span className="tb-color tb-bg"><BgColorsOutlined /><span className="dd-caret">▾</span></span>}
      >
        {(close) => (
          <div className="color-grid">
            {CELL_COLORS.map((c) => (
              <button
                key={c}
                className={"color-cell" + (cellAttrs.background === c ? " active" : "")}
                title={c}
                style={{ background: c, outline: c === "#ffffff" ? "1px solid #d9d9d9" : "none" }}
                onClick={() => { cmd.setCellBackground(viewRef.current, c === "#ffffff" ? null : c); close(); }}
              />
            ))}
            <button
              className="color-none"
              onClick={() => { cmd.setCellBackground(viewRef.current, null); close(); }}
            >
              无
            </button>
          </div>
        )}
      </Dropdown>

      {/* 单元格对齐：水平 + 垂直（复刻钉钉「对齐方式」） */}
      <span className="ctx-label">对齐</span>
      {[["left", "左"], ["center", "居中"], ["right", "右"]].map(([k, l]) => (
        <button
          key={k}
          className={"ctx-btn ctx-icon" + (cellAttrs.align === k ? " active" : "")}
          data-tip={"水平" + l + "对齐"}
          onClick={run((v) => cmd.setCellAlign(v, k))}
        >
          <AlignIcon type={k} />
        </button>
      ))}
      <button
        className={"ctx-btn ctx-icon" + (cellAttrs.valign === "top" ? " active" : "")}
        data-tip="顶端对齐"
        onClick={run((v) => cmd.setCellVAlign(v, "top"))}
      >
        <VerticalAlignTopOutlined />
      </button>
      <button
        className={"ctx-btn ctx-icon" + (cellAttrs.valign === "middle" ? " active" : "")}
        data-tip="垂直居中"
        onClick={run((v) => cmd.setCellVAlign(v, "middle"))}
      >
        <VerticalAlignMiddleOutlined />
      </button>
      <button
        className={"ctx-btn ctx-icon" + (cellAttrs.valign === "bottom" ? " active" : "")}
        data-tip="底端对齐"
        onClick={run((v) => cmd.setCellVAlign(v, "bottom"))}
      >
        <VerticalAlignBottomOutlined />
      </button>

      <span className="ctx-sep" />
      <button className="ctx-btn ctx-icon" data-tip="均分列宽（钉钉「均分列宽」）" onClick={run(cmd.distributeColumns)}>
        <ColumnWidthOutlined />
      </button>

      {/* 表格边框样式（复刻钉钉「表格边框」） */}
      <Dropdown
        title="表格边框"
        label={<span className="tb-color"><BorderOutlined /><span className="dd-caret">▾</span></span>}
      >
        {(close) => (
          <div className="dd-list">
            {[["all", "全边框"], ["outer", "仅外边框"], ["none", "无边框"]].map(([k, l]) => (
              <button key={k} className="dd-item" onClick={() => { cmd.setTableBorders(viewRef.current, k); close(); }}>{l}</button>
            ))}
          </div>
        )}
      </Dropdown>

      <span className="ctx-sep" />
      <button className="ctx-btn ctx-icon danger" data-tip="删除整行" onClick={run(cmd.tableDeleteRow)}>
        <DeleteRowOutlined />
      </button>
      <button className="ctx-btn ctx-icon danger" data-tip="删除整列" onClick={run(cmd.tableDeleteCol)}>
        <DeleteColumnOutlined />
      </button>
      <button className="ctx-btn ctx-icon danger" data-tip="删除整个表格" onClick={run(cmd.tableDelete)}>
        <DeleteOutlined />
      </button>
    </div>
  );
}

/* ---------- 斜杠菜单数据 ---------- */
/** 斜杠插入菜单；有子文档时追加「子文档目录」 */
function getSlashItems(childDocs = []) {
  const items = [
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
  { key: "poll", label: "投票", desc: "插入投票，多人实时看结果", icon: "🗳", keywords: "poll toupiao 投票 表决 调查", run: (v) => cmd.insertPoll(v) },
  { key: "survey", label: "问卷调查", desc: "插入问卷，收集作答", icon: "📋", keywords: "survey wenjuan 问卷 调查 答题", run: (v) => cmd.insertSurvey(v) },
  ];
  if (childDocs.length) {
    items.push({
      key: "childtoc",
      label: "子文档目录",
      desc: `把 ${childDocs.length} 个子文档插成目录`,
      icon: "☰",
      keywords: "childtoc mulu 目录 子文档 子目录 doc toc",
      run: (v) => cmd.insertChildToc(v, childDocs),
    });
  }
  return items;
}

function matches(item, q) {
  if (!q) return true;
  const s = q.toLowerCase();
  return item.label.includes(q) || item.keywords.toLowerCase().includes(s);
}
