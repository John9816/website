/**
 * 模板内容构造（零依赖）
 * ------------------------------------------------------------------
 * 从 TemplateUI.jsx 拆出：App 的 createFromTemplate 只需要这个纯函数，
 * 若从 TemplateUI 引入会连带把 ProseMirror 只读预览拉进主包。
 * 模板自身的 build() 依赖 schema，但只有在真正调用 tplContent 时才需要，
 * 而模板数据本身已经是按需加载的。
 */
export function tplContent(tpl) {
  if (!tpl) return null;
  if (typeof tpl.build === "function") return tpl.build();
  return tpl.content || null;
}
