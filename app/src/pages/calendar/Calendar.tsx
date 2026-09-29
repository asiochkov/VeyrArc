import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { colorOf, createItem, fetchCalendar, updateNote, updateTimes, weekEvents, type CalRaw } from '../../data/calendar';
import { fetchGoals } from '../../data/goals';
import { useHeader } from '../../data/header';
import { addDays, daysBetween, hhmm, parseDay } from '../../data/model';
import { buildToday, fetchToday } from '../../data/today';
import { useAuth } from '../../lib/auth';
import { hasBackend } from '../../lib/supabase';
import { Link } from 'react-router-dom';
import { useAddAction } from '../../app/nav';
import { useT, type T } from '../../i18n';
import { useIsDesktop } from '../../lib/useIsDesktop';
import {
  breakdown, calEvents, EV_CAT, EV_FILL, H0, H1, mobileStats, MONTH, ROW, ROW_M, TASKS_TODAY, TODAY_IDX, TZ_LABEL,
  upcoming, weekDates, type CalEvent, type EvColor,
} from '../../mock/calendar';
import { Icon, type IconName } from '../../ui/Icon';
import { Avatar, Segmented } from '../../ui/primitives';
import s from './calendar.module.css';

type View = 'month' | 'week' | 'day';
type Creating = { d: number; s: number; e: number; t: string; c: EvColor };

const fmt = (x: number) => {
  const h = Math.floor(x);
  const m = Math.round((x - h) * 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
};
const HOURS = Array.from({ length: H1 - H0 + 1 }, (_, i) => String(H0 + i).padStart(2, '0') + ':00');

type Cal = {
  weekDates: number[]; todayIdx: number; monthIdx: number; year: number;
  month: { days: number; sel: number; today: number; lead: number };
  monthDots: (n: number) => EvColor[];
  upcoming: { name: { ru: string; en: string }; time: string; done: boolean }[];
  breakdown: { label: { ru: string; en: string }; hours: number; c: string; w: number }[];
  tasksToday: number; tz: string;
  stats: { value: string; key: 'habitsDone' | 'daysInRow' | 'daysToGoal'; hue: string; icon: string; span: number }[];
};
const MOCK_CAL: Cal = {
  weekDates, todayIdx: TODAY_IDX, monthIdx: 8, year: 2026, month: { ...MONTH, lead: 0 },
  monthDots: (n) => { const i = weekDates.indexOf(n); return i >= 0 ? calEvents.filter((e) => e.d === i).map((e) => e.c) : []; },
  upcoming, breakdown, tasksToday: TASKS_TODAY, tz: TZ_LABEL, stats: mobileStats.map((m) => ({ ...m })),
};
const BD = [
  { key: 'meeting', label: { ru: 'Встречи', en: 'Meetings' }, c: '#5B9BD5' },
  { key: 'work', label: { ru: 'Проекты', en: 'Projects' }, c: '#5FBF9B' },
  { key: 'deadline', label: { ru: 'События', en: 'Events' }, c: '#E8A54B' },
  { key: 'review', label: { ru: 'Ревью', en: 'Reviews' }, c: '#9B87D6' },
];
const COLOR_OF_KEY: Record<string, EvColor> = { meeting: 'blue', work: 'green', deadline: 'red', review: 'purple' };

function deriveCal(raw: CalRaw, extra: { habitsPct: number | null; streak: number | null; daysToGoal: number | null }): Cal {
  const d0 = parseDay(raw.day);
  const days = new Date(d0.getFullYear(), d0.getMonth() + 1, 0).getDate();
  const lead = (new Date(d0.getFullYear(), d0.getMonth(), 1).getDay() + 6) % 7;
  const events = weekEvents(raw);
  const hours: Record<string, number> = {};
  for (const e of events) { const k = Object.keys(COLOR_OF_KEY).find((x) => COLOR_OF_KEY[x] === e.c)!; hours[k] = (hours[k] ?? 0) + (e.e - e.s); }
  const maxH = Math.max(1, ...Object.values(hours));
  const off = -new Date().getTimezoneOffset() / 60;
  const todays = raw.items.filter((p) => p.day === raw.day);
  return {
    weekDates: Array.from({ length: 7 }, (_, i) => parseDay(addDays(raw.week0, i)).getDate()),
    todayIdx: daysBetween(raw.week0, raw.day), monthIdx: d0.getMonth(), year: d0.getFullYear(),
    month: { days, sel: d0.getDate(), today: d0.getDate(), lead },
    monthDots: (n) => {
      const day = raw.monthStart.slice(0, 8) + String(n).padStart(2, '0');
      return raw.items.filter((p) => p.day === day).map((p) => colorOf(raw, p));
    },
    upcoming: todays.slice(0, 4).map((p) => ({ name: { ru: p.title, en: p.title }, time: hhmm(p.starts_at) ?? '—', done: p.done })),
    breakdown: BD.map((b) => ({ label: b.label, c: b.c, hours: Math.round((hours[b.key] ?? 0) * 10) / 10, w: Math.round(((hours[b.key] ?? 0) / maxH) * 78) })),
    tasksToday: todays.length,
    tz: `GMT ${off >= 0 ? '+' : '−'}${Math.abs(off)}`,
    stats: [
      { value: extra.habitsPct == null ? '—' : extra.habitsPct + '%', key: 'habitsDone', hue: '#5FBF9B', icon: 'check', span: 2 },
      { value: extra.streak == null ? '—' : String(extra.streak), key: 'daysInRow', hue: '#E8A54B', icon: 'flameTall', span: 1 },
      { value: extra.daysToGoal == null ? '—' : String(extra.daysToGoal), key: 'daysToGoal', hue: '#9B87D6', icon: 'target', span: 1 },
    ],
  };
}

/* State + handlers from VeyrArc Calendar.dc.html */
function useCalendar() {
  const session = useAuth((x) => x.session);
  const on = hasBackend && !!session;
  const q = useQuery({ queryKey: ['calendar'], queryFn: fetchCalendar, enabled: on, refetchOnWindowFocus: false });
  const qt = useQuery({ queryKey: ['today'], queryFn: fetchToday, enabled: on, refetchOnWindowFocus: false });
  const qg = useQuery({ queryKey: ['goals'], queryFn: fetchGoals, enabled: on, refetchOnWindowFocus: false });
  const cal = useMemo<Cal | null>(() => {
    if (!hasBackend) return MOCK_CAL;
    if (!q.data) return null;
    const tv = qt.data ? buildToday(qt.data, { initials: '', freezesAllowed: 1 }) : null;
    const todayIdx = (new Date().getDay() + 6) % 7;
    const dots = tv ? tv.habits.flatMap((h) => h.dots.slice(0, todayIdx + 1)) : [];
    const deadlines = (qg.data?.goals ?? []).filter((g) => g.status === 'active' && g.deadline && g.deadline >= q.data.day).map((g) => daysBetween(q.data.day, g.deadline!));
    return deriveCal(q.data, {
      habitsPct: dots.length ? Math.round((dots.filter(Boolean).length / dots.length) * 100) : null,
      streak: tv ? tv.stats.streak : null,
      daysToGoal: deadlines.length ? Math.min(...deadlines) : null,
    });
  }, [q.data, qt.data, qg.data]);
  const [view, setView] = useState<View>('week');
  const [selEvent, setSelEvent] = useState<string | null>(hasBackend ? null : 'meet');
  const [selDay, setSelDay] = useState(hasBackend ? (new Date().getDay() + 6) % 7 : 1);
  const [monthOpen, setMonthOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [events, setEvents] = useState<CalEvent[]>(hasBackend ? [] : calEvents);
  useEffect(() => { if (q.data) setEvents(weekEvents(q.data)); }, [q.data]);
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const noteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const persistTimes = (id: string) => {
    if (!hasBackend) return;
    setTimeout(() => { const ev = eventsRef.current.find((x) => x.id === id); if (ev) void updateTimes(id, ev.s, ev.e).catch(() => {}); }, 0);
  };
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState<Creating | null>(null);
  const drag = useRef<{ id: string; y0: number; s: number; e: number } | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    const move = (ev: globalThis.PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const snap = Math.round(((ev.clientY - d.y0) / ROW) * 4) / 4;
      const len = d.e - d.s;
      let ns = d.s + snap;
      if (ns < H0) ns = H0;
      if (ns + len > H1) ns = H1 - len;
      setEvents((list) => list.map((x) => (x.id === d.id ? { ...x, s: ns, e: ns + len } : x)));
    };
    const up = () => { const d = drag.current; drag.current = null; if (d) persistTimes(d.id); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { clearInterval(t); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, []);

  const startDrag = (id: string, ev: PointerEvent) => {
    ev.preventDefault();
    const e0 = events.find((x) => x.id === id)!;
    setSelEvent(id);
    drag.current = { id, y0: ev.clientY, s: e0.s, e: e0.e };
  };

  const nudge = (id: string, field: 's' | 'e', delta: number) => { persistTimes(id); setEvents((list) => list.map((x) => {
    if (x.id !== id) return x;
    if (field === 's') return { ...x, s: Math.max(H0, Math.min(x.e - 0.25, x.s + delta)) };
    return { ...x, e: Math.min(H1, Math.max(x.s + 0.25, x.e + delta)) };
  })); };

  const nudgeCreating = (field: 's' | 'e', delta: number) => setCreating((c) => {
    if (!c) return c;
    if (field === 's') return { ...c, s: Math.max(H0, Math.min(c.e - 0.25, c.s + delta)) };
    return { ...c, e: Math.min(H1, Math.max(c.s + 0.25, c.e + delta)) };
  });

  const onColumnClick = (dayIndex: number, e: MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    let hr = Math.round((H0 + (e.clientY - rect.top) / ROW) * 4) / 4;
    hr = Math.max(H0, Math.min(H1 - 0.5, hr));
    setCreating({ d: dayIndex, s: hr, e: Math.min(hr + 1, H1), t: '', c: 'blue' });
    setSelEvent(null);
  };

  const addTask = (label: { ru: string; en: string }) => {
    const used = events.filter((ev) => ev.d === selDay).map((ev) => ev.s);
    let st = 12;
    while (used.indexOf(st) >= 0 && st < H1 - 1) st++;
    const item: CalEvent = { id: hasBackend ? crypto.randomUUID() : 't' + Date.now(), d: selDay, s: st, e: Math.min(st + 1, H1), t: label, c: 'purple' };
    if (hasBackend && q.data) void createItem(q.data, item.id, addDays(q.data.week0, selDay), item.s, item.e, label[document.documentElement.lang === 'en' ? 'en' : 'ru'], item.c).catch(() => {});
    setEvents((l) => [...l, item]);
    setSelEvent(item.id);
  };

  const saveCreating = (fallback: { ru: string; en: string }) => {
    if (!creating) return;
    const title = creating.t.trim();
    const item: CalEvent = { id: hasBackend ? crypto.randomUUID() : 'n' + Date.now(), d: creating.d, s: creating.s, e: creating.e, t: title ? { ru: title, en: title } : fallback, c: creating.c };
    if (hasBackend && q.data) void createItem(q.data, item.id, addDays(q.data.week0, creating.d), item.s, item.e, title || fallback[document.documentElement.lang === 'en' ? 'en' : 'ru'], item.c).catch(() => {});
    setEvents((l) => [...l, item]);
    setCreating(null);
    setSelEvent(item.id);
  };

  return {
    cal: cal ?? MOCK_CAL, ready: !!cal,
    saveNote: (id: string, v: string) => {
      setNotes((n) => ({ ...n, [id]: v }));
      if (!hasBackend) return;
      clearTimeout(noteTimers.current[id]);
      noteTimers.current[id] = setTimeout(() => { void updateNote(id, v).catch(() => {}); }, 700);
    },
    view, setView, selEvent, setSelEvent, selDay, setSelDay, monthOpen, setMonthOpen, now, events, notes, setNotes,
    creating, setCreating, startDrag, nudge, nudgeCreating, onColumnClick, addTask, saveCreating,
  };
}
type St = ReturnType<typeof useCalendar>;

export function Calendar() {
  const t = useT();
  const isDesktop = useIsDesktop();
  const st = useCalendar();
  const hd = useHeader();

  const setHandler = useAddAction((x) => x.setHandler);
  useEffect(() => {
    setHandler(() => st.addTask({ ru: 'Новая задача', en: 'New task' }));
    return () => setHandler(null);
  });

  if (!st.ready) return <div style={{ flex: 1, background: 'var(--bg)' }} />;
  return isDesktop ? <DesktopCalendar t={t} st={st} initials={hd.initials} /> : <MobileCalendar t={t} st={st} initials={hd.initials} />;
}

/* month grid cells: 30 days + trailing greyed days, sel = 12, today = 11 */
function monthCells(cal: Cal) {
  const M = cal.month;
  const cells: { label: string; k: 'sel' | 'today' | 'day' | 'grey' }[] = [];
  const prevDays = new Date(cal.year, cal.monthIdx, 0).getDate();
  for (let i = M.lead; i > 0; i--) cells.push({ label: String(prevDays - i + 1), k: 'grey' });
  for (let n = 1; n <= M.days; n++) cells.push({ label: String(n), k: n === M.sel ? 'sel' : n === M.today ? 'today' : 'day' });
  let nx = 1;
  while (cells.length < 35 || cells.length % 7) cells.push({ label: String(nx++), k: 'grey' });
  return cells;
}

function MonthMini({ t, big, gap, cal }: { t: T; big: boolean; gap: number; cal: Cal }) {
  return (
    <>
      <div className={s.grid7} style={{ gap, marginBottom: gap }}>
        {t.list('weekdays.short').map((w) => <div key={w} className={s.wd} style={big ? undefined : { padding: '2px 0' }}>{w}</div>)}
      </div>
      <div className={s.grid7} style={{ gap }}>
        {monthCells(cal).map((c, i) => (
          <div key={i} className={s.mcell} data-k={c.k} style={{ fontSize: big ? 13 : 12, borderRadius: big ? 11 : 9 }}>{c.label}</div>
        ))}
      </div>
    </>
  );
}

function durLabel(t: T, hours: number) {
  const h = Math.floor(hours);
  const m = Math.round((hours % 1) * 60);
  const txt = ((h ? t('units.h', { h }) + ' ' : '') + (m ? t('units.m', { m }) : '')).trim();
  return txt || t('units.m', { m: 0 });
}

function NowLine({ now }: { now: number }) {
  const nd = new Date(now);
  const nowH = Math.min(H1, Math.max(H0, nd.getHours() + nd.getMinutes() / 60));
  const label = String(nd.getHours()).padStart(2, '0') + ':' + String(nd.getMinutes()).padStart(2, '0');
  return (
    <div className={s.nowLine} style={{ top: (nowH - H0) * ROW }}>
      <span className={s.nowDot} /><span className={s.nowPill}>{label}</span>
    </div>
  );
}

function EventBlock({ t, st, ev, wide }: { t: T; st: St; ev: CalEvent; wide: boolean }) {
  return (
    <div
      className={s.ev} data-sel={ev.id === st.selEvent}
      style={{ top: (ev.s - H0) * ROW + 2, height: (ev.e - ev.s) * ROW - 5, background: EV_FILL[ev.c] }}
      onPointerDown={(e) => st.startDrag(ev.id, e)}
      onClick={(e) => { e.stopPropagation(); st.setSelEvent(ev.id); st.setCreating(null); }}
    >
      <div className={s.evTitle} style={{ fontSize: wide ? 13 : 12 }}>{t.pick(ev.t)}</div>
      <span className={s.grip} />
    </div>
  );
}

function TimeBox({ label, value, onUp, onDown }: { label: string; value: string; onUp: () => void; onDown: () => void }) {
  return (
    <div className={s.timeBox}>
      <div><div className={s.timeLab}>{label}</div><div className={s.timeVal}>{value}</div></div>
      <div className={s.steps}>
        <button type="button" className={s.step} onClick={onUp}>+</button>
        <button type="button" className={s.step} onClick={onDown}>−</button>
      </div>
    </div>
  );
}

function EventPopover({ t, st }: { t: T; st: St }) {
  const ev = st.events.find((x) => x.id === st.selEvent) || st.events.find((x) => x.id === 'meet') || (hasBackend ? st.events[0] : undefined);
  if (!ev) return null;
  const cat = EV_CAT[ev.c];
  const note = st.notes[ev.id] ?? (ev.n ? t.pick(ev.n) : '');
  return (
    <div className={s.popover}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className={s.popTitle}>{t.pick(ev.t)}</div>
        <button type="button" className={s.smallBtn}><Icon name="pencil" size={15} /></button>
      </div>
      <div className={s.dateRow}>
        <span style={{ color: '#6FA0D6' }}><Icon name="cal" size={16} /></span>
        <span style={{ font: '600 13px var(--font-ui)' }} />
      </div>
      <div className={s.times}>
        <TimeBox label={t('calendar.start')} value={fmt(ev.s)} onUp={() => st.nudge(ev.id, 's', 0.25)} onDown={() => st.nudge(ev.id, 's', -0.25)} />
        <TimeBox label={t('calendar.end')} value={fmt(ev.e)} onUp={() => st.nudge(ev.id, 'e', 0.25)} onDown={() => st.nudge(ev.id, 'e', -0.25)} />
      </div>
      <div className={s.dur}><span className={s.durDot} />{durLabel(t, ev.e - ev.s)}{t('calendar.dragHint')}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
        <span className={s.tag} style={{ color: cat.hue, background: cat.hue + '28' }}>
          <span className={s.tagDot} style={{ background: cat.hue }} />{t(`calendar.cats.${cat.tag}`)}
        </span>
      </div>
      <div style={{ marginTop: 14 }}>
        <div className={s.noteLab}>{t('calendar.note')}</div>
        <textarea className={s.note} value={note} placeholder={t('calendar.notePlaceholder')}
          onChange={(e) => st.saveNote(ev.id, e.target.value)} />
      </div>
    </div>
  );
}

function CreatePopover({ t, st }: { t: T; st: St }) {
  const c = st.creating!;
  return (
    <div className={s.popover}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ font: '700 11px var(--font-mono)', letterSpacing: '.14em', color: 'rgba(232,237,243,.4)' }}>{t('calendar.newTask')}</div>
        <button type="button" className={s.smallBtn} onClick={() => st.setCreating(null)} aria-label={t('common.close')}>✕</button>
      </div>
      <input className={s.titleInput} value={c.t} placeholder={t('calendar.taskName')}
        onChange={(e) => { const v = e.target.value; st.setCreating((x) => (x ? { ...x, t: v } : x)); }} />
      <div className={s.dateRow}>
        <span style={{ color: '#6FA0D6' }}><Icon name="cal" size={16} /></span>
        <span style={{ font: '600 13px var(--font-ui)' }} />
      </div>
      <div className={s.times}>
        <TimeBox label={t('calendar.start')} value={fmt(c.s)} onUp={() => st.nudgeCreating('s', 0.25)} onDown={() => st.nudgeCreating('s', -0.25)} />
        <TimeBox label={t('calendar.end')} value={fmt(c.e)} onUp={() => st.nudgeCreating('e', 0.25)} onDown={() => st.nudgeCreating('e', -0.25)} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
        {(['blue', 'green', 'red', 'purple'] as EvColor[]).map((k) => {
          const cat = EV_CAT[k];
          const on = c.c === k;
          return (
            <button key={k} type="button" className={s.tag} style={{ cursor: 'pointer', color: on ? cat.hue : 'rgba(232,237,243,.5)', background: on ? cat.hue + '28' : 'rgba(255,255,255,.05)' }}
              onClick={() => st.setCreating((x) => (x ? { ...x, c: k } : x))}>
              <span className={s.tagDot} style={{ background: cat.hue }} />{t(`calendar.cats.${cat.tag}`)}
            </button>
          );
        })}
      </div>
      <button type="button" className={s.saveBtn} onClick={() => st.saveCreating({ ru: 'Новая задача', en: 'New task' })}>{t('calendar.createTask')}</button>
    </div>
  );
}

/* ---------------- desktop ---------------- */

function DesktopCalendar({ t, st, initials }: { t: T; st: St; initials: string }) {
  const dows = t.list('weekdays.short');
  const { weekDates, todayIdx: TODAY_IDX, upcoming, breakdown, tz: TZ_LABEL } = st.cal;
  const monthName = t.list('months')[st.cal.monthIdx];
  const hoursCol = (
    <div className={s.hours}>
      <div className={s.tz}>{TZ_LABEL}</div>
      {HOURS.map((h) => <div key={h} className={s.hour}>{h}</div>)}
    </div>
  );

  return (
    <div className={s.desktopRoot}>
      <div className={s.sidebar}>
        <div>
          <div className={s.miniMonth}>{monthName}</div>
          <MonthMini t={t} big={false} gap={4} cal={st.cal} />
        </div>
        <div>
          <div className={s.secHead} style={{ marginBottom: 12 }}>
            <div className={s.secTitle}>{t('calendar.upcoming')}</div>
            <a href="#" className={s.secLink} onClick={(e) => e.preventDefault()}>{t('calendar.all')}</a>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {upcoming.map((u, i) => (
              <div key={i} className={s.upRow}>
                <span className={s.upBox} data-done={u.done}>{u.done && <Icon name="check" size={11} sw={3} />}</span>
                <span className={s.upName}>{t.pick(u.name)}</span>
                <span className={s.upTime}>{u.time}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className={s.secHead} style={{ marginBottom: 14 }}>
            <div className={s.secTitle}>{t('calendar.breakdown')}</div>
            <a href="#" className={s.secLink} onClick={(e) => e.preventDefault()}>{t('calendar.all')}</a>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {breakdown.map((b, i) => (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span className={s.bdLabel}>{t.pick(b.label)}</span>
                  <span className={s.bdHrs}>{t('units.h', { h: b.hours })}</span>
                </div>
                <div className={s.bdTrack}><div style={{ height: '100%', width: b.w + '%', borderRadius: 4, background: b.c }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={s.main}>
        <div className={s.head}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, minWidth: 0 }}>
            <div className={s.monthTitle}>{monthName}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
            <Segmented variant="calendar" value={st.view} onChange={st.setView}
              options={(['month', 'week', 'day'] as View[]).map((v) => ({ id: v, label: t(`calendar.views.${v}`) }))} />
            <button type="button" className={s.iconBtn}><Icon name="search" size={18} /></button>
            <button type="button" className={s.iconBtn}><Icon name="bell" size={18} /></button>
            <Avatar initials={initials} size={36} />
          </div>
        </div>

        {st.view === 'week' && (
          <>
            <div style={{ marginTop: 20 }}>
              <div className={s.dayHeads}>
                {weekDates.map((d, i) => <div key={d} className={s.dayHead} data-today={i === TODAY_IDX}>{t('calendar.dayHead', { dow: dows[i], date: d })}</div>)}
              </div>
            </div>
            <div className={`${s.scroll} wk-scroll`}>
              {hoursCol}
              <div className={s.cols}>
                <NowLine now={st.now} />
                {weekDates.map((d, i) => (
                  <div key={d} className={s.col} data-today={i === TODAY_IDX} onClick={(e) => st.onColumnClick(i, e)}>
                    {st.events.filter((ev) => ev.d === i).map((ev) => <EventBlock key={ev.id} t={t} st={st} ev={ev} wide={false} />)}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {st.view === 'day' && (
          <>
            <div style={{ marginTop: 20, paddingLeft: 56 }}>
              <div className={s.selDayHead}>{t('calendar.dayHead', { dow: dows[st.selDay], date: weekDates[st.selDay] })}</div>
            </div>
            <div className={`${s.scroll} wk-scroll`}>
              {hoursCol}
              <div className={s.col} onClick={(e) => st.onColumnClick(st.selDay, e)}>
                <NowLine now={st.now} />
                {st.events.filter((ev) => ev.d === st.selDay).map((ev) => <EventBlock key={ev.id} t={t} st={st} ev={ev} wide />)}
              </div>
            </div>
          </>
        )}

        {st.view === 'month' && (
          <div style={{ marginTop: 20, flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div className={s.grid7} style={{ gap: 8, marginBottom: 8 }}>
              {dows.map((w) => <div key={w} style={{ font: '700 11px var(--font-mono)', letterSpacing: '.08em', color: 'rgba(232,237,243,.4)', padding: '0 4px' }}>{w}</div>)}
            </div>
            <div className={s.grid7} style={{ flex: 1, gridAutoRows: '1fr', gap: 8 }}>
              {monthCells(st.cal).map((c, i) => {
                const greyed = c.k === 'grey';
                const evs = greyed ? [] : st.cal.monthDots(Number(c.label)).map((cc) => ({ c: cc }));
                const isSel = c.k === 'sel';
                return (
                  <div key={i} className={s.monthCell} data-sel={isSel}>
                    <div className={s.monthNum} style={greyed ? { color: 'rgba(232,237,243,.22)' } : isSel ? { color: '#A8CBEF' } : undefined}>{c.label}</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {evs.slice(0, 4).map((ev, k) => <span key={k} style={{ width: 6, height: 6, borderRadius: '50%', background: EV_FILL[ev.c] }} />)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {st.view !== 'month' && !st.creating && <EventPopover t={t} st={st} />}
        {st.view !== 'month' && st.creating && <CreatePopover t={t} st={st} />}
      </div>
    </div>
  );
}

/* ---------------- mobile ---------------- */

function MobileCalendar({ t, st, initials }: { t: T; st: St; initials: string }) {
  const dows = t.list('weekdays.short');
  const { weekDates, tasksToday: TASKS_TODAY, stats: mobileStats } = st.cal;
  const monthName = t.list('months')[st.cal.monthIdx];
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
          <button type="button" className={s.mMonthBtn} onClick={() => st.setMonthOpen(!st.monthOpen)}>
            {monthName} <span style={{ display: 'inline-grid', placeItems: 'center', transition: 'transform .2s', transform: `rotate(${st.monthOpen ? 180 : 0}deg)`, color: 'rgba(232,237,243,.5)' }}><Icon name="chevronDown" size={18} sw={2} /></span>
          </button>
          <div style={{ font: '400 12px var(--font-ui)', color: 'rgba(232,237,243,.45)', marginTop: 4 }}>{t('calendar.tasksToday', { n: TASKS_TODAY })}</div>
        </div>
        <button type="button" className={s.mPlus} onClick={() => st.addTask({ ru: 'Новая задача', en: 'New task' })} aria-label={t('common.add')}><Icon name="plus" size={22} sw={2} /></button>
      </div>

      {st.monthOpen && (
        <div className={s.mMonth}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ font: '700 14px var(--font-ui)' }}>{monthName}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className={s.arrow}><Icon name="chevronLeft" size={15} sw={2} /></button>
              <button type="button" className={s.arrow}><Icon name="chevron" size={15} sw={2} /></button>
            </div>
          </div>
          <MonthMini t={t} big gap={5} cal={st.cal} />
        </div>
      )}

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        {weekDates.map((d, i) => {
          const on = i === st.selDay;
          return (
            <button key={d} type="button" className={s.selBtn} aria-pressed={on} onClick={() => st.setSelDay(i)}>
              <span style={{ font: '700 17px var(--font-ui)', color: on ? '#06121f' : '#E8EDF3' }}>{d}</span>
              <span style={{ font: '600 10px var(--font-mono)', color: on ? 'rgba(6,18,31,.65)' : 'rgba(232,237,243,.4)' }}>{dows[i]}</span>
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 20, font: '700 15px var(--font-ui)', marginBottom: 6 }}>{t('calendar.schedule')}</div>
      <div style={{ display: 'flex' }}>
        <div style={{ width: 48, flex: 'none', display: 'flex', flexDirection: 'column', paddingTop: 2 }}>
          {HOURS.map((h) => <div key={h} className={s.mHour}>{h}</div>)}
        </div>
        <div className={s.mArea}>
          {st.events.filter((ev) => ev.d === st.selDay).map((ev) => (
            <div key={ev.id} className={s.mEv} style={{ top: (ev.s - H0) * ROW_M + 2, height: (ev.e - ev.s) * ROW_M - 6, background: EV_FILL[ev.c] }}>
              <div style={{ font: '700 13px var(--font-ui)', color: '#fff', lineHeight: 1.2 }}>{t.pick(ev.t)}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 24, font: '700 15px var(--font-ui)', marginBottom: 10 }}>{t('calendar.progress')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {mobileStats.map((m) => (
          <div key={m.key} className={s.statCard} style={{ gridColumn: 'span ' + m.span, background: m.hue + '1c', border: `1px solid ${m.hue}40` }}>
            <div className={s.statIcon} style={{ background: m.hue + '2e', color: m.hue }}>
              {m.icon === 'check' ? <Icon name="check" size={11} sw={3} /> : <Icon name={m.icon as IconName} size={20} />}
            </div>
            <div style={{ font: '700 28px var(--font-mono)', marginTop: 14, color: '#F3F6FA' }}>{m.value}</div>
            <div style={{ font: '600 12px var(--font-ui)', color: 'rgba(232,237,243,.55)', marginTop: 3 }}>{t(`calendar.stats.${m.key}`)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
