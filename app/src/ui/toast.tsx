import { create } from 'zustand';
import { useT } from '../i18n';
import { Icon } from './Icon';
import s from './ui.module.css';

/* One toast system for the whole app: success / error / info, optional action (e.g. «Отменить»). */
export type ToastKind = 'success' | 'error' | 'info';
type Toast = { id: number; kind: ToastKind; text: string; action?: { label: string; run: () => void }; ms: number; leaving?: boolean };
type Store = { list: Toast[]; show: (t: Omit<Toast, 'id' | 'ms'> & { ms?: number }) => number; hide: (id: number) => void };

let seq = 0;
const timers = new Map<number, ReturnType<typeof setTimeout>>();
export const useToasts = create<Store>((set, get) => ({
  list: [],
  show: (t) => {
    const id = ++seq;
    // errors stay longer: they matter; an identical message replaces the previous one
    const ms = t.ms ?? (t.kind === 'error' ? 6000 : 3500);
    set({ list: [...get().list.filter((x) => x.text !== t.text), { ...t, id, ms }].slice(-3) });
    timers.set(id, setTimeout(() => get().hide(id), ms));
    return id;
  },
  // leaving plays a short exit before the toast is removed
  hide: (id) => {
    clearTimeout(timers.get(id)); timers.delete(id);
    if (!get().list.some((x) => x.id === id && !x.leaving)) return;
    set({ list: get().list.map((x) => (x.id === id ? { ...x, leaving: true } : x)) });
    setTimeout(() => set({ list: get().list.filter((x) => x.id !== id) }), 220);
  },
}));

export const toast = {
  success: (text: string, ms?: number) => useToasts.getState().show({ kind: 'success', text, ms }),
  error: (text: string, ms?: number) => useToasts.getState().show({ kind: 'error', text, ms }),
  info: (text: string, ms?: number) => useToasts.getState().show({ kind: 'info', text, ms }),
  action: (text: string, label: string, run: () => void, ms = 6000) => useToasts.getState().show({ kind: 'info', text, action: { label, run }, ms }),
  hide: (id: number) => useToasts.getState().hide(id),
};

const ICON = { success: 'check', error: 'alert', info: 'bell' } as const;

export function Toaster() {
  const t = useT();
  const list = useToasts((x) => x.list);
  const hide = useToasts((x) => x.hide);
  if (!list.length) return null;
  return (
    <div className={s.toaster} aria-live="polite">
      {list.map((x) => (
        <div key={x.id} className={s.toast} data-kind={x.kind} data-leaving={!!x.leaving} role={x.kind === 'error' ? 'alert' : 'status'}
          onTouchStart={(e) => { (e.currentTarget as HTMLElement).dataset.y0 = String(e.touches[0].clientY); }}
          onTouchMove={(e) => { const el = e.currentTarget as HTMLElement; const dy = e.touches[0].clientY - Number(el.dataset.y0 ?? 0); if (dy > 0) { el.style.transform = `translateY(${dy}px)`; el.style.opacity = String(Math.max(0, 1 - dy / 90)); } }}
          onTouchEnd={(e) => { const el = e.currentTarget as HTMLElement; const dy = parseFloat(el.style.transform.replace(/[^\d.-]/g, '') || '0'); if (dy > 40) hide(x.id); else { el.style.transform = ''; el.style.opacity = ''; } }}>
          <span className={s.toastIcon} aria-hidden="true"><Icon name={ICON[x.kind]} size={15} sw={2.4} /></span>
          <span className={s.toastText}>{x.text}</span>
          {x.action && <button type="button" className={s.toastAction} onClick={() => { x.action!.run(); hide(x.id); }}>{x.action.label}</button>}
          <button type="button" className={s.toastClose} onClick={() => hide(x.id)} aria-label={t('common.close')}><Icon name="close" size={13} sw={2.2} /></button>
        </div>
      ))}
    </div>
  );
}
