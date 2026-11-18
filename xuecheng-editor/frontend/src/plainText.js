/**
 * 轻量纯文本提取（零依赖）
 * ------------------------------------------------------------------
 * 从 skills.js 中拆出：App 首屏只需要 docToPlainText 做 AI 上下文与字数统计，
 * 若直接从 skills.js 引入会把整套技能库（以及它的 ProseMirror 转换链）拉进主包。
 * 这里保持与 skills.js 中原来的实现完全一致，输出行为不变。
 */
export function inlineToMd(node) {
  const name = node.type;

  if (name === "hard_break") return "  \n";
  if (name === "image") {
    const { alt = "", src = "", title = "" } = node.attrs || {};
    return `![${alt || "图片"}](${src}${title ? ` "${title}"` : ""})`;
  }
  if (name !== "text") {
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

export function inlineChildren(node) {
  if (!Array.isArray(node.content)) return "";
  return node.content.map(inlineToMd).join("");
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
