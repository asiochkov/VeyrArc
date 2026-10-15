import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../../i18n';
import { haptic } from '../../lib/haptics';
import s from './milestone.module.css';

/*
 * A streak milestone as a moment (audit 1.15.1 / 2.9 peak-end): the number counts up, the arc
 * draws, one sentence, the promise. Shown once per milestone per arc.
 */
export const MILESTONES = [3, 7, 14, 21, 30, 45, 60, 90];
const key = (arc: string, n: number) => `veyrarc.ms.${arc}.${n}`;
export const milestoneSeen = (arc: string, n: number) => { try { return localStorage.getItem(key(arc, n)) === '1'; } catch { return true; } };
const markSeen = (arc: string, n: number) => { try { localStorage.setItem(key(arc, n), '1'); } catch { /* no storage */ } };

export function Milestone({ n, arcId, oath, length, onClose }: { n: number; arcId: string; oath: string | null; length: number; onClose: () => void }) {
  const t = useT();
  const [shown, setShown] = useState(0);
  const [title, line] = t.list(`celebrate.m${n}` as never);
  useEffect(() => {
    markSeen(arcId, n);
    haptic('milestone');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setShown(n); return; }
    const t0 = performance.now(), dur = 900;
    let raf = 0;
    const step = (now: number) => { const p = Math.min(1, (now - t0) / dur); setShown(Math.round(n * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', esc); };
  }, [arcId, n, onClose]);
  const pct = Math.min(1, n / length);
  const r = 120, len = Math.PI * r;
  return createPortal(
    <div className={s.root} role="dialog" aria-modal="true" aria-label={title}>
      <div className={s.glow} aria-hidden="true" />
      <svg className={s.arc} viewBox="0 0 280 150" aria-hidden="true">
        <path d="M20 140 A120 120 0 0 1 260 140" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="3" strokeLinecap="round" />
        <path d="M20 140 A120 120 0 0 1 260 140" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - pct)} className={s.trail} style={{ '--len': len } as React.CSSProperties} />
      </svg>
      <div className={s.num}>{shown}</div>
      <div className={s.unit}>{t('home.daysInRow', { n } as never)}</div>
      <h2 className={s.title}>{title}</h2>
      <p className={s.line}>{line}</p>
      {oath && <p className={s.oath}><span>{t('celebrate.oath')}</span>«{oath}»</p>}
      <button type="button" className={s.next} onClick={onClose} autoFocus>{t('celebrate.next')}</button>
    </div>,
    document.body,
  );
}
