import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { config } from '../../config';
import { buildToday, fetchToday, writeFocus, writeLog, writeMood, type TodayView } from '../../data/today';
import { useAuth } from '../../lib/auth';
import { hasBackend } from '../../lib/supabase';
import { plannerToday, todayHabits, todayStats, weekStates, type TodayHabit } from '../../mock/today';
import { isDone } from './HabitRow';
import { notifyFocusDone } from '../../lib/reminders';

const MOCK: TodayView = { habits: todayHabits, week: weekStates, planner: plannerToday, stats: todayStats, streakBase: todayStats.streak - 1, requiredIds: [] };
/* Pomodoro tabs «Фокус / Короткий / Длинный» */
const TAB_MIN = [25, 5, 15];

/* Interaction logic from VeyrArc Today.dc.html (componentDidMount / patchHabit / flash), backed by Supabase when configured. */
export function useTodayState() {
  const { session, profile, plan } = useAuth();
  const q = useQuery({ queryKey: ['today'], queryFn: fetchToday, enabled: hasBackend && !!session, refetchOnWindowFocus: false });
  const initials = ((profile?.first_name?.[0] ?? '') + (profile?.last_name?.[0] ?? '')).toUpperCase() || (session?.user.email?.[0] ?? '·').toUpperCase();
  const view = useMemo<TodayView | null>(() => {
    if (!hasBackend) return MOCK;
    if (!q.data) return null;
    return buildToday(q.data, { initials, freezesAllowed: plan?.plan === 'pro' ? config.limits.pro.freezesPerWeek : config.limits.free.freezesPerWeek });
  }, [q.data, initials, plan?.plan]);

  const [habits, setHabits] = useState<TodayHabit[]>(view?.habits ?? []);
  const [moodSel, setMood] = useState(view?.stats.moodSel ?? 2);
  useEffect(() => { if (view) { setHabits(view.habits); setMood(view.stats.moodSel); } }, [view]);

  const [flashId, setFlashId] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flash = useCallback((id: string) => {
    setFlashId(id);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashId(null), 400);
  }, []);

  const save = (p: Promise<unknown>) => { void p.catch(() => q.refetch()); };
  const patch = useCallback((id: string, fn: (h: TodayHabit) => Partial<TodayHabit>) => {
    setHabits((list) => list.map((h) => (h.id === id ? ({ ...h, ...fn(h) } as TodayHabit) : h)));
  }, []);

  // duration timers tick once a second; a finished timer is saved as done
  useEffect(() => {
    const t = setInterval(() => {
      setHabits((list) => {
        if (!list.some((h) => h.type === 'duration' && h.running)) return list;
        return list.map((h) => {
          if (h.type !== 'duration' || !h.running) return h;
          const left = Math.max(0, h.left - 1);
          if (left === 0) {
            setTimeout(() => flash(h.id), 0);
            if (hasBackend) save(writeLog(h.id, h.minutes, true));
          }
          return { ...h, left, running: left > 0 };
        });
      });
    }, 1000);
    return () => { clearInterval(t); clearTimeout(flashTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flash]);

  const actions = (h: TodayHabit) => ({
    onToggle: () => {
      if (h.type !== 'binary') return;
      patch(h.id, () => ({ checked: !h.checked }));
      if (hasBackend) save(writeLog(h.id, h.checked ? 0 : 1, true));
    },
    onInc: () => {
      if (h.type !== 'counter' || h.count >= h.goal) return;
      patch(h.id, () => ({ count: h.count + 1 }));
      if (h.count + 1 >= h.goal) flash(h.id);
      if (hasBackend) save(writeLog(h.id, h.count + 1, h.count + 1 >= h.goal));
    },
    onDec: () => {
      if (h.type !== 'counter') return;
      const n = Math.max(0, h.count - 1);
      patch(h.id, () => ({ count: n }));
      if (hasBackend) save(writeLog(h.id, n, n >= h.goal));
    },
    onPlay: () => {
      if (isDone(h)) return;
      patch(h.id, (x) => (x.type === 'duration' ? { running: !x.running, started: true } : {}));
    },
    onStop: () => {
      patch(h.id, (x) => (x.type === 'duration' ? { running: false, started: false, left: x.minutes * 60 } : {}));
      if (hasBackend) save(writeLog(h.id, 0, false));
    },
  });

  const setMoodSel = (i: number) => { setMood(i); if (hasBackend) save(writeMood(i)); };

  /* ---- pomodoro ---- */
  const [activeTab, setTab] = useState(0);
  const [pomoLeft, setPomoLeft] = useState(TAB_MIN[0] * 60);
  const [pomoRunning, setPomoRunning] = useState(false);
  const [extra, setExtra] = useState({ sessions: 0, minutes: 0 });
  const [pomoSession, setSession] = useState<number | null>(null);
  const setActiveTab = (i: number) => { setTab(i); setPomoLeft(TAB_MIN[i] * 60); setPomoRunning(false); };
  useEffect(() => {
    if (!pomoRunning) return;
    const t = setInterval(() => setPomoLeft((x) => Math.max(0, x - 1)), 1000);
    return () => clearInterval(t);
  }, [pomoRunning]);
  useEffect(() => {
    if (pomoLeft > 0 || !pomoRunning) return;
    setPomoRunning(false);
    if (activeTab === 0) {
      const cur = pomoSession ?? view?.stats.session ?? 1;
      setExtra((e) => ({ sessions: e.sessions + 1, minutes: e.minutes + TAB_MIN[0] }));
      if (hasBackend) save(writeFocus(TAB_MIN[0]));
      notifyFocusDone();
      setSession(cur % 4 + 1);
      const next = cur === 4 ? 2 : 1;
      setTab(next); setPomoLeft(TAB_MIN[next] * 60);
    } else { setTab(0); setPomoLeft(TAB_MIN[0] * 60); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pomoLeft, pomoRunning]);
  const pomo = {
    label: `${Math.floor(pomoLeft / 60)}:${String(pomoLeft % 60).padStart(2, '0')}`,
    running: pomoRunning,
    toggle: () => setPomoRunning((r) => !r),
    reset: () => { setPomoRunning(false); setPomoLeft(TAB_MIN[activeTab] * 60); },
  };

  const doneN = habits.filter(isDone).length;
  const dayPct = habits.length ? Math.round((doneN / habits.length) * 100) : 0;
  // "Тело" / "Разум" / "Дисциплина" come from the first part of the category label
  const catFrac = (cat: string) => {
    const list = habits.filter((h) => h.cat.ru.split(' · ')[0] === cat);
    return list.filter(isDone).length + '/' + list.length;
  };

  const base = view?.stats ?? todayStats;
  const req = view?.requiredIds ?? [];
  const reqToday = habits.filter((h) => req.includes(h.id));
  const keptToday = hasBackend ? (reqToday.length ? reqToday.every(isDone) : doneN > 0) : true;
  const streak = hasBackend ? (view?.streakBase ?? 0) + (keptToday ? 1 : 0) : base.streak;
  const stats = {
    ...base,
    streak, streakRecord: Math.max(base.streakRecord, streak),
    streakBars: hasBackend ? [...base.streakBars.slice(0, 6), keptToday ? 1 : 0] : base.streakBars,
    sessionsToday: base.sessionsToday + extra.sessions,
    focusTodayMin: base.focusTodayMin + extra.minutes,
    session: pomoSession ?? base.session,
  };

  return {
    ready: !!view, habits, moodSel, setMoodSel, activeTab, setActiveTab, flashId, actions, pomo,
    week: view?.week ?? weekStates, planner: view?.planner ?? [], stats,
    doneN, dayPct, catBody: catFrac('Тело'), catMind: catFrac('Разум'), catDisc: catFrac('Дисциплина'),
  };
}
