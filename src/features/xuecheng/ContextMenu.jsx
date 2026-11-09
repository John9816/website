import { useLayoutEffect, useRef } from 'react';

export function contextMenuAt(event, label, items, restoreFocus) {
  event.preventDefault();
  event.stopPropagation();
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    label, items, restoreFocus,
    x: event.clientX || rect.left + 12,
    y: event.clientY || rect.top + 12,
  };
}

export default function ContextMenu({ menu, onClose, onError }) {
  const ref = useRef(null);
  const callbacks = useRef({ onClose, onError });
  callbacks.current = { onClose, onError };

  useLayoutEffect(() => {
    if (!menu) return;
    const el = ref.current;
    const rect = el.getBoundingClientRect();
    el.style.left = `${Math.max(8, Math.min(menu.x, innerWidth - rect.width - 8))}px`;
    el.style.top = `${Math.max(8, Math.min(menu.y, innerHeight - rect.height - 8))}px`;
    el.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
    const outside = event => {
      if (!(event.target instanceof Node) || !el.contains(event.target)) {
        callbacks.current.onClose();
        if (event.type === 'scroll') menu.restoreFocus?.();
      }
    };
    const close = () => callbacks.current.onClose();
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('scroll', outside, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('scroll', outside, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  }, [menu]);

  if (!menu) return null;
  const dismiss = () => { onClose(); menu.restoreFocus?.(); };
  return (
    <div ref={ref} className="xc-context-menu" role="menu" aria-label={menu.label}
      style={{ left: menu.x, top: menu.y }}
      onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}
      onKeyDown={event => {
        if (event.key === 'Escape' || event.key === 'Tab') {
          event.preventDefault(); event.stopPropagation(); dismiss();
        } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault(); event.stopPropagation();
          const buttons = [...ref.current.querySelectorAll('button:not(:disabled)')];
          const index = buttons.indexOf(document.activeElement);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
            : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next]?.focus({ preventScroll: true });
          buttons[next]?.scrollIntoView({ block: 'nearest' });
        }
      }}
    >
      {menu.items.map((item, i) => item ? (
        <button key={item.label} type="button" role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
          aria-label={item.label} aria-checked={item.checked} disabled={item.disabled}
          className={item.danger ? 'danger' : undefined}
          onClick={() => {
            dismiss();
            try {
              Promise.resolve(item.run()).catch(error => callbacks.current.onError?.(error.message));
            } catch (error) { callbacks.current.onError?.(error.message); }
          }}
        ><span className="xc-menu-check" aria-hidden="true">{item.checked ? '✓' : ''}</span><span>{item.label}</span>{item.shortcut && <kbd>{item.shortcut}</kbd>}</button>
      ) : <div key={i} role="separator" className="xc-context-separator" />)}
    </div>
  );
}
