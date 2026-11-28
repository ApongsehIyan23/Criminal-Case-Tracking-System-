// A small dropdown menu for the Sort, Filter and row action buttons. It is drawn
// on the page body, so the table's rounded card cannot clip it.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const GAP = 4;

// `children` receives `close` and renders the MenuItem list.
export default function Menu({ label, buttonClassName, button, children }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  const panel = useRef(null);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }, []);

  // Under the button and aligned to its right edge; above it when there is no room.
  useLayoutEffect(() => {
    if (!open) return;
    const anchor = trigger.current.getBoundingClientRect();
    const box = panel.current;
    const below = anchor.bottom + GAP;
    const fits = below + box.offsetHeight <= window.innerHeight;
    box.style.top = `${fits ? below : Math.max(GAP, anchor.top - GAP - box.offsetHeight)}px`;
    box.style.left = `${Math.max(GAP, anchor.right - box.offsetWidth)}px`;
    box.querySelector('[role^=menuitem]')?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (event) => {
      if (!panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) close(false);
    };
    const moved = () => close(false);
    document.addEventListener('mousedown', outside);
    window.addEventListener('resize', moved);
    window.addEventListener('scroll', moved);
    return () => {
      document.removeEventListener('mousedown', outside);
      window.removeEventListener('resize', moved);
      window.removeEventListener('scroll', moved);
    };
  }, [open, close]);

  function keys(event) {
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      close();
      return;
    }
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    const items = [...panel.current.querySelectorAll('[role^=menuitem]')];
    const step = event.key === 'ArrowDown' ? 1 : -1;
    items[(items.indexOf(document.activeElement) + step + items.length) % items.length]?.focus();
  }

  return (
    <>
      <button ref={trigger} type="button" className={buttonClassName} aria-haspopup="menu" aria-expanded={open}
        aria-label={label} title={label} onClick={() => setOpen(!open)}>
        {button}
      </button>
      {open && createPortal(
        <div ref={panel} role="menu" aria-label={label} tabIndex={-1} onKeyDown={keys}
          className="fixed z-30 min-w-52 rounded-lg border border-[#e5e7eb] bg-white py-1 font-['Inter_Variable',Inter,sans-serif] shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
          {children(close)}
        </div>,
        document.body,
      )}
    </>
  );
}

// `checked` turns the item into a choice that shows a tick when selected.
export function MenuItem({ checked, onSelect, children }) {
  const choice = checked !== undefined;
  return (
    <button type="button" role={choice ? 'menuitemradio' : 'menuitem'} aria-checked={choice ? checked : undefined}
      tabIndex={-1} onClick={onSelect}
      className="flex w-full items-center justify-between gap-6 px-3.5 py-2 text-left text-[13px] text-[#374151] hover:bg-[#f3f4f6] focus:bg-[#f3f4f6] focus:outline-none">
      {children}
      {checked && <span aria-hidden="true" className="font-semibold text-[#1a1a1a]">✓</span>}
    </button>
  );
}

export const MenuHeading = ({ children }) => (
  <p role="presentation" className="px-3.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">
    {children}
  </p>
);
