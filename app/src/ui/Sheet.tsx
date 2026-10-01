import { useEffect, useRef, type ReactNode, type TouchEvent } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';
import { useIsDesktop } from '../lib/useIsDesktop';
import { Icon } from './Icon';
import s from './sheet.module.css';

/*
 * The main modal pattern (Master Changeset §16): a bottom sheet on mobile (grabber, swipe down
 * to close, backdrop blocks the page), a centered panel on desktop. Esc closes on both.
 */
export function Sheet({ open, onClose, title, children, size = 'auto', label }: {
  open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; size?: 'auto' | 'full'; label?: string;
}) {
  const t = useT();
  const desktop = useIsDesktop();
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y0: number; dy: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, onClose]);
  if (!open) return null;

  const onStart = (e: TouchEvent) => {
    if ((panel.current?.scrollTop ?? 0) > 0) return;
    drag.current = { y0: e.touches[0].clientY, dy: 0 };
  };
  const onMove = (e: TouchEvent) => {
    const d = drag.current;
    if (!d || !panel.current) return;
    d.dy = Math.max(0, e.touches[0].clientY - d.y0);
    panel.current.style.transform = `translateY(${d.dy}px)`;
  };
  const onEnd = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !panel.current) return;
    if (d.dy > panel.current.offsetHeight * 0.3) onClose();
    else panel.current.style.transform = '';
  };

  return createPortal(
    <div className={s.backdrop} data-desktop={desktop} onClick={onClose}>
      <div ref={panel} className={s.panel} data-size={size} role="dialog" aria-modal="true" aria-label={label ?? (typeof title === 'string' ? title : undefined)}
        onClick={(e) => e.stopPropagation()} onTouchStart={desktop ? undefined : onStart} onTouchMove={desktop ? undefined : onMove} onTouchEnd={desktop ? undefined : onEnd}>
        {!desktop && <div className={s.grabber} aria-hidden="true" />}
        {title !== undefined && (
          <div className={s.head}>
            <div className={s.title}>{title}</div>
            <button type="button" className={s.close} onClick={onClose} aria-label={t('common.close')}><Icon name="close" size={14} sw={2} /></button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
