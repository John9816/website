/**
 * 应用外壳：嵌套文档树 + 标题 + 自动保存
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor from "./editor/Editor.jsx";
import { api } from "./api.js";
import { createDocumentSaver } from "./autosave.js";
import { starterDoc } from "./schema.js";
import SidebarTree, { countDescendants } from "./SidebarTree.jsx";
import { TEMPLATES } from "./templates.js";
import {
  NewDocDialog,
  SaveTemplateDialog,
  TemplatePreviewDialog,
  tplContent,
} from "./TemplateUI.jsx";
import { HomeView, TemplateMarket, KnowledgeSquare, FavoritesSpaceView } from "./Views.jsx";
import AiPanel from "./AiPanel.jsx";
import { docToPlainText } from "./skills.js";
import { useHashRoute, docHash } from "./router.js";
import SharePage, { ShareDialog } from "./ShareView.jsx";
import ThemeToggle from "../../components/ThemeToggle";
import ContextMenu, { contextMenuAt } from './ContextMenu.jsx';

const SAVE_DEBOUNCE = 800;

/** 相对时间：用于顶栏「最后修改」 */
function relTime(iso) {
  if (!iso) return "刚刚";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "刚刚";
  const diff = Math.max(0, Date.now() - t);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d} 天前` : new Date(t).toLocaleDateString("zh-CN");
}

/* 侧栏导航图标 */
const NAV_ICONS = {
  home: <path d="M3.4 9.2 10 3.6l6.6 5.6V16a1 1 0 0 1-1 1h-3.4v-4.2H7.8V17H4.4a1 1 0 0 1-1-1z" />,
  grid: (
    <>
      <rect x="3.4" y="3.6" width="5.6" height="5.6" rx="1.1" />
      <rect x="11" y="3.6" width="5.6" height="5.6" rx="1.1" />
      <rect x="3.4" y="11.2" width="5.6" height="5.6" rx="1.1" />
      <rect x="11" y="11.2" width="5.6" height="5.6" rx="1.1" />
    </>
  ),
  book: (
    <>
      <path d="M4 3.6h8.6a2.4 2.4 0 0 1 2.4 2.4v10.4H6.4A2.4 2.4 0 0 1 4 14z" />
      <path d="M4 14a2.4 2.4 0 0 1 2.4-2.4H15" />
    </>
  ),
  clock: (
    <>
      <circle cx="10" cy="10" r="6.6" />
      <path d="M10 6.4V10l2.6 1.6" />
    </>
  ),
  star: <path d="M10 3.4l2 4.1 4.5.7-3.3 3.2.8 4.5-4-2.1-4 2.1.8-4.5L3.5 8.2l4.5-.7z" />,
  folder: <path d="M3.4 6.2a1.2 1.2 0 0 1 1.2-1.2h3.1l1.6 1.8h6.1a1.2 1.2 0 0 1 1.2 1.2v6.6a1.2 1.2 0 0 1-1.2 1.2H4.6a1.2 1.2 0 0 1-1.2-1.2z" />,
  doc: (
    <>
      <path d="M5.4 3.6h6l3.2 3.2v9.6H5.4z" />
      <path d="M11.2 3.8v3.4h3.3M7.4 10h5.2M7.4 12.8h5.2" />
    </>
  ),
};

function NavIco({ name }) {
  return (
    <svg
      className="nav-ico"
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {NAV_ICONS[name]}
    </svg>
  );
}

/** 从 ProseMirror JSON 里只取 text 节点统计字数，避免把 type/attrs 之类的 key 算进去 */
function countWords(json) {
  let s = "";
  const walk = (n) => {
    if (!n) return;
    if (typeof n === "string") {
      s += n;
      return;
    }
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (n.type === "text") s += n.text || "";
    else if (n.content) walk(n.content);
  };
  walk(json);
  return s.replace(/\s/g, "").length;
}

const LS = {
  collapsed: "xc.collapsed",
  width: "xc.sidebarW",
  sideCollapsed: "xc.sidebarCollapsed",
};

const VIEW_NAME = { home: "主页", templates: "模板市场", square: "知识广场", favspace: "收藏空间" };
const VIEW_ICON = { home: "home", templates: "grid", square: "book", favspace: "star" };

export default function App({ canUseMcp = false, onBack }) {
  const [docs, setDocs] = useState([]);
  const [doc, setDoc] = useState(null);
  const [saveState, setSaveState] = useState("saved");
  const [words, setWords] = useState(0);
  const [loading, setLoading] = useState(true);
  const [openingDoc, setOpeningDoc] = useState(false);
  const openGeneration = useRef(0);
  const openingId = useRef(null);
  useEffect(() => () => { openGeneration.current += 1; }, []);
  const [error, setError] = useState("");
  const [contextMenu, setContextMenu] = useState(null);

  // 侧栏：宽度 / 折叠 / 树节点折叠
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const w = parseInt(localStorage.getItem(LS.width) || "", 10);
    return Number.isFinite(w) ? Math.min(440, Math.max(200, w)) : 256;
  });
  // 默认展开；只有手动点 « 才收成窄条（不再读取历史折叠态，避免每次进来都是收起状态）
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(LS.collapsed) || "[]"));
    } catch {
      return new Set();
    }
  });


  const docRef = useRef(null);
  docRef.current = doc;
  const saver = useMemo(() => createDocumentSaver({
    save: d => api.saveDoc(d.id, { title: d.title, content: d.content }),
    onStatus: (id, status) => { if (docRef.current?.id === id) setSaveState(status); },
    onSaved: updated => setDocs(prev => prev.map(d => d.id === updated.id ? { ...d, title: updated.title, updatedAt: updated.updatedAt } : d)),
    onError: error => setError(error.message),
    delay: SAVE_DEBOUNCE,
  }), []);
  useEffect(() => {
    const beforeUnload = event => { if (saver.hasPending()) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { window.removeEventListener('beforeunload', beforeUnload); void saver.flushAll(); };
  }, [saver]);

  const docsRef = useRef(docs);
  docsRef.current = docs;
  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;

  // 主视图：doc=编辑器；home/templates/square/favspace=四大页面
  const [view, setView] = useState("doc");

  /* ---------- 路由：让地址栏真实反映当前位置 ---------- */
  const { route, navigate } = useHashRoute();
  // 首屏 hash 决定「打开哪篇 / 落在哪个视图」，之后交给 route 的 effect
  const initialRouteRef = useRef(route);
  // 给异步回调（如慢网络下才返回的 openDoc）判断「用户此刻停在哪」，避免覆盖用户主动导航
  const routeRef = useRef(route);
  routeRef.current = route;
  const [shareOpen, setShareOpen] = useState(false);

  /* ---------- 模板：新建面板 / 预览 / 存为模板 ---------- */
  const [myTpl, setMyTpl] = useState([]);
  const [newDoc, setNewDoc] = useState(null); // { parentId, parentTitle } | null
  const [tplPreview, setTplPreview] = useState(null);
  const [saveTplOpen, setSaveTplOpen] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);
  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2800);
  }, []);

  // 自建模板：首屏拉一次即可（后续新增/删除在本地同步）
  useEffect(() => {
    if (initialRouteRef.current.name === "share") return;
    api.templates
      .list()
      .then((list) => setMyTpl(Array.isArray(list) ? list : []))
      .catch(() => {});
  }, []);

  /* 切换主视图（同时改地址栏，可前进后退） */
  const goView = useCallback(
    (v) => {
      openGeneration.current += 1;
      openingId.current = null;
      setOpeningDoc(false);
      setView(v);
      setMobileSidebar(false);
      navigate("#/" + v);
    },
    [navigate]
  );

  /* ---------- AI 助手面板 ---------- */
  const [aiOpen, setAiOpen] = useState(false);
  const editorViewRef = useRef(null);
  const handleViewReady = useCallback((v) => {
    editorViewRef.current = v;
  }, []);

  // 暴露给面板的最小接口：读上下文 + 写选区
  const viewApi = useMemo(
    () => ({
      getContext() {
        const v = editorViewRef.current;
        if (!v) return { hasSelection: false, text: "", crossBlock: false, docJSON: { type: "doc", content: [] }, docText: "" };
        const { state } = v;
        const { from, to, empty, $from, $to } = state.selection;
        const docJSON = state.doc.toJSON();
        return {
          hasSelection: !empty,
          text: empty ? "" : state.doc.textBetween(from, to, "\n", " "),
          crossBlock: !empty && !$from.sameParent($to),
          docJSON,
          docText: docToPlainText(docJSON),
        };
      },
      replaceSelection(text) {
        const v = editorViewRef.current;
        if (!v) return false;
        const { from, to, empty } = v.state.selection;
        const tr = empty ? v.state.tr.insertText(text, from) : v.state.tr.insertText(text, from, to);
        v.dispatch(tr.scrollIntoView());
        v.focus();
        return true;
      },
      insertText(text) {
        const v = editorViewRef.current;
        if (!v) return false;
        const { from, to } = v.state.selection;
        v.dispatch(v.state.tr.insertText(text, from, to).scrollIntoView());
        v.focus();
        return true;
      },
      focus() {
        editorViewRef.current?.focus();
      },
    }),
    []
  );

  // ⌘J / Ctrl+J 开关面板
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.isComposing || e.keyCode === 229 || !editorViewRef.current || document.querySelector('.xuecheng-workspace dialog[open]')) return;
      if (e.target.closest?.('input, textarea, [contenteditable="true"]') && !e.target.closest('.pm-host, .doc-head')) return;
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setAiOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---------- 持久化 ---------- */
  useEffect(() => {
    try {
      localStorage.setItem(LS.collapsed, JSON.stringify([...collapsed]));
    } catch {}
  }, [collapsed]);
  useEffect(() => {
    try {
      localStorage.setItem(LS.width, String(sidebarWidth));
    } catch {}
  }, [sidebarWidth]);
  useEffect(() => {
    try {
      localStorage.setItem(LS.sideCollapsed, sidebarCollapsed ? "1" : "0");
    } catch {}
  }, [sidebarCollapsed]);

  /* ---------- 文档列表 ---------- */
  const refresh = useCallback(async () => {
    const list = await api.listDocs();
    setDocs(list);
    return list;
  }, []);

  /* 记录「最近访问」：更新本地列表（即时反映）并异步落库，不改 updatedAt */
  const touchDoc = useCallback((id) => {
    const ts = new Date().toISOString();
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, lastVisitedAt: ts } : d)));
    api.updateDoc(id, { lastVisitedAt: ts }).catch(() => {});
  }, []);

  const openDoc = useCallback(
    async (id, opts = {}) => {
      if (openingId.current === id) return;
      const generation = ++openGeneration.current;
      openingId.current = id;
      setOpeningDoc(true);
      if (!opts.auto && !opts.silent) navigate(docHash(id), { replace: !!opts.replace });
      try {
        setError("");
        if (!(await saver.flushAll())) return;
        if (generation !== openGeneration.current) return;
        const d = await api.getDoc(id);
        if (generation !== openGeneration.current) return;
        docRef.current = d;
        setSaveState("saved");
        setMobileSidebar(false);
        setDoc(d);
        setWords(countWords(d.content));
        touchDoc(id);

        /* auto：首屏（或后台补开）自动落位。
           弱网下这一步可能晚于用户点击「主页」等操作，因此只在地址栏还停在
           根地址 / 或指向一篇已不存在的文档时，才改写 hash 与视图。 */
        if (opts.auto) {
          const r = routeRef.current;
          const stale = r.name === "root" || (r.name === "doc" && r.id !== id);
          if (stale) {
            setView("doc");
            navigate(docHash(id), { replace: true });
          }
          return;
        }

        setView("doc");
      } catch (e) {
        if (generation === openGeneration.current) setError(e.message);
      } finally {
        if (generation === openGeneration.current) {
          openingId.current = null;
          setOpeningDoc(false);
        }
      }
    },
    [touchDoc, navigate, saver]
  );

  /* 收藏 / 取消收藏 */
  const toggleFavorite = useCallback((id) => {
    const cur = docsRef.current.find((d) => d.id === id);
    const next = !(cur && cur.favorite);
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, favorite: next } : d)));
    // 同步当前打开文档的状态，让顶栏星标即时翻转
    setDoc((d) => (d && d.id === id ? { ...d, favorite: next } : d));
    api.updateDoc(id, { favorite: next }).catch(() => {});
  }, []);

  /* 用某个模板（或空白）创建文档；parentId 决定建在谁下面 */
  const createFromTemplate = useCallback(
    async (tpl, parentId = null) => {
      const title = tpl ? tpl.name : "未命名文档";
      const content = tpl ? tplContent(tpl) : null;
      const created = await api.createDoc(title, content, parentId);
      await refresh();
      await openDoc(created.id);
      if (parentId) {
        // 让新建的子文档可见
        setCollapsed((prev) => {
          const n = new Set(prev);
          n.delete(parentId);
          return n;
        });
      }
      return created;
    },
    [refresh, openDoc]
  );

  /* 新建面板提交 */
  const submitNewDoc = useCallback(
    async ({ template }) => {
      const parentId = newDoc?.parentId || null;
      try {
        await createFromTemplate(template, parentId);
        setNewDoc(null);
      } catch (e) {
        setError(e.message);
        throw e;
      }
    },
    [newDoc, createFromTemplate]
  );

  /* 模板市场点「使用模板」：直接建一篇，不再问 */
  const useTemplate = useCallback(
    async (tpl) => {
      try {
        await createFromTemplate(tpl, null);
        setTplPreview(null);
        showToast(`已用「${tpl.name}」创建文档`);
      } catch (e) {
        setError(e.message);
      }
    },
    [createFromTemplate, showToast]
  );

  /* 把当前文档存为模板 */
  const saveAsTemplate = useCallback(
    async ({ name, desc, icon }) => {
      const d = docRef.current;
      if (!d) throw new Error("当前没有打开的文档");
      const created = await api.templates.create({
        name,
        desc,
        icon,
        content: d.content || null,
        fromDoc: d.id,
      });
      setMyTpl((prev) => [created, ...prev]);
      setSaveTplOpen(false);
      showToast(`已存为模板「${created.name}」，新建文档时可选`);
      return created;
    },
    [showToast]
  );

  const removeTemplate = useCallback(
    async (tpl) => {
      try {
        await api.templates.remove(tpl.id);
        setMyTpl((prev) => prev.filter((x) => x.id !== tpl.id));
        setTplPreview(null);
        showToast("模板已删除");
      } catch (e) {
        setError(e.message);
      }
    },
    [showToast]
  );

  /* ---------- 派生列表：最近访问 / 收藏 / 最近编辑 ---------- */
  const recents = useMemo(
    () =>
      docs
        .filter((d) => d.lastVisitedAt)
        .sort((a, b) => new Date(b.lastVisitedAt) - new Date(a.lastVisitedAt))
        .slice(0, 8),
    [docs]
  );
  const favorites = useMemo(() => docs.filter((d) => d.favorite), [docs]);
  const edited = useMemo(
    () => [...docs].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 6),
    [docs]
  );
  const stats = { total: docs.length, favorites: favorites.length, recent: recents.length };

  /* ---------- 首次加载 ---------- */
  useEffect(() => {
    const want = initialRouteRef.current;
    // 分享页独立渲染，不需要文档列表
    if (want.name === "share") {
      setLoading(false);
      return;
    }
    let active = true;
    (async () => {
      try {
        let list = await api.listDocs();
        if (!active) return;
        if (!list.length) {
          const created = await api.createDoc("欢迎使用学城编辑器", starterDoc().toJSON());
          list = await api.listDocs();
          if (!active) return;
          setDocs(list);
          await openDoc(created.id, { auto: true });
          return;
        }
        setDocs(list);
        // 地址栏直接指向某篇（刷新 / 从收藏打开）→ 优先打开它；否则落到第一篇
        const target = want.name === "doc" && list.some((d) => d.id === want.id) ? want.id : list[0].id;
        await openDoc(target, { auto: true });
      } catch (e) {
        if (active) setError(e.message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [openDoc]);

  /* ---------- 地址栏变化（前进 / 后退 / 手输 hash）→ 同步视图 ---------- */
  useEffect(() => {
    if (loading) return;
    const cancelOpen = () => {
      openGeneration.current += 1;
      openingId.current = null;
      setOpeningDoc(false);
    };
    if (route.name === "page" || route.name === "root") {
      if (openingId.current) cancelOpen();
      setView(route.name === "page" ? route.page : "doc");
    } else if (route.name === "doc") {
      if (docRef.current?.id === route.id && openingId.current !== route.id) {
        if (openingId.current) cancelOpen();
        setView("doc");
      } else {
        openDoc(route.id, { replace: true, silent: true });
      }
    }
  }, [route, openDoc, loading]);

  /* 浏览器标题跟随文档 */
  useEffect(() => {
    if (route.name === "share") return;
    const name = view === "doc" ? doc?.title || "未命名文档" : VIEW_NAME[view] || "学城";
    document.title = `${name} · 学城`;
  }, [doc?.title, view, route.name]);

  /* ---------- 保存 ---------- */
  const flush = useCallback(async () => {
    const current = docRef.current;
    if (!current) return;
    saver.schedule(current);
    await saver.flush(current.id);
  }, [saver]);

  const scheduleSave = useCallback((payload) => {
    const current = docRef.current;
    if (!current) return;
    const snapshot = { ...current, ...payload };
    docRef.current = snapshot;
    saver.schedule(snapshot);
  }, [saver]);

  const onEditorChange = useCallback(
    (content) => {
      setDoc((d) => (d ? { ...d, content } : d));
      setWords(countWords(content));
      scheduleSave({ content });
    },
    [scheduleSave]
  );

  const onTitleChange = (e) => {
    const title = e.target.value;
    setDoc((d) => (d ? { ...d, title } : d));
    scheduleSave({ title });
  };

  /* ---------- 文档操作 ---------- */
  /* 新建：先弹面板选空白 / 模板，再真正创建 */
  const createDoc = () => setNewDoc({ parentId: null, parentTitle: "" });

  // 在某个节点下新建子文档
  const addChildDoc = (parentId) =>
    setNewDoc({
      parentId,
      parentTitle: docsRef.current.find((d) => d.id === parentId)?.title || "",
    });

  const renameDoc = async (id) => {
    const current = docsRef.current.find(d => d.id === id);
    const title = window.prompt('文档名称', current?.title || '未命名文档');
    if (title === null || !title.trim()) return;
    if (!(await saver.flushAll())) return;
    const updated = await api.updateDoc(id, { title: title.trim() });
    setDoc(d => d?.id === id ? { ...d, title: updated.title } : d);
    await refresh();
  };

  const removeDoc = async (id) => {
    const n = countDescendants(docs, id);
    const msg =
      n > 0
        ? `确定删除这篇文档？将同时删除 ${n} 个子文档，不可恢复。`
        : "确定删除这篇文档？删除后不可恢复。";
    if (!window.confirm(msg)) return;
    try {
      if (!(await saver.flushAll())) return;
      await api.deleteDoc(id);
      saver.discard(id);
      const remaining = await refresh();
      const cur = docRef.current;
      const exists = cur && remaining.some((x) => x.id === cur.id);
      if (!exists) {
        if (remaining.length) await openDoc(remaining[0].id);
        else {
          const created = await api.createDoc("未命名文档");
          await refresh();
          await openDoc(created.id);
        }
      }
    } catch (err) {
      setError(err.message);
    }
  };

  /* 拖拽移动：把 id 移到 targetId 文档下（targetId=null 表示移回根目录） */
  const moveDoc = useCallback(
    async (id, targetId) => {
      if (!id || id === targetId) return;
      try {
        await api.updateDoc(id, { parentId: targetId || null });
        await refresh();
        // 展开目标节点，让移动结果立刻可见
        if (targetId) {
          setCollapsed((prev) => {
            const n = new Set(prev);
            n.delete(targetId);
            return n;
          });
        }
      } catch (e) {
        setError(e.message);
      }
    },
    [refresh]
  );

  /* ---------- 侧栏拖拽加宽 ---------- */
  const startResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidthRef.current;
    const onMove = (ev) => {
      const w = Math.min(440, Math.max(200, startW + ev.clientX - startX));
      setSidebarWidth(w);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  /* ---------- 键盘：⌘S 立即保存 ---------- */
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.isComposing || e.keyCode === 229 || !editorViewRef.current || document.querySelector('.xuecheng-workspace dialog[open]')) return;
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();

        flush({});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flush]);

  const saveLabel =
    saveState === "saving" ? "保存中…" : saveState === "dirty" ? "未保存" : saveState === "error" ? "保存失败" : "已保存";

  /* 分享页：独立版式，不渲染侧栏与工具栏 */
  if (route.name === "share") {
    return (
      <SharePage
        token={route.token}
        onHome={() => {
          navigate("#/home");
          setView("home");
          if (!docsRef.current.length) {
            refresh()
              .then((list) => list.length && openDoc(list[0].id, { auto: true }))
              .catch(() => {});
          }
        }}
      />
    );
  }

  return (
    <div className={"app" + (mobileSidebar ? " mobile-sidebar-open" : "")}>
      <ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} onError={setError} />
      {mobileSidebar && <button className="mobile-sidebar-backdrop" aria-label="关闭文档导航" onClick={() => setMobileSidebar(false)} />}
      <aside
        className={"sidebar" + (sidebarCollapsed ? " collapsed" : "")}
        style={{ width: sidebarCollapsed ? 52 : sidebarWidth }}
        onContextMenu={event => {
          const row = event.target.closest('[data-doc-id]');
          const target = docsRef.current.find(d => d.id === row?.dataset.docId);
          const items = target ? [
            { label: '打开文档', run: () => openDoc(target.id) },
            { label: '重命名', run: () => renameDoc(target.id) },
            { label: '新建子文档', run: () => addChildDoc(target.id) },
            { label: target.favorite ? '取消收藏' : '收藏文档', run: () => toggleFavorite(target.id) },
            ...(target.parentId ? [{ label: '移到根目录', run: () => moveDoc(target.id, null) }] : []),
            null, { label: '删除文档', danger: true, run: () => removeDoc(target.id) },
          ] : [{ label: '新建文档', run: createDoc }];
          setContextMenu(contextMenuAt(event, '文档操作', items, () => row?.focus({ preventScroll: true })));
        }}
      >
        <div className="brand">
          <button className="brand-back" title="返回工作台" aria-label="返回工作台" onClick={async () => { if (await saver.flushAll()) onBack?.(); }}>←</button>
          <span className="brand-mark">学</span>
          {!sidebarCollapsed && <span className="brand-name">学城文档</span>}
        </div>

        {!sidebarCollapsed && (
          <div className="side-scroll">
            <nav className="side-nav">
              <button
                className={"side-nav-item" + (view === "home" ? " active" : "")}
                onClick={() => goView("home")}
              >
                <NavIco name="home" />主页
              </button>
              <button
                className={"side-nav-item" + (view === "templates" ? " active" : "")}
                onClick={() => goView("templates")}
              >
                <NavIco name="grid" />模板市场
              </button>
              <button
                className={"side-nav-item" + (view === "square" ? " active" : "")}
                onClick={() => goView("square")}
              >
                <NavIco name="book" />知识广场
              </button>
            </nav>

            <div className="side-group">
              <div className="side-group-head">
                <span>我的空间</span>
                <button className="side-add" title="新建根文档" onClick={createDoc}>
                  ＋
                </button>
              </div>
              <div className="doc-list">
                {loading && <div className="doc-empty">加载中…</div>}
                {!loading && (
                  <SidebarTree
                    docs={docs}
                    currentId={doc?.id || ""}
                    collapsed={collapsed}
                    onToggle={(id) =>
                      setCollapsed((prev) => {
                        const n = new Set(prev);
                        n.has(id) ? n.delete(id) : n.add(id);
                        return n;
                      })
                    }
                    onOpen={openDoc}
                    onAdd={addChildDoc}
                    onDelete={removeDoc}
                    onMove={moveDoc}
                  />
                )}
              </div>
            </div>

            <div className="side-group">
              <div className="side-group-head">
                <span>快速访问</span>
              </div>
              {recents.length ? (
                <div className="side-list">
                  {recents.map((d) => (
                    <button key={d.id} data-doc-id={d.id} className="side-doc-item" onClick={() => openDoc(d.id)} title={d.title || "未命名文档"}>
                      <span className="side-doc-ico">▤</span>
                      <span className="side-doc-name">{d.title || "未命名文档"}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="side-empty">打开过的文档会出现在这里</div>
              )}
            </div>

            <div className="side-group">
              <div className="side-group-head">
                <span>收藏夹</span>
              </div>
              {favorites.length ? (
                <div className="side-list">
                  {favorites.map((d) => (
                    <button key={d.id} data-doc-id={d.id} className="side-doc-item" onClick={() => openDoc(d.id)} title={d.title || "未命名文档"}>
                      <span className="side-doc-ico">★</span>
                      <span className="side-doc-name">{d.title || "未命名文档"}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="side-empty">点文档顶部的 ☆ 即可收藏</div>
              )}
            </div>

            <div className="side-group">
              <button className="side-group-head clickable" onClick={() => goView("favspace")}>
                <span>收藏空间</span>
                <span className="side-group-go">›</span>
              </button>
              {favorites.length ? (
                <div className="side-list">
                  {favorites.slice(0, 5).map((d) => (
                    <button key={d.id} data-doc-id={d.id} className="side-doc-item" onClick={() => openDoc(d.id)} title={d.title || "未命名文档"}>
                      <span className="side-doc-ico">▤</span>
                      <span className="side-doc-name">{d.title || "未命名文档"}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="side-empty">收藏的文档会集中展示</div>
              )}
            </div>
          </div>
        )}

        {!sidebarCollapsed && <div className="resizer" onMouseDown={startResize} title="拖拽加宽" />}
      </aside>

      <main
        inert={openingDoc ? "" : undefined}
        aria-busy={openingDoc}
        className={"main" + (aiOpen && view === "doc" ? " ai-open" : "")}
        data-doc-id={doc?.id || ""}
      >
        <button
          className={"pane-toggle" + (sidebarCollapsed ? " is-collapsed" : "")}
          title={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
          onClick={() => setSidebarCollapsed((v) => !v)}
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12.4 4.6 7 10l5.4 5.4" />
          </svg>
        </button>

        <header className="topbar">
          <button className="mobile-doc-menu" aria-label="打开文档导航" aria-expanded={mobileSidebar} onClick={() => { setSidebarCollapsed(false); setMobileSidebar(true); }}>☰</button>
          {view === "doc" ? (
            <>
              <div className="crumb">
                <span className="crumb-ico">
                  <NavIco name="doc" />
                </span>
                <span className="crumb-name">{doc?.title || "未命名文档"}</span>
                <button
                  className={"top-star" + (doc?.favorite ? " on" : "")}
                  title={doc?.favorite ? "取消收藏" : "收藏到收藏空间"}
                  onClick={() => doc && toggleFavorite(doc.id)}
                >
                  {doc?.favorite ? "★" : "☆"}
                </button>
              </div>
              <div className="topbar-right">
                <button
                  className="top-share top-tpl"
                  aria-label="存为模板"
                  data-tip="把当前文档存为模板，新建时可直接复用"
                  onClick={() => setSaveTplOpen(true)}
                >
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5.6 3.6h8.8v13l-4.4-2.8-4.4 2.8z" />
                  </svg>
                  <span>存为模板</span>
                </button>
                <button
                  className={"top-share" + (doc?.share?.enabled ? " on" : "")}
                  data-tip={doc?.share?.enabled ? "已开启分享 · 点此管理链接" : "分享文档（只读链接）"}
                  onClick={() => setShareOpen(true)}
                >
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="14.6" cy="4.8" r="2.2" />
                    <circle cx="5.4" cy="10" r="2.2" />
                    <circle cx="14.6" cy="15.2" r="2.2" />
                    <path d="M7.4 8.9 12.6 6M7.4 11.1l5.2 2.9" />
                  </svg>
                  <span>分享</span>
                </button>
                <button
                  className={"top-ai" + (aiOpen ? " on" : "")}
                  data-tip="AI 助手 ⌘J"
                  aria-pressed={aiOpen}
                  onClick={() => setAiOpen((v) => !v)}
                >
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M10 3.2l1.5 4.3 4.3 1.5-4.3 1.5L10 14.8 8.5 10.5 4.2 9l4.3-1.5z" />
                    <path d="M15.4 13.4l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z" />
                  </svg>
                  <span>AI</span>
                </button>
                <span className="top-meta">
                  所有者 <b>我</b>
                </span>
                <span className="top-sep" />
                <span className="top-meta">
                  最后修改 <b>{relTime(doc?.updatedAt)}</b>
                </span>
                <span className={"save-state " + saveState}>
                  <i className="save-dot" />
                  {saveLabel}
                </span>
              </div>
            </>
          ) : (
            <div className="crumb">
              <span className="crumb-ico">
                <NavIco name={VIEW_ICON[view] || "doc"} />
              </span>
              <span className="crumb-name">{VIEW_NAME[view] || "学城"}</span>
            </div>
          )}
          <ThemeToggle bare />
        </header>

        {error && <div className="banner-error" onClick={() => setError("")}>{error}（点击关闭）</div>}

        {view === "doc" ? (
          doc ? (
            <Editor
              key={doc.id}
              initialDoc={doc.content || null}
              onChange={onEditorChange}
              title={doc.title}
              onTitleChange={onTitleChange}
              words={words}
              onViewReady={handleViewReady}
              onError={setError}
            />
          ) : (
            <div className="loading-page">正在打开文档…</div>
          )
        ) : view === "home" ? (
          <HomeView
            stats={stats}
            edited={edited}
            recents={recents}
            favorites={favorites}
            onOpen={openDoc}
            onNew={createDoc}
            onToggleFav={toggleFavorite}
            onView={goView}
          />
        ) : view === "templates" ? (
          <TemplateMarket
            templates={TEMPLATES}
            myTemplates={myTpl}
            onPreview={setTplPreview}
            onUse={useTemplate}
            onDelete={removeTemplate}
            onSaveCurrent={doc ? () => setSaveTplOpen(true) : null}
          />
        ) : view === "square" ? (
          <KnowledgeSquare docs={docs} onOpen={openDoc} onToggleFav={toggleFavorite} />
        ) : (
          <FavoritesSpaceView favorites={favorites} onOpen={openDoc} onToggleFav={toggleFavorite} />
        )}

        {view === "doc" && (
          <AiPanel
            canUseMcp={canUseMcp}
            open={aiOpen}
            onClose={() => setAiOpen(false)}
            viewApi={viewApi}
            docTitle={doc?.title}
          />
        )}
      </main>

      {shareOpen && doc && (
        <ShareDialog
          doc={doc}
          onClose={() => setShareOpen(false)}
          onUpdate={(patch) => {
            setDoc((d) => (d ? { ...d, ...patch } : d));
            setDocs((prev) => prev.map((x) => (x.id === doc.id ? { ...x, shared: !!patch.share?.enabled } : x)));
          }}
        />
      )}

      {newDoc && (
        <NewDocDialog
          builtins={TEMPLATES}
          mine={myTpl}
          parentTitle={newDoc.parentTitle}
          onClose={() => setNewDoc(null)}
          onCreate={submitNewDoc}
        />
      )}

      {tplPreview && (
        <TemplatePreviewDialog
          template={tplPreview}
          onClose={() => setTplPreview(null)}
          onUse={useTemplate}
          onDelete={tplPreview.builtin ? null : removeTemplate}
        />
      )}

      {saveTplOpen && doc && (
        <SaveTemplateDialog
          docTitle={doc.title}
          charCount={words}
          onClose={() => setSaveTplOpen(false)}
          onSave={saveAsTemplate}
        />
      )}

      {toast && <div className="app-toast">{toast}</div>}
    </div>
  );
}
