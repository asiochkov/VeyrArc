import { mutate } from '../data/sync';
import { isoDay } from '../lib/day';
import { db, hasBackend } from '../lib/supabase';
import { cadenceOf, type FocusRow, type HabitRowDb, type PlanRow, type QuitRow } from '../data/model';
import { getSystem, patchSystem, SYSTEM_KEY, systemClient, type GoalDb, type SystemRaw } from './system';

/*
 * The mutation points of the system (Master Changeset task 02). Each one:
 *   1. changes the shared ['system'] cache at once — every screen shows it in the same frame;
 *   2. sends the write through data/sync.ts (offline queue, rollback + toast when refused);
 *   3. when no write is left in flight, reloads the system state from the server once.
 * Cross-screen links live here too: a Core habit done → linked goal steps done; a focus
 * session on an event → the event done; an event linked to a goal done → the matching goal step.
 */

let inFlight = 0;
let lastWrite = 0;
/** This device is writing or has just written: realtime echoes of its own changes are ignored. */
export const ownWriteRecent = () => inFlight > 0 || Date.now() - lastWrite < 3000;
/** Writes made outside `write()` (onboarding, import, arc rollover) count as this device's own too. */
export const markOwnWrite = (ms = 0) => { lastWrite = Date.now() + ms; };
function write(run: () => Promise<unknown>) {
  if (!hasBackend) return;
  inFlight++;
  lastWrite = Date.now();
  const settle = () => {
    inFlight = Math.max(0, inFlight - 1);
    lastWrite = Date.now();
    if (inFlight === 0) {
      const qc = systemClient();
      void qc?.invalidateQueries({ queryKey: SYSTEM_KEY });
      void qc?.invalidateQueries({ queryKey: ['calendar'] });
      void qc?.invalidateQueries({ queryKey: ['accountStats'] });
      void qc?.invalidateQueries({ queryKey: ['events'] });
    }
  };
  mutate(run, { done: settle, rollback: settle });
}
const ok = <T extends { error: unknown }>(r: T) => { if (r.error) throw r.error; return r; };

/* ---- habits ---- */
export function logHabit(habitId: string, value: number, done: boolean, day = isoDay()) {
  patchSystem((r) => ({
    ...r,
    logs: [...r.logs.filter((l) => !(l.habit_id === habitId && l.day === day)), ...(value > 0 ? [{ habit_id: habitId, day, value, done }] : [])],
  }));
  write(async () => {
    ok(value > 0
      ? await db().from('habit_logs').upsert({ habit_id: habitId, day, value, done })
      : await db().from('habit_logs').delete().eq('habit_id', habitId).eq('day', day));
  });
  // a goal linked to this Core habit: its daily steps follow the habit
  const sys = getSystem();
  for (const g of sys?.goals ?? []) {
    if (g.status !== 'active' || g.linked_core_habit_id !== habitId) continue;
    const ids = (sys?.tasks ?? []).filter((t) => t.goal_id === g.id).map((t) => t.id);
    if (ids.length) setGoalTasks(g.id, done && value > 0 ? ids : [], day);
  }
}

/* ---- mood: one value per day, shared by Today and Goals ---- */
export function logMood(level: number | null, day = isoDay()) {
  const mood = level == null ? null : level + 1;
  patchSystem((r) => ({
    ...r,
    days: r.days.some((d) => d.day === day)
      ? r.days.map((d) => (d.day === day ? { ...d, mood } : d))
      : [...r.days, { day, mood, water: 0, frozen: false }],
  }));
  write(async () => { ok(await db().from('day_entries').upsert({ day, mood }, { onConflict: 'user_id,day' })); });
}

/* ---- focus ---- */
export type FocusLink = { goalId?: string | null; habitId?: string | null; eventId?: string | null };
export function logFocus(minutes: number, type: 'focus' | 'short' | 'long' = 'focus', link: FocusLink = {}) {
  const row: FocusRow = {
    id: crypto.randomUUID(), started_at: new Date(Date.now() - minutes * 60000).toISOString(), minutes, category: null, completed: true,
    session_type: type, linked_goal_id: link.goalId ?? null, linked_habit_id: link.habitId ?? null, linked_event_id: link.eventId ?? null,
  };
  patchSystem((r) => ({ ...r, focus: [...r.focus, row] }));
  write(async () => {
    ok(await db().from('focus_sessions').insert({
      id: row.id, started_at: row.started_at, minutes, session_type: type,
      linked_goal_id: row.linked_goal_id, linked_habit_id: row.linked_habit_id, linked_event_id: row.linked_event_id,
    }));
  });
  if (type !== 'focus') return;
  const sys = getSystem();
  // a duration habit gets the minutes; an event is done
  const h = link.habitId ? sys?.habits.find((x) => x.id === link.habitId) : undefined;
  if (h && h.type === 'duration') {
    const day = isoDay();
    const cur = sys?.logs.find((l) => l.habit_id === h.id && l.day === day)?.value ?? 0;
    const total = cur + minutes;
    logHabit(h.id, total, total >= (h.minutes ?? 1));
  }
  if (link.eventId) setEventDone(link.eventId, true);
}

/* ---- planner events ---- */
export function saveEvent(ev: PlanRow, isNew: boolean) {
  patchSystem((r) => ({ ...r, plan: isNew ? [...r.plan, ev] : r.plan.map((p) => (p.id === ev.id ? ev : p)) }));
  const row = {
    day: ev.day, title: ev.title.slice(0, 120), note: ev.note || null, done: ev.done, starts_at: ev.starts_at, ends_at: ev.ends_at,
    category_id: ev.category_id, linked_goal_id: ev.linked_goal_id ?? null, linked_habit_id: ev.linked_habit_id ?? null, focus: !!ev.focus,
  };
  write(async () => { ok(isNew ? await db().from('plan_items').insert({ id: ev.id, ...row }) : await db().from('plan_items').update(row).eq('id', ev.id)); });
}
export function deleteEvent(id: string) {
  patchSystem((r) => ({ ...r, plan: r.plan.filter((p) => p.id !== id) }));
  write(async () => { ok(await db().from('plan_items').delete().eq('id', id)); });
}
export function setEventDone(id: string, done: boolean) {
  const ev = getSystem()?.plan.find((p) => p.id === id);
  patchSystem((r) => ({ ...r, plan: r.plan.map((p) => (p.id === id ? { ...p, done } : p)) }));
  write(async () => { ok(await db().from('plan_items').update({ done }).eq('id', id)); });
  // an event linked to a goal: the goal step with the same text is ticked for that day
  if (ev?.linked_goal_id && done) {
    const sys = getSystem();
    const task = sys?.tasks.find((t) => t.goal_id === ev.linked_goal_id && t.text.trim().toLowerCase() === ev.title.trim().toLowerCase());
    if (task) logGoalTask(ev.linked_goal_id, task.id, true, ev.day);
  }
}

/* ---- goal steps ---- */
export function reorderGoalSteps(ids: string[]) {
  patchSystem((r) => ({ ...r, tasks: r.tasks.map((x) => (ids.includes(x.id) ? { ...x, sort: ids.indexOf(x.id) } : x)).sort((a, b) => a.sort - b.sort) }));
  write(async () => { for (const [i, id] of ids.entries()) ok(await db().from('goal_tasks').update({ sort: i }).eq('id', id)); });
}
const entryOf = (r: SystemRaw | undefined, goalId: string, day: string) => r?.entries.find((e) => e.goal_id === goalId && e.day === day);
function setGoalTasks(goalId: string, ids: string[], day: string) {
  patchSystem((r) => {
    const cur = entryOf(r, goalId, day);
    const next = { goal_id: goalId, day, done_task_ids: ids, diary: cur?.diary ?? null };
    return { ...r, entries: cur ? r.entries.map((e) => (e === cur ? next : e)) : [...r.entries, next] };
  });
  write(async () => { ok(await db().from('goal_entries').upsert({ goal_id: goalId, day, done_task_ids: ids }, { onConflict: 'goal_id,day' })); });
}
export function logGoalTask(goalId: string, taskId: string, done: boolean, day = isoDay()) {
  const cur = entryOf(getSystem(), goalId, day)?.done_task_ids ?? [];
  setGoalTasks(goalId, done ? [...new Set([...cur, taskId])] : cur.filter((x) => x !== taskId), day);
}

/* ---- streak freeze for a past day ---- */
export async function saveFreeze(day: string): Promise<boolean> {
  if (!hasBackend) return true;
  const r = await db().rpc('use_freeze', { p_day: day });
  if (r.error || r.data !== true) return false;
  patchSystem((s) => ({
    ...s,
    days: s.days.some((d) => d.day === day) ? s.days.map((d) => (d.day === day ? { ...d, frozen: true } : d)) : [...s.days, { day, mood: null, water: 0, frozen: true }],
  }));
  void systemClient()?.invalidateQueries({ queryKey: SYSTEM_KEY });
  return true;
}

/* ---- create / change habits (Disciplines, Add sheet, command palette) ---- */
export type NewHabit = Omit<HabitRowDb, 'created_at' | 'sort' | 'cadence' | 'archived_at'> & { sort?: number };
export function createHabit(h: NewHabit) {
  const sys = getSystem();
  const row: HabitRowDb = { ...h, sort: h.sort ?? (sys?.habits.length ?? 0), created_at: new Date().toISOString(), archived_at: null };
  patchSystem((r) => ({ ...r, habits: [...r.habits, row] }));
  write(async () => {
    ok(await db().from('habits').insert({
      id: row.id, name: row.name, icon: row.icon, hue: row.hue, type: row.type, target: row.target, unit: row.unit, minutes: row.minutes,
      days: row.days, cadence: cadenceOf(row.days), category: row.category, core: row.core, sort: row.sort,
    }));
  });
  return row;
}
export function updateHabit(id: string, patch: Partial<Omit<HabitRowDb, 'id' | 'created_at'>>) {
  patchSystem((r) => ({ ...r, habits: r.habits.map((h) => (h.id === id ? { ...h, ...patch } : h)) }));
  const dbPatch: Record<string, unknown> = { ...patch };
  if (patch.days != null) dbPatch.cadence = cadenceOf(patch.days);
  write(async () => { ok(await db().from('habits').update(dbPatch).eq('id', id)); });
}
export const archiveHabit = (id: string) => updateHabit(id, { archived_at: new Date().toISOString() });
export const restoreHabit = (id: string) => updateHabit(id, { archived_at: null });
export function deleteHabit(id: string) {
  patchSystem((r) => ({ ...r, habits: r.habits.filter((h) => h.id !== id), logs: r.logs.filter((l) => l.habit_id !== id) }));
  write(async () => { ok(await db().from('habits').delete().eq('id', id)); });
}
export function reorderHabits(ids: string[]) {
  patchSystem((r) => ({ ...r, habits: r.habits.map((h) => (ids.includes(h.id) ? { ...h, sort: ids.indexOf(h.id) } : h)) }));
  write(async () => { for (const [i, id] of ids.entries()) ok(await db().from('habits').update({ sort: i }).eq('id', id)); });
}

/* ---- goal steps ---- */
export function addGoalStep(goalId: string, text: string) {
  const sys = getSystem();
  const id = crypto.randomUUID();
  const sort = sys?.tasks.filter((t) => t.goal_id === goalId).length ?? 0;
  patchSystem((r) => ({ ...r, tasks: [...r.tasks, { id, goal_id: goalId, text, detail: null, sort }] }));
  write(async () => { ok(await db().from('goal_tasks').insert({ id, goal_id: goalId, text, sort })); });
  return id;
}

/* ---- quits (Disciplines → Отказы) ---- */
export function addQuit(q: Pick<QuitRow, 'id' | 'name' | 'hue' | 'icon' | 'unit' | 'per_day' | 'clean_since'>) {
  const row: QuitRow = { ...q, best_days: 0, goal_days: null, created_at: new Date().toISOString() };
  patchSystem((r) => ({ ...r, quits: [...r.quits, row] }));
  write(async () => { ok(await db().from('quits').insert({ id: q.id, name: q.name, hue: q.hue, icon: q.icon, unit: q.unit, per_day: q.per_day, clean_since: q.clean_since })); });
}
export function updateQuit(id: string, patch: Partial<Pick<QuitRow, 'clean_since' | 'goal_days' | 'name'>>) {
  patchSystem((r) => ({ ...r, quits: r.quits.map((q) => (q.id === id ? { ...q, ...patch } : q)) }));
  write(async () => { ok(await db().from('quits').update(patch).eq('id', id)); });
}
export function archiveQuit(id: string, archived: boolean) {
  const sys = getSystem();
  const q = sys?.quits.find((x) => x.id === id);
  if (archived) patchSystem((r) => ({ ...r, quits: r.quits.filter((x) => x.id !== id) }));
  write(async () => { ok(await db().from('quits').update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', id)); });
  return q;
}
export function restoreQuit(q: QuitRow) {
  patchSystem((r) => ({ ...r, quits: [...r.quits.filter((x) => x.id !== q.id), q] }));
  write(async () => { ok(await db().from('quits').update({ archived_at: null }).eq('id', q.id)); });
}
/** A slip: the timer restarts, the best run is kept; returns a function that undoes it. */
export function logRelapse(id: string, note: string) {
  const sys = getSystem();
  const q = sys?.quits.find((x) => x.id === id);
  if (!q) return () => {};
  const days = Math.floor((Date.now() - new Date(q.clean_since).getTime()) / 86400000);
  const tempId = crypto.randomUUID();
  patchSystem((r) => ({
    ...r,
    quits: r.quits.map((x) => (x.id === id ? { ...x, clean_since: new Date().toISOString(), best_days: Math.max(x.best_days, days) } : x)),
    relapses: [...r.relapses, { id: tempId, quit_id: id, at: new Date().toISOString() }],
  }));
  let gotId: (v: string) => void = () => {};
  const rid = new Promise<string>((res) => { gotId = res; });
  write(async () => { const r = ok(await db().rpc('log_relapse', { p_quit: id, p_note: note || null })); gotId((r.data as { id: string }).id); });
  return () => {
    patchSystem((r) => ({ ...r, quits: r.quits.map((x) => (x.id === id ? q : x)), relapses: r.relapses.filter((x) => x.id !== tempId) }));
    write(async () => { const real = await rid; ok(await db().rpc('undo_relapse', { p_relapse: real })); });
  };
}

/* ---- goals ---- */
export function createGoal(g: { id: string; title: string; hue: string; deadline: string | null; linkedCoreHabitId: string | null; steps: string[] }) {
  const sys = getSystem();
  const arcId = sys?.arcs.find((a) => !a.ended_on)?.id ?? null;
  const row: GoalDb = {
    id: g.id, title: g.title, hue: g.hue, type: 'process', deadline: g.deadline, started_on: isoDay(), status: 'active', best_streak: 0,
    created_at: new Date().toISOString(), linked_core_habit_id: g.linkedCoreHabitId, arc_id: arcId,
  };
  const tasks = g.steps.map((text, i) => ({ id: crypto.randomUUID(), goal_id: g.id, text, detail: null, sort: i }));
  patchSystem((r) => ({ ...r, goals: [...r.goals, row], tasks: [...r.tasks, ...tasks] }));
  write(async () => {
    ok(await db().from('goals').insert({ id: g.id, title: g.title, hue: g.hue, type: 'process', deadline: g.deadline, linked_core_habit_id: g.linkedCoreHabitId, arc_id: arcId }));
    if (tasks.length) ok(await db().from('goal_tasks').insert(tasks.map(({ id, goal_id, text, sort }) => ({ id, goal_id, text, sort }))));
  });
}
export function updateGoal(id: string, patch: Partial<Pick<GoalDb, 'title' | 'deadline' | 'linked_core_habit_id' | 'status' | 'best_streak' | 'completed_at'>>) {
  patchSystem((r) => ({ ...r, goals: r.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) }));
  const dbPatch: Record<string, unknown> = { ...patch };
  if (patch.status === 'completed') dbPatch.completed_at = new Date().toISOString();
  write(async () => { ok(await db().from('goals').update(dbPatch).eq('id', id)); });
}
export function deleteGoal(id: string) {
  patchSystem((r) => ({ ...r, goals: r.goals.filter((g) => g.id !== id), tasks: r.tasks.filter((t) => t.goal_id !== id), entries: r.entries.filter((e) => e.goal_id !== id) }));
  write(async () => { ok(await db().from('goals').delete().eq('id', id)); });
}
export function renameGoalStep(id: string, text: string) {
  patchSystem((r) => ({ ...r, tasks: r.tasks.map((t) => (t.id === id ? { ...t, text } : t)) }));
  write(async () => { ok(await db().from('goal_tasks').update({ text }).eq('id', id)); });
}
export function deleteGoalStep(id: string) {
  const t = getSystem()?.tasks.find((x) => x.id === id);
  patchSystem((r) => ({ ...r, tasks: r.tasks.filter((x) => x.id !== id) }));
  write(async () => { ok(await db().from('goal_tasks').delete().eq('id', id)); });
  return t;
}
export function restoreGoalStep(t: { id: string; goal_id: string; text: string; sort: number }) {
  patchSystem((r) => ({ ...r, tasks: [...r.tasks, { ...t, detail: null }].sort((a, b) => a.sort - b.sort) }));
  write(async () => { ok(await db().from('goal_tasks').insert({ id: t.id, goal_id: t.goal_id, text: t.text, sort: t.sort })); });
}
/** Diary text for a goal and day; the caller debounces. Resolves when saved (for «Сохранено»). */
export function saveDiary(goalId: string, day: string, diary: string, onSaved: () => void, onFailed: () => void) {
  patchSystem((r) => {
    const cur = r.entries.find((e) => e.goal_id === goalId && e.day === day);
    const next = { goal_id: goalId, day, done_task_ids: cur?.done_task_ids ?? [], diary };
    return { ...r, entries: cur ? r.entries.map((e) => (e === cur ? next : e)) : [...r.entries, next] };
  });
  if (!hasBackend) { onSaved(); return; }
  inFlight++;
  mutate(async () => { ok(await db().from('goal_entries').upsert({ goal_id: goalId, day, diary }, { onConflict: 'goal_id,day' })); }, {
    done: () => { inFlight = Math.max(0, inFlight - 1); onSaved(); },
    rollback: () => { inFlight = Math.max(0, inFlight - 1); onFailed(); },
  });
}

/* ---- arc ---- */

/** The arc's promise (Today Now Card, Settings → Arc). */
export function saveOath(arcId: string, text: string) {
  const oath = text.trim().slice(0, 280);
  patchSystem((r) => ({ ...r, arcs: r.arcs.map((a) => (a.id === arcId ? { ...a, oath } : a)) }));
  write(async () => { ok(await db().from('arcs').update({ oath }).eq('id', arcId)); });
}
