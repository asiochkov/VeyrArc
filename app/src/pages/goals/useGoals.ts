import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { config } from '../../config';
import { addGoalTask, completeGoal, createGoal, deleteGoal, fetchGoals, renameGoal, saveEntry } from '../../data/goals';
import { useAuth, isProPlan } from '../../lib/auth';
import { isoDay } from '../../lib/day';
import { hasBackend } from '../../lib/supabase';
import { entries as seedEntries, FREE_GOAL_LIMIT, GOAL_HUES, goals as seedGoals, GOALS_TODAY, type Entry, type Goal } from '../../mock/goals';

/* Logic from VeyrArc Training.dc.html (goals). Dates are YYYY-MM-DD strings. */
const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (y: number, m: number, d: number) => y + '-' + pad(m + 1) + '-' + pad(d);
export const parseYmd = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s: string, delta: number) => { const dt = parseYmd(s); dt.setDate(dt.getDate() + delta); return ymd(dt.getFullYear(), dt.getMonth(), dt.getDate()); };

export type DayStatus = 'future' | 'neutral' | 'missed' | 'done' | 'partial';
const EMPTY: Entry = { tasksDone: {}, diary: '', mood: null };

export function useGoals() {
  const TODAY = hasBackend ? isoDay() : GOALS_TODAY;
  const { session, plan } = useAuth();
  const limit = hasBackend ? (isProPlan(plan) ? config.limits.pro.goals : config.limits.free.goals) : FREE_GOAL_LIMIT;
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['goals'], queryFn: fetchGoals, enabled: hasBackend && !!session, refetchOnWindowFocus: false });
  const [goals, setGoals] = useState<Goal[]>(hasBackend ? [] : seedGoals);
  const [entries, setEntries] = useState<Record<string, Entry>>(hasBackend ? {} : seedEntries);
  useEffect(() => { if (q.data) { setGoals(q.data.goals); setEntries(q.data.entries); } }, [q.data]);
  const sync = (p: Promise<unknown>) => { void p.catch(() => {}).finally(() => { void qc.invalidateQueries({ queryKey: ['goals'] }); }); };
  const entryTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [adhoc, setAdhoc] = useState<Record<string, string[]>>({});
  const [screen, setScreen] = useState<'day' | 'month'>('day');
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(hasBackend ? null : 'travel');
  const [viewDate, setViewDate] = useState(TODAY);
  const [viewMonth, setViewMonth] = useState(() => { const d = parseYmd(TODAY); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [addingGoal, setAddingGoal] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [newGoalName, setNewGoalName] = useState('');
  const [newGoalType, setNewGoalType] = useState<'process' | 'number'>('process');
  const [newGoalDeadline, setNewGoalDeadline] = useState('');
  const [menuGoalId, setMenuGoalId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [streakPanelOpen, setStreakPanelOpen] = useState(false);
  const [adhocOpen, setAdhocOpen] = useState(false);
  const [adhocText, setAdhocText] = useState('');
  const [recapGoalId, setRecapGoalId] = useState<string | null>(null);

  const active = goals.filter((g) => g.status === 'active');
  const completed = goals.filter((g) => g.status === 'completed');
  const selected = active.find((g) => g.id === selectedGoalId) || active[0] || null;

  const getEntry = (goalId: string, date: string) => entries[goalId + '|' + date] || EMPTY;
  const patchEntry = (goalId: string, date: string, patch: Partial<Entry>) => {
    const key = goalId + '|' + date;
    const next = { ...(entries[key] || EMPTY), ...patch };
    setEntries((all) => ({ ...all, [key]: { ...(all[key] || EMPTY), ...patch } }));
    if (hasBackend) {
      // diary typing is debounced; checks and mood save at once
      clearTimeout(entryTimers.current[key]);
      entryTimers.current[key] = setTimeout(() => { void saveEntry(goalId, date, next).catch(() => {}); }, 'diary' in patch ? 700 : 0);
    }
  };

  const dayStatus = (g: Goal, date: string): DayStatus => {
    if (date > TODAY) return 'future';
    if (date < g.startDate) return 'neutral';
    const e = entries[g.id + '|' + date];
    const doneCount = e ? Object.values(e.tasksDone || {}).filter(Boolean).length : 0;
    if (doneCount === 0) return 'missed';
    if (doneCount >= g.tasks.length) return 'done';
    return 'partial';
  };

  const computeStreak = (g: Goal) => {
    let count = 0;
    let d = TODAY;
    while (dayStatus(g, d) === 'done') { count++; d = addDays(d, -1); }
    return count;
  };

  const recap = (id: string) => {
    const g = goals.find((x) => x.id === id);
    if (!g) return null;
    const totalDays = Math.max(1, Math.round((parseYmd(TODAY).getTime() - parseYmd(g.startDate).getTime()) / 86400000) + 1);
    let doneDays = 0;
    let notes = 0;
    for (let d = g.startDate; d <= TODAY; d = addDays(d, 1)) {
      if (dayStatus(g, d) === 'done') doneDays++;
      if (entries[g.id + '|' + d]?.diary) notes++;
    }
    return { goal: g, pct: Math.round((doneDays / totalDays) * 100), best: Math.max(g.bestStreak, computeStreak(g)), notes };
  };

  const startAddGoal = () => {
    setAddingGoal(true);
    setLimitReached(active.length >= limit);
    setNewGoalName(''); setNewGoalType('process'); setNewGoalDeadline('');
  };

  const confirmAddGoal = (defaultTask: { ru: string; en: string }) => {
    const name = newGoalName.trim();
    if (!name) { setAddingGoal(false); return; }
    const id = hasBackend ? crypto.randomUUID() : 'g' + Date.now();
    const taskId = hasBackend ? crypto.randomUUID() : 'a';
    const g: Goal = {
      id, title: { ru: name, en: name }, hue: GOAL_HUES[goals.length % GOAL_HUES.length], status: 'active', startDate: TODAY,
      bestStreak: 0, type: newGoalType, deadline: newGoalDeadline || undefined, tasks: [{ id: taskId, text: defaultTask, detail: { ru: '', en: '' } }],
    };
    if (hasBackend) sync(createGoal({ id, title: name, hue: g.hue, type: newGoalType, deadline: newGoalDeadline, taskId, task: defaultTask[document.documentElement.lang === 'en' ? 'en' : 'ru'] }));
    setGoals((l) => [...l, g]);
    setSelectedGoalId(id);
    setAddingGoal(false);
    setNewGoalName('');
  };

  const menu = {
    rename: () => { const g = goals.find((x) => x.id === menuGoalId); setRenaming(true); setRenameValue(g ? g.title.ru : ''); },
    complete: () => { const id = menuGoalId; const cg = goals.find((x) => x.id === id); if (hasBackend && id && cg) sync(completeGoal(id, Math.max(cg.bestStreak, computeStreak(cg)))); setGoals((l) => l.map((g) => (g.id === id ? { ...g, status: 'completed' } : g))); setMenuGoalId(null); setRecapGoalId(id); },
    remove: () => {
      const id = menuGoalId;
      if (hasBackend && id) sync(deleteGoal(id));
      const remain = goals.filter((g) => g.id !== id);
      setGoals(remain);
      setMenuGoalId(null);
      setSelectedGoalId(remain.find((g) => g.status === 'active')?.id ?? null);
    },
    close: () => setMenuGoalId(null),
    confirmRename: () => {
      const id = menuGoalId;
      const val = renameValue.trim();
      if (hasBackend && id && val) sync(renameGoal(id, val));
      setGoals((l) => l.map((g) => (g.id === id ? { ...g, title: val ? { ru: val, en: val } : g.title } : g)));
      setMenuGoalId(null);
      setRenaming(false);
    },
  };

  const confirmAdhoc = () => {
    if (!selected) return;
    const text = adhocText.trim();
    if (!text) return;
    const key = selected.id + '|' + viewDate;
    // backend: an added task becomes one of the goal's daily tasks (B11)
    if (hasBackend) { sync(addGoalTask(selected.id, text, selected.tasks.length)); setAdhocText(''); setAdhocOpen(false); return; }
    setAdhoc((a) => ({ ...a, [key]: (a[key] || []).concat([text]) }));
    setAdhocText('');
    setAdhocOpen(false);
  };

  const shiftMonth = (delta: number) => setViewMonth((v) => { const dt = new Date(v.y, v.m + delta, 1); return { y: dt.getFullYear(), m: dt.getMonth() }; });

  return {
    today: TODAY, limit, ready: !hasBackend || !!q.data,
    goals, entries, active, completed, selected, screen, setScreen, setSelectedGoalId, viewDate, setViewDate, viewMonth, shiftMonth,
    addingGoal, setAddingGoal, limitReached, newGoalName, setNewGoalName, newGoalType, setNewGoalType, newGoalDeadline, setNewGoalDeadline,
    startAddGoal, confirmAddGoal, menuGoalId, setMenuGoalId, renaming, setRenaming, renameValue, setRenameValue, menu,
    expandedTaskId, setExpandedTaskId, streakPanelOpen, setStreakPanelOpen, adhocOpen, setAdhocOpen, adhocText, setAdhocText, confirmAdhoc,
    adhocItems: selected ? adhoc[selected.id + '|' + viewDate] || [] : [],
    getEntry, patchEntry, dayStatus, computeStreak, recap, recapGoalId, setRecapGoalId,
  };
}
export type GoalsState = ReturnType<typeof useGoals>;
