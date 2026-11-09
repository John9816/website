import { useLayoutEffect, useRef, useState } from 'react';
import * as cmd from './commands.js';
import { shortcutHelp, shortcutLabel } from './actions.js';

const focusable = element => [...element.querySelectorAll('button:not(:disabled), input, select')];
export function Dropdown({ label, title, active, disabled, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null), panel = useRef(null), keyboard = useRef(false);
  const close = () => setOpen(false);
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = ref.current.firstElementChild, menu = panel.current;
    const rect = trigger.getBoundingClientRect(), bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - bounds.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(rect.bottom + 4, innerHeight - bounds.height - 8))}px`;
    focusable(menu).forEach(button => { button.setAttribute('role', 'menuitem'); button.tabIndex = -1; });
    if (keyboard.current) focusable(menu)[0]?.focus({ preventScroll: true });
    window.dispatchEvent(new CustomEvent('xc-dropdown-open', { detail: ref.current }));
    const outside = event => { if (!ref.current?.contains(event.target)) close(); };
    const other = event => { if (event.detail !== ref.current) close(); };
    const scroll = event => { if (!menu.contains(event.target)) close(); };
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('xc-dropdown-open', other);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('xc-dropdown-open', other);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);
  return <div className="dd" ref={ref} onKeyDown={event => {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); close(); ref.current.firstElementChild.focus();
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      const items = focusable(panel.current), index = items.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus({ preventScroll: true }); items[next]?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Tab') close();
  }}>
    <button type="button" className={'tb-btn dd-trigger' + (active ? ' active' : '') + (open ? ' open' : '')}
      aria-label={title} aria-haspopup="menu" aria-expanded={open} disabled={disabled} data-tip={title}
      onClick={event => { keyboard.current = event.detail === 0; setOpen(value => !value); }}
      onKeyDown={event => { if (['ArrowDown', 'ArrowUp'].includes(event.key) && !open) { event.preventDefault(); event.stopPropagation(); keyboard.current = true; setOpen(true); } }}>
      {label}
    </button>
    {open && <div ref={panel} className="dd-panel" role="menu" aria-label={title}>{typeof children === 'function' ? children(close) : children}</div>}
  </div>;
}

export function toolbarNavigation(event, view) {
  if (event.target.closest('.dd-panel') || !event.target.matches('button')) return;
  if (event.key === 'Escape') { event.preventDefault(); view?.focus(); return; }
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const items = focusable(event.currentTarget).filter(el => !el.closest('.dd-panel'));
  const index = items.indexOf(event.target);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
  items[next]?.focus();
}

export function EditorDialog({ dialog, viewRef, onClose }) {
  const ref = useRef(null);
  const [value, setValue] = useState(dialog.value || '');
  const [error, setError] = useState('');
  useLayoutEffect(() => {
    const modal = ref.current;
    modal.showModal();
    return () => { modal.close(); if (!viewRef.current?.isDestroyed) viewRef.current?.focus(); };
  }, []);
  const title = dialog.type === 'help' ? '快捷键速查' : dialog.type === 'link' ? '编辑链接' : dialog.replace ? '替换图片' : '插入图片';
  const apply = event => {
    event.preventDefault();
    const view = viewRef.current;
    if (!view || view.isDestroyed || view.state.doc !== dialog.doc) { setError('文档已变化，请关闭后重试'); return; }
    const url = value.trim();
    if (!cmd.safeUrl(url, dialog.type === 'image')) { setError('请输入有效的 HTTP、HTTPS 或站内地址'); return; }
    view.dispatch(view.state.tr.setSelection(dialog.selection));
    const ok = dialog.type === 'link' ? cmd.setLink(view, url) : dialog.replace ? cmd.replaceImage(view, url) : cmd.insertImage(view, url);
    if (!ok) { setError('当前位置不能执行此操作，请在正文中重新选择位置'); return; }
    onClose();
  };
  return <dialog ref={ref} className="xc-editor-dialog" aria-label={title} onCancel={onClose}
    onClick={event => { if (event.target === ref.current) { const r = ref.current.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) onClose(); } }}>
    <div className="xc-dialog-heading"><h2>{title}</h2><button type="button" aria-label="关闭弹窗" onClick={onClose}>×</button></div>
    {dialog.type === 'help' ? <>
      <p>在正文中使用；按 Alt+F10 进入工具栏，方向键移动，Esc 返回正文。</p>
      <div className="xc-shortcut-list">{shortcutHelp.map(item => <div key={item.label}><span>{item.label}</span><kbd>{shortcutLabel(item.shortcut)}</kbd></div>)}</div>
    </> : <form onSubmit={apply}>
      <label htmlFor="xc-editor-url">{dialog.type === 'link' ? '链接地址' : '图片地址'}</label>
      <input id="xc-editor-url" autoFocus value={value} onChange={event => { setValue(event.target.value); setError(''); }} placeholder="https://" autoComplete="off" />
      <p>{dialog.type === 'link' ? '选中文字后设置链接；光标位于现有链接内时可直接修改。' : '支持网络图片地址；也可以在正文中直接粘贴图片。'}</p>
      {error && <p className="xc-dialog-error" role="alert">{error}</p>}
      <div className="xc-dialog-actions">
        {dialog.type === 'link' && dialog.value && <button type="button" onClick={() => {
          const view = viewRef.current;
          if (!view || view.state.doc !== dialog.doc) { setError('文档已变化，请关闭后重试'); return; }
          view.dispatch(view.state.tr.setSelection(dialog.selection)); cmd.setLink(view, ''); onClose();
        }}>移除链接</button>}
        <button type="button" onClick={onClose}>取消</button><button type="submit" className="primary">应用</button>
      </div>
    </form>}
  </dialog>;
}
