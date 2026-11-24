/**
 * 技能库（Skills）
 * ------------------------------------------------------------------
 * 这里的「技能」全部是**确定性的本地能力**：给定选中的文本或整篇文档，
 * 产出一段结果文本，不依赖任何外部模型。因此它们可离线运行、结果可预期、
 * 也方便单测。
 *
 * 契约
 *   run(ctx) -> { text: string, note?: string }
 *   ctx = {
 *     text       选中的纯文本（无选区时为空字符串）
 *     hasSelection
 *     crossBlock 选区是否跨多个块（跨块替换会合并段落，面板据此禁用替换）
 *     docJSON    ProseMirror 文档 JSON
 *     docText    全文纯文本
 *   }
 *
 * scope  -> "selection"：只对选中文本生效；"doc"：对整篇文档生效
 * mode   -> "replace"：结果可替换选区 / 插入光标
 *           "insert" ：结果适合插入到光标处（如目录）
 *           "info"   ：只读结果（统计、分析）
 *           "download"：可下载为文件
 */

/* ------------------------------------------------------------------ */
/* 通用工具                                                            */
/* ------------------------------------------------------------------ */
const CJK = /[\u4e00-\u9fa5]/;

/** 遍历 ProseMirror JSON 的所有节点 */
function walk(node, fn) {
  if (!node || typeof node !== "object") return;
  fn(node);
  if (Array.isArray(node.content)) node.content.forEach((c) => walk(c, fn));
}

function countOfType(docJSON, type) {
  let n = 0;
  walk(docJSON, (nd) => {
    if (nd.type === type) n++;
  });
  return n;
}

/** 只统计文档顶层（不含列表项、表格单元格内的段落） */
function countTopLevel(docJSON, type) {
  return (docJSON?.content || []).filter((nd) => nd.type === type).length;
}

/** 中文按字、英文按词统计 */
export function countUnits(text) {
  const s = text || "";
  const cn = (s.match(/[\u4e00-\u9fa5]/g) || []).length;
  const en = (s.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || []).length;
  return { cn, en, total: cn + en };
}

/* ------------------------------------------------------------------ */
/* ProseMirror JSON → Markdown / 纯文本                                 */
/* ------------------------------------------------------------------ */
function inlineToMd(node) {
  const name = node.type;

  if (name === "hard_break") return "  \n";
  if (name === "image") {
    const { alt = "", src = "", title = "" } = node.attrs || {};
    return `![${alt || "图片"}](${src}${title ? ` "${title}"` : ""})`;
  }
  if (name !== "text") {
    // 未知行内节点，退化成文本
    return (node.text || "") || inlineChildren(node);
  }

  let s = node.text || "";
  const marks = node.marks || [];
  const get = (n) => marks.find((m) => m.type === n);

  if (get("code")) s = "`" + s + "`";
  if (get("bold")) s = `**${s}**`;
  if (get("em")) s = `*${s}*`;
  if (get("strikethrough")) s = `~~${s}~~`;
  if (get("underline")) s = `<u>${s}</u>`;
  if (get("highlight")) s = `==${s}==`;
  if (get("superscript")) s = `<sup>${s}</sup>`;
  if (get("subscript")) s = `<sub>${s}</sub>`;

  const color = get("textColor");
  const bg = get("bgColor");
  const fs = get("fontSize");
  if (color || bg || fs) {
    const style = [
      color && `color:${color.attrs.color}`,
      bg && `background-color:${bg.attrs.color}`,
      fs && `font-size:${fs.attrs.size}`,
    ]
      .filter(Boolean)
      .join(";");
    s = `<span style="${style}">${s}</span>`;
  }

  const link = get("link");
  if (link) s = `[${s}](${link.attrs.href || ""})`;

  return s;
}

function inlineChildren(node) {
  if (!Array.isArray(node.content)) return "";
  return node.content.map(inlineToMd).join("");
}

const CALLOUT_LABEL = { info: "NOTE", success: "TIP", warning: "WARNING", danger: "CAUTION" };

function listItemToMd(item, indent, marker) {
  const kids = Array.isArray(item.content) ? item.content : [];
  const pad = " ".repeat(marker.length);
  if (!kids.length) return indent + marker + "\n";

  let out = "";
  kids.forEach((kid, i) => {
    if (i === 0 && (kid.type === "paragraph" || kid.type === "heading")) {
      const body = inlineChildren(kid).replace(/\n+$/, "");
      out += indent + marker + body.split("\n").join("\n" + indent + pad) + "\n";
    } else {
      out += blockToMd(kid, indent + pad);
    }
  });
  return out;
}

function tableToMd(node) {
  const rows = (node.content || []).filter((r) => r.type === "table_row");
  if (!rows.length) return "";
  const grid = rows.map((r) =>
    (r.content || []).map((cell) => inlineChildren(cell).replace(/\|/g, "\\|").replace(/\n+/g, " "))
  );
  const width = Math.max(...grid.map((r) => r.length));
  const pad = (r) => {
    const copy = r.slice();
    while (copy.length < width) copy.push("");
    return copy;
  };
  const head = pad(grid[0]);
  const body = grid.slice(1).map(pad);
  const lines = [
    `| ${head.join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...body.map((r) => `| ${r.join(" | ")} |`),
  ];
  return lines.join("\n") + "\n\n";
}

function blockToMd(node, indent = "") {
  const name = node.type;

  switch (name) {
    case "paragraph": {
      const t = inlineChildren(node);
      if (!t.trim()) return "";
      return indent + t.replace(/\n/g, "\n" + indent) + "\n\n";
    }
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 1));
      return `${indent}${"#".repeat(level)} ${inlineChildren(node)}\n\n`;
    }
    case "code_block": {
      const lang = node.attrs?.language || "";
      const body = node.content ? node.content.map((c) => c.text || "").join("") : "";
      return `${indent}\`\`\`${lang}\n${body}\n\`\`\`\n\n`;
    }
    case "blockquote": {
      const inner = (node.content || []).map((c) => blockToMd(c)).join("").replace(/\n+$/, "");
      return inner
        .split("\n")
        .map((l) => `${indent}> ${l}`.trimEnd())
        .join("\n") + "\n\n";
    }
    case "bullet_list":
    case "ordered_list": {
      const ordered = name === "ordered_list";
      const start = Number(node.attrs?.start) || 1;
      return (
        (node.content || [])
          .map((li, i) => listItemToMd(li, indent, ordered ? `${start + i}. ` : "- ").replace(/\n+$/, "") + "\n")
          .join("") + "\n"
      );
    }
    case "task_list": {
      return (
        (node.content || [])
          .map((li) => {
            const marker = `- [${li.attrs?.checked ? "x" : " "}] `;
            const kids = li.content || [];
            let out = indent + marker + (kids[0] ? inlineChildren(kids[0]) : "") + "\n";
            kids.slice(1).forEach((k) => {
              out += blockToMd(k, indent + "  ");
            });
            return out;
          })
          .join("") + "\n"
      );
    }
    case "table":
      return indent + tableToMd(node);
    case "horizontal_rule":
      return `${indent}---\n\n`;
    case "image": {
      return `${indent}${inlineToMd(node)}\n\n`;
    }
    case "callout": {
      const label = CALLOUT_LABEL[node.attrs?.type] || "NOTE";
      const inner = (node.content || []).map((c) => blockToMd(c)).join("").replace(/\n+$/, "");
      const lines = [`${indent}> [!${label}]`];
      inner.split("\n").forEach((l) => lines.push(`${indent}> ${l}`.trimEnd()));
      return lines.join("\n") + "\n\n";
    }
    case "toggle": {
      const summary = node.attrs?.summary || "折叠内容";
      const inner = (node.content || []).map((c) => blockToMd(c)).join("").replace(/\n+$/, "");
      return `${indent}<details>\n${indent}<summary>${summary}</summary>\n\n${inner}\n\n${indent}</details>\n\n`;
    }
    default:
      return (node.content || []).map((c) => blockToMd(c, indent)).join("");
  }
}

/** 整篇文档 → Markdown */
export function docToMarkdown(docJSON) {
  if (!docJSON) return "";
  return (docJSON.content || [])
    .map((n) => blockToMd(n))
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 整篇文档 → 纯文本（保留段落换行，列表加项目符号） */
export function docToPlainText(docJSON) {
  if (!docJSON) return "";
  const out = [];
  const emit = (node, indent = "") => {
    if (!node) return;
    switch (node.type) {
      case "paragraph":
      case "heading":
        out.push(indent + inlineChildren(node));
        break;
      case "code_block":
        out.push(indent + (node.content || []).map((c) => c.text || "").join(""));
        break;
      case "bullet_list":
      case "ordered_list": {
        const ordered = node.type === "ordered_list";
        (node.content || []).forEach((li, i) => {
          const kids = li.content || [];
          const first = kids[0];
          out.push(indent + (ordered ? `${i + 1}. ` : "• ") + (first ? inlineChildren(first) : ""));
          kids.slice(1).forEach((k) => emit(k, indent + "   "));
        });
        break;
      }
      case "task_list":
        (node.content || []).forEach((li) => {
          const first = (li.content || [])[0];
          out.push(indent + (li.attrs?.checked ? "[x] " : "[ ] ") + (first ? inlineChildren(first) : ""));
        });
        break;
      case "table":
        (node.content || []).forEach((row) => {
          out.push(indent + (row.content || []).map((c) => inlineChildren(c)).join(" | "));
        });
        break;
      case "horizontal_rule":
        out.push(indent + "———");
        break;
      case "image":
        out.push(indent + `[图片] ${node.attrs?.alt || ""} ${node.attrs?.src || ""}`.trim());
        break;
      case "callout":
      case "toggle":
      case "blockquote":
        (node.content || []).forEach((c) => emit(c, indent));
        break;
      case "list_item":
      case "task_item":
        (node.content || []).forEach((c) => emit(c, indent));
        break;
      default:
        (node.content || []).forEach((c) => emit(c, indent));
    }
  };
  (docJSON.content || []).forEach((n) => emit(n));
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** 提取标题大纲 */
export function outlineOf(docJSON) {
  const items = [];
  (docJSON?.content || []).forEach((n) => {
    if (n.type === "heading") {
      const level = Number(n.attrs?.level) || 1;
      const text = inlineChildren(n).trim();
      if (text) items.push({ level, text });
    }
  });
  return items;
}

/* ------------------------------------------------------------------ */
/* 文本清洗小工具                                                       */
/* ------------------------------------------------------------------ */
function normalizeBlankLines(text) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const PUNCT_MAP = [
  [/,/g, "，"],
  [/\./g, "。"],
  [/;/g, "；"],
  [/:/g, "："],
  [/\?/g, "？"],
  [/!/g, "！"],
];

/** 中文语境下的半角标点转全角（不动数字、英文单词、URL、代码） */
function toChinesePunct(text) {
  return text
    .split("\n")
    .map((line) => {
      if (!CJK.test(line)) return line;

      // 先把 URL / 邮箱挖出来占位，避免其中的 : . 被误转
      const tokens = [];
      let out = line.replace(
        /(https?:\/\/[^\s，。；：！？）)】"']+|mailto:[^\s]+|[\w.+-]+@[\w-]+\.[\w.]+)/g,
        (m) => `\u0000${tokens.push(m) - 1}\u0000`
      );

      for (const [re, zh] of PUNCT_MAP) {
        out = out.replace(re, (m, offset, str) => {
          const prev = str[offset - 1] || "";
          const next = str[offset + 1] || "";
          // 数字中的小数点 / 千分位 / 时间冒号不动
          if ((m === "." || m === ":") && /\d/.test(prev) && /\d/.test(next)) return m;
          // 夹在两个英文字母之间（域名、缩写）不动
          if (/[A-Za-z]/.test(prev) && /[A-Za-z]/.test(next)) return m;
          return zh;
        });
      }

      // 还原占位
      return out.replace(/\u0000(\d+)\u0000/g, (m, i) => tokens[Number(i)] ?? m);
    })
    .join("\n");
}

/** 中英文之间插入空格 */
function latinCjkSpace(text) {
  return text
    .split("\n")
    .map((line) => {
      if (!CJK.test(line)) return line;
      return line
        .replace(/([\u4e00-\u9fa5])([A-Za-z0-9])/g, "$1 $2")
        .replace(/([A-Za-z0-9])([\u4e00-\u9fa5])/g, "$1 $2")
        .replace(/([\u4e00-\u9fa5]) {2,}([A-Za-z0-9])/g, "$1 $2")
        .replace(/([A-Za-z0-9]) {2,}([\u4e00-\u9fa5])/g, "$1 $2");
    })
    .join("\n");
}

/** 直引号统一为中文弯引号（按出现顺序成对替换，英文撇号 don't 不动） */
function unifyQuotes(text) {
  let dq = true; // true 表示下一个双引号是开引号
  let sq = true;
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      out += dq ? "“" : "”";
      dq = !dq;
    } else if (ch === "'") {
      const prev = text[i - 1] || "";
      const next = text[i + 1] || "";
      if (/[A-Za-z0-9]/.test(prev) || /[A-Za-z]/.test(next)) {
        out += ch; // don't、it's 这类英文撇号保持原样
        continue;
      }
      out += sq ? "‘" : "’";
      sq = !sq;
    } else {
      out += ch;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 词频（近似）                                                         */
/* ------------------------------------------------------------------ */
const EN_STOP = new Set(
  "the a an and or but if then than that this these those is are was were be been being to of in on at for with by from as it its we you they he she i not no do does did has have had can could should would will may might about into over under more most other some such only own same so too very just also".split(
    " "
  )
);
const CJK_STOP_CHAR = new Set("的了着吗呢吧啊呀哦嗯是在和与及等就也都还很更最又再被把对为以于其之而且或但所以因为如果这那我你他她它们一二三四五六七八九十".split(""));

export function wordFrequency(text, top = 20) {
  const counts = new Map();
  const bump = (w, weight = 1) => {
    if (!w) return;
    counts.set(w, (counts.get(w) || 0) + weight);
  };

  // 英文单词（长度 ≥ 3，去停用词）
  for (const m of text.matchAll(/[A-Za-z][A-Za-z'’-]{2,}/g)) {
    const w = m[0].toLowerCase();
    if (!EN_STOP.has(w)) bump(w);
  }

  // 中文 n-gram：2 字与 3 字滑动窗口（中文无空格，这里做近似统计）
  for (const run of text.match(/[\u4e00-\u9fa5]{2,}/g) || []) {
    for (let i = 0; i + 1 < run.length; i++) {
      const g = run.slice(i, i + 2);
      if ([...g].some((c) => CJK_STOP_CHAR.has(c))) continue;
      bump(g);
    }
    for (let i = 0; i + 2 < run.length; i++) {
      const g = run.slice(i, i + 3);
      if ([...g].some((c) => CJK_STOP_CHAR.has(c))) continue;
      bump(g, 1.4);
    }
  }

  const isCjk = (w) => /^[\u4e00-\u9fa5]+$/.test(w);
  const sortFn = (a, b) => b[1] - a[1] || b[0].length - a[0].length;
  const strong = [...counts.entries()]
    .filter(([w, n]) => (!isCjk(w) ? n >= 2 : w.length === 2 ? n >= 3 : n >= 2))
    .sort(sortFn);

  // 文档较短时放宽二字组门槛，避免结果只剩一两条
  const list =
    strong.length >= 5
      ? strong
      : [
          ...strong,
          ...[...counts.entries()]
            .filter(([w, n]) => isCjk(w) && w.length === 2 && n >= 2 && !strong.some(([sw]) => sw === w))
            .sort(sortFn),
        ];

  // 子串抑制：若某个更长且频次不低的词组已收录，其内部的短片段不再重复展示
  const kept = [];
  for (const [w, n] of list) {
    if (kept.some(([kw, kn]) => kw.length > w.length && kw.includes(w) && kn >= n)) continue;
    kept.push([w, n]);
  }
  return kept.slice(0, top);
}

/* ------------------------------------------------------------------ */
/* 句子级分析（确定性、无噪声）                                          */
/* ------------------------------------------------------------------ */
function splitSentences(text) {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/(?<=[。！？!?；;])|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/* ------------------------------------------------------------------ */
/* 表格 → CSV                                                           */
/* ------------------------------------------------------------------ */
function tableToCsv(tableNode) {
  const rows = (tableNode.content || []).filter((r) => r.type === "table_row");
  const esc = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return rows.map((r) => (r.content || []).map((c) => esc(inlineChildren(c).trim())).join(",")).join("\n");
}

function firstTable(docJSON) {
  let found = null;
  walk(docJSON, (nd) => {
    if (!found && nd.type === "table") found = nd;
  });
  return found;
}

function allTables(docJSON) {
  const list = [];
  walk(docJSON, (nd) => {
    if (nd.type === "table") list.push(nd);
  });
  return list;
}

/* ------------------------------------------------------------------ */
/* 技能定义                                                            */
/* ------------------------------------------------------------------ */
export const CATEGORIES = [
  { key: "clean", name: "文本清洗", desc: "统一空格、标点、空行等格式问题" },
  { key: "structure", name: "结构整理", desc: "目录、排序、去重、编号" },
  { key: "analyze", name: "分析统计", desc: "字数、词频、阅读时长" },
  { key: "convert", name: "格式转换", desc: "导出 Markdown / 纯文本 / CSV" },
];

const needSelection = (ctx) => {
  if (!ctx.hasSelection || !ctx.text.trim()) {
    throw new Error("请先在正文中选中一段文本，再执行这个技能");
  }
  return ctx.text;
};

export const SKILLS = [
  /* ---------------- 文本清洗 ---------------- */
  {
    id: "clean-blank",
    name: "整理空行",
    cat: "clean",
    icon: "lines",
    scope: "selection",
    mode: "replace",
    desc: "把连续空行压成一行，去掉行尾多余空格与首尾空白",
    run: (ctx) => ({ text: normalizeBlankLines(needSelection(ctx)) }),
  },
  {
    id: "clean-trim",
    name: "去行首尾空白",
    cat: "clean",
    icon: "trim",
    scope: "selection",
    mode: "replace",
    desc: "逐行去掉首尾空格与制表符，内容不变",
    run: (ctx) => ({
      text: needSelection(ctx)
        .split("\n")
        .map((l) => l.trim())
        .join("\n"),
    }),
  },
  {
    id: "clean-cn-en",
    name: "中英文加空格",
    cat: "clean",
    icon: "space",
    scope: "selection",
    mode: "replace",
    desc: "在汉字与英文/数字之间插入空格，排版更透气（如「使用 Redis 缓存」）",
    run: (ctx) => ({ text: latinCjkSpace(needSelection(ctx)) }),
  },
  {
    id: "clean-punct",
    name: "标点规范化",
    cat: "clean",
    icon: "punct",
    scope: "selection",
    mode: "replace",
    desc: "中文语境下的半角 , . ; : ? ! 转全角，保留数字小数点与英文缩写",
    run: (ctx) => ({ text: toChinesePunct(needSelection(ctx)) }),
  },
  {
    id: "clean-quotes",
    name: "引号统一",
    cat: "clean",
    icon: "quote",
    scope: "selection",
    mode: "replace",
    desc: "把直引号 \" ' 换成中文弯引号 “ ” ‘ ’",
    run: (ctx) => ({ text: unifyQuotes(needSelection(ctx)) }),
  },
  {
    id: "clean-tight",
    name: "紧凑排版",
    cat: "clean",
    icon: "tight",
    scope: "selection",
    mode: "replace",
    desc: "删除所有空行，适合粘贴公告、说明等短文本",
    run: (ctx) => ({ text: needSelection(ctx).replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim()).join("\n") }),
  },

  /* ---------------- 结构整理 ---------------- */
  {
    id: "struct-toc",
    name: "生成目录",
    cat: "structure",
    icon: "toc",
    scope: "doc",
    mode: "insert",
    desc: "根据文档标题层级生成缩进目录，可插入到光标处",
    run: (ctx) => {
      const heads = outlineOf(ctx.docJSON);
      if (!heads.length) throw new Error("文档里还没有标题（H1–H6），无法生成目录");
      const min = Math.min(...heads.map((h) => h.level));
      return {
        text: heads.map((h) => `${"  ".repeat(h.level - min)}- ${h.text}`).join("\n"),
        note: `共 ${heads.length} 个标题`,
      };
    },
  },
  {
    id: "struct-md-toc",
    name: "生成 Markdown 目录",
    cat: "structure",
    icon: "toc",
    scope: "doc",
    mode: "insert",
    desc: "带 # 号的目录，适合导出到其他平台",
    run: (ctx) => {
      const heads = outlineOf(ctx.docJSON);
      if (!heads.length) throw new Error("文档里还没有标题，无法生成目录");
      return { text: heads.map((h) => `${"#".repeat(Math.min(6, h.level))} ${h.text}`).join("\n") };
    },
  },
  {
    id: "struct-dedupe",
    name: "行去重",
    cat: "structure",
    icon: "dedupe",
    scope: "selection",
    mode: "replace",
    desc: "删除重复行（保留首次出现），适合整理清单",
    run: (ctx) => {
      const seen = new Set();
      const out = [];
      for (const line of needSelection(ctx).split("\n")) {
        const key = line.trim();
        if (!key) {
          out.push(line);
          continue;
        }
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(line);
      }
      return { text: out.join("\n"), note: `原有 ${ctx.text.split("\n").length} 行，去重后 ${out.length} 行` };
    },
  },
  {
    id: "struct-sort",
    name: "行排序",
    cat: "structure",
    icon: "sort",
    scope: "selection",
    mode: "replace",
    desc: "按字符顺序排列每一行（空行忽略）",
    run: (ctx) => ({
      text: needSelection(ctx)
        .split("\n")
        .filter((l) => l.trim())
        .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))
        .join("\n"),
    }),
  },
  {
    id: "struct-number",
    name: "按行加序号",
    cat: "structure",
    icon: "number",
    scope: "selection",
    mode: "replace",
    desc: "给每行加上 1. 2. 3. 的序号",
    run: (ctx) => ({
      text: needSelection(ctx)
        .split("\n")
        .filter((l) => l.trim())
        .map((l, i) => `${i + 1}. ${l.trim()}`)
        .join("\n"),
    }),
  },
  {
    id: "struct-join",
    name: "合并为一段",
    cat: "structure",
    icon: "merge",
    scope: "selection",
    mode: "replace",
    desc: "把多行合成的段落重新接成一段（适合修复 PDF 复制）",
    run: (ctx) => ({
      text: needSelection(ctx)
        .replace(/\r\n?/g, "\n")
        .split(/\n{2,}/)
        .map((para) => para.split("\n").map((l) => l.trim()).filter(Boolean).join(""))
        .filter(Boolean)
        .join("\n\n"),
    }),
  },

  /* ---------------- 分析统计 ---------------- */
  {
    id: "analyze-stats",
    name: "文档统计",
    cat: "analyze",
    icon: "chart",
    scope: "doc",
    mode: "info",
    desc: "字数、段落、标题、列表、表格、图片等结构与体量统计",
    run: (ctx) => {
      const text = ctx.docText || "";
      const { cn, en, total } = countUnits(text);
      const heads = outlineOf(ctx.docJSON);
      const rows = [
        ["字数（中文按字 / 英文按词）", `${total}　（中文 ${cn} · 英文 ${en}）`],
        ["字符数（含空白）", String(text.length)],
        ["段落数", String(countTopLevel(ctx.docJSON, "paragraph"))],
        ["标题数", `${heads.length}　（H1 ${heads.filter((h) => h.level === 1).length} / H2 ${heads.filter((h) => h.level === 2).length} / H3+ ${heads.filter((h) => h.level >= 3).length}）`],
        ["列表", `${countOfType(ctx.docJSON, "bullet_list")} 个无序 · ${countOfType(ctx.docJSON, "ordered_list")} 个有序 · ${countOfType(ctx.docJSON, "task_list")} 个任务`],
        ["表格 / 图片", `${countOfType(ctx.docJSON, "table")} 个表 · ${countOfType(ctx.docJSON, "image")} 张图`],
        ["代码块 / 提示块", `${countOfType(ctx.docJSON, "code_block")} 段代码 · ${countOfType(ctx.docJSON, "callout")} 个提示块`],
        ["预计阅读时长", `${Math.max(1, Math.round(cn / 400 + en / 200))} 分钟`],
      ];
      return {
        text: rows.map(([k, v]) => `${k}\n  ${v}`).join("\n"),
        note: "口径：中文 400 字/分钟，英文 200 词/分钟",
      };
    },
  },
  {
    id: "analyze-freq",
    name: "高频词组",
    cat: "analyze",
    icon: "freq",
    scope: "doc",
    mode: "info",
    desc: "按 2–3 字滑动窗口统计全文高频词组（近似分词，已滤虚词与碎片）",
    run: (ctx) => {
      const rows = wordFrequency(ctx.docText || "", 20);
      if (!rows.length) throw new Error("文档内容太少，统计不出有效词组（同一词组需出现 2 次以上）");
      return {
        text: rows.map(([w, n], i) => `${String(i + 1).padStart(2, " ")}. ${w}　×${Math.round(n)}`).join("\n"),
        note: "中文按字组近似统计，用于快速判断主题分布，不等同于分词结果",
      };
    },
  },
  {
    id: "analyze-longsent",
    name: "长句检查",
    cat: "analyze",
    icon: "ruler",
    scope: "doc",
    mode: "info",
    desc: "找出超过 60 字仍未断句的句子，帮助改善可读性",
    run: (ctx) => {
      const sentences = splitSentences(ctx.docText || "");
      const long = sentences
        .map((s, i) => ({ s, i, len: countUnits(s).total }))
        .filter((x) => x.len >= 60)
        .sort((a, b) => b.len - a.len);
      if (!sentences.length) throw new Error("文档里没有可分析的句子");
      if (!long.length) {
        return { text: `共 ${sentences.length} 句，没有超过 60 字的长句 👍`, note: "长句判定阈值：60 字" };
      }
      return {
        text:
          `共 ${sentences.length} 句，其中 ${long.length} 句超过 60 字：\n\n` +
          long
            .slice(0, 15)
            .map((x, i) => `${i + 1}. （${x.len} 字）${x.s.slice(0, 46)}${x.s.length > 46 ? "…" : ""}`)
            .join("\n"),
        note: "长句判定阈值：60 字（中文按字 / 英文按词）",
      };
    },
  },
  {
    id: "analyze-dup",
    name: "重复句检测",
    cat: "analyze",
    icon: "dedupe",
    scope: "doc",
    mode: "info",
    desc: "找出全文重复出现的句子，清理抄写与复制粘贴的残留",
    run: (ctx) => {
      const map = new Map();
      for (const s of splitSentences(ctx.docText || "")) {
        const key = s.replace(/[\s，。、；：！？,.;:!?"'“”‘’()（）]/g, "");
        if (key.length < 8) continue;
        const hit = map.get(key) || { text: s, count: 0 };
        hit.count++;
        map.set(key, hit);
      }
      const dups = [...map.values()].filter((x) => x.count > 1).sort((a, b) => b.count - a.count);
      if (!dups.length) return { text: "未发现重复句子 👍" };
      return {
        text:
          `发现 ${dups.length} 处重复：\n\n` +
          dups
            .slice(0, 15)
            .map((x, i) => `${i + 1}. ×${x.count}　${x.text.slice(0, 46)}${x.text.length > 46 ? "…" : ""}`)
            .join("\n"),
        note: "忽略标点与空白差异，仅比较 8 字以上的句子",
      };
    },
  },
  {
    id: "analyze-toc",
    name: "结构大纲",
    cat: "analyze",
    icon: "outline",
    scope: "doc",
    mode: "info",
    desc: "按层级列出所有标题，检查结构是否完整",
    run: (ctx) => {
      const heads = outlineOf(ctx.docJSON);
      if (!heads.length) throw new Error("文档里还没有标题");
      const min = Math.min(...heads.map((h) => h.level));
      return {
        text: heads
          .map((h) => `${"  ".repeat(h.level - min)}H${h.level}  ${h.text}`)
          .join("\n"),
        note: `共 ${heads.length} 个标题，最深 H${Math.max(...heads.map((h) => h.level))}`,
      };
    },
  },

  /* ---------------- 格式转换 ---------------- */
  {
    id: "convert-markdown",
    name: "导出 Markdown",
    cat: "convert",
    icon: "markdown",
    scope: "doc",
    mode: "download",
    desc: "把整篇文档转成 Markdown（保留下标、引用、表格、折叠块等结构）",
    run: (ctx) => {
      const md = docToMarkdown(ctx.docJSON);
      if (!md.trim()) throw new Error("文档是空的，没有可导出的内容");
      return { text: md, ext: "md", mime: "text/markdown;charset=utf-8" };
    },
  },
  {
    id: "convert-text",
    name: "导出纯文本",
    cat: "convert",
    icon: "text",
    scope: "doc",
    mode: "download",
    desc: "去掉所有格式，只保留文字与基本缩进",
    run: (ctx) => {
      const t = docToPlainText(ctx.docJSON);
      if (!t.trim()) throw new Error("文档是空的，没有可导出的内容");
      return { text: t, ext: "txt", mime: "text/plain;charset=utf-8" };
    },
  },
  {
    id: "convert-csv",
    name: "表格转 CSV",
    cat: "convert",
    icon: "table",
    scope: "doc",
    mode: "download",
    desc: "把文档里第一个表格导出为 CSV，可直接用 Excel 打开",
    run: (ctx) => {
      const tables = allTables(ctx.docJSON);
      if (!tables.length) throw new Error("文档里没有表格");
      return {
        text: tableToCsv(tables[0]),
        ext: "csv",
        mime: "text/csv;charset=utf-8",
        note: tables.length > 1 ? `文档共 ${tables.length} 个表格，已导出第 1 个` : "",
      };
    },
  },
  {
    id: "convert-json",
    name: "导出文档 JSON",
    cat: "convert",
    icon: "json",
    scope: "doc",
    mode: "download",
    desc: "原始 ProseMirror 结构，用于备份或迁移到其他编辑器",
    run: (ctx) => ({ text: JSON.stringify(ctx.docJSON, null, 2), ext: "json", mime: "application/json" }),
  },
];

export const SKILL_MAP = new Map(SKILLS.map((s) => [s.id, s]));

/** 供面板做搜索/分类过滤 */
export function filterSkills(keyword = "", cat = "all") {
  const kw = keyword.trim().toLowerCase();
  return SKILLS.filter((s) => {
    if (cat !== "all" && s.cat !== cat) return false;
    if (!kw) return true;
    return (
      s.name.toLowerCase().includes(kw) ||
      s.desc.toLowerCase().includes(kw) ||
      s.id.includes(kw)
    );
  });
}
