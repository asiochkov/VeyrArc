import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type TouchEvent } from 'react';
import { AppHeader } from '../../app/AppHeader';
import { fetchCalendar, toEvents, toRow, type Ev } from '../../data/calendar';
import { addDays, daysBetween, parseDay, weekStart } from '../../data/model';
import { translate, useLangStore, useT, type T, type TKey } from '../../i18n';
import { useAuth } from '../../lib/auth';
import { isoDay } from '../../lib/day';
import { hasBackend } from '../../lib/supabase';
import { useIsDesktop } from '../../lib/useIsDesktop';
import { EV_CAT, EV_FILL, ROW, ROW_M, type EvColor } from '../../mock/calendar';
import { deleteEvent, saveEvent, setEventDone } from '../../state/actions';
import { pomo } from '../../state/pomodoro';
import { useSystem } from '../../state/system';
import { Icon } from '../../ui/Icon';
import { EmptyState } from '../../ui/EmptyState';
import { PageState } from '../../ui/PageState';
import { Checkbox, Segmented } from '../../ui/primitives';
import { toast } from '../../ui/toast';
import s from './calendar.module.css';

type View = 'month' | 'week' | 'day';
/* px a mouse must travel before a press becomes a drag (below that it is a click) */
const DRAG_THRESHOLD = 8;
const fmtH = (x: number) => `${String(Math.floor(x)).padStart(2, '0')}:${String(Math.round((x % 1) * 60)).padStart(2, '0')}`;
const COLORS: EvColor[] = ['blue', 'green', 'red', 'purple'];
const BD: { c: EvColor; label: { ru: string; en: string } }[] = [
  { c: 'blue', label: { ru: 'Личное', en: 'Personal' } },
  { c: 'green', label: { ru: 'Работа', en: 'Work' } },
  { c: 'red', label: { ru: 'Здоровье', en: 'Health' } },
  { c: 'purple', label: { ru: 'Учёба', en: 'Learning' } },
];

const fmt = (x: number) => {
  const h = Math.floor(x);
  const m = Math.round((x - h) * 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
};
const parseHm = (v: string) => { const [h, m] = v.split(':').map(Number); return h + (m || 0) / 60; };
const clampH = (x: number) => Math.max(0, Math.min(24, Math.round(x * 4) / 4));
const monthStart = (day: string) => day.slice(0, 8) + '01';
const addMonths = (first: string, n: number) => { const d = parseDay(first); return isoDay(new Date(d.getFullYear(), d.getMonth() + n, 1)); };
const monthEnd = (first: string) => { const d = parseDay(first); return isoDay(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };
const sortEv = (a: Ev, b: Ev) => (a.s ?? -1) - (b.s ?? -1) || a.title.localeCompare(b.title);

export function dayLabel(t: T, day: string) {
  const d = parseDay(day);
  const dow = t.list('weekdays.short')[(d.getDay() + 6) % 7];
  return t.lang === 'en' ? `${dow}, ${t.list('months')[d.getMonth()]} ${d.getDate()}` : `${dow}, ${d.getDate()} ${t.list('monthsGen')[d.getMonth()]}`;
}
function durLabel(t: T, hours: number) {
  const h = Math.floor(hours);
  const m = Math.round((hours % 1) * 60);
  const txt = ((h ? t('units.h', { h }) + ' ' : '') + (m ? t('units.m', { m }) : '')).trim();
  return txt || t('units.m', { m: 0 });
}

/* ---------------- state ---------------- */

type Draft = { ev: Ev; isNew: boolean };

/*
 * Planner state on top of the one system state (Master Changeset task 16): events come from
 * ['system'] (400 days back … 120 ahead); a range outside that window is fetched on demand.
 * Every change goes through state/actions (Today's strip and Goals update in the same frame).
 */
function useCalendar() {
  const session = useAuth((x) => x.session);
  const on = hasBackend && !!session;
  const today = isoDay();
  const [sel, setSelRaw] = useState(today);
  const [cursor, setCursor] = useState(monthStart(today)); // month shown in the month grids
  const [view, setView] = useState<View>('week');
  const [monthOpen, setMonthOpen] = useState(false);
  const setSel = (d: string) => { setSelRaw(d); setCursor(monthStart(d)); };

  const week0 = weekStart(sel);
  const gridFrom = weekStart(cursor);
  const gridTo = addDays(weekStart(monthEnd(cursor)), 6);
  const from = week0 < gridFrom ? week0 : gridFrom;
  const to = addDays(week0, 6) > gridTo ? addDays(week0, 6) : gridTo;
  const sq = useSystem((r) => r);
  const sys = sq.data;
  const outside = !!sys && (from < addDays(sys.day, -400) || to > addDays(sys.day, 120));
  const extra = useQuery({ queryKey: ['calendar', from, to], queryFn: () => fetchCalendar(from, to), enabled: on && outside, refetchOnWindowFocus: false, placeholderData: (p) => p });
  const cats = sys?.cats ?? [];
  const [dragOver, setDragOver] = useState<{ id: string; s: number; e: number; day: string } | null>(null);
  const items = useMemo<Ev[]>(() => {
    if (!sys) return [];
    const base = toEvents({ items: sys.plan, cats: sys.cats });
    const more = extra.data ? toEvents(extra.data).filter((x) => !base.some((b) => b.id === x.id)) : [];
    const all = [...base, ...more];
    return dragOver ? all.map((x) => (x.id === dragOver.id ? { ...x, s: dragOver.s, e: dragOver.e, day: dragOver.day } : x)) : all;
  }, [sys, extra.data, dragOver]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const catsRef = useRef(cats);
  catsRef.current = cats;
  const links = useMemo(() => ({
    goals: (sys?.goals ?? []).filter((g) => g.status === 'active').map((g) => ({ id: g.id, title: g.title })),
    habits: (sys?.habits ?? []).filter((h) => !h.archived_at).map((h) => ({ id: h.id, title: h.name, type: h.type })),
  }), [sys]);

  /* ---- editing ---- */
  const [draft, setDraft] = useState<Draft | null>(null);
  const openNew = (day: string, start?: number, focus = false) => {
    let st = start;
    if (st == null) {
      // first free full hour from now (today) or from 9:00
      const used = itemsRef.current.filter((x) => x.day === day && x.s != null);
      st = day === today ? Math.min(22, new Date().getHours() + 1) : 9;
      while (used.some((u) => u.s! < st! + 1 && u.e! > st!) && st < 22) st++;
    }
    const len = focus ? 50 / 60 : 1;
    setDraft({ isNew: true, ev: { id: crypto.randomUUID(), day, s: st, e: Math.min(24, st + len), title: focus ? t0('calendar.focusTitle') : '', c: 'blue', note: '', done: false, focus } });
  };
  const openEdit = (id: string) => { const ev = itemsRef.current.find((x) => x.id === id); if (ev) setDraft({ isNew: false, ev: { ...ev } }); };
  const commit = (ev: Ev, isNew: boolean) => { saveEvent(toRow(catsRef.current, ev), isNew); setDraft(null); };
  const remove = (id: string) => {
    const ev = itemsRef.current.find((x) => x.id === id);
    deleteEvent(id);
    setDraft(null);
    if (!ev) return;
    toast.action(t0('calendar.deleted'), t0('explain.undo'), () => saveEvent(toRow(catsRef.current, ev), true));
  };
  const toggleDone = (id: string) => {
    const ev = itemsRef.current.find((x) => x.id === id);
    if (!ev) return;
    if (!ev.done) navigator.vibrate?.(15);
    setEventDone(id, !ev.done);
  };

  /* ---- move / resize a block (mouse: drag at once; finger: hold, then drag) ----
     snaps to 15 minutes, follows the finger across day columns, scrolls the grid at its edges,
     a tap without movement opens the editor; after a drop the old time can be restored. */
  type Drag = {
    id: string; mode: 'move' | 'resize'; touch: boolean; x0: number; y0: number; x: number; y: number;
    s: number; e: number; day: string; ns: number; ne: number; nday: string; grab: number;
    active: boolean; moved: boolean; timer?: ReturnType<typeof setTimeout>; area: HTMLElement; row: number; h0: number; raf?: number;
  };
  const drag = useRef<Drag | null>(null);
  const lastDrag = useRef(0);
  const [now, setNow] = useState(Date.now());
  const place = (d: Drag) => {
    // the column under the finger (week view), else the block's own column
    let col = d.area;
    if (d.mode === 'move') {
      const cols = d.area.parentElement?.querySelectorAll<HTMLElement>('[data-day]') ?? [];
      for (const c of cols) { const r = c.getBoundingClientRect(); if (d.x >= r.left && d.x <= r.right) { col = c; break; } }
    }
    const top = col.getBoundingClientRect().top;
    const hour = d.h0 + (d.y - top) / d.row;
    const q = (v: number) => Math.round(v * 4) / 4;
    const len = d.e - d.s;
    let ns = d.ns, ne = d.ne;
    if (d.mode === 'move') { ns = Math.max(0, Math.min(24 - len, q(hour - d.grab))); ne = ns + len; }
    else { ne = Math.max(d.s + 0.25, Math.min(24, q(hour))); }
    const nday = col.dataset.day ?? d.day;
    if (ns !== d.ns || ne !== d.ne || nday !== d.nday) {
      if (d.touch) navigator.vibrate?.(6);
      d.ns = ns; d.ne = ne; d.nday = nday;
      setDragOver({ id: d.id, s: ns, e: ne, day: nday });
    }
  };
  const activate = (d: Drag) => {
    d.active = true;
    const top = d.area.getBoundingClientRect().top;
    d.grab = d.h0 + (d.y0 - top) / d.row - d.s;
    if (d.touch) navigator.vibrate?.(18);
    document.documentElement.dataset.dragging = '';
    setDragOver({ id: d.id, s: d.s, e: d.e, day: d.day });
    // scroll the grid while the finger rests near its top or bottom edge
    const scroller = d.area.closest<HTMLElement>('.wk-scroll, [data-scroll]');
    const tick = () => {
      const x = drag.current;
      if (!x || !x.active) return;
      if (scroller) {
        const r = scroller.getBoundingClientRect();
        const bottom = Math.min(r.bottom, window.innerHeight - (d.touch ? 110 : 0));
        const v = x.y < r.top + 60 ? -Math.ceil((r.top + 60 - x.y) / 6) : x.y > bottom - 60 ? Math.ceil((x.y - bottom + 60) / 6) : 0;
        if (v) { scroller.scrollTop += v; place(x); }
      }
      x.raf = requestAnimationFrame(tick);
    };
    d.raf = requestAnimationFrame(tick);
  };
  const finish = (commit: boolean) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    clearTimeout(d.timer);
    if (d.raf) cancelAnimationFrame(d.raf);
    delete document.documentElement.dataset.dragging;
    if (!d.active) return; // a plain tap opens the task through its click
    lastDrag.current = Date.now();
    setDragOver(null);
    const cur = itemsRef.current.find((x) => x.id === d.id);
    if (!cur) return;
    const ev = { ...cur, s: d.s, e: d.e, day: d.day }; // items already carry the dragged position
    if (!commit || (d.ns === d.s && d.ne === d.e && d.nday === d.day)) return;
    navigator.vibrate?.(10);
    saveEvent(toRow(catsRef.current, { ...ev, s: d.ns, e: d.ne, day: d.nday }), false);
    toast.action(t0('calendar.moved').replace('{t}', `${fmtH(d.ns)}–${fmtH(d.ne)}`), t0('explain.undo'), () => saveEvent(toRow(catsRef.current, ev), false), 5000);
  };
  useEffect(() => {
    const tm = setInterval(() => setNow(Date.now()), 30000);
    const move = (ev: globalThis.PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      d.x = ev.clientX; d.y = ev.clientY;
      const far = Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) > DRAG_THRESHOLD;
      if (!d.active) {
        if (!far) return;
        d.moved = true;
        if (d.touch) { finish(false); return; } // the finger is scrolling, not holding
        activate(d);
      }
      place(d);
    };
    const up = () => finish(true);
    const cancel = () => finish(!!drag.current?.active);
    // once a block is lifted the page must not scroll under the finger
    const block = (ev: globalThis.TouchEvent) => { if (drag.current?.active) ev.preventDefault(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('touchmove', block, { passive: false });
    return () => {
      clearInterval(tm);
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel); window.removeEventListener('touchmove', block);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const startDrag = (id: string, e: PointerEvent, opts: { row: number; h0: number; mode?: 'move' | 'resize' }) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation();
    const ev = itemsRef.current.find((x) => x.id === id);
    const el = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-ev]');
    if (!ev || ev.s == null || !el?.parentElement) return;
    const touch = e.pointerType !== 'mouse';
    if (!touch) e.preventDefault();
    const d: Drag = {
      id, mode: opts.mode ?? 'move', touch, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY,
      s: ev.s, e: ev.e ?? ev.s + 1, day: ev.day, ns: ev.s, ne: ev.e ?? ev.s + 1, nday: ev.day, grab: 0,
      active: false, moved: false, area: el.parentElement, row: opts.row, h0: opts.h0,
    };
    drag.current = d;
    if (touch) d.timer = setTimeout(() => { if (drag.current === d && !d.moved) activate(d); }, 350);
  };
  const dragId = dragOver?.id ?? null;
  // the click that follows a drag must not open the editor
  const clickEv = (id: string, e: MouseEvent) => { e.stopPropagation(); if (Date.now() - lastDrag.current > 400) openEdit(id); };

  /* ---- navigation ---- */
  const shift = (n: number) => {
    if (view === 'month') { setCursor(addMonths(cursor, n)); return; }
    setSel(addDays(sel, view === 'week' ? 7 * n : n));
  };
  const goToday = () => { setSel(today); };

  return {
    ready: !!sys, loadError: sq.isError && !sq.data, retry: () => { void sq.refetch(); }, today, sel, setSel, cursor, setCursor, view, setView, monthOpen, setMonthOpen, week0,
    items, now, links, draft, setDraft, openNew, openEdit, commit, remove, toggleDone, startDrag, dragId, clickEv, shift, goToday,
  };
}
const t0 = (k: TKey) => translate(useLangStore.getState().lang, k);
type St = ReturnType<typeof useCalendar>;

/** Visible hours: 6:00–23:00, stretched to fit items but never beyond 5:00–24:00 (PROBLEM #24). */
function hourRange(list: Ev[]) {
  let a = 6, b = 23;
  for (const x of list) if (x.s != null) { a = Math.min(a, Math.floor(x.s)); b = Math.max(b, Math.ceil(x.e ?? x.s + 1)); }
  return [Math.max(5, a), Math.min(24, b)] as const;
}

export function Calendar() {
  const t = useT();
  const isDesktop = useIsDesktop();
  const st = useCalendar();
  if (!st.ready) return <PageState variant="planner" error={st.loadError} onRetry={st.retry} />;
  return isDesktop ? <DesktopCalendar t={t} st={st} /> : <MobileCalendar t={t} st={st} />;
}

/* ---------------- shared pieces ---------------- */

function monthCells(cursor: string) {
  const first = weekStart(cursor);
  const last = addDays(weekStart(monthEnd(cursor)), 6);
  return Array.from({ length: daysBetween(first, last) + 1 }, (_, i) => addDays(first, i));
}

function MonthMini({ t, st, big, gap, onPick }: { t: T; st: St; big: boolean; gap: number; onPick: (day: string) => void }) {
  const m = st.cursor.slice(0, 7);
  return (
    <>
      <div className={s.grid7} style={{ gap, marginBottom: gap }}>
        {t.list('weekdays.short').map((w) => <div key={w} className={s.wd} style={big ? undefined : { padding: '2px 0' }}>{w}</div>)}
      </div>
      <div className={s.grid7} style={{ gap }}>
        {monthCells(st.cursor).map((day) => {
          const k = day.slice(0, 7) !== m ? 'grey' : day === st.sel ? 'sel' : day === st.today ? 'today' : 'day';
          const dots = st.items.filter((x) => x.day === day).slice(0, 3);
          return (
            <button key={day} type="button" className={s.mcell} data-k={k} style={{ fontSize: big ? 13 : 12 }} onClick={() => onPick(day)}>
              {parseDay(day).getDate()}
              {dots.length > 0 && <span className={s.mDots}>{dots.map((x) => <i key={x.id} style={{ background: k === 'sel' ? 'var(--ink)' : EV_FILL[x.c] }} />)}</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}

function MonthHead({ t, st, small }: { t: T; st: St; small?: boolean }) {
  const d = parseDay(st.cursor);
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: small ? 12 : 14 }}>
      <div style={{ font: `700 ${small ? 14 : 15}px var(--font-ui)` }}>{t.list('months')[d.getMonth()]} {d.getFullYear() !== parseDay(st.today).getFullYear() ? d.getFullYear() : ''}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" className={s.arrow} aria-label={t('calendar.prev')} onClick={() => st.setCursor(addMonths(st.cursor, -1))}><Icon name="chevronLeft" size={15} sw={2} /></button>
        <button type="button" className={s.arrow} aria-label={t('calendar.next')} onClick={() => st.setCursor(addMonths(st.cursor, 1))}><Icon name="chevron" size={15} sw={2} /></button>
      </div>
    </div>
  );
}

function NowLine({ now, h0, row }: { now: number; h0: number; row: number }) {
  const nd = new Date(now);
  const nowH = nd.getHours() + nd.getMinutes() / 60;
  const label = String(nd.getHours()).padStart(2, '0') + ':' + String(nd.getMinutes()).padStart(2, '0');
  return (
    <div className={s.nowLine} style={{ top: (nowH - h0) * row }}>
      <span className={s.nowDot} /><span className={s.nowPill}>{label}</span>
    </div>
  );
}

function TimeBox({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className={s.timeBox}>
      <div style={{ minWidth: 0 }}>
        <div className={s.timeLab}>{label}</div>
        <input className={s.timeInput} type="time" step={900} value={fmt(Math.min(value, 23.75))} aria-label={label}
          onChange={(e) => e.target.value && onChange(parseHm(e.target.value))} />
      </div>
      <div className={s.steps}>
        <button type="button" className={s.step} data-hit="off" onClick={() => onChange(value - 0.25)} aria-label={`${label} −15`}>−</button>
        <button type="button" className={s.step} data-hit="off" onClick={() => onChange(value + 0.25)} aria-label={`${label} +15`}>+</button>
      </div>
    </div>
  );
}

/** Create / edit form for one planner item (desktop popover, mobile bottom sheet). */
function Editor({ t, st, d }: { t: T; st: St; d: Draft }) {
  const [ev, setEv] = useState(d.ev);
  const set = (p: Partial<Ev>) => setEv((x) => ({ ...x, ...p }));
  const setStart = (v: number) => setEv((x) => { const s0 = clampH(Math.min(v, 23.75)); const len = (x.e ?? s0 + 1) - (x.s ?? s0); return { ...x, s: s0, e: Math.min(24, s0 + Math.max(0.25, len)) }; });
  const setEnd = (v: number) => setEv((x) => ({ ...x, e: Math.max((x.s ?? 0) + 0.25, clampH(v)) }));
  const save = () => st.commit({ ...ev, title: ev.title.trim() || t('calendar.newTaskDefault') }, d.isNew);
  const timed = ev.s != null;
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className={s.popKicker}>{d.isNew ? t('calendar.newTask') : t('calendar.editTask')}</div>
        <button type="button" className={s.smallBtn} onClick={() => st.setDraft(null)} aria-label={t('common.close')}><Icon name="close" size={14} sw={2} /></button>
      </div>
      <input className={s.titleInput} value={ev.title} placeholder={t('calendar.taskName')} autoFocus={d.isNew} maxLength={120}
        onChange={(e) => set({ title: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
      <div className={s.dateRow}>
        <span style={{ color: '#2D6CF0', display: 'grid' }}><Icon name="cal" size={16} /></span>
        <input className={s.dateInput} type="date" value={ev.day} aria-label={t('calendar.date')} onChange={(e) => e.target.value && set({ day: e.target.value })} />
        <span className={s.dateText}>{dayLabel(t, ev.day)}</span>
      </div>
      <div className={s.chips} style={{ marginTop: 12 }}>
        <button type="button" className={s.chip} data-on={timed} onClick={() => !timed && set({ s: 9, e: 10 })}>{t('calendar.timed')}</button>
        <button type="button" className={s.chip} data-on={!timed} onClick={() => set({ s: null, e: null })}>{t('calendar.untimed')}</button>
      </div>
      {timed && (
        <>
          <div className={s.times}>
            <TimeBox label={t('calendar.start')} value={ev.s!} onChange={setStart} />
            <TimeBox label={t('calendar.end')} value={ev.e!} onChange={setEnd} />
          </div>
          <div className={s.dur}><span className={s.durDot} />{durLabel(t, ev.e! - ev.s!)}</div>
        </>
      )}
      <div className={s.chips} style={{ marginTop: 14 }}>
        {COLORS.map((k) => {
          const cat = EV_CAT[k];
          const on = ev.c === k;
          return (
            <button key={k} type="button" className={s.tag} style={{ cursor: 'pointer', color: on ? cat.hue : 'rgba(232,237,243,.5)', background: on ? cat.hue + '28' : 'rgba(255,255,255,.05)' }}
              onClick={() => set({ c: k })} aria-pressed={on}>
              <span className={s.tagDot} style={{ background: cat.hue }} />{t(`calendar.cats.${cat.tag}`)}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 14 }}>
        <div className={s.noteLab}>{t('calendar.linkTo')}</div>
        <select className={s.select} aria-label={t('calendar.linkTo')}
          value={ev.linkedGoalId ? 'g:' + ev.linkedGoalId : ev.linkedHabitId ? 'h:' + ev.linkedHabitId : ''}
          onChange={(e) => { const v = e.target.value; set({ linkedGoalId: v.startsWith('g:') ? v.slice(2) : null, linkedHabitId: v.startsWith('h:') ? v.slice(2) : null }); }}>
          <option value="">{t('calendar.linkNone')}</option>
          {st.links.goals.length > 0 && <optgroup label={t('nav.goals')}>{st.links.goals.map((g) => <option key={g.id} value={'g:' + g.id}>{g.title}</option>)}</optgroup>}
          {st.links.habits.length > 0 && <optgroup label={t('nav.disciplines')}>{st.links.habits.map((h) => <option key={h.id} value={'h:' + h.id}>{h.title}</option>)}</optgroup>}
        </select>
        <label className={s.doneRow}>
          <input type="checkbox" checked={!!ev.focus} onChange={(e) => set({ focus: e.target.checked })} />
          <span>{t('calendar.focusBlock')}</span>
          <span className={s.hintSmall}>{t('calendar.focusHint')}</span>
        </label>
      </div>
      <div style={{ marginTop: 14 }}>
        <div className={s.noteLab}>{t('calendar.note')}</div>
        <textarea className={s.note} value={ev.note} maxLength={2000} placeholder={t('calendar.notePlaceholder')} onChange={(e) => set({ note: e.target.value })} />
      </div>
      {!d.isNew && (
        <div className={s.doneRow}>
          <Checkbox on={ev.done} onChange={(v) => set({ done: v })} label={t('calendar.doneLabel')} />
          <span>{t('calendar.doneLabel')}</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        {!d.isNew && <button type="button" className={s.delBtn} onClick={() => st.remove(ev.id)} aria-label={t('calendar.deleteTask')}><Icon name="trash" size={16} /></button>}
        {!d.isNew && ev.focus && !ev.done && ev.day === st.today && (
          <button type="button" className={s.delBtn} style={{ color: 'var(--link)', borderColor: 'rgba(0,75,224,.4)', background: 'rgba(0,75,224,.1)' }}
            onClick={() => { st.setDraft(null); pomo.openSheet({ eventId: ev.id, label: ev.title, goalId: ev.linkedGoalId ?? undefined }); }} aria-label={t('cockpit.now.focus')}><Icon name="bolt" size={16} /></button>
        )}
        <button type="button" className={s.saveBtn} style={{ marginTop: 0 }} onClick={save}>{d.isNew ? t('calendar.createTask') : t('calendar.save')}</button>
      </div>
    </>
  );
}

function DayList({ t, st, list, compact }: { t: T; st: St; list: Ev[]; compact?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {list.map((u) => (
        <div key={u.id} className={s.upRow} data-compact={compact}>
          <button type="button" className={s.upBox} data-done={u.done} onClick={() => st.toggleDone(u.id)} aria-label={t('calendar.doneLabel')}>{u.done && <Icon name="check" size={11} sw={3} />}</button>
          <button type="button" className={s.upName} data-done={u.done} onClick={() => st.openEdit(u.id)}>
            <span className={s.upDot} style={{ background: EV_FILL[u.c] }} />{u.title}
          </button>
          <span className={s.upTime}>{u.s == null ? '—' : fmt(u.s)}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- desktop ---------------- */

function EventBlock({ st, ev, h0, wide }: { st: St; ev: Ev; h0: number; wide: boolean }) {
  const lifted = st.dragId === ev.id;
  return (
    <div
      className={s.ev} data-ev data-drag={lifted} data-sel={st.draft?.ev.id === ev.id} data-done={ev.done}
      style={{ top: (ev.s! - h0) * ROW + 2, height: Math.max(18, (ev.e! - ev.s!) * ROW - 5), background: EV_FILL[ev.c] }}
      role="button" tabIndex={0} aria-label={`${ev.title}, ${fmt(ev.s!)}–${fmt(ev.e!)}`}
      onPointerDown={(e) => st.startDrag(ev.id, e, { row: ROW, h0 })}
      onClick={(e) => st.clickEv(ev.id, e)}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); st.openEdit(ev.id); } }}
    >
      <div className={s.evTitle} style={{ fontSize: wide ? 13 : 12 }}>{ev.title}</div>
      {((ev.e! - ev.s!) >= 0.75 || lifted) && <div className={s.evTime}>{fmt(ev.s!)}–{fmt(ev.e!)}</div>}
      <span className={s.grip} onPointerDown={(e) => st.startDrag(ev.id, e, { row: ROW, h0, mode: 'resize' })} />
    </div>
  );
}

function DesktopCalendar({ t, st }: { t: T; st: St }) {
  const dows = t.list('weekdays.short');
  const days = st.view === 'day' ? [st.sel] : Array.from({ length: 7 }, (_, i) => addDays(st.week0, i));
  const visible = st.items.filter((x) => days.includes(x.day));
  const [h0, h1] = hourRange(visible);
  const hours = Array.from({ length: h1 - h0 + 1 }, (_, i) => String(h0 + i).padStart(2, '0') + ':00');
  const titleDay = parseDay(st.view === 'month' ? st.cursor : st.sel);
  const title = `${t.list('months')[titleDay.getMonth()]} ${titleDay.getFullYear()}`;
  const dayItems = st.items.filter((x) => x.day === st.sel).sort(sortEv);
  const weekItems = st.items.filter((x) => x.day >= st.week0 && x.day <= addDays(st.week0, 6) && x.s != null);
  const hrs = (c: EvColor) => weekItems.filter((x) => x.c === c).reduce((a, x) => a + (x.e! - x.s!), 0);
  const maxH = Math.max(1, ...COLORS.map(hrs));
  const off = -new Date().getTimezoneOffset() / 60;
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = Math.max(0, (new Date().getHours() - h0 - 1) * ROW);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.view]);

  const colClick = (day: string, e: MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const hr = Math.max(0, Math.min(23, Math.floor((h0 + (e.clientY - rect.top) / ROW) * 2) / 2));
    st.openNew(day, hr);
  };
  const untimedRow = days.some((d) => st.items.some((x) => x.day === d && x.s == null));

  return (
    <div className={s.desktopRoot}>
      <div className={s.sidebar}>
        <div>
          <MonthHead t={t} st={st} />
          <MonthMini t={t} st={st} big={false} gap={4} onPick={(d) => { st.setSel(d); if (st.view === 'month') st.setView('day'); }} />
        </div>
        <div>
          <div className={s.secHead} style={{ marginBottom: 12 }}>
            <div className={s.secTitle}>{st.sel === st.today ? t('calendar.upcoming') : dayLabel(t, st.sel)}</div>
            <button type="button" className={s.secLink} onClick={() => st.openNew(st.sel)}>+ {t('common.add')}</button>
          </div>
          {dayItems.length ? <DayList t={t} st={st} list={dayItems} /> : <EmptyState compact title={t('empty.freeDay')} sub={t('calendar.emptyDay')} />}
        </div>
        <div>
          <div className={s.secHead} style={{ marginBottom: 14 }}><div className={s.secTitle}>{t('calendar.breakdown')}</div></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {BD.map((b) => (
              <div key={b.c}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span className={s.bdLabel}>{t.pick(b.label)}</span>
                  <span className={s.bdHrs}>{t('units.h', { h: Math.round(hrs(b.c) * 10) / 10 })}</span>
                </div>
                <div className={s.bdTrack}><div style={{ height: '100%', width: Math.round((hrs(b.c) / maxH) * 100) + '%', borderRadius: 4, background: EV_FILL[b.c] }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={s.main}>
        <div className={s.head}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div className={s.monthTitle}>{title}</div>
            <button type="button" className={s.arrow} aria-label={t('calendar.prev')} onClick={() => st.shift(-1)}><Icon name="chevronLeft" size={15} sw={2} /></button>
            <button type="button" className={s.arrow} aria-label={t('calendar.next')} onClick={() => st.shift(1)}><Icon name="chevron" size={15} sw={2} /></button>
            <button type="button" className={s.todayBtn} onClick={st.goToday}>{t('common.today')}</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
            <Segmented variant="calendar" value={st.view} onChange={st.setView}
              options={(['month', 'week', 'day'] as View[]).map((v) => ({ id: v, label: t(`calendar.views.${v}`) }))} />
            <button type="button" className={s.focusBtn} onClick={() => st.openNew(st.sel, undefined, true)}><Icon name="bolt" size={15} />{t('calendar.focusBlock')}</button>
            <button type="button" className={s.newBtn} onClick={() => st.openNew(st.sel)}><Icon name="plus" size={16} sw={2.2} />{t('calendar.newTaskShort')}</button>
          </div>
        </div>

        {st.view !== 'month' && (
          <>
            <div style={{ marginTop: 20 }}>
              <div className={s.dayHeads}>
                {days.map((d) => (
                  <button key={d} type="button" className={s.dayHead} data-today={d === st.today} data-sel={st.view === 'week' && d === st.sel}
                    onClick={() => { st.setSel(d); st.setView('day'); }}>
                    {t('calendar.dayHead', { dow: dows[(parseDay(d).getDay() + 6) % 7], date: parseDay(d).getDate() })}
                  </button>
                ))}
              </div>
              {untimedRow && (
                <div className={s.dayHeads} style={{ marginTop: 6 }}>
                  {days.map((d) => (
                    <div key={d} className={s.allDay}>
                      {st.items.filter((x) => x.day === d && x.s == null).map((x) => (
                        <button key={x.id} type="button" className={s.allDayItem} data-done={x.done} style={{ background: EV_FILL[x.c] }} onClick={() => st.openEdit(x.id)}>{x.title}</button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div ref={scrollRef} className={`${s.scroll} wk-scroll`}>
              <div className={s.hours}>
                <div className={s.tz}>GMT {off >= 0 ? '+' : '−'}{Math.abs(off)}</div>
                {hours.map((h) => <div key={h} className={s.hour}>{h}</div>)}
              </div>
              <div className={s.cols} style={{ height: (h1 - h0) * ROW, marginTop: 20 }}>
                {days.map((d) => (
                  <div key={d} className={s.col} data-day={d} data-today={d === st.today} onClick={(e) => colClick(d, e)}>
                    {d === st.today && <NowLine now={st.now} h0={h0} row={ROW} />}
                    {st.items.filter((ev) => ev.day === d && ev.s != null).map((ev) => <EventBlock key={ev.id} st={st} ev={ev} h0={h0} wide={st.view === 'day'} />)}
                  </div>
                ))}
              </div>
            </div>
            <div className={s.hint} style={{ marginTop: 8 }}>{t('calendar.gridHint')}</div>
          </>
        )}

        {st.view === 'month' && (
          <div style={{ marginTop: 20, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className={s.grid7} style={{ gap: 8, marginBottom: 8 }}>
              {dows.map((w) => <div key={w} style={{ font: 'var(--fw-regular) 11px var(--font-mono)', letterSpacing: '.08em', color: 'rgba(232,237,243,.56)', padding: '0 4px' }}>{w}</div>)}
            </div>
            <div className={s.grid7} style={{ flex: 1, gridAutoRows: '1fr', gap: 8 }}>
              {monthCells(st.cursor).map((day) => {
                const greyed = day.slice(0, 7) !== st.cursor.slice(0, 7);
                const evs = st.items.filter((x) => x.day === day).sort(sortEv);
                return (
                  <button key={day} type="button" className={s.monthCell} data-sel={day === st.sel} data-today={day === st.today} data-grey={greyed}
                    onClick={() => { st.setSel(day); st.setView('day'); }}>
                    <div className={s.monthNum}>{parseDay(day).getDate()}</div>
                    {evs.slice(0, 3).map((x) => <div key={x.id} className={s.monthItem} data-done={x.done}><i style={{ background: EV_FILL[x.c] }} />{x.title}</div>)}
                    {evs.length > 3 && <div className={s.monthMore}>+{evs.length - 3}</div>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {st.draft && (
          <div className={s.popover}><Editor key={st.draft.ev.id} t={t} st={st} d={st.draft} /></div>
        )}
      </div>
    </div>
  );
}

/* ---------------- mobile ---------------- */

function MobileCalendar({ t, st }: { t: T; st: St }) {
  const dows = t.list('weekdays.short');
  const week = Array.from({ length: 7 }, (_, i) => addDays(st.week0, i));
  const dayItems = st.items.filter((x) => x.day === st.sel).sort(sortEv);
  const timed = dayItems.filter((x) => x.s != null);
  const untimed = dayItems.filter((x) => x.s == null);
  const [h0, h1] = hourRange(timed);
  const hours = Array.from({ length: h1 - h0 + 1 }, (_, i) => String(h0 + i).padStart(2, '0') + ':00');
  const selD = parseDay(st.sel);
  const monthName = t.list('months')[selD.getMonth()] + (selD.getFullYear() !== parseDay(st.today).getFullYear() ? ' ' + selD.getFullYear() : '');
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: TouchEvent) => { swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e: TouchEvent) => {
    const w = swipe.current;
    swipe.current = null;
    if (!w) return;
    const dx = e.changedTouches[0].clientX - w.x, dy = e.changedTouches[0].clientY - w.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) st.setSel(addDays(st.sel, dx < 0 ? 7 : -7));
  };
  // open on «now»: today scrolls to the current time (a third from the top), another day to its
  // first task — the morning hours stay above, a swipe away
  const scrollRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const opened = useRef(false);
  useEffect(() => {
    const sc = scrollRef.current, area = areaRef.current;
    if (!sc || !area || !st.ready) return;
    const first = !opened.current;
    if (!first && st.sel !== st.today) return; // picking another day keeps the day strip in view
    opened.current = true;
    const nd = new Date();
    const target = st.sel === st.today ? nd.getHours() + nd.getMinutes() / 60 : timed[0]?.s ?? 8;
    const y = area.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop + (Math.max(h0, target) - h0) * ROW_M - sc.clientHeight * 0.3;
    sc.scrollTo({ top: Math.max(0, y), behavior: first ? 'auto' : 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.sel, st.ready]);
  const areaClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    st.openNew(st.sel, Math.max(0, Math.min(23, Math.floor(h0 + (e.clientY - rect.top) / ROW_M))));
  };

  return (
    <div ref={scrollRef} className={s.mobileScroll} data-scroll data-fixed-scale>
      <AppHeader title={t('nav.planner')} />

      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <button type="button" className={s.mMonthBtn} onClick={() => { st.setCursor(monthStart(st.sel)); st.setMonthOpen(!st.monthOpen); }} aria-expanded={st.monthOpen}>
            {monthName} <span style={{ display: 'inline-grid', placeItems: 'center', transition: 'transform .2s', transform: `rotate(${st.monthOpen ? 180 : 0}deg)`, color: 'rgba(232,237,243,.5)' }}><Icon name="chevronDown" size={18} sw={2} /></span>
          </button>
          <div style={{ font: 'var(--fw-regular) 12px var(--font-ui)', color: 'rgba(232,237,243,.6)', marginTop: 4 }}>
            {st.sel === st.today ? t('calendar.tasksToday', { n: dayItems.length }) : t('calendar.tasksOn', { n: dayItems.length, d: dayLabel(t, st.sel) })}
          </div>
        </div>
        <button type="button" className={s.mPlus} onClick={() => st.openNew(st.sel)} aria-label={t('calendar.newTaskShort')}><Icon name="plus" size={22} sw={2} /></button>
      </div>

      {st.monthOpen && (
        <div className={s.mMonth}>
          <MonthHead t={t} st={st} small />
          <MonthMini t={t} st={st} big gap={5} onPick={(d) => { st.setSel(d); st.setMonthOpen(false); }} />
        </div>
      )}

      <div style={{ marginTop: 16, display: 'flex', gap: 8, touchAction: 'pan-y' }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {week.map((d, i) => {
          const on = d === st.sel;
          const has = st.items.some((x) => x.day === d);
          return (
            <button key={d} type="button" className={s.selBtn} aria-pressed={on} data-today={d === st.today} onClick={() => st.setSel(d)}>
              <span style={{ font: 'var(--fw-regular) 17px var(--font-ui)', color: on ? '#fff' : '#E8EDF3' }}>{parseDay(d).getDate()}</span>
              <span style={{ font: 'var(--fw-regular) 10px var(--font-mono)', color: on ? 'rgba(255,255,255,.75)' : 'rgba(232,237,243,.4)' }}>{dows[i]}</span>
              <span className={s.selDot} style={{ opacity: has ? 1 : 0, background: on ? '#fff' : 'var(--accent)' }} />
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 20, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ font: 'var(--fw-regular) 15px var(--font-ui)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dayLabel(t, st.sel)}</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 'none' }}>
          {st.sel !== st.today && <button type="button" className={s.todayBtn} onClick={st.goToday}>{t('common.today')}</button>}
          <button type="button" className={s.arrow} aria-label={t('calendar.prev')} onClick={() => st.setSel(addDays(st.sel, -1))}><Icon name="chevronLeft" size={15} sw={2} /></button>
          <button type="button" className={s.arrow} aria-label={t('calendar.next')} onClick={() => st.setSel(addDays(st.sel, 1))}><Icon name="chevron" size={15} sw={2} /></button>
        </div>
      </div>

      {untimed.length > 0 && (
        <div className={s.mCard}>
          <div className={s.noteLab} style={{ marginBottom: 2 }}>{t('calendar.untimed').toUpperCase()}</div>
          <DayList t={t} st={st} list={untimed} compact />
        </div>
      )}
      {dayItems.length === 0 && <div style={{ margin: '0 0 10px' }}><EmptyState compact title={t('empty.freeDay')} sub={t('calendar.emptyDay')} /></div>}

      {timed.length > 0 && <div className={s.holdHint}><Icon name="move" size={13} sw={1.8} />{t('calendar.holdHint')}</div>}
      <div style={{ display: 'flex' }}>
        <div style={{ width: 48, flex: 'none', display: 'flex', flexDirection: 'column', paddingTop: 2 }}>
          {hours.map((h) => <div key={h} className={s.mHour}>{h}</div>)}
        </div>
        <div ref={areaRef} className={s.mArea} data-day={st.sel} style={{ height: (h1 - h0 + 1) * ROW_M }} onClick={areaClick}>
          {st.sel === st.today && <NowLine now={st.now} h0={h0} row={ROW_M} />}
          {timed.map((ev) => (
            <button key={ev.id} type="button" className={s.mEv} data-ev data-drag={st.dragId === ev.id} data-done={ev.done}
              onPointerDown={(e) => st.startDrag(ev.id, e, { row: ROW_M, h0 })}
              onClick={(e) => st.clickEv(ev.id, e)}
              onContextMenu={(e) => e.preventDefault()}
              style={{ top: (ev.s! - h0) * ROW_M + 2, height: Math.max(26, (ev.e! - ev.s!) * ROW_M - 6), background: EV_FILL[ev.c] }}>
              <div className={s.mEvTitle}>{ev.title}</div>
              {((ev.e! - ev.s!) >= 0.75 || st.dragId === ev.id) && <div className={s.evTime}>{fmt(ev.s!)}–{fmt(ev.e!)}</div>}
              <span className={s.mGrip} onPointerDown={(e) => st.startDrag(ev.id, e, { row: ROW_M, h0, mode: 'resize' })} />
            </button>
          ))}
        </div>
      </div>

      <WeekBreakdown t={t} st={st} />

      {/* portal: inside the scroll container the bottom bar and the + button were drawn over the sheet */}
      {st.draft && createPortal(
        <div className={s.sheetOverlay} onClick={() => st.setDraft(null)}>
          <div className={s.sheet} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <Editor key={st.draft.ev.id} t={t} st={st} d={st.draft} />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/* Time by category this week — folded, instead of the progress cards (PROBLEM #13: analytics live in Analytics). */
function WeekBreakdown({ t, st }: { t: T; st: St }) {
  const end = addDays(st.week0, 6);
  const week = st.items.filter((x) => x.day >= st.week0 && x.day <= end && x.s != null);
  const hrs = (c: EvColor) => week.filter((x) => x.c === c).reduce((a, x) => a + (x.e! - x.s!), 0);
  const max = Math.max(1, ...COLORS.map(hrs));
  if (!week.length) return null;
  return (
    <details className={s.weekBox}>
      <summary className={s.weekSum}>{t('calendar.weekBreakdown')}<Icon name="chevronDown" size={14} sw={2} /></summary>
      <div className={s.weekBody}>
        {BD.map((b) => (
          <div key={b.c} className={s.weekRow}>
            <span className={s.bdLabel}>{t.pick(b.label)}</span>
            <span className={s.bdTrack}><span style={{ width: (hrs(b.c) / max) * 100 + '%', background: EV_FILL[b.c] }} /></span>
            <span className={s.bdHrs}>{t('units.h', { h: Math.round(hrs(b.c) * 10) / 10 })}</span>
          </div>
        ))}
      </div>
    </details>
  );
}
