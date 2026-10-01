import { useQuery, type QueryClient } from '@tanstack/react-query';
import { isoDay } from '../lib/day';
import { useAuth } from '../lib/auth';
import { db, hasBackend } from '../lib/supabase';
import { mockSystem } from '../mock/system';
import {
  addDays, type ArcRow, type DayRow, type FocusRow, type HabitRowDb, type LogRow, type PlanRow, type QuitRow,
} from '../data/model';

/*
 * One source of truth for the whole app (Master Changeset task 02, RS-9).
 * Layer 1 Supabase → Layer 2 one react-query entry ['system'] → Layer 3 actions (state/actions.ts)
 * → Layer 4 screens, which only read through selectors. One fetch on start; every action updates
 * this cache at once (all screens re-render from the same data) and then the server.
 */

export type CatRow = { id: string; key: string | null; hue: string };
export type GoalDb = {
  id: string; title: string; hue: string; type: 'process' | 'number'; deadline: string | null; started_on: string;
  status: 'active' | 'completed'; best_streak: number; created_at: string; linked_core_habit_id?: string | null; arc_id?: string | null; completed_at?: string | null;
};
export type TaskDb = { id: string; goal_id: string; text: string; detail: string | null; sort: number };
export type EntryDb = { goal_id: string; day: string; done_task_ids: string[]; diary: string | null; mood?: number | null };
export type RelapseRow = { id: string; quit_id: string; at: string };

export type SystemRaw = {
  day: string;
  habits: HabitRowDb[];          // active and archived (archived_at set)
  logs: LogRow[];                // last 400 days
  days: DayRow[];                // mood / water / freeze per day, last 400 days
  focus: FocusRow[];             // last 400 days
  plan: PlanRow[];               // planner events from 400 days ago to 120 days ahead
  cats: CatRow[];
  arcs: ArcRow[];
  quits: QuitRow[]; relapses: RelapseRow[];
  goals: GoalDb[]; tasks: TaskDb[]; entries: EntryDb[];
};

export const SYSTEM_KEY = ['system'] as const;

export async function fetchSystem(): Promise<SystemRaw> {
  const day = isoDay();
  const from = addDays(day, -400);
  const q = await Promise.all([
    db().from('habits').select('*').order('sort').order('created_at'),
    db().from('habit_logs').select('habit_id, day, value, done').gte('day', from),
    db().from('day_entries').select('day, mood, water, frozen, note').gte('day', from),
    db().from('focus_sessions').select('*').gte('started_at', from),
    db().from('plan_items').select('*').gte('day', from).lte('day', addDays(day, 120)).order('starts_at', { nullsFirst: false }),
    db().from('plan_categories').select('id, key, hue'),
    db().from('arcs').select('*').order('number'),
    db().from('quits').select('*').is('archived_at', null).order('created_at'),
    db().from('quit_relapses').select('id, quit_id, at'),
    db().from('goals').select('*').order('created_at'),
    db().from('goal_tasks').select('*').order('sort'),
    db().from('goal_entries').select('goal_id, day, done_task_ids, diary').gte('day', from),
  ]);
  for (const r of q) if (r.error) throw r.error;
  const [habits, logs, days, focus, plan, cats, arcs, quits, relapses, goals, tasks, entries] = q.map((r) => r.data as never[]);
  return { day, habits, logs, days, focus, plan, cats, arcs, quits, relapses, goals, tasks, entries };
}

/** Read a slice of the system state; every screen shares the one fetch and cache entry. */
export function useSystem<T>(select: (r: SystemRaw) => T) {
  const session = useAuth((x) => x.session);
  return useQuery({ queryKey: SYSTEM_KEY, queryFn: fetchSystem, enabled: hasBackend && !!session, refetchOnWindowFocus: false, select });
}

/* ---- slices in the shapes the screen builders already take ---- */
export const activeHabits = (r: SystemRaw) => r.habits.filter((h) => !h.archived_at);
export const activeArc = (r: SystemRaw) => r.arcs.find((a) => !a.ended_on) ?? null;

export const todayRawOf = (r: SystemRaw) => ({
  day: r.day, habits: activeHabits(r), logs: r.logs, days: r.days, focus: r.focus,
  plan: r.plan.filter((p) => p.day === r.day), arc: activeArc(r),
});
export const trackerRawOf = (r: SystemRaw) => ({
  day: r.day, habits: activeHabits(r), logs: r.logs, quits: r.quits, relapses: r.relapses,
});
export const profileRawOf = (r: SystemRaw) => ({
  day: r.day, habits: activeHabits(r), logs: r.logs, days: r.days, quits: r.quits, relapses: r.relapses,
  goals: r.goals, tasks: r.tasks, entries: r.entries, plan: r.plan.filter((p) => p.day <= r.day), focus: r.focus, arcs: r.arcs,
});

/* ---- cache helpers for actions ---- */
let client: QueryClient | null = null;
export const bindSystem = (qc: QueryClient) => {
  client = qc;
  // design preview: the same screens run on sample data, fully interactive
  if (!hasBackend) qc.setQueryData(SYSTEM_KEY, mockSystem());
};
export const systemClient = () => client;
/** Apply an optimistic change to the shared state (no-op before the first load). */
export function patchSystem(fn: (r: SystemRaw) => SystemRaw) {
  client?.setQueryData<SystemRaw>(SYSTEM_KEY, (r) => (r ? fn(r) : r));
}
export const getSystem = () => client?.getQueryData<SystemRaw>(SYSTEM_KEY);
