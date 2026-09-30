import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type TouchEvent } from 'react';
import { Link } from 'react-router-dom';
import { createItem, deleteItem, fetchCalendar, saveItem, setDone, toEvents, type CalRaw, type Ev } from '../../data/calendar';
import { fetchGoals } from '../../data/goals';
import { useHeader } from '../../data/header';
import { addDays, daysBetween, parseDay, weekStart } from '../../data/model';
import { buildToday, fetchToday } from '../../data/today';
import { useAddAction } from '../../app/nav';
import { useT, type T } from '../../i18n';
import { useAuth } from '../../lib/auth';
import { isoDay } from '../../lib/day';
import { hasBackend } from '../../lib/supabase';
import { useIsDesktop } from '../../lib/useIsDesktop';
import { calEvents, EV_CAT, EV_FILL, H0, H1, mobileStats, ROW, ROW_M, type EvColor } from '../../mock/calendar';
import { Icon, type IconName } from '../../ui/Icon';
import { Avatar, Checkbox, Segmented } from '../../ui/primitives';
import s from './calendar.module.css';

type View = 'month' | 'week' | 'day';
type Stat = { value: string; key: 'habitsDone' | 'daysInRow' | 'daysToGoal'; hue: string; icon: string; span: number };
const COLORS: EvColor[] = ['blue', 'green', 'red', 'purple'];
const BD: { c: EvColor; label: { ru: string; en: string } }[] = [
  { c: 'blue', label: { ru: 'Встречи', en: 'Meetings' } },
  { c: 'green', label: { ru: 'Работа', en: 'Work' } },
  { c: 'red', label: { ru: 'Дедлайны', en: 'Deadlines' } },
  { c: 'purple', label: { ru: 'Ревью', en: 'Reviews' } },
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

/* the design preview has no backend: its sample week is laid onto the current week */
function mockEvents(): Ev[] {
  const w0 = weekStart(isoDay());
  return calEvents.map((e) => ({ id: e.id, day: addDays(w0, e.d), s: e.s, e: e.e, title: e.t.ru, c: e.c, note: e.n?.ru ?? '', done: false }));
}

/* ---------------- state ---------------- */

type Draft = { ev: Ev; isNew: boolean };

function useCalendar() {
  const session = useAuth((x) => x.session);
  const on = hasBackend && !!session;
  const qc = useQueryClient();
  const today = isoDay();
  const [sel, setSelRaw] = useState(today);
  const [cursor, setCursor] = useState(monthStart(today)); // month shown in the month grids
  const [view, setView] = useState<View>('week');
  const [monthOpen, setMonthOpen] = useState(false);
  const setSel = (d: string) => { setSelRaw(d); setCursor(monthStart(d)); };

  const week0 = weekStart(sel);
  // one fetch covers the visible week and the whole visible month grid
  const gridFrom = weekStart(cursor);
  const gridTo = addDays(weekStart(monthEnd(cursor)), 6);
  const from = week0 < gridFrom ? week0 : gridFrom;
  const to = addDays(week0, 6) > gridTo ? addDays(week0, 6) : gridTo;
  const q = useQuery({ queryKey: ['calendar', from, to], queryFn: () => fetchCalendar(from, to), enabled: on, refetchOnWindowFocus: false, placeholderData: (p) => p });
  const qt = useQuery({ queryKey: ['today'], queryFn: fetchToday, enabled: on, refetchOnWindowFocus: false });
  const qg = useQuery({ queryKey: ['goals'], queryFn: fetchGoals, enabled: on, refetchOnWindowFocus: false });

  const [items, setItems] = useState<Ev[]>(hasBackend ? [] : mockEvents());
  const cats = useRef<CalRaw['cats']>([]);
  useEffect(() => {
    if (!q.data) return;
    cats.current = q.data.cats;
    const fresh = toEvents(q.data);
    // keep items from other ranges that are already loaded; the fetched range is authoritative
    setItems((old) => [...old.filter((x) => x.day < from || x.day > to), ...fresh]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const sync = (p: Promise<unknown>) => {
    void p.then(() => qc.invalidateQueries({ queryKey: ['today'] })).catch(() => q.refetch());
  };

  const stats = useMemo<Stat[]>(() => {
    if (!hasBackend) return mobileStats.map((m) => ({ ...m })) as Stat[];
    const tv = qt.data ? buildToday(qt.data, { initials: '', freezesAllowed: 1 }) : null;
    const wd = (new Date().getDay() + 6) % 7;
    const dots = tv ? tv.habits.flatMap((h) => h.dots.slice(0, wd + 1)) : [];
    const deadlines = (qg.data?.goals ?? []).filter((g) => g.status === 'active' && g.deadline && g.deadline >= today).map((g) => daysBetween(today, g.deadline!));
    const pct = dots.length ? Math.round((dots.filter(Boolean).length / dots.length) * 100) : null;
    return [
      { value: pct == null ? '—' : pct + '%', key: 'habitsDone', hue: '#5FBF9B', icon: 'check', span: 2 },
      { value: tv ? String(tv.stats.streak) : '—', key: 'daysInRow', hue: '#E8A54B', icon: 'flameTall', span: 1 },
      { value: deadlines.length ? String(Math.min(...deadlines)) : '—', key: 'daysToGoal', hue: '#9B87D6', icon: 'target', span: 1 },
    ];
  }, [qt.data, qg.data, today]);

  /* ---- editing ---- */
  const [draft, setDraft] = useState<Draft | null>(null);
  const openNew = (day: string, start?: number) => {
    let st = start;
    if (st == null) {
      // first free full hour from now (today) or from 9:00
      const used = itemsRef.current.filter((x) => x.day === day && x.s != null);
      st = day === today ? Math.min(22, new Date().getHours() + 1) : 9;
      while (used.some((u) => u.s! < st! + 1 && u.e! > st!) && st < 22) st++;
    }
    setDraft({ isNew: true, ev: { id: hasBackend ? crypto.randomUUID() : 'n' + Date.now(), day, s: st, e: Math.min(24, st + 1), title: '', c: 'blue', note: '', done: false } });
  };
  const openEdit = (id: string) => { const ev = itemsRef.current.find((x) => x.id === id); if (ev) setDraft({ isNew: false, ev: { ...ev } }); };
  const commit = (ev: Ev, isNew: boolean) => {
    setItems((l) => (isNew ? [...l, ev] : l.map((x) => (x.id === ev.id ? ev : x))));
    if (hasBackend) sync(isNew ? createItem(cats.current, ev) : saveItem(cats.current, ev));
    setDraft(null);
  };
  const remove = (id: string) => {
    setItems((l) => l.filter((x) => x.id !== id));
    if (hasBackend) sync(deleteItem(id));
    setDraft(null);
  };
  const toggleDone = (id: string) => {
    const ev = itemsRef.current.find((x) => x.id === id);
    if (!ev) return;
    if (!ev.done) navigator.vibrate?.(15);
    setItems((l) => l.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));
    if (hasBackend) sync(setDone(id, !ev.done));
  };

  /* ---- drag to move (desktop grid) ---- */
  const drag = useRef<{ id: string; y0: number; s: number; e: number; moved: boolean } | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const tm = setInterval(() => setNow(Date.now()), 30000);
    const move = (ev: globalThis.PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (!d.moved && Math.abs(ev.clientY - d.y0) < 5) return;
      d.moved = true;
      const snap = Math.round(((ev.clientY - d.y0) / ROW) * 4) / 4;
      const len = d.e - d.s;
      const ns = Math.max(0, Math.min(24 - len, d.s + snap));
      setItems((list) => list.map((x) => (x.id === d.id ? { ...x, s: ns, e: ns + len } : x)));
    };
    const up = () => {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      if (!d.moved) { openEdit(d.id); return; }
      const ev = itemsRef.current.find((x) => x.id === d.id);
      if (ev && hasBackend) sync(saveItem(cats.current, ev));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { clearInterval(tm); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const startDrag = (id: string, e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const ev = itemsRef.current.find((x) => x.id === id)!;
    drag.current = { id, y0: e.clientY, s: ev.s ?? 9, e: ev.e ?? 10, moved: false };
  };

  /* ---- navigation ---- */
  const shift = (n: number) => {
    if (view === 'month') { setCursor(addMonths(cursor, n)); return; }
    setSel(addDays(sel, view === 'week' ? 7 * n : n));
  };
  const goToday = () => { setSel(today); };

  return {
    ready: !on || !!q.data, today, sel, setSel, cursor, setCursor, view, setView, monthOpen, setMonthOpen, week0,
    items, now, stats, draft, setDraft, openNew, openEdit, commit, remove, toggleDone, startDrag, shift, goToday,
  };
}
type St = ReturnType<typeof useCalendar>;

/** Visible hours: 7:00–21:00, stretched to fit earlier or later items. */
function hourRange(list: Ev[]) {
  let a = H0, b = H1;
  for (const x of list) if (x.s != null) { a = Math.min(a, Math.floor(x.s)); b = Math.max(b, Math.ceil(x.e ?? x.s + 1)); }
  return [a, Math.min(24, b)] as const;
}

export function Calendar() {
  const t = useT();
  const isDesktop = useIsDesktop();
  const st = useCalendar();
  const hd = useHeader();

  const setHandler = useAddAction((x) => x.setHandler);
  useEffect(() => {
    setHandler(() => st.openNew(st.sel));
    return () => setHandler(null);
  });

  if (!st.ready) return <div style={{ flex: 1, background: 'var(--bg)' }} />;
  return isDesktop ? <DesktopCalendar t={t} st={st} initials={hd.initials} /> : <MobileCalendar t={t} st={st} initials={hd.initials} />;
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
            <button key={day} type="button" className={s.mcell} data-k={k} style={{ fontSize: big ? 13 : 12, borderRadius: big ? 11 : 9 }} onClick={() => onPick(day)}>
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
        <button type="button" className={s.step} onClick={() => onChange(value + 0.25)} aria-label="+15">+</button>
        <button type="button" className={s.step} onClick={() => onChange(value - 0.25)} aria-label="−15">−</button>
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
        <span style={{ color: '#6FA0D6', display: 'grid' }}><Icon name="cal" size={16} /></span>
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
  return (
    <div
      className={s.ev} data-sel={st.draft?.ev.id === ev.id} data-done={ev.done}
      style={{ top: (ev.s! - h0) * ROW + 2, height: Math.max(18, (ev.e! - ev.s!) * ROW - 5), background: EV_FILL[ev.c] }}
      onPointerDown={(e) => st.startDrag(ev.id, e)}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={s.evTitle} style={{ fontSize: wide ? 13 : 12 }}>{ev.title}</div>
      {(ev.e! - ev.s!) >= 0.75 && <div className={s.evTime}>{fmt(ev.s!)}–{fmt(ev.e!)}</div>}
      <span className={s.grip} />
    </div>
  );
}

function DesktopCalendar({ t, st, initials }: { t: T; st: St; initials: string }) {
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
          {dayItems.length ? <DayList t={t} st={st} list={dayItems} /> : <div className={s.hint}>{t('calendar.emptyDay')}</div>}
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
            <button type="button" className={s.newBtn} onClick={() => st.openNew(st.sel)}><Icon name="plus" size={16} sw={2.2} />{t('calendar.newTaskShort')}</button>
            <Avatar initials={initials} size={36} />
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
                  <div key={d} className={s.col} data-today={d === st.today} onClick={(e) => colClick(d, e)}>
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
              {dows.map((w) => <div key={w} style={{ font: '700 11px var(--font-mono)', letterSpacing: '.08em', color: 'rgba(232,237,243,.4)', padding: '0 4px' }}>{w}</div>)}
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

function MobileCalendar({ t, st, initials }: { t: T; st: St; initials: string }) {
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
  const areaClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    st.openNew(st.sel, Math.max(0, Math.min(23, Math.floor(h0 + (e.clientY - rect.top) / ROW_M))));
  };

  return (
    <div className={s.mobileScroll} data-scroll>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/" className={s.mBack} aria-label={t('nav.today')}><Icon name="back" size={18} sw={2} /></Link>
          <div>
            <div style={{ font: '700 10px/1 var(--font-mono)', letterSpacing: '.24em', color: 'rgba(232,237,243,.34)' }}>{t('common.brandCaps')}</div>
            <div style={{ font: '800 22px/1.1 var(--font-ui)', marginTop: 5 }}>{t('calendar.planner')}</div>
          </div>
        </div>
        <Avatar initials={initials} />
      </div>

      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <button type="button" className={s.mMonthBtn} onClick={() => { st.setCursor(monthStart(st.sel)); st.setMonthOpen(!st.monthOpen); }} aria-expanded={st.monthOpen}>
            {monthName} <span style={{ display: 'inline-grid', placeItems: 'center', transition: 'transform .2s', transform: `rotate(${st.monthOpen ? 180 : 0}deg)`, color: 'rgba(232,237,243,.5)' }}><Icon name="chevronDown" size={18} sw={2} /></span>
          </button>
          <div style={{ font: '400 12px var(--font-ui)', color: 'rgba(232,237,243,.45)', marginTop: 4 }}>
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
              <span style={{ font: '700 17px var(--font-ui)', color: on ? '#06121f' : '#E8EDF3' }}>{parseDay(d).getDate()}</span>
              <span style={{ font: '600 10px var(--font-mono)', color: on ? 'rgba(6,18,31,.65)' : 'rgba(232,237,243,.4)' }}>{dows[i]}</span>
              <span className={s.selDot} style={{ opacity: has ? 1 : 0, background: on ? '#06121f' : 'var(--accent)' }} />
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 20, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ font: '700 15px var(--font-ui)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dayLabel(t, st.sel)}</div>
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
      {dayItems.length === 0 && <div className={s.hint} style={{ margin: '0 0 10px' }}>{t('calendar.emptyDay')}</div>}

      <div style={{ display: 'flex' }}>
        <div style={{ width: 48, flex: 'none', display: 'flex', flexDirection: 'column', paddingTop: 2 }}>
          {hours.map((h) => <div key={h} className={s.mHour}>{h}</div>)}
        </div>
        <div className={s.mArea} style={{ height: (h1 - h0 + 1) * ROW_M }} onClick={areaClick}>
          {st.sel === st.today && <NowLine now={st.now} h0={h0} row={ROW_M} />}
          {timed.map((ev) => (
            <button key={ev.id} type="button" className={s.mEv} data-done={ev.done} onClick={() => st.openEdit(ev.id)}
              style={{ top: (ev.s! - h0) * ROW_M + 2, height: Math.max(26, (ev.e! - ev.s!) * ROW_M - 6), background: EV_FILL[ev.c] }}>
              <div className={s.mEvTitle}>{ev.title}</div>
              {(ev.e! - ev.s!) >= 0.75 && <div className={s.evTime}>{fmt(ev.s!)}–{fmt(ev.e!)}</div>}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 24, font: '700 15px var(--font-ui)', marginBottom: 10 }}>{t('calendar.progress')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {st.stats.map((m) => (
          <div key={m.key} className={s.statCard} style={{ gridColumn: 'span ' + m.span, background: m.hue + '1c', border: `1px solid ${m.hue}40` }}>
            <div className={s.statIcon} style={{ background: m.hue + '2e', color: m.hue }}>
              {m.icon === 'check' ? <Icon name="check" size={11} sw={3} /> : <Icon name={m.icon as IconName} size={20} />}
            </div>
            <div style={{ font: '700 28px var(--font-mono)', marginTop: 14, color: '#F3F6FA' }}>{m.value}</div>
            <div style={{ font: '600 12px var(--font-ui)', color: 'rgba(232,237,243,.55)', marginTop: 3 }}>{t(`calendar.stats.${m.key}`)}</div>
          </div>
        ))}
      </div>

      {st.draft && (
        <div className={s.sheetOverlay} onClick={() => st.setDraft(null)}>
          <div className={s.sheet} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <Editor key={st.draft.ev.id} t={t} st={st} d={st.draft} />
          </div>
        </div>
      )}
    </div>
  );
}
