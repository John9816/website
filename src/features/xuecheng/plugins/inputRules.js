/**
 * Markdown 风格的输入规则 —— 让写作不必离开键盘
 * 触发时机：在行内输入规则末尾字符时自动转换
 */
import {
  inputRules,
  wrappingInputRule,
  textblockTypeInputRule,
  InputRule,
} from "prosemirror-inputrules";
import { schema } from "../schema.js";
import { safeUrl } from '../editor/commands.js';

/**
 * 行内 mark 的输入规则（ProseMirror 官方未提供，Tiptap 的同名 API 不能直接用）
 * 命中的第 1 个捕获组视为要加样式的文本
 */
function markInputRule(regexp, markType, getAttrs) {
  return new InputRule(regexp, (state, match, start, end) => {
    const content = match[1];
    if (!content) return null;
    const attrs = getAttrs ? getAttrs(match) : null;
    const offset = match[0].indexOf(content);
    if (offset < 0) return null;
    const delimiterLength = match[0].length - offset - content.length;
    const from = start + Math.max(0, offset - delimiterLength);
    const tr = state.tr;
    // The final typed delimiter is not in the document yet. Remove only the
    // existing delimiters, retaining the text and its other marks exactly once.
    tr.delete(start + offset + content.length, end);
    tr.delete(from, start + offset);
    tr.addMark(from, from + content.length, markType.create(attrs));
    tr.removeStoredMark(markType);
    return tr;
  });
}

export function buildInputRules() {
  const rules = [];

  /* 标题：# / ## / ### */
  const headingRule = textblockTypeInputRule(/^(#{1,6})\s$/, schema.nodes.heading, (match) => ({
    level: match[1].length,
  }));
  rules.push(headingRule);

  /* 引用：> */
  rules.push(wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote));

  /* 无序列表：- / * / + */
  rules.push(wrappingInputRule(/^\s*([-+*])\s$/, schema.nodes.bullet_list));

  /* 有序列表：1. */
  rules.push(
    wrappingInputRule(
      /^(\d+)\.\s$/,
      schema.nodes.ordered_list,
      (match) => ({ order: Number(match[1]) }),
      (match, node) => node.childCount + node.attrs.order === Number(match[1])
    )
  );

  /* 代码块：```js */
  rules.push(
    textblockTypeInputRule(/^```([a-zA-Z0-9+#._-]*)\s$/, schema.nodes.code_block, (match) => ({
      language: match[1] || "",
    }))
  );

  /* 行内样式：**粗** / *斜* / `代码` / ~~删除~~ */
  rules.push(markInputRule(/(?:\*\*|__)([^*_]+)(?:\*\*|__)$/, schema.marks.strong));
  rules.push(markInputRule(/(?:^|[^*])\*([^*]+)\*$/, schema.marks.em));
  rules.push(markInputRule(/(?:^|[^_])_([^_]+)_$/, schema.marks.em));
  rules.push(markInputRule(/(?:`)([^`]+)(?:`)$/, schema.marks.code));
  rules.push(markInputRule(/(?:~~)([^~]+)(?:~~)$/, schema.marks.strikethrough));

  /* 分割线：--- */
  rules.push(
    new InputRule(/^---$/, (state, _match, start, end) => {
      const { tr } = state;
      tr.delete(start, end);
      tr.replaceWith(start, start, schema.nodes.horizontal_rule.create());
      return tr;
    })
  );

  /* 链接：[文字](url) */
  rules.push(
    new InputRule(/\[([^\]]+)\]\(([^)]+)\)$/, (state, match, start, end) => {
      if (!safeUrl(match[2])) return null;
      const { tr } = state;
      tr.delete(start, end);
      tr.insertText(match[1], start);
      tr.addMark(start, start + match[1].length, schema.marks.link.create({ href: match[2] }));
      return tr;
    })
  );

  return inputRules({ rules });
}
