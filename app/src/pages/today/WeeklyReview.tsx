import { useEffect, useMemo, useState } from 'react';
import { addDays, weekStart } from '../../data/model';
import { useT } from '../../i18n';
import { isoDay } from '../../lib/day';
import { dayStatus } from '../../state/compute';
import { activeArc, getSystem, type SystemRaw } from '../../state/system';
import { Sheet } from '../../ui/Sheet';
import { Cta } from '../../ui/primitives';
import s from './weekly.module.css';

/*
 * Weekly review (audit 2.2 phase 4 / phase 7): Sunday evening or Monday morning, once a week.
 * Three numbers, one observation, one question — what the next week keeps. The answer becomes the
 * «focus of the week» line on Today (kept on this device).
 */
const FOCUS = (w: string) => `veyrarc.weekFocus.${w}`;
const SHOWN = (w: string) => `veyrarc.weekShown.${w}`;
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* no storage */ } };

/** the week being reviewed: last week on a Monday morning, otherwise this week so far */
export function reviewWeek(now = new Date()) {
  const today = isoDay(now);
  return now.getDay() === 1 && now.getHours() < 14 ? addDays(weekStart(today), -7) : weekStart(today);
}
/** keep the line the person chose to carry into the week (the screen and the assistant both write it here) */
/** the storage key and the old value of the line that saveWeekFocus() is about to write (for undo) */
export function weekFocusSlot(now = new Date()) {
  const from = reviewWeek(now);
  const key = FOCUS(now.getDay() === 0 ? addDays(from, 7) : weekStart(isoDay(now)));
  return { key, prev: get(key) };
}
export function restoreLocal(key: string, prev: string | null) { try { if (prev == null) localStorage.removeItem(key); else localStorage.setItem(key, prev); } catch { /* no storage */ } }
export function saveWeekFocus(text: string, now = new Date()) {
  const from = reviewWeek(now);
  const target = now.getDay() === 0 ? addDays(from, 7) : weekStart(isoDay(now));
  const v = text.trim().slice(0, 120);
  if (v) put(FOCUS(target), v);
  return v;
}
/** the focus the person chose for the current week (from the last review) */
export const weekFocus = (now = new Date()) => get(FOCUS(weekStart(isoDay(now))));
/** time to offer the review on its own: Sunday after 17:00 or Monday before 14:00, once */
export function reviewDue(sys: SystemRaw | undefined, now = new Date()) {
  if (!sys || !sys.habits.some((h) => !h.archived_at)) return false;
  const due = (now.getDay() === 0 && now.getHours() >= 17) || (now.getDay() === 1 && now.getHours() < 14);
  const w = reviewWeek(now);
  const arc = activeArc(sys);
  return due && !get(SHOWN(w)) && !!arc && arc.started_on <= addDays(w, 3);
}

export function stats(sys: SystemRaw, from: string) {
  const today = isoDay();
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i)).filter((d) => d <= today);
  const idx = { habits: sys.habits.filter((h) => !h.archived_at), logs: sys.logs, days: sys.days };
  const kept = days.filter((d) => ['earned', 'frozen'].includes(dayStatus(idx, d, today, 23))).length;
  const focusMin = sys.focus.filter((f) => f.completed && (f.session_type ?? 'focus') === 'focus' && isoDay(new Date(f.started_at)) >= from && isoDay(new Date(f.started_at)) <= addDays(from, 6)).reduce((a, f) => a + f.minutes, 0);
  const perDay = days.map((d) => ({ d, n: sys.logs.filter((l) => l.day === d && l.done).length }));
  const best = perDay.reduce((a, b) => (b.n > a.n ? b : a), { d: '', n: 0 });
  const moods = sys.days.filter((x) => x.mood != null && x.day >= from && x.day <= addDays(from, 6)).map((x) => x.mood!);
  return { kept, of: days.length, focusMin, best, mood: moods.length ? moods.reduce((a, m) => a + m, 0) / moods.length : null };
}

export function WeeklyReview({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const from = reviewWeek();
  const [focus, setFocus] = useState('');
  useEffect(() => { if (open) { put(SHOWN(from), '1'); setFocus(get(FOCUS(new Date().getDay() === 0 ? addDays(from, 7) : weekStart(isoDay()))) ?? ''); } }, [open, from]);
  const data = useMemo(() => {
    const sys = getSystem();
    if (!sys || !open) return null;
    return { cur: stats(sys, from), prev: stats(sys, addDays(from, -7)) };
  }, [open, from]);
  if (!data) return null;
  const { cur, prev } = data;
  const dows = t.list('weekdays.long');
  const bestName = cur.best.n ? dows[(new Date(cur.best.d + 'T12:00:00').getDay() + 6) % 7] : '—';
  const moodWords = t.list('today.moodWords');
  // one observation: the change against last week first, then the mood, then the best day
  const insight = cur.kept > prev.kept ? t('weekly.better', { n: cur.kept - prev.kept })
    : cur.kept < prev.kept ? t('weekly.lower', { n: prev.kept - cur.kept })
      : cur.mood != null ? t('weekly.mood', { m: moodWords[Math.round(cur.mood) - 1] ?? '' })
        : cur.best.n ? t('weekly.bestDay', { d: bestName }) : t('weekly.start');
  const range = `${new Date(from + 'T12:00:00').getDate()}–${new Date(addDays(from, 6) + 'T12:00:00').toLocaleDateString(t.lang === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'long' })}`;
  // Sunday (or the Monday look back) plans the coming week; mid-week it is this week's focus
  const sunday = new Date().getDay() === 0;
  const target = sunday ? addDays(from, 7) : weekStart(isoDay());
  const save = () => { const v = focus.trim().slice(0, 120); if (v) put(FOCUS(target), v); onClose(); };
  const ideas = t.list('weekly.ideas');
  return (
    <Sheet open={open} onClose={onClose} title={t('weekly.title')}>
      <div className={s.range}>{range}</div>
      <div className={s.stats}>
        <div className={s.stat} style={{ '--k': 0 } as React.CSSProperties}><b>{cur.kept}<small>/{cur.of}</small></b><span>{t('weekly.kept')}</span></div>
        <div className={s.stat} style={{ '--k': 1 } as React.CSSProperties}><b>{t.hm(cur.focusMin)}</b><span>{t('weekly.focus')}</span></div>
        <div className={s.stat} style={{ '--k': 2 } as React.CSSProperties}><b className={s.word}>{cur.best.n ? t.list('weekdays.short')[(new Date(cur.best.d + 'T12:00:00').getDay() + 6) % 7] : '—'}</b><span>{t('weekly.best')}</span></div>
      </div>
      <p className={s.insight}>{insight}</p>
      <label className={s.q} htmlFor="week-focus">{t(sunday ? 'weekly.question' : 'weekly.questionNow')}</label>
      <input id="week-focus" className={s.input} value={focus} maxLength={120} onChange={(e) => setFocus(e.target.value)} placeholder={t('weekly.ph')} enterKeyHint="done" onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
      <div className={s.ideas}>{ideas.map((x) => <button key={x} type="button" className={s.idea} onClick={() => setFocus(x)}>{x}</button>)}</div>
      <Cta onClick={save} style={{ marginTop: 18 }}>{focus.trim() ? t('weekly.save') : t('weekly.close')}</Cta>
    </Sheet>
  );
}
