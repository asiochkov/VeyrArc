import { useEffect, useLayoutEffect, useState } from 'react';
import { create } from 'zustand';
import { setProfile } from '../data/settings';
import { useT } from '../i18n';
import { useAuth } from '../lib/auth';
import { hasBackend } from '../lib/supabase';
import s from './tour.module.css';

/*
 * Coach-mark tours (Master Changeset A9 / task 24): 1–3 steps per screen, shown once.
 * A step points at an element with `data-tour="<id>"`; a missing element is skipped.
 * Done flags live on the device and in profiles.tour_done; «?» in the palette replays a tour.
 */
export type TourId = 'today' | 'disciplines' | 'analytics';
export const TOURS: Record<TourId, string[]> = {
  today: ['today-score', 'today-now', 'today-core'],
  disciplines: ['disc-core', 'disc-extra'],
  analytics: ['an-index'],
};
const KEY = 'veyrarc.tours';
const readDone = (): Record<string, boolean> => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; } };

export const useTour = create<{ id: TourId | null; step: number; start: (id: TourId) => void; next: () => void; stop: () => void }>((set, get) => ({
  id: null, step: 0,
  start: (id) => set({ id, step: 0 }),
  next: () => { const { id, step } = get(); if (id && step + 1 < TOURS[id].length) set({ step: step + 1 }); else get().stop(); },
  stop: () => {
    const { id } = get();
    if (id) {
      const done = { ...readDone(), [id]: true };
      try { localStorage.setItem(KEY, JSON.stringify(done)); } catch { /* storage off */ }
      const p = useAuth.getState().profile;
      if (hasBackend && p && !p.tour_done?.[id]) setProfile({ tour_done: { ...(p.tour_done ?? {}), [id]: true } });
    }
    set({ id: null, step: 0 });
  },
}));

/** Starts the screen's tour once, after its content is on screen. */
export function useAutoTour(id: TourId, ready: boolean) {
  const profileDone = useAuth((x) => !!x.profile?.tour_done?.[id]);
  useEffect(() => {
    if (!ready || profileDone || readDone()[id] || navigator.webdriver) return;
    const tm = setTimeout(() => { if (!useTour.getState().id) useTour.getState().start(id); }, 700);
    return () => clearTimeout(tm);
  }, [id, ready, profileDone]);
}

export function TourOverlay() {
  const t = useT();
  const { id, step, next, stop } = useTour();
  const [rect, setRect] = useState<DOMRect | null>(null);
  const target = id ? TOURS[id][step] : null;

  useLayoutEffect(() => {
    if (!target) { setRect(null); return; }
    const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
    if (!el) { next(); return; }
    el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
    const upd = () => setRect(el.getBoundingClientRect());
    upd();
    window.addEventListener('resize', upd);
    window.addEventListener('scroll', upd, true);
    return () => { window.removeEventListener('resize', upd); window.removeEventListener('scroll', upd, true); };
  }, [target, next]);
  useEffect(() => {
    if (!id) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') stop(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [id, stop]);

  if (!id || !target || !rect) return null;
  const pad = 6;
  const below = rect.bottom + 180 < window.innerHeight;
  const total = TOURS[id].length;
  return (
    <div className={s.layer} role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div className={s.hole} style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      <div className={s.card} style={below ? { top: rect.bottom + 14 } : { bottom: window.innerHeight - rect.top + 14 }}>
        <div className={s.count}>{step + 1} / {total}</div>
        <div id="tour-title" className={s.title}>{t(`tour.${target}.title` as never)}</div>
        <div className={s.body}>{t(`tour.${target}.body` as never)}</div>
        <div className={s.actions}>
          <button type="button" className={s.skip} onClick={stop}>{t('tour.skip')}</button>
          <button type="button" className={s.next} onClick={next} autoFocus>{step + 1 < total ? t('tour.next') : t('tour.done')}</button>
        </div>
      </div>
    </div>
  );
}
