import { translate, useLangStore } from '../../i18n';
import { toast } from '../../ui/toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { config } from '../../config';
import { addGoalTask, completeGoal, createGoal, deleteGoal, deleteGoalTask, fetchGoals, renameGoal, renameGoalTask, saveEntry } from '../../data/goals';
import { useAuth, isProPlan } from '../../lib/auth';
import { isoDay } from '../../lib/day';
import { hasBackend } from '../../lib/supabase';
import { mutate } from '../../data/sync';
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
  const sync = (run: () => Promise<unknown>) => mutate(run, { rollback: () => { void q.refetch(); }, done: () => { void qc.invalidateQueries({ queryKey: ['goals'] }); } });
  const entryTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // diary save indicator per goal|day
  const [saveState, setSaveState] = useState<Record<string, 'saving' | 'saved' | 'error'>>({});
  const [screen, setScreen] = useState<'day' | 'month'>('day');
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(hasBackend ? null : 'travel');
  const [viewDate, setViewDate] = useState(TODAY);
  const [viewMonth, setViewMonth] = useState(() => { const d = parseYmd(TODAY); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [addingGoal, setAddingGoal] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [newGoalName, setNewGoalName] = useState('');
  const [newGoalStep, setNewGoalStep] = useState('');
  const [newGoalDeadline, setNewGoalDeadline] = useState('');
  const [menuGoalId, setMenuGoalId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [streakPanelOpen, setStreakPanelOpen] = useState(false);
  const [stepOpen, setStepOpen] = useState(false);
  const [stepText, setStepText] = useState('');
  const [editingSteps, setEditingSteps] = useState(false);
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
      const diary = 'diary' in patch;
      if (diary) setSaveState((x) => ({ ...x, [key]: 'saving' }));
      entryTimers.current[key] = setTimeout(() => {
        mutate(() => saveEntry(goalId, date, next), {
          done: () => { if (diary) setSaveState((x) => ({ ...x, [key]: 'saved' })); },
          rollback: () => { setSaveState((x) => ({ ...x, [key]: 'error' })); if (!diary) void q.refetch(); },
        });
      }, diary ? 700 : 0);
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
    setNewGoalName(''); setNewGoalStep(''); setNewGoalDeadline('');
  };

  const newId = () => (hasBackend ? crypto.randomUUID() : 'x' + Date.now() + Math.random().toString(36).slice(2, 6));
  const confirmAddGoal = () => {
    const name = newGoalName.trim();
    if (!name) return;
    const id = newId();
    const step = newGoalStep.trim();
    const steps = step ? [{ id: newId(), text: step }] : [];
    const g: Goal = {
      id, title: { ru: name, en: name }, hue: GOAL_HUES[goals.length % GOAL_HUES.length], status: 'active', startDate: TODAY,
      bestStreak: 0, type: 'process', deadline: newGoalDeadline || undefined, tasks: steps.map((x) => ({ id: x.id, text: { ru: x.text, en: x.text }, detail: { ru: '', en: '' } })),
    };
    sync(() => createGoal({ id, title: name, hue: g.hue, deadline: newGoalDeadline, steps }));
    setViewDate(TODAY);
    setStepOpen(!step);
    setGoals((l) => [...l, g]);
    setSelectedGoalId(id);
    setAddingGoal(false);
    setNewGoalName('');
  };

  const menu = {
    rename: () => { const g = goals.find((x) => x.id === menuGoalId); setRenaming(true); setRenameValue(g ? g.title.ru : ''); },
    complete: () => { const id = menuGoalId; const cg = goals.find((x) => x.id === id); if (id && cg) sync(() => completeGoal(id, Math.max(cg.bestStreak, computeStreak(cg)))); setGoals((l) => l.map((g) => (g.id === id ? { ...g, status: 'completed' } : g))); setMenuGoalId(null); setRecapGoalId(id); },
    remove: () => {
      const id = menuGoalId;
      if (id) sync(() => deleteGoal(id));
      const remain = goals.filter((g) => g.id !== id);
      setGoals(remain);
      setMenuGoalId(null);
      setSelectedGoalId(remain.find((g) => g.status === 'active')?.id ?? null);
    },
    close: () => setMenuGoalId(null),
    confirmRename: () => {
      const id = menuGoalId;
      const val = renameValue.trim();
      if (id && val) sync(() => renameGoal(id, val));
      setGoals((l) => l.map((g) => (g.id === id ? { ...g, title: val ? { ru: val, en: val } : g.title } : g)));
      setMenuGoalId(null);
      setRenaming(false);
    },
  };

  /* daily steps of the selected goal */
  const patchTasks = (goalId: string, fn: (tasks: Goal['tasks']) => Goal['tasks']) => setGoals((l) => l.map((x) => (x.id === goalId ? { ...x, tasks: fn(x.tasks) } : x)));
  const addStep = () => {
    if (!selected) return;
    const text = stepText.trim().slice(0, 160);
    if (!text) { setStepOpen(false); return; }
    const id = newId();
    patchTasks(selected.id, (ts) => [...ts, { id, text: { ru: text, en: text }, detail: { ru: '', en: '' } }]);
    sync(() => addGoalTask(id, selected.id, text, selected.tasks.length));
    setStepText('');
  };
  const renameStep = (id: string, text: string) => {
    if (!selected) return;
    const v = text.trim().slice(0, 160);
    if (!v) return;
    patchTasks(selected.id, (ts) => ts.map((x) => (x.id === id ? { ...x, text: { ru: v, en: v } } : x)));
    sync(() => renameGoalTask(id, v));
  };
  const removeStep = (id: string) => {
    if (!selected) return;
    const goalId = selected.id;
    const idx = selected.tasks.findIndex((x) => x.id === id);
    const step = selected.tasks[idx];
    if (!step) return;
    patchTasks(goalId, (ts) => ts.filter((x) => x.id !== id));
    sync(() => deleteGoalTask(id));
    const lang = useLangStore.getState().lang;
    toast.action(translate(lang, 'goals.stepDeleted'), translate(lang, 'explain.undo'), () => {
      patchTasks(goalId, (ts) => { const n = ts.slice(); n.splice(idx, 0, step); return n; });
      sync(() => addGoalTask(step.id, goalId, step.text.ru, idx));
    });
  };

  const shiftMonth = (delta: number) => setViewMonth((v) => { const dt = new Date(v.y, v.m + delta, 1); return { y: dt.getFullYear(), m: dt.getMonth() }; });

  return {
    today: TODAY, limit, ready: !hasBackend || !!q.data, loadError: q.isError && !q.data, retry: () => { void q.refetch(); },
    goals, entries, active, completed, selected, screen, setScreen, setSelectedGoalId, viewDate, setViewDate, viewMonth, shiftMonth,
    addingGoal, setAddingGoal, limitReached, newGoalName, setNewGoalName, newGoalStep, setNewGoalStep, newGoalDeadline, setNewGoalDeadline,
    startAddGoal, confirmAddGoal, confirmDelete, setConfirmDelete, menuGoalId, setMenuGoalId, renaming, setRenaming, renameValue, setRenameValue, menu,
    expandedTaskId, setExpandedTaskId, streakPanelOpen, setStreakPanelOpen,
    stepOpen, setStepOpen, stepText, setStepText, addStep, renameStep, removeStep, editingSteps, setEditingSteps,
    saveState: selected ? saveState[selected.id + '|' + viewDate] : undefined,
    getEntry, patchEntry, dayStatus, computeStreak, recap, recapGoalId, setRecapGoalId,
  };
}
export type GoalsState = ReturnType<typeof useGoals>;
