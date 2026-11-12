/**
 * 文档 schema — 对齐企业 Wiki（学城）的内容模型
 *
 * 结构：doc(block+) → paragraph/heading/blockquote/code_block/list/table/callout/toggle/image/hr
 * 设计要点：
 *  - 全部块级节点都要能被子节点包裹（list_item 内含 paragraph），
 *    否则 ProseMirror 的 content 表达式会拒绝「列表里放标题」这类合法输入
 *  - mark 仅作用于 inline content
 */
import { Schema } from "prosemirror-model";
import { schema as basicSchema } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";
import { tableNodes } from "prosemirror-tables";

/* ---------- 文本块：带对齐属性 ---------- */
const paragraph = {
  content: "inline*",
  group: "block",
  attrs: { align: { default: null } },
  parseDOM: [
    {
      tag: "p",
      getAttrs: (dom) => ({ align: dom.style.textAlign || null }),
    },
  ],
  toDOM: (node) => [
    "p",
    node.attrs.align ? { style: `text-align:${node.attrs.align}` } : {},
    0,
  ],
};

const heading = {
  attrs: { level: { default: 1 }, align: { default: null } },
  content: "inline*",
  group: "block",
  defining: true,
  parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({
    tag: `h${level}`,
    getAttrs: (dom) => ({ level, align: dom.style.textAlign || null }),
  })),
  toDOM: (node) => [
    `h${node.attrs.level}`,
    node.attrs.align ? { style: `text-align:${node.attrs.align}` } : {},
    0,
  ],
};

/* ---------- 代码块：带语言标记，用于语法高亮与复制 ---------- */
const codeBlock = {
  content: "text*",
  marks: "",
  group: "block",
  code: true,
  defining: true,
  attrs: { language: { default: "" } },
  parseDOM: [
    {
      tag: "pre",
      preserveWhitespace: "full",
      getAttrs: (dom) => ({ language: dom.getAttribute("data-language") || "" }),
    },
  ],
  toDOM: (node) => [
    "pre",
    { "data-language": node.attrs.language || "" },
    ["code", 0],
  ],
};

/* ---------- 提示块（学城的「高亮块」）：info / success / warning / danger ---------- */
const callout = {
  content: "block+",
  group: "block",
  defining: true,
  attrs: { type: { default: "info" } },
  parseDOM: [
    {
      tag: "div[data-callout]",
      getAttrs: (dom) => ({ type: dom.getAttribute("data-callout") || "info" }),
    },
  ],
  toDOM: (node) => [
    "div",
    { "data-callout": node.attrs.type, class: `callout callout-${node.attrs.type}` },
    0,
  ],
};

/* ---------- 折叠块：details/summary，适合长文档收纳 ---------- */
const toggle = {
  content: "block+",
  group: "block",
  defining: true,
  attrs: { summary: { default: "折叠内容" }, open: { default: true } },
  parseDOM: [
    {
      tag: "div[data-toggle]",
      getAttrs: (dom) => ({
        summary: dom.getAttribute("data-summary") || "折叠内容",
        open: dom.getAttribute("data-open") !== "false",
      }),
    },
  ],
  toDOM: (node) => [
    "div",
    {
      "data-toggle": "1",
      "data-summary": node.attrs.summary,
      "data-open": String(node.attrs.open),
      class: "toggle-block",
    },
    0,
  ],
};

/* ---------- 任务列表 ---------- */
const taskList = {
  group: "block",
  content: "task_item+",
  defining: true,
  parseDOM: [{ tag: 'ul[data-task-list]' }],
  toDOM: () => ["ul", { "data-task-list": "1", class: "task-list" }, 0],
};

const taskItem = {
  content: "paragraph block*",
  defining: true,
  attrs: { checked: { default: false } },
  parseDOM: [
    {
      tag: "li[data-task]",
      contentElement: ".task-body",
      getAttrs: (dom) => ({ checked: dom.getAttribute("data-checked") === "true" }),
    },
  ],
  // 复选框必须是 contenteditable=false 的独立元素，否则会被当成正文吞掉
  toDOM: (node) => [
    "li",
    {
      "data-task": "1",
      "data-checked": String(node.attrs.checked),
      class: node.attrs.checked ? "task-item checked" : "task-item",
    },
    ["span", { class: "task-checkbox", contenteditable: "false" }],
    ["div", { class: "task-body" }, 0],
  ],
};

/* ---------- 表格（对齐 / 底色，复刻钉钉表格交互） ---------- */
// 注意：tableNodes 已内置 colspan/rowspan/colwidth，这里只需补钉钉风格的单元格属性
const tables = tableNodes({
  tableGroup: "block",
  cellContent: "block+",
  cellAttributes: {
    // 单元格底色（钉钉「单元格填色」）
    background: {
      default: null,
      getFromDOM(dom) {
        return dom.style.backgroundColor || null;
      },
      setDOMAttr(value, attrs) {
        if (value) attrs.style = (attrs.style || "") + `background-color:${value};`;
      },
    },
    // 单元格水平对齐（钉钉「对齐方式」）
    align: {
      default: null,
      getFromDOM(dom) {
        return dom.getAttribute("data-align") || null;
      },
      setDOMAttr(value, attrs) {
        if (value) (attrs || (attrs = {}))["data-align"] = value;
      },
    },
    // 单元格垂直对齐
    valign: {
      default: null,
      getFromDOM(dom) {
        return dom.getAttribute("data-valign") || null;
      },
      setDOMAttr(value, attrs) {
        if (value) (attrs || (attrs = {}))["data-valign"] = value;
      },
    },
  },
});

// 表格整体属性：边框样式（钉钉「表格边框」预设：全框 / 外框 / 无框）
// tableNodes 的 table.toDOM 形态为 ["table", ["tbody", 0]]，故重写时要把 data-borders 插进
// 表格元素的属性对象，并把原有的 tbody 子节点顺延，不能破坏内容占位。
const _tableSpec = tables.table;
tables.table = {
  ..._tableSpec,
  attrs: { ..._tableSpec.attrs, borders: { default: "all" } },
  parseDOM: [
    {
      tag: "table",
      getAttrs: (dom) => ({ borders: dom.getAttribute("data-borders") || "all" }),
    },
  ],
  toDOM: (node) => {
    const base = _tableSpec.toDOM(node); // ["table", ["tbody", 0]]
    const tbody = base[1]; // 原内容占位
    return ["table", { "data-borders": node.attrs.borders || "all" }, tbody];
  },
};

/* ---------- 投票（poll）：原子块，定义内联在文档，计数走后端 ---------- */
const poll = {
  group: "block",
  atom: true,
  attrs: {
    id: { default: "" },
    question: { default: "投票问题？" },
    options: { default: () => [] }, // [{ id, text }]
  },
  parseDOM: [{ tag: "div[data-poll-id]" }],
  toDOM: (node) => ["div", { "data-poll-id": node.attrs.id, class: "poll-block" }],
};

/* ---------- 问卷调查（survey）：原子块，定义内联在文档，作答走后端 ---------- */
const survey = {
  group: "block",
  atom: true,
  attrs: {
    id: { default: "" },
    title: { default: "问卷调查" },
    questions: { default: () => [] }, // [{ id, type:'single'|'multi'|'text', title, options:[{id,text}] }]
  },
  parseDOM: [{ tag: "div[data-survey-id]" }],
  toDOM: (node) => ["div", { "data-survey-id": node.attrs.id, class: "survey-block" }],
};

/* ---------- marks 扩展：删除线 / 下划线 / 高亮 / 文字色 / 背景色 / 上下标 ---------- */
const extraMarks = {
  strikethrough: {
    parseDOM: [
      { tag: "s" },
      { tag: "del" },
      { style: "text-decoration=line-through" },
    ],
    toDOM: () => ["s", 0],
  },
  underline: {
    parseDOM: [{ tag: "u" }, { style: "text-decoration=underline" }],
    toDOM: () => ["u", 0],
  },
  highlight: {
    parseDOM: [{ tag: "mark" }],
    toDOM: () => ["mark", 0],
  },
  textColor: {
    attrs: { color: { default: "#1f2329" } },
    parseDOM: [
      {
        style: "color",
        getAttrs: (v) => (v ? { color: v } : false),
      },
    ],
    toDOM: (mark) => ["span", { style: `color:${mark.attrs.color}` }, 0],
  },
  bgColor: {
    attrs: { color: { default: "#fff3b0" } },
    parseDOM: [
      {
        style: "background-color",
        getAttrs: (v) => (v ? { color: v } : false),
      },
    ],
    toDOM: (mark) => ["span", { style: `background-color:${mark.attrs.color}` }, 0],
  },
  superscript: {
    excludes: "subscript",
    parseDOM: [{ tag: "sup" }],
    toDOM: () => ["sup", 0],
  },
  subscript: {
    excludes: "superscript",
    parseDOM: [{ tag: "sub" }],
    toDOM: () => ["sub", 0],
  },
  fontSize: {
    attrs: { size: { default: "14px" } },
    parseDOM: [
      {
        style: "font-size",
        getAttrs: (v) => (v ? { size: v } : false),
      },
    ],
    toDOM: (mark) => ["span", { style: `font-size:${mark.attrs.size}` }, 0],
  },
  /* ---------- 划词评论：线程数据（id / resolved / thread[]）内联进标记 attrs，随文档持久化 ---------- */
  comment: {
    attrs: {
      id: { default: "" },
      resolved: { default: false },
      thread: { default: () => [] }, // [{ author, text, ts }]
    },
    parseDOM: [
      {
        tag: "span[data-comment-id]",
        getAttrs: (dom) => ({
          id: dom.getAttribute("data-comment-id") || "",
          resolved: dom.getAttribute("data-resolved") === "1",
        }),
      },
    ],
    toDOM: (mark) => [
      "span",
      {
        "data-comment-id": mark.attrs.id,
        "data-resolved": mark.attrs.resolved ? "1" : "0",
        class: "pm-comment" + (mark.attrs.resolved ? " pm-comment-resolved" : ""),
      },
      0,
    ],
  },
};

/* ---------- 图片：在基础 schema 之上扩展 width / border 属性 ---------- */
// 注意：必须保持 inline + group:"inline"，否则现有文档（图片内嵌于段落）加载会崩
export function imageStyle(attrs) {
  const parts = [];
  if (attrs.width) parts.push(`width:${attrs.width}`);
  if (attrs.border) {
    const w =
      attrs.border === "thin" ? "1px" : attrs.border === "medium" ? "3px" : attrs.border === "thick" ? "5px" : attrs.border;
    parts.push(`border:${w} solid var(--img-border, #d0d3d9)`);
  }
  return parts.join(";");
}

const image = {
  inline: true,
  group: "inline",
  draggable: true,
  attrs: {
    src: { default: "" },
    alt: { default: "" },
    title: { default: "" },
    width: { default: "" }, // 如 "50%" / "320px"，空 = 自适应
    border: { default: "" }, // "" / thin / medium / thick
  },
  parseDOM: [
    {
      tag: "img[src]",
      getAttrs: (dom) => {
        const style = dom.getAttribute("style") || "";
        const wm = style.match(/width\s*:\s*([^;]+)/i);
        const bm = style.match(/border(?:-width)?\s*:\s*([^;]+)/i);
        let border = "";
        if (bm) {
          const px = parseFloat(bm[1]);
          if (px > 0 && px <= 2) border = "thin";
          else if (px > 2 && px <= 4) border = "medium";
          else if (px > 4) border = "thick";
        }
        return {
          src: dom.getAttribute("src"),
          alt: dom.getAttribute("alt") || "",
          title: dom.getAttribute("title") || "",
          width: wm ? wm[1].trim() : "",
          border,
        };
      },
    },
  ],
  toDOM: (node) => [
    "img",
    {
      src: node.attrs.src,
      alt: node.attrs.alt || null,
      title: node.attrs.title || null,
      style: imageStyle(node.attrs) || null,
    },
  ],
};

/* ---------- 音频/歌曲：原子块，整块渲染为播放器或平台 iframe ----------
 * - kind="audio" → 原生 <audio controls>（直链 / 上传文件）
 * - kind="embed" → 平台 iframe（网易云 / B站 / QQ音乐），src 经白名单校验后由 toDOM 安全重包
 * - 只读分享页不注册 NodeView，直接用 toDOM 渲染（与 image 同策略），免登录即可播放 */
const audio = {
  group: "block",
  atom: true,
  attrs: {
    src: { default: "" },
    kind: { default: "audio" }, // "audio" | "embed"
    provider: { default: "" }, // netease | bilibili | qq | ""
    title: { default: "" },
    cover: { default: "" },
  },
  parseDOM: [
    {
      tag: "audio[src]",
      getAttrs: (dom) => ({ src: dom.getAttribute("src") || "", kind: "audio", title: dom.getAttribute("title") || "" }),
    },
    {
      tag: "iframe[src][data-audio='1']",
      getAttrs: (dom) => ({
        src: dom.getAttribute("src") || "",
        kind: "embed",
        provider: dom.getAttribute("data-provider") || "",
        title: dom.getAttribute("title") || "",
      }),
    },
  ],
  toDOM: (node) => {
    const a = node.attrs;
    if (a.kind === "embed") {
      return [
        "iframe",
        {
          src: a.src,
          "data-audio": "1",
          "data-provider": a.provider || "",
          class: "audio-embed",
          frameborder: "0",
          allow: "autoplay; encrypted-media; fullscreen; picture-in-picture",
          allowfullscreen: "true",
          title: a.title || "音频嵌入",
          style: "width:100%;aspect-ratio:16/9;border:0;max-width:640px;border-radius:8px;",
        },
      ];
    }
    return [
      "audio",
      {
        src: a.src,
        controls: "",
        preload: "metadata",
        title: a.title || "",
        "aria-label": a.title || "音频",
        style: "width:100%;max-width:640px;",
      },
    ];
  },
};

/* ---------- 组装 ---------- */
let nodes = basicSchema.spec.nodes;
nodes = nodes.update("paragraph", paragraph);
nodes = nodes.update("heading", heading);
nodes = nodes.update("code_block", codeBlock);
nodes = nodes.append({
  callout,
  toggle,
  task_list: taskList,
  task_item: taskItem,
  poll,
  survey,
  audio,
  ...tables,
});
// 列表节点需要允许任意 block 作为内容（列表项里可以放代码块 / 提示块）
nodes = addListNodes(nodes, "paragraph block*", "block");
// 覆盖基础 schema 的 image，加入 width / border 属性（其余行为保持一致）
nodes = nodes.update("image", image);

export const schema = new Schema({
  nodes,
  marks: basicSchema.spec.marks.append(extraMarks),
});

/* ---------- 空文档 ---------- */
export function emptyDoc() {
  return schema.node("doc", null, [schema.node("paragraph")]);
}

/* ---------- 初始示例文档 ---------- */
export function starterDoc() {
  const n = schema.nodes;
  const t = (text, marks) => schema.text(text, marks);
  return n.doc.create(null, [
    n.heading.create({ level: 1 }, t("欢迎使用学城编辑器")),
    // 注意：NodeType.create(attrs, content, marks) 只有三个参数，
    // 多段文本必须用数组传入，否则多余的 TextNode 会被当成 marks
    n.paragraph.create(null, [
      t("这是一个基于 "),
      t("ProseMirror", [schema.marks.strong.create()]),
      t(" 构建的文档编辑器，支持块级结构、Markdown 快捷输入与实时保存。"),
    ]),
    n.heading.create({ level: 2 }, t("可以试试这些")),
    n.bullet_list.create(null, [
      n.list_item.create(null, [
        n.paragraph.create(null, [t("输入 "), t("/", [schema.marks.code.create()]), t(" 呼出插入菜单")]),
      ]),
      n.list_item.create(null, [
        n.paragraph.create(null, [
          t("行首输入 "),
          t("# ", [schema.marks.code.create()]),
          t("、"),
          t("- ", [schema.marks.code.create()]),
          t("、"),
          t("> ", [schema.marks.code.create()]),
          t(" 自动转成标题/列表/引用"),
        ]),
      ]),
      n.list_item.create(null, [
        n.paragraph.create(null, [
          t("选中文字后用 "),
          t("⌘B", [schema.marks.code.create()]),
          t(" / "),
          t("⌘I", [schema.marks.code.create()]),
          t(" 加粗斜体"),
        ]),
      ]),
    ]),
    n.callout.create({ type: "info" }, [
      n.paragraph.create(null, t("文档会自动保存，右上角可以看到保存状态。")),
    ]),
    n.heading.create({ level: 2 }, t("代码示例")),
    n.code_block.create({ language: "javascript" }, t("const editor = new EditorView(place, {\n  state,\n  dispatchTransaction,\n});")),
    n.heading.create({ level: 2 }, t("表格")),
    n.table.create(null, [
      n.table_row.create(null, [
        n.table_header.create(null, [n.paragraph.create(null, t("能力"))]),
        n.table_header.create(null, [n.paragraph.create(null, t("说明"))]),
      ]),
      n.table_row.create(null, [
        n.table_cell.create(null, [n.paragraph.create(null, t("块级拖拽"))]),
        n.table_cell.create(null, [n.paragraph.create(null, t("悬停块左侧出现手柄，可上下移动"))]),
      ]),
      n.table_row.create(null, [
        n.table_cell.create(null, [n.paragraph.create(null, t("大纲"))]),
        n.table_cell.create(null, [n.paragraph.create(null, t("右侧自动生成标题导航"))]),
      ]),
    ]),
  ]);
}
