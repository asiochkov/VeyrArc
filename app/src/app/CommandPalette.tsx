import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useT, type T } from '../i18n';
import { isoDay } from '../lib/day';
import { addDays, scheduled } from '../data/model';
import { logHabit, logMood, saveEvent } from '../state/actions';
import { pomo } from '../state/pomodoro';
import { useSystem, type SystemRaw } from '../state/system';
import { Icon, type IconName } from '../ui/Icon';
import { toast } from '../ui/toast';
import { useTour, type TourId } from '../ui/Tour';
import s from './CommandPalette.module.css';
import { NAV, useAdd } from './nav';

/*
 * Command palette (Master Changeset PROBLEM #11, A4, task 12): ⌘K / Ctrl+K, or the search button.
 * Searches habits, events, goals and diary lines, and understands short commands:
 *   «вода» / «вода 2» → log the habit (+1 / +2), «фокус 50» → start focus,
 *   «встреча 15:00 шеф» / «завтра 9:00 бег» → event, «настроение 4» → mood.
 */
type Row = { id: string; icon: IconName; title: string; sub?: string; kbd?: string; run: () => void };

const norm = (x: string) => x.toLowerCase().replace(/ё/g, 'е').trim();
function score(q: string, text: string) {
  const a = norm(text), b = norm(q);
  if (!b) return 1;
  if (a.startsWith(b)) return 3;
  if (a.includes(b)) return 2;
  let i = 0;
  for (const ch of a) if (ch === b[i]) i++;
  return i === b.length ? 1 : 0;
}

function commands(q: string, r: SystemRaw | undefined, t: T, close: () => void): Row[] {
  const out: Row[] = [];
  const raw = q.trim();
  const low = norm(raw);
  const day = isoDay();
  // time → event
  const tm = raw.match(/(^|\s)([01]?\d|2[0-3])[:.]([0-5]\d)(\s|$)/);
  if (tm) {
    const time = `${tm[2].padStart(2, '0')}:${tm[3]}`;
    const tomorrow = /(^|\s)(завтра|tomorrow)(\s|$)/i.test(raw);
    const title = raw.replace(tm[0], ' ').replace(/(^|\s)(завтра|tomorrow|сегодня|today)(\s|$)/gi, ' ').replace(/\s+/g, ' ').trim() || t('calendar.newTaskDefault');
    const d = tomorrow ? addDays(day, 1) : day;
    out.push({
      id: 'cmd-event', icon: 'cal', title: t('palette.createEvent', { x: title, t: time }), sub: tomorrow ? t('add.tomorrow') : t('common.today'), kbd: 'E',
      run: () => {
        const [h, m] = time.split(':').map(Number);
        saveEvent({ id: crypto.randomUUID(), title, day: d, starts_at: time, ends_at: `${String(Math.min(23, h + 1)).padStart(2, '0')}:${String(m).padStart(2, '0')}`, note: null, done: false, category_id: null }, true);
        toast.success(t('add.eventCreated')); close();
      },
    });
  }
  // focus N
  const fm = low.match(/^(фокус|focus)\s*(\d{1,3})?/);
  if (fm) {
    const m = fm[2] ? Math.max(5, Math.min(180, Number(fm[2]))) : null;
    out.push({ id: 'cmd-focus', icon: 'bolt', title: t('palette.startFocus', { m: m ?? '' }).trim(), kbd: 'F', run: () => { if (m) pomo.setLength(0, m); pomo.setTab(0); pomo.start(); close(); } });
  }
  // mood N
  const mm = low.match(/^(настроение|mood)\s*([1-5])$/);
  if (mm) out.push({ id: 'cmd-mood', icon: 'spark', title: t('palette.logMood', { n: mm[2] }), run: () => { logMood(Number(mm[2]) - 1); toast.success(t('palette.moodSaved')); close(); } });
  // habit [+N]
  if (r && low) {
    const num = raw.match(/(?:^|\s)\+?(\d{1,3})$/);
    const name = num ? raw.slice(0, raw.length - num[0].length).trim() : raw;
    for (const h of r.habits.filter((x) => !x.archived_at && scheduled(x, day))) {
      if (score(name, h.name) < 2) continue;
      const log = r.logs.find((l) => l.habit_id === h.id && l.day === day);
      const n = num ? Number(num[1]) : 1;
      const title = h.type === 'counter' ? t('palette.logCounter', { x: h.name, n }) : h.type === 'duration' ? t('palette.logDuration', { x: h.name }) : log?.done ? t('palette.unlog', { x: h.name }) : t('palette.log', { x: h.name });
      out.push({
        id: 'log-' + h.id, icon: 'check', title, sub: h.core ? 'Core' : 'Extra',
        run: () => {
          if (h.type === 'counter') { const v = (log?.value ?? 0) + n; logHabit(h.id, v, v >= (h.target ?? 1)); }
          else if (h.type === 'duration') pomo.openSheet({ habitId: h.id, label: h.name });
          else logHabit(h.id, log?.done ? 0 : 1, !log?.done);
          toast.success(t('palette.logged', { x: h.name }), 1600); close();
        },
      });
    }
  }
  return out;
}

export function CommandPalette() {
  const t = useT();
  const navigate = useNavigate();
  const { paletteOpen, closePalette, openAdd } = useAdd();
  const sys = useSystem((r) => r).data;
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { if (paletteOpen) { setQ(''); setSel(0); setTimeout(() => input.current?.focus(), 0); } }, [paletteOpen]);
  const go = (to: string) => { closePalette(); navigate(to); };
  const { pathname } = useLocation();
  const tourId: TourId | null = pathname === '/' ? 'today' : pathname.startsWith('/disciplines') ? 'disciplines' : pathname.startsWith('/analytics') ? 'analytics' : null;

  const rows = useMemo<Row[]>(() => {
    if (!paletteOpen) return [];
    const base: Row[] = [
      { id: 'a-habit', icon: 'checklist', title: t('palette.newHabit'), kbd: 'H', run: () => openAdd('habit') },
      { id: 'a-event', icon: 'cal', title: t('palette.newEvent'), kbd: 'E', run: () => openAdd('event') },
      { id: 'a-goal', icon: 'target', title: t('palette.newGoal'), kbd: 'G', run: () => go('/goals?new=1') },
      { id: 'a-focus', icon: 'bolt', title: t('palette.focus'), kbd: 'F', run: () => { closePalette(); pomo.openSheet(); } },
      ...NAV.map((n) => ({ id: 'go-' + n.id, icon: n.icon, title: t('palette.goTo', { x: t(n.label) }), kbd: 'G ' + n.key.toUpperCase(), run: () => go(n.to) })),
      { id: 'go-settings', icon: 'gear' as IconName, title: t('palette.goTo', { x: t('settings.title') }), run: () => go('/settings') },
      { id: 'a-arc', icon: 'snow' as IconName, title: t('palette.newArc'), run: () => go('/settings#arc') },
    ];
    // «?» replays the tips of this screen
    if (q.trim() === '?' && tourId) return [{ id: 'tour', icon: 'alert', title: t('palette.tour'), run: () => { closePalette(); useTour.getState().start(tourId); } }];
    const cmd = commands(q, sys, t, closePalette);
    if (!q.trim()) return [...base.slice(0, 4), ...base.slice(4)];
    const found: Row[] = [];
    if (sys) {
      for (const h of sys.habits.filter((x) => !x.archived_at)) if (score(q, h.name) > 1) found.push({ id: 'h' + h.id, icon: 'checklist', title: h.name, sub: t('nav.disciplines'), run: () => go(`/disciplines?open=${h.id}`) });
      for (const g of sys.goals) if (score(q, g.title) > 1) found.push({ id: 'g' + g.id, icon: 'target', title: g.title, sub: t('nav.goals'), run: () => go(`/goals/${g.id}`) });
      for (const p of sys.plan) if (score(q, p.title) > 1) found.push({ id: 'p' + p.id, icon: 'cal', title: p.title, sub: `${p.day}${p.starts_at ? ' ' + p.starts_at.slice(0, 5) : ''}`, run: () => go(`/planner?day=${p.day}`) });
      for (const e of sys.entries) if (e.diary && score(q, e.diary) > 1) found.push({ id: 'd' + e.goal_id + e.day, icon: 'doc', title: e.diary.slice(0, 80), sub: e.day, run: () => go(`/goals/${e.goal_id}`) });
    }
    const matched = base.filter((b) => score(q, b.title) > 0);
    return [...cmd, ...found.slice(0, 12), ...matched];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, sys, paletteOpen, t, tourId]);
  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => { list.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: 'nearest' }); }, [sel]);
  if (!paletteOpen) return null;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((x) => Math.min(rows.length - 1, x + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((x) => Math.max(0, x - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); rows[sel]?.run(); }
    else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
  };
  return (
    <div className={s.backdrop} onClick={closePalette}>
      <div className={s.panel} role="dialog" aria-modal="true" aria-label={t('palette.title')} onClick={(e) => e.stopPropagation()}>
        <div className={s.inputRow}>
          <Icon name="search" size={16} />
          <input ref={input} className={s.input} value={q} placeholder={t('palette.placeholder')} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
            role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={rows[sel] ? 'pal-' + rows[sel].id : undefined} enterKeyHint="go" />
          <kbd className={s.esc}>Esc</kbd>
        </div>
        <div className={s.list} id="palette-list" role="listbox" ref={list}>
          {rows.length === 0 && <div className={s.empty}>{t('palette.nothing')}</div>}
          {rows.map((r, i) => (
            <button key={r.id} id={'pal-' + r.id} data-i={i} type="button" role="option" aria-selected={i === sel} className={s.row}
              onMouseMove={() => setSel(i)} onClick={() => r.run()}>
              <Icon name={r.icon} size={16} />
              <span className={s.rowTitle}>{r.title}</span>
              {r.sub && <span className={s.rowSub}>{r.sub}</span>}
              {r.kbd && <kbd className={s.kbd}>{r.kbd}</kbd>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
