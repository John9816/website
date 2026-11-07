const nodes = new Set(['doc', 'paragraph', 'heading', 'text', 'blockquote', 'code_block', 'horizontal_rule', 'hard_break', 'image', 'bullet_list', 'ordered_list', 'list_item', 'task_list', 'task_item', 'table', 'table_row', 'table_cell', 'table_header', 'callout', 'toggle'])
const marks = new Set(['link', 'em', 'strong', 'code', 'underline', 'strikethrough', 'highlight', 'textColor', 'bgColor', 'superscript', 'subscript', 'fontSize'])
function invalid(message) { throw Object.assign(new Error(message), { status: 400 }) }
export function validateContent(content) {
  if (content == null) return
  if (content.type !== 'doc') invalid('文档内容格式不正确')
  if (JSON.stringify(content).length > 2 * 1024 * 1024) invalid('文档内容不能超过 2MB')
  let count = 0
  const walk = (node, depth, mark = false) => {
    if (!node || typeof node !== 'object' || Array.isArray(node) || depth > 60 || ++count > 50000) invalid('文档结构过于复杂')
    if (!(mark ? marks : nodes).has(node.type)) invalid('文档包含不支持的节点')
    if (node.text !== undefined && typeof node.text !== 'string') invalid('文本格式不正确')
    if (node.attrs) {
      if (typeof node.attrs !== 'object' || Array.isArray(node.attrs)) invalid('节点属性格式不正确')
      for (const [key, value] of Object.entries(node.attrs)) {
        if (value && typeof value === 'object' && !(key === 'colwidth' && Array.isArray(value) && value.every(n => Number.isFinite(n) && n >= 0))) invalid('节点属性格式不正确')
        if (key === 'href' || key === 'src') {
          if (typeof value !== 'string' || /[\u0000-\u0020\u007f]/.test(value)) invalid('链接地址无效')
          const safe = /^https?:\/\//i.test(value) || /^\/(?!\/)/.test(value) || (key === 'href' && /^(mailto:|tel:|#)/i.test(value))
          if (!safe) invalid('链接只支持 HTTP、HTTPS 或站内地址')
        }
      }
      if (node.type === 'heading' && (!Number.isInteger(node.attrs.level) || node.attrs.level < 1 || node.attrs.level > 6)) invalid('标题级别无效')
    }
    if (node.content !== undefined) {
      if (!Array.isArray(node.content)) invalid('文档结构不正确')
      for (const child of node.content) walk(child, depth + 1)
    }
    if (node.marks !== undefined) {
      if (!Array.isArray(node.marks)) invalid('文字样式格式不正确')
      for (const m of node.marks) walk(m, depth + 1, true)
    }
  }
  walk(content, 0)
}
