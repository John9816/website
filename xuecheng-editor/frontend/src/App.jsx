/**
 * 应用外壳：嵌套文档树 + 标题 + 自动保存
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";
import SidebarTree, { countDescendants } from "./SidebarTree.jsx";
import { TEMPLATES } from "./templates.js";
import { tplContent } from "./templateUtils.js";
import { docToPlainText } from "./plainText.js";
import { useHashRoute, docHash, parseRouteFromLocation } from "./router.js";
import AuthView from "./AuthView.jsx";
import UserMenu from "./UserMenu.jsx";
import PresenceAvatars from "./PresenceAvatars.jsx";
import NotificationBell from "./NotificationBell.jsx";
import { buildTreeMenuItems } from "./treeMenu.jsx";
import ContextMenu from "./ContextMenu.jsx";
import { getOps, getEditorRuntime } from "./editor/docContext.js";
import {
  ScissorOutlined, CopyOutlined, SnippetsOutlined, BoldOutlined, ItalicOutlined,
  UnderlineOutlined, StrikethroughOutlined, ClearOutlined, TableOutlined, FileImageOutlined,
  LinkOutlined, InsertRowAboveOutlined, InsertRowBelowOutlined,
  MergeCellsOutlined, SplitCellsOutlined, DeleteRowOutlined,
  DeleteColumnOutlined, DeleteOutlined, AlignLeftOutlined, AlignCenterOutlined, AlignRightOutlined,
  VerticalAlignMiddleOutlined, ColumnWidthOutlined, BorderOutlined, BorderlessTableOutlined,
  MenuOutlined, ArrowLeftOutlined, ReloadOutlined, PlusOutlined, CloseOutlined, PushpinOutlined,
  CommentOutlined, DownloadOutlined, EditOutlined,
} from "@ant-design/icons";

/* ---------- 首屏代码分割：按需加载的视图与弹层 ----------
   编辑器内核（ProseMirror 全家桶）、只读分享页、AI 面板、非文档视图与各类
   弹层都拆成独立 chunk，只有真正用到时才下载。主包只保留外壳必需模块。 */
const Editor = lazy(() => import("./editor/Editor.jsx"));
const SharePage = lazy(() => import("./ShareView.jsx"));
const AiPanel = lazy(() => import("./AiPanel.jsx"));
const PermissionDialog = lazy(() => import("./PermissionDialog.jsx"));
const AccessRequestView = lazy(() => import("./AccessRequestView.jsx"));
const TrashView = lazy(() => import("./TrashView.jsx"));
const SharedView = lazy(() => import("./SharedView.jsx"));

const loadViews = () => import("./Views.jsx");
const HomeView = lazy(() => loadViews().then((m) => ({ default: m.HomeView })));
const TemplateMarket = lazy(() => loadViews().then((m) => ({ default: m.TemplateMarket })));
const KnowledgeSquare = lazy(() => loadViews().then((m) => ({ default: m.KnowledgeSquare })));
const FavoritesSpaceView = lazy(() => loadViews().then((m) => ({ default: m.FavoritesSpaceView })));

const loadTemplateUI = () => import("./TemplateUI.jsx");
const NewDocDialog = lazy(() => loadTemplateUI().then((m) => ({ default: m.NewDocDialog })));
const SaveTemplateDialog = lazy(() => loadTemplateUI().then((m) => ({ default: m.SaveTemplateDialog })));
const TemplatePreviewDialog = lazy(() => loadTemplateUI().then((m) => ({ default: m.TemplatePreviewDialog })));

/* ---------- 编辑器内核代理 ----------
   右键菜单是同步构建的，但命令实现位于按需加载的 Editor chunk：Editor.jsx
   在模块顶层通过 registerEditorRuntime 注册，这里做转发，主包因此完全不
   静态依赖 ProseMirror。内核尚未加载时命令安全地返回 undefined / false。 */
const cmd = new Proxy({}, {
  get(_, prop) {
    return (...args) => getEditorRuntime()?.cmd?.[prop]?.(...args);
  },
});
const isInTable = (state) => getEditorRuntime()?.isInTable?.(state) ?? false;
const TextSelection = {
  create: (...args) => getEditorRuntime()?.TextSelection?.create(...args),
  near: (...args) => getEditorRuntime()?.TextSelection?.near(...args),
};

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

/* 列插入图标：Ant Design 无「插入列」图标，这里用内联 SVG 复刻钉钉风格（竖向线 + 方向箭头） */
function ColLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 4v16" />
      <path d="M11 8l-3 4 3 4" />
      <path d="M4 12h13" opacity="0.45" />
    </svg>
  );
}
function ColRightIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 4v16" />
      <path d="M13 8l3 4-3 4" />
      <path d="M20 12H7" opacity="0.45" />
    </svg>
  );
}

/* 全选图标：Ant Design 无「全选」图标，这里用内联 SVG（选取矩形） */
function SelectAllIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
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
  trash: (
    <>
      <path d="M4.6 5.8h10.8M8 5.8V4.2h4v1.6M6 5.8l.7 10.2h6.6L14 5.8" />
      <path d="M8.6 8.6v4.8M11.4 8.6v4.8" />
    </>
  ),
  share: (
    <>
      <circle cx="7" cy="7.2" r="2.5" />
      <circle cx="14" cy="6.2" r="2.1" />
      <circle cx="13.4" cy="14" r="2.1" />
      <path d="M8.7 8.9 12.2 12.7M9.3 8.4 12.6 6.6" />
    </>
  ),
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

const VIEW_NAME = { home: "主页", templates: "模板市场", square: "知识广场", favspace: "收藏空间", trash: "回收站", shared: "收到的分享" };
const VIEW_ICON = { home: "home", templates: "grid", square: "book", favspace: "star", trash: "trash", shared: "share" };

export default function App() {
  const [docs, setDocs] = useState([]);
  const [doc, setDoc] = useState(null);
  const [saveState, setSaveState] = useState("saved");
  const [words, setWords] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /* ---------- 当前登录用户 ----------
     无 Context / 状态库，登录态就放在 App 顶层并 props 下发（与既有风格一致）。
     401 由 api.js 统一广播，任何接口发现会话失效都会切回登录页。 */
  const [auth, setAuth] = useState({ checking: true, user: null });
  const user = auth.user;
  useEffect(() => {
    let alive = true;
    api.auth
      .me()
      .then((u) => { if (alive) setAuth({ checking: false, user: u }); })
      .catch(() => { if (alive) setAuth({ checking: false, user: null }); });
    const onUnauthorized = () => setAuth({ checking: false, user: null });
    window.addEventListener("xc:unauthorized", onUnauthorized);
    return () => {
      alive = false;
      window.removeEventListener("xc:unauthorized", onUnauthorized);
    };
  }, []);

  // 侧栏：宽度 / 折叠 / 树节点折叠
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const w = parseInt(localStorage.getItem(LS.width) || "", 10);
    return Number.isFinite(w) ? Math.min(440, Math.max(200, w)) : 256;
  });
  // 默认展开；只有手动点 « 才收成窄条（不再读取历史折叠态，避免每次进来都是收起状态）
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(LS.collapsed) || "[]"));
    } catch {
      return new Set();
    }
  });

  const timerRef = useRef(null);
  const docRef = useRef(null);
  docRef.current = doc;
  const docsRef = useRef(docs);
  docsRef.current = docs;
  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;

  // 主视图：doc=编辑器；home/templates/square/favspace=四大页面
  // 按初始路由推导，避免访问首页等非文档路由时首帧误渲染编辑器分支、
  // 从而白白触发编辑器内核 chunk 的下载（代码分割后这一点很关键）。
  const [view, setView] = useState(() => {
    const r = parseRouteFromLocation();
    return r.name === "page" ? r.page : "doc";
  });

  /* ---------- 路由：让地址栏真实反映当前位置 ---------- */
  const { route, navigate } = useHashRoute();
  // 首屏 hash 决定「打开哪篇 / 落在哪个视图」，之后交给 route 的 effect
  const initialRouteRef = useRef(route);
  // 给异步回调（如慢网络下才返回的 openDoc）判断「用户此刻停在哪」，避免覆盖用户主动导航
  const routeRef = useRef(route);
  routeRef.current = route;
  /* 权限面板：直接存目标文档对象，树行右键可对「非当前打开」的文档管理权限 */
  const [permDoc, setPermDoc] = useState(null);
  /* 地址栏打开了一篇无权限文档：渲染「申请权限」页，而不是退回自己的文档 */
  const [accessDenied, setAccessDenied] = useState(null);
  const accessDeniedRef = useRef(null);
  accessDeniedRef.current = accessDenied;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    const narrow = window.matchMedia("(max-width: 820px)").matches;
    const touchUA = /Mobi|Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    return narrow || touchUA;
  });

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

  // 自建模板：登录后拉一次即可（后续新增/删除在本地同步）
  useEffect(() => {
    if (!user) return;
    api.templates
      .list()
      .then((list) => setMyTpl(Array.isArray(list) ? list : []))
      .catch(() => {});
  }, [user]);

  /* 切换主视图（同时改地址栏，可前进后退） */
  const goView = useCallback(
    (v) => {
      setView(v);
      navigate("#/" + v);
      setMobileNavOpen(false);
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
          inTable: isInTable(state),
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
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setAiOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* 窄屏（≤820px）或移动 UA 下强制展开侧栏，使其可作为抽屉渲染 */
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 820px)");
    const apply = () => {
      const touchUA = /Mobi|Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      const mobile = mq.matches || touchUA;
      setIsMobile(mobile);
      if (mobile) setSidebarCollapsed(false);
    };
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
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
      try {
        setError("");
        setAccessDenied(null);
        const d = await api.getDoc(id);
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
            setMobileNavOpen(false);
            navigate(docHash(id), { replace: true });
          }
          return;
        }

        setView("doc");
        setMobileNavOpen(false);
        if (!opts.silent) navigate(docHash(id), { replace: !!opts.replace });
      } catch (e) {
        /* 复制地址栏 /editor/doc/<id> 给同事时，对方可能没登录 / 没权限。
           403 里带 needRequest：留在原地址并渲染「申请权限」页，
           绝不能像以前那样静默退回他自己的第一篇文档。 */
        if (e.status === 403 && e.data?.needRequest) {
          // 地址栏本来就是 /doc/<id>，不要在这里再 navigate：
          // navigate 会产生新的 route 对象，触发下面的 route effect 再次 openDoc，
          // 形成「403 → 导航 → 再 403」的无限循环。
          setDoc(null);
          setAccessDenied({ docId: id, ...e.data });
          setView("doc");
          setMobileNavOpen(false);
          return;
        }
        setError(e.message);
      }
    },
    [touchDoc, navigate]
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

  /* 固定 / 取消固定到「快速访问」：用户手动维护，不随打开历史变化 */
  const togglePin = useCallback((id) => {
    const cur = docsRef.current.find((d) => d.id === id);
    const next = !(cur && cur.pinned);
    const ts = new Date().toISOString();
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, pinned: next, pinnedAt: next ? ts : null } : d)));
    setDoc((d) => (d && d.id === id ? { ...d, pinned: next, pinnedAt: next ? ts : null } : d));
    api.updateDoc(id, { pinned: next, pinnedAt: next ? ts : null }).catch(() => {});
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

  /* ---------- 派生列表：最近访问 / 收藏 / 最近编辑 ----------
     列表接口会回「受限文档」掩码占位（只为保持树结构完整），不能进主页/统计/广场 */
  const visibleDocs = useMemo(() => docs.filter((d) => !d.placeholder), [docs]);
  const recents = useMemo(
    () =>
      visibleDocs
        .filter((d) => d.lastVisitedAt)
        .sort((a, b) => new Date(b.lastVisitedAt) - new Date(a.lastVisitedAt))
        .slice(0, 8),
    [visibleDocs]
  );
  const favorites = useMemo(() => visibleDocs.filter((d) => d.favorite), [visibleDocs]);
  const pinned = useMemo(
    () =>
      visibleDocs
        .filter((d) => d.pinned)
        .sort((a, b) => new Date(b.pinnedAt || 0) - new Date(a.pinnedAt || 0))
        .slice(0, 12),
    [visibleDocs]
  );
  const edited = useMemo(
    () => [...visibleDocs].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 6),
    [visibleDocs]
  );
  const stats = { total: visibleDocs.length, favorites: favorites.length, recent: recents.length };

  /* ---------- 首次加载（登录成功后才执行） ---------- */
  useEffect(() => {
    // 未登录 / 会话校验中不拉文档列表，避免 401；登录成功后 user 变化会重跑
    if (!user) return;
    const want = initialRouteRef.current;
    // 分享页独立渲染，不需要文档列表
    if (want.name === "share") {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        let list = await api.listDocs();
        if (!list.length) {
          const { starterDoc } = await import("./schema.js");
          const created = await api.createDoc("欢迎使用学城编辑器", starterDoc().toJSON());
          list = await api.listDocs();
          setDocs(list);
          await openDoc(created.id, { auto: true });
          return;
        }
        setDocs(list);
        // 地址栏明确指向某篇文档时，必须尝试打开它：即使不在「可见列表」里，
        // 也要让服务端判 403 → 进入申请权限页，而不是退回自己的文档。
        const openable = list.filter((d) => !d.placeholder);
        const target = want.name === "doc" ? want.id : (openable[0] || list[0])?.id;
        if (target) await openDoc(target, { auto: true });
        if (want.name === "page") setView(want.page);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [openDoc, user]);

  /* ---------- 地址栏变化（前进 / 后退 / 手输 hash）→ 同步视图 ---------- */
  useEffect(() => {
    if (!user || route.name === "share") return;
    if (route.name === "page") {
      setView((v) => (v === route.page ? v : route.page));
    } else if (route.name === "doc") {
      // 无权限文档已渲染申请页，避免 route 对象变化造成重复 403 请求
      if (accessDeniedRef.current?.docId === route.id) return;
      if (docRef.current?.id !== route.id) openDoc(route.id, { replace: true, silent: true });
    } else if (route.name === "root") {
      setView("doc");
    }
  }, [route, openDoc, user]);

  /* 浏览器标题跟随文档 */
  useEffect(() => {
    if (route.name === "share") return;
    const name = view === "doc" ? doc?.title || "未命名文档" : VIEW_NAME[view] || "学城";
    document.title = `${name} · 学城`;
  }, [doc?.title, view, route.name]);

  /* ---------- 保存 ---------- */
  const flush = useCallback(async (payload) => {
    const d = docRef.current;
    // 只读态（viewer）绝不发起写请求；服务端也会拒绝，这里只是提前短路
    if (!d || d.canEdit === false) return;
    setSaveState("saving");
    try {
      const updated = await api.saveDoc(d.id, {
        title: payload.title ?? d.title,
        content: payload.content ?? d.content,
      });
      setSaveState("saved");
      setDocs((prev) =>
        prev.map((x) => (x.id === updated.id ? { ...x, title: updated.title, updatedAt: updated.updatedAt } : x))
      );
    } catch (e) {
      setSaveState("error");
      setError(e.message);
    }
  }, []);

  const scheduleSave = useCallback(
    (payload) => {
      if (docRef.current?.canEdit === false) return;
      setSaveState("dirty");
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => flush(payload), SAVE_DEBOUNCE);
    },
    [flush]
  );

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

  /* ---------- 回收站 ---------- */
  const [trash, setTrash] = useState([]);
  const [trashBusy, setTrashBusy] = useState(false);

  const refreshTrash = useCallback(async () => {
    if (!user) return;
    try {
      const r = await api.trash.list();
      setTrash(Array.isArray(r?.batches) ? r.batches : []);
    } catch (e) {
      setError(e.message);
    }
  }, [user]);

  // 进入回收站视图时拉取；恢复 / 彻底删除后由操作函数主动刷新
  useEffect(() => {
    if (user && view === "trash") refreshTrash();
  }, [user, view, refreshTrash]);

  const restoreTrash = useCallback(
    async (batchId) => {
      if (trashBusy) return;
      setTrashBusy(true);
      try {
        const r = await api.trash.restore(batchId);
        await refresh();
        await refreshTrash();
        showToast(`已恢复 ${r?.count || 0} 篇文档`);
      } catch (e) {
        setError(e.message);
      } finally {
        setTrashBusy(false);
      }
    },
    [trashBusy, refresh, refreshTrash, showToast]
  );

  const purgeTrash = useCallback(
    async (batchId) => {
      if (trashBusy || !window.confirm("彻底删除后无法找回，确定继续？")) return;
      setTrashBusy(true);
      try {
        await api.trash.purge(batchId);
        await refreshTrash();
        showToast("已彻底删除");
      } catch (e) {
        setError(e.message);
      } finally {
        setTrashBusy(false);
      }
    },
    [trashBusy, refreshTrash, showToast]
  );

  const clearTrash = useCallback(
    async () => {
      if (trashBusy) return;
      setTrashBusy(true);
      try {
        await api.trash.clear();
        await refreshTrash();
        showToast("回收站已清空");
      } catch (e) {
        setError(e.message);
      } finally {
        setTrashBusy(false);
      }
    },
    [trashBusy, refreshTrash, showToast]
  );

  // 在某个节点下新建子文档
  const addChildDoc = (parentId) =>
    setNewDoc({
      parentId,
      parentTitle: docsRef.current.find((d) => d.id === parentId)?.title || "",
    });

  const removeDoc = async (id) => {
    const n = countDescendants(docs, id);
    const msg =
      n > 0
        ? `确定删除这篇文档？将连同 ${n} 个子文档一起移入回收站，可随时恢复。`
        : "确定删除这篇文档？会移入回收站，可随时恢复。";
    if (!window.confirm(msg)) return;
    try {
      await api.deleteDoc(id);
      await refreshTrash();
      showToast("已移入回收站");
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
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        clearTimeout(timerRef.current);
        flush({});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flush]);

  const saveLabel =
    saveState === "saving" ? "保存中…" : saveState === "dirty" ? "未保存" : saveState === "error" ? "保存失败" : "已保存";

  /* ---------- 上下文菜单：全网页右键统一接管 ---------- */
  const [ctx, setCtx] = useState(null);
  const openCtx = useCallback((x, y, items) => setCtx({ x, y, items }), []);
  const closeCtx = useCallback(() => setCtx(null), []);

  const childDocs = useMemo(() => {
    if (!doc) return [];
    return docs
      .filter((d) => (d.parentId || null) === doc.id && !d.placeholder)
      .map((d) => ({ id: d.id, title: d.title }));
  }, [docs, doc]);

  /* 打开权限面板：树行右键可对非当前文档操作，且仅所有者可管理 */
  const openPermission = useCallback((docId) => {
    const d = docsRef.current.find((x) => x.id === docId);
    if (d && !d.placeholder && d.canManage) setPermDoc(d);
  }, []);

  const insertChildToc = useCallback(() => {
    const v = editorViewRef.current;
    if (!v) return;
    if (!childDocs.length) {
      showToast("当前文档还没有子文档，先在左侧文档树上用「⋯ → 新建子文档」添加");
      return;
    }
    cmd.insertChildToc(v, childDocs);
    v.focus();
  }, [childDocs, showToast]);

  // 与 SidebarTree.jsx 的「⋯」菜单共用同一份定义（treeMenu.jsx）
  const treeMenuItems = useCallback(
    (docId) => {
      const d = docsRef.current.find((x) => x.id === docId);
      return buildTreeMenuItems(d, {
        onTogglePin: togglePin,
        onAdd: addChildDoc,
        onDelete: removeDoc,
        onPermission: openPermission,
      });
    },
    [togglePin, addChildDoc, removeDoc, openPermission]
  );

  /* 用 ref 持有「按目标构造菜单」的逻辑，避免全局监听反复重绑。
   * 对齐主流编辑器（飞书/Notion/Google Docs/钉钉）的右键规范：
   *  - 菜单随目标场景切换（正文选区/表格/图片/链接/文档树）
   *  - 输入框与非编辑区不拦截，保留浏览器原生菜单
   *  - 剪贴板操作带 HTTP 降级（Clipboard API 需 HTTPS） */
  const buildCtxRef = useRef(null);
  buildCtxRef.current = (target) => {
    const t = target;
    // 只读文档（viewer）：只保留查看/复制类操作，其余放行浏览器原生菜单
    const readOnly = docRef.current?.canEdit === false;

    /* 剪贴板工具：HTTPS 用 Clipboard API，HTTP 降级 execCommand */
    const execCopyFallback = (text) => {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (_) {}
      document.body.removeChild(ta);
    };
    const copyText = (text) => {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(() => showToast("已复制")).catch(() => { execCopyFallback(text); showToast("已复制"); });
      } else {
        execCopyFallback(text);
        showToast("已复制");
      }
    };

    /* 1. 文档树行 */
    const row = t.closest?.("[data-doc-id].tree-row, .tree-row[data-doc-id]");
    if (row?.dataset?.docId) return treeMenuItems(row.dataset.docId);

    /* 2. 表单输入框（含标题输入）：不拦截，保留原生菜单（拼写检查/自动填充） */
    if (t.closest?.("input, textarea")) return null;

    /* 3. 编辑器正文 / 文档标题 */
    if (t.closest?.(".ProseMirror, .editor-page, .doc-head")) {
      const v = editorViewRef.current;
      if (!v) return null;
      if (readOnly) {
        const imgRO = t.closest?.("img");
        if (imgRO && t.closest?.(".ProseMirror")) {
          return [
            { label: "下载图片", icon: <DownloadOutlined />, onClick: () => {
              const a = document.createElement("a");
              a.href = imgRO.src; a.download = imgRO.src.split("/").pop() || "image";
              a.target = "_blank"; a.rel = "noopener";
              document.body.appendChild(a); a.click(); a.remove();
            } },
            { label: "复制图片地址", icon: <CopyOutlined />, onClick: () => copyText(imgRO.src) },
          ];
        }
        const linkRO = t.closest?.("a[href]");
        if (linkRO && t.closest?.(".ProseMirror")) {
          const hrefRO = linkRO.getAttribute("href") || "";
          return [
            { label: "打开链接", icon: <LinkOutlined />, onClick: () => window.open(hrefRO, "_blank", "noopener") },
            { label: "复制链接地址", icon: <CopyOutlined />, onClick: () => copyText(hrefRO) },
          ];
        }
        // 正文 / 表格区域不拦截，交给浏览器原生菜单（复制、全选、查找）
        return null;
      }
      const sel = v.state.selection;
      const hasSel = !!(sel && !sel.empty);

      /* 3a. 图片：下载/复制/替换/删除 */
      const imgEl = t.closest?.("img");
      if (imgEl && t.closest?.(".ProseMirror")) {
        const imgPos = (() => {
          try {
            const at = v.posAtDOM(imgEl, 0);
            const $p = v.state.doc.resolve(Math.min(at, v.state.doc.content.size));
            for (let d = $p.depth; d > 0; d--) {
              const n = $p.node(d);
              if (n.type.name === "image") return $p.before(d);
            }
            const n = v.state.doc.nodeAt(at);
            if (n && n.type.name === "image") return at;
          } catch (_) {}
          return null;
        })();
        return [
          { label: "下载图片", icon: <DownloadOutlined />, onClick: () => {
            const a = document.createElement("a");
            a.href = imgEl.src; a.download = imgEl.src.split("/").pop() || "image";
            a.target = "_blank"; a.rel = "noopener";
            document.body.appendChild(a); a.click(); a.remove();
          } },
          { label: "复制图片地址", icon: <CopyOutlined />, onClick: () => copyText(imgEl.src) },
          { sep: true },
          { label: "替换图片", icon: <FileImageOutlined />, onClick: () => {
            const url = window.prompt("输入新图片地址", imgEl.src);
            if (url && url.trim() && imgPos != null) cmd.replaceImage(v, url.trim(), imgPos);
          } },
          { label: "删除图片", icon: <DeleteOutlined />, danger: true, onClick: () => {
            if (imgPos == null) return;
            const n = v.state.doc.nodeAt(imgPos);
            if (n) { v.dispatch(v.state.tr.delete(imgPos, imgPos + n.nodeSize)); v.focus(); }
          } },
        ];
      }

      /* 3b. 链接：打开/复制/编辑/移除 */
      const linkEl = t.closest?.("a[href]");
      if (linkEl && t.closest?.(".ProseMirror")) {
        const href = linkEl.getAttribute("href") || "";
        let lStart = 0, lEnd = 0;
        try {
          lStart = v.posAtDOM(linkEl, 0);
          lEnd = v.posAtDOM(linkEl, linkEl.childNodes.length);
        } catch (_) {}
        const selectLink = () => {
          try { v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, lStart, lEnd))); } catch (_) {}
        };
        return [
          { label: "打开链接", icon: <LinkOutlined />, onClick: () => window.open(href, "_blank", "noopener") },
          { label: "复制链接地址", icon: <CopyOutlined />, onClick: () => copyText(href) },
          { sep: true },
          { label: "编辑链接", icon: <EditOutlined />, onClick: () => {
            const url = window.prompt("输入链接地址（留空则移除链接）", href);
            if (url === null) return;
            selectLink();
            cmd.setLink(v, url.trim());
            v.focus();
          } },
          { label: "移除链接", icon: <ClearOutlined />, danger: true, onClick: () => {
            selectLink();
            cmd.setLink(v, "");
            v.focus();
          } },
        ];
      }

      /* 剪贴板操作（带 HTTP 降级） */
      const doCopy = () => {
        if (!v || !hasSel) return;
        copyText(v.state.doc.textBetween(sel.from, sel.to, "\n"));
      };
      const doCut = () => {
        doCopy();
        if (v && hasSel) v.dispatch(v.state.tr.deleteSelection());
        v?.focus();
      };
      const doPaste = async () => {
        v.focus();
        try {
          if (navigator.clipboard?.readText) {
            const text = await navigator.clipboard.readText();
            if (text) { viewApi.insertText(text); return; }
          }
        } catch (_) {}
        showToast("已聚焦编辑器，请按 ⌘V / Ctrl+V 粘贴");
      };

      const ctx = viewApi.getContext();

      /* 3c. 表格单元格：精简一级菜单 + 分组 + 二级子菜单。
       * 对标飞书/钉钉文档：把插入行列、单元格格式、删除三类低频操作收进子菜单，
       * 一级只留常用项，避免 19 项扁平长列表压住文档；危险操作也不再平铺成一片红。 */
      if (ctx.inTable) {
        // 合并需先选中 ≥2 个单元格；拆分需光标在已合并单元格内。否则灰显禁用，避免「点了没反应」
        const canMerge = cmd.canMerge(v.state);
        const canSplit = cmd.canSplit(v.state);
        return [
          { group: "剪贴板" },
          { label: "剪切", icon: <ScissorOutlined />, hint: "⌘X", onClick: doCut },
          { label: "复制", icon: <CopyOutlined />, hint: "⌘C", onClick: doCopy },
          { label: "粘贴", icon: <SnippetsOutlined />, hint: "⌘V", onClick: doPaste },
          { group: "单元格" },
          {
            label: "插入行列", icon: <TableOutlined />, children: [
              { label: "在上方插入行", icon: <InsertRowAboveOutlined />, onClick: () => v && cmd.tableAddRowsBefore(v) },
              { label: "在下方插入行", icon: <InsertRowBelowOutlined />, onClick: () => v && cmd.tableAddRowsAfter(v) },
              { sep: true },
              { label: "在左侧插入列", icon: <ColLeftIcon />, onClick: () => v && cmd.tableAddColsBefore(v) },
              { label: "在右侧插入列", icon: <ColRightIcon />, onClick: () => v && cmd.tableAddColsAfter(v) },
            ],
          },
          { label: "合并单元格", icon: <MergeCellsOutlined />, disabled: !canMerge, onClick: () => v && cmd.tableMerge(v) },
          { label: "拆分单元格", icon: <SplitCellsOutlined />, disabled: !canSplit, onClick: () => v && cmd.tableSplit(v) },
          { group: "格式" },
          {
            label: "单元格样式", icon: <BorderOutlined />, children: [
              { label: "左对齐", icon: <AlignLeftOutlined />, onClick: () => v && cmd.setCellAlign(v, "left") },
              { label: "居中对齐", icon: <AlignCenterOutlined />, onClick: () => v && cmd.setCellAlign(v, "center") },
              { label: "右对齐", icon: <AlignRightOutlined />, onClick: () => v && cmd.setCellAlign(v, "right") },
              { sep: true },
              { label: "垂直居中", icon: <VerticalAlignMiddleOutlined />, onClick: () => v && cmd.setCellVAlign(v, "middle") },
              { label: "清除底色", icon: <ClearOutlined />, onClick: () => v && cmd.setCellBackground(v, null) },
              { label: "均分列宽", icon: <ColumnWidthOutlined />, onClick: () => v && cmd.distributeColumns(v) },
            ],
          },
          { sep: true },
          {
            label: "删除", icon: <DeleteOutlined />, children: [
              { label: "删除整行", icon: <DeleteRowOutlined />, danger: true, onClick: () => v && cmd.tableDeleteRow(v) },
              { label: "删除整列", icon: <DeleteColumnOutlined />, danger: true, onClick: () => v && cmd.tableDeleteCol(v) },
              { sep: true },
              { label: "删除表格", icon: <DeleteOutlined />, danger: true, onClick: () => v && cmd.tableDelete(v) },
            ],
          },
          { sep: true },
          { label: "全选", icon: <SelectAllIcon />, hint: "⌘A", onClick: () => document.execCommand("selectAll") },
        ];
      }

      /* 3d. 正文选中文字：剪贴板 + 评论 + 格式 + 链接（对齐飞书/Notion/Google Docs） */
      if (hasSel) {
        return [
          { label: "剪切", icon: <ScissorOutlined />, hint: "⌘X", onClick: doCut },
          { label: "复制", icon: <CopyOutlined />, hint: "⌘C", onClick: doCopy },
          { label: "粘贴", icon: <SnippetsOutlined />, hint: "⌘V", onClick: doPaste },
          { sep: true },
          { label: "评论", icon: <CommentOutlined />, hint: "划词", onClick: () => {
            const rect = (() => { try { return v.coordsAtPos(sel.from); } catch (_) { return null; } })();
            getOps().addComment?.(sel.from, sel.to, { top: (rect?.top ?? 120) - 8, left: rect?.left ?? 120 });
          } },
          { sep: true },
          { label: "加粗", icon: <BoldOutlined />, hint: "⌘B", onClick: () => v && cmd.toggleBold(v) },
          { label: "斜体", icon: <ItalicOutlined />, hint: "⌘I", onClick: () => v && cmd.toggleItalic(v) },
          { label: "下划线", icon: <UnderlineOutlined />, hint: "⌘U", onClick: () => v && cmd.toggleUnderline(v) },
          { label: "删除线", icon: <StrikethroughOutlined />, onClick: () => v && cmd.toggleStrike(v) },
          { label: "清除格式", icon: <ClearOutlined />, onClick: () => v && cmd.clearFormat(v) },
          { sep: true },
          { label: "添加链接", icon: <LinkOutlined />, onClick: () => {
            const url = window.prompt("输入链接地址", "https://");
            if (url && url.trim()) cmd.setLink(v, url.trim());
          } },
        ];
      }

      /* 3e. 正文无选区：粘贴 / 全选（+ 插入子文档目录） */
      const items = [
        { label: "粘贴", icon: <SnippetsOutlined />, hint: "⌘V", onClick: doPaste },
        { sep: true },
        { label: "全选", icon: <SelectAllIcon />, hint: "⌘A", onClick: () => document.execCommand("selectAll") },
      ];
      if (childDocs.length) {
        items.push({ sep: true });
        items.push({ label: "插入子文档目录", icon: <MenuOutlined />, hint: `${childDocs.length} 篇`, onClick: insertChildToc });
      }
      return items;
    }

    /* 4. 其它区域（侧栏空白/面板/按钮）：不拦截，保留浏览器原生菜单 */
    return null;
  };

  /* 捕获所有右键：系统菜单一律不出，改出我们的菜单 */
  useEffect(() => {
    // 右键 mousedown 会触发浏览器/视图把选区重置到点击处，破坏已拖选的多单元格选区，
    // 导致「拖选多格后右键合并」失效。捕获阶段阻止默认，保留 CellSelection。
    const onDown = (e) => {
      if (e.button === 2 && editorViewRef.current) {
        // 右键落在表格选区上时，阻止默认并停止传播，避免 mousedown 把已拖选的
        // 多单元格选区重置，否则「拖选多格后右键合并」会失效
        if (isInTable(editorViewRef.current.state)) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      }
    };
    const onCtx = (e) => {
      // 子组件（如文档树行）已处理：菜单已开，只需保证系统菜单不出现
      if (e.defaultPrevented) {
        e.preventDefault();
        return;
      }
      const v = editorViewRef.current;
      if (v) {
        const cellEl = e.target.closest?.("td,th");
        const inEditor = e.target.closest?.(".ProseMirror, .editor-page, .doc-head");
        // 右键落在单元格内：把选区定位到点击处，否则右键不会移动光标，
        // 导致 isInTable(state) 基于旧选区误判、表格菜单与合并/拆分全部失效
        // 右键落在单元格内：仅当选区不在表格内（如光标在表格外却右键了表格）
        // 时才把光标移到点击处，保证表格菜单出现；已在表格内则保留用户选区（含多选）
        if (cellEl && inEditor) {
          const at = v.posAtCoords({ left: e.clientX, top: e.clientY });
          if (at && !isInTable(v.state)) {
            const $p = v.state.doc.resolve(at.pos);
            v.dispatch(v.state.tr.setSelection(TextSelection.near($p)));
            v.focus();
          }
        }
      }
      // 有对应场景菜单才拦截；输入框/非编辑区返回 null → 放行浏览器原生菜单
      const items = buildCtxRef.current?.(e.target) || [];
      if (!items.length) return;
      e.preventDefault();
      openCtx(e.clientX, e.clientY, items);
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("contextmenu", onCtx);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("contextmenu", onCtx);
    };
  }, [openCtx]);

  /* 分享页：独立版式，匿名放行，优先于登录检查（历史链接仍可免登录只读） */
  if (route.name === "share") {
    return (
      <Suspense fallback={<div className="loading-page">正在打开分享页…</div>}>
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
      </Suspense>
    );
  }

  /* 会话校验中 / 未登录：直接渲染登录页，不加载侧栏、顶栏与文档数据 */
  if (auth.checking) {
    return <div className="loading-page">正在检查登录状态…</div>;
  }
  if (!user) {
    return (
      <AuthView
        onAuthed={(u) => setAuth({ checking: false, user: u })}
        notice={route.name === "doc" ? "你打开的文档需要登录后才能查看，登录后会继续打开原链接。" : ""}
      />
    );
  }

  return (
    <div className={"app" + (isMobile ? " is-mobile" : "")}>
      <aside
        className={"sidebar" + (sidebarCollapsed ? " collapsed" : "") + (mobileNavOpen ? " open" : "")}
        style={{ width: sidebarCollapsed ? 0 : sidebarWidth }}
      >
        <div className="brand">
          <span className="brand-mark">学</span>
          {!sidebarCollapsed && <span className="brand-name">学城</span>}
          <button
            className="drawer-close"
            aria-label="关闭菜单"
            onClick={() => setMobileNavOpen(false)}
          >
            ✕
          </button>
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
              <button
                className={"side-nav-item" + (view === "trash" ? " active" : "")}
                onClick={() => goView("trash")}
              >
                <NavIco name="trash" />回收站
              </button>
              <button
                className={"side-nav-item" + (view === "shared" ? " active" : "")}
                onClick={() => goView("shared")}
              >
                <NavIco name="share" />收到的分享
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
                    docs={docs.filter((d) => !d.sharedWithMe)}
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
                    onTogglePin={togglePin}
                    onPermission={openPermission}
                    onRowMenu={openCtx}
                    disableDrag={isMobile}
                  />
                )}
              </div>
            </div>

            <div className="side-group">
              <div className="side-group-head">
                <span>快速访问</span>
              </div>
              {pinned.length ? (
                <div className="side-list">
                  {pinned.map((d) => (
                    <button key={d.id} className="side-doc-item" onClick={() => openDoc(d.id)} title={d.title || "未命名文档"}>
                      <span className="side-doc-ico">📌</span>
                      <span className="side-doc-name">{d.title || "未命名文档"}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="side-empty">点文档顶部的 📌 或文档树上的图钉即可固定到这里</div>
              )}
            </div>

            <div className="side-group">
              <div className="side-group-head">
                <span>收藏夹</span>
              </div>
              {favorites.length ? (
                <div className="side-list">
                  {favorites.map((d) => (
                    <button key={d.id} className="side-doc-item" onClick={() => openDoc(d.id)} title={d.title || "未命名文档"}>
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
                    <button key={d.id} className="side-doc-item" onClick={() => openDoc(d.id)} title={d.title || "未命名文档"}>
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
        className={"main" + (aiOpen && view === "doc" ? " ai-open" : "") + (sidebarCollapsed ? " side-collapsed" : "")}
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
          <button
            className="nav-burger"
            aria-label="打开菜单"
            onClick={() => setMobileNavOpen(true)}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M3.5 6h13M3.5 10h13M3.5 14h13" />
            </svg>
          </button>
          {view === "doc" && !accessDenied ? (
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
                <button
                  className={"top-pin" + (doc?.pinned ? " on" : "")}
                  title={doc?.pinned ? "取消固定（移出快速访问）" : "固定到快速访问"}
                  onClick={() => doc && togglePin(doc.id)}
                >
                  📌
                </button>
              </div>
              <div className="topbar-right">
                {doc?.canEdit !== false && (
                  <button
                    className="top-share top-tpl"
                    data-tip="把当前文档存为模板，新建时可直接复用"
                    onClick={() => setSaveTplOpen(true)}
                  >
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5.6 3.6h8.8v13l-4.4-2.8-4.4 2.8z" />
                    </svg>
                    <span>存为模板</span>
                  </button>
                )}
                {doc?.canManage && (
                  <button
                    className="top-share top-perm"
                    data-tip="管理成员与权限（指定人授权）"
                    onClick={() => setPermDoc(doc)}
                  >
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="7.2" cy="6.8" r="2.5" />
                      <path d="M2.8 16.2c0-2.6 2-4.3 4.4-4.3s4.4 1.7 4.4 4.3" />
                      <path d="M13.6 5.1a2.3 2.3 0 0 1 0 4.4M14.8 12.4c1.8.5 2.9 1.9 2.9 3.8" />
                    </svg>
                    <span>权限</span>
                  </button>
                )}
                <NotificationBell
                  user={user}
                  onOpenDoc={(id) => openDoc(id, { replace: true })}
                  onOpenPerm={(id) => api.getDoc(id).then(setPermDoc).catch(() => {})}
                />
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
                {/* 正在看的人：登录成员 + 通过分享链接进来的匿名访客 */}
                {doc && <PresenceAvatars docId={doc.id} />}
                <UserMenu user={user} onLogout={() => setAuth({ checking: false, user: null })} />
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
            <>
              <div className="crumb">
                <span className="crumb-ico">
                  <NavIco name={VIEW_ICON[view] || "doc"} />
                </span>
                <span className="crumb-name">{accessDenied ? "申请权限" : VIEW_NAME[view] || "学城"}</span>
              </div>
              {/* 非文档视图 / 无权限页同样保留用户菜单：改密 / 登出 / 用户管理 / 数据导出
                  不应只有打开编辑器时才能用 */}
              <div className="topbar-right">
                <UserMenu user={user} onLogout={() => setAuth({ checking: false, user: null })} />
              </div>
            </>
          )}
        </header>

        {error && <div className="banner-error" onClick={() => setError("")}>{error}（点击关闭）</div>}

        <Suspense fallback={<div className="loading-page">正在打开…</div>}>
        {view === "doc" ? (
          accessDenied ? (
            <AccessRequestView
              docId={accessDenied.docId}
              denied={accessDenied}
              onGranted={async () => {
                const id = accessDenied.docId;
                setAccessDenied(null);
                await refresh();
                await openDoc(id, { replace: true });
              }}
              onHome={() => { setAccessDenied(null); goView("home"); }}
            />
          ) : doc ? (
            <Editor
              key={`${doc.id}:${doc.canEdit === false ? "ro" : "rw"}`}
              docId={doc.id}
              editable={doc.canEdit !== false}
              initialDoc={doc.content || null}
              onChange={onEditorChange}
              title={doc.title}
              onTitleChange={doc.canEdit === false ? null : onTitleChange}
              words={words}
              onViewReady={handleViewReady}
              childDocs={childDocs}
              onOpenDoc={openDoc}
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
            pinned={pinned}
            onOpen={openDoc}
            onNew={createDoc}
            onToggleFav={toggleFavorite}
            onTogglePin={togglePin}
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
          <KnowledgeSquare docs={visibleDocs} onOpen={openDoc} onToggleFav={toggleFavorite} />
        ) : view === "trash" ? (
          <TrashView
            batches={trash}
            busy={trashBusy}
            onRestore={restoreTrash}
            onPurge={purgeTrash}
            onClear={clearTrash}
            onGoHome={() => goView("home")}
          />
        ) : view === "shared" ? (
          <SharedView
            docs={docs.filter((d) => d.sharedWithMe)}
            onOpen={openDoc}
            onTogglePin={togglePin}
            onRowMenu={openCtx}
            loading={loading}
          />
        ) : (
          <FavoritesSpaceView favorites={favorites} onOpen={openDoc} onToggleFav={toggleFavorite} />
        )}

        </Suspense>

        <Suspense fallback={null}>
          {view === "doc" && (
            <AiPanel
              open={aiOpen}
              onClose={() => setAiOpen(false)}
              viewApi={viewApi}
              docTitle={doc?.title}
              user={user}
            />
          )}
        </Suspense>
      </main>

      {mobileNavOpen && (
        <div className="nav-mask" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />
      )}

      <Suspense fallback={null}>
      {permDoc && (
        <PermissionDialog
          doc={permDoc}
          onClose={() => setPermDoc(null)}
          onChanged={async () => {
            try {
              await refresh();
              refreshRequestBadge();
              const id = permDoc.id;
              if (docRef.current?.id === id) {
                const d = await api.getDoc(id);
                // 只更新权限相关字段，不重置正文（避免打断未保存的编辑）
                setDoc((prev) =>
                  prev && prev.id === id
                    ? { ...prev, canEdit: d.canEdit, canManage: d.canManage, visibility: d.visibility, share: d.share }
                    : prev
                );
              }
            } catch (_) {}
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

      </Suspense>

      {toast && <div className="app-toast">{toast}</div>}

      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={closeCtx} />}
    </div>
  );
}
