import { db } from '../lib/supabase';
import type { Entry, Goal } from '../mock/goals';

type GoalDb = { id: string; title: string; hue: string; type: 'process' | 'number'; deadline: string | null; started_on: string; status: 'active' | 'completed'; best_streak: number; created_at: string };
type TaskDb = { id: string; goal_id: string; text: string; detail: string | null; sort: number };
type EntryDb = { goal_id: string; day: string; done_task_ids: string[]; diary: string | null; mood: number | null };

export async function fetchGoals() {
  const [g, t, e] = await Promise.all([
    db().from('goals').select('*').order('created_at'),
    db().from('goal_tasks').select('*').order('sort'),
    db().from('goal_entries').select('*'),
  ]);
  for (const x of [g, t, e]) if (x.error) throw x.error;
  const tasks = t.data as TaskDb[];
  const goals: Goal[] = (g.data as GoalDb[]).map((x) => ({
    id: x.id, title: { ru: x.title, en: x.title }, hue: x.hue, status: x.status, startDate: x.started_on, bestStreak: x.best_streak,
    type: x.type, deadline: x.deadline ?? undefined,
    tasks: tasks.filter((k) => k.goal_id === x.id).map((k) => ({ id: k.id, text: { ru: k.text, en: k.text }, detail: { ru: k.detail ?? '', en: k.detail ?? '' } })),
  }));
  const entries: Record<string, Entry> = {};
  for (const x of e.data as EntryDb[]) {
    entries[x.goal_id + '|' + x.day] = { tasksDone: Object.fromEntries(x.done_task_ids.map((id) => [id, true])), diary: x.diary ?? '', mood: x.mood == null ? null : x.mood - 1 };
  }
  return { goals, entries };
}

const ok = <T extends { error: unknown }>(r: T) => { if (r.error) throw r.error; return r; };

export async function createGoal(g: { id: string; title: string; hue: string; deadline?: string; steps: { id: string; text: string }[] }) {
  ok(await db().from('goals').insert({ id: g.id, title: g.title, hue: g.hue, type: 'process', deadline: g.deadline || null }));
  if (g.steps.length) ok(await db().from('goal_tasks').insert(g.steps.map((x, i) => ({ id: x.id, goal_id: g.id, text: x.text, sort: i }))));
}
export const renameGoal = async (id: string, title: string) => { ok(await db().from('goals').update({ title }).eq('id', id)); };
export const completeGoal = async (id: string, best: number) => { ok(await db().from('goals').update({ status: 'completed', completed_at: new Date().toISOString(), best_streak: best }).eq('id', id)); };
export const deleteGoal = async (id: string) => { ok(await db().from('goals').delete().eq('id', id)); };
export async function saveEntry(goalId: string, day: string, e: Entry) {
  ok(await db().from('goal_entries').upsert({
    goal_id: goalId, day, done_task_ids: Object.keys(e.tasksDone).filter((k) => e.tasksDone[k]),
    diary: typeof e.diary === 'string' ? e.diary : e.diary.ru, mood: e.mood == null ? null : e.mood + 1,
  }));
}
export const addGoalTask = async (id: string, goalId: string, text: string, sort: number) => { ok(await db().from('goal_tasks').insert({ id, goal_id: goalId, text, sort })); };
export const renameGoalTask = async (id: string, text: string) => { ok(await db().from('goal_tasks').update({ text }).eq('id', id)); };
export const deleteGoalTask = async (id: string) => { ok(await db().from('goal_tasks').delete().eq('id', id)); };
