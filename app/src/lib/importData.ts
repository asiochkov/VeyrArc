import { config } from '../config';
import { isProPlan, useAuth } from './auth';
import { db } from './supabase';
import { markOwnWrite } from '../state/actions';

/*
 * Import (Master Changeset task 31): a VeyrArc export file (Settings → Data → Export) is added
 * to the current account. Every row gets a new id; links between rows are re-mapped.
 * Free limits stay: Core beyond 5 comes in as Extra, active goals beyond 3 are skipped.
 */
type Row = Record<string, unknown>;
export type ImportFile = {
  habits: Row[]; habit_logs: Row[]; quits: Row[]; quit_relapses: Row[]; day_entries: Row[];
  focus_sessions: Row[]; plan_items: Row[]; goals: Row[]; goal_tasks: Row[]; goal_entries: Row[];
};
export type ImportSummary = { habits: number; logs: number; quits: number; goals: number; events: number; days: number; focus: number };

const TABLES = ['habits', 'habit_logs', 'quits', 'quit_relapses', 'day_entries', 'focus_sessions', 'plan_items', 'goals', 'goal_tasks', 'goal_entries'] as const;

export function parseImport(text: string): { file: ImportFile; summary: ImportSummary } | null {
  let j: Record<string, unknown>;
  try { j = JSON.parse(text); } catch { return null; }
  if (!j || typeof j !== 'object' || !Array.isArray(j.habits)) return null;
  const file = Object.fromEntries(TABLES.map((t) => [t, Array.isArray(j[t]) ? (j[t] as Row[]) : []])) as ImportFile;
  return {
    file,
    summary: {
      habits: file.habits.length, logs: file.habit_logs.length, quits: file.quits.length, goals: file.goals.length,
      events: file.plan_items.length, days: file.day_entries.length, focus: file.focus_sessions.length,
    },
  };
}

const strip = (r: Row, drop: string[] = []) => {
  const o: Row = { ...r };
  for (const k of ['user_id', ...drop]) delete o[k];
  return o;
};
const chunks = <T,>(xs: T[], n = 400) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
async function insertAll(table: string, rows: Row[], opts?: { onConflict?: string }) {
  for (const part of chunks(rows)) {
    const r = opts?.onConflict ? await db().from(table).upsert(part, { onConflict: opts.onConflict }) : await db().from(table).insert(part);
    if (r.error) throw r.error;
  }
}

export async function runImport(f: ImportFile): Promise<{ habits: number; goalsSkipped: number }> {
  const uid = useAuth.getState().session?.user.id;
  if (!uid) throw new Error('no session');
  const pro = isProPlan(useAuth.getState().plan);
  const keep = setInterval(() => markOwnWrite(), 1000);
  try { return await importRows(f, pro); } finally { clearInterval(keep); markOwnWrite(); }
}

async function importRows(f: ImportFile, pro: boolean): Promise<{ habits: number; goalsSkipped: number }> {
  const id = () => crypto.randomUUID();
  const map = new Map<string, string>();
  const re = (old: unknown) => (typeof old === 'string' ? map.get(old) ?? null : null);

  // habits: Core up to the free limit, the rest as Extra
  const cur = await db().from('habits').select('id', { count: 'exact', head: true }).eq('core', true).is('archived_at', null);
  let coreLeft = pro ? Infinity : Math.max(0, config.limits.free.core - (cur.count ?? 0));
  const habits = f.habits.map((h) => {
    const n = id(); map.set(String(h.id), n);
    const wasCore = !!(h.core ?? h.required) && !h.archived_at;
    const core = wasCore && coreLeft > 0;
    if (core) coreLeft--;
    const days = typeof h.days === 'number' ? h.days : h.cadence === 'weekdays' ? 31 : h.cadence === 'weekends' ? 96 : 127;
    return { ...strip(h, ['required']), id: n, core, days };
  });
  await insertAll('habits', habits);
  await insertAll('habit_logs', f.habit_logs.filter((l) => map.has(String(l.habit_id))).map((l) => ({ ...strip(l, ['id']), habit_id: re(l.habit_id) })), { onConflict: 'habit_id,day' });

  const quits = f.quits.map((q) => { const n = id(); map.set(String(q.id), n); return { ...strip(q), id: n }; });
  await insertAll('quits', quits);
  await insertAll('quit_relapses', f.quit_relapses.filter((r) => map.has(String(r.quit_id))).map((r) => ({ ...strip(r, ['id']), quit_id: re(r.quit_id) })));

  // goals one by one: the database refuses active goals beyond the free limit
  let goalsSkipped = 0;
  for (const g of f.goals) {
    const n = id();
    const r = await db().from('goals').insert({ ...strip(g, ['arc_id']), id: n, linked_core_habit_id: re(g.linked_core_habit_id) });
    if (r.error) { goalsSkipped++; continue; }
    map.set(String(g.id), n);
  }
  await insertAll('goal_tasks', f.goal_tasks.filter((x) => map.has(String(x.goal_id))).map((x) => { const n = id(); map.set(String(x.id), n); return { ...strip(x), id: n, goal_id: re(x.goal_id) }; }));
  await insertAll('goal_entries', f.goal_entries.filter((x) => map.has(String(x.goal_id))).map((x) => ({
    ...strip(x, ['id']), goal_id: re(x.goal_id), done_task_ids: ((x.done_task_ids as string[] | null) ?? []).map((t) => map.get(t)).filter(Boolean),
  })), { onConflict: 'goal_id,day' });

  await insertAll('day_entries', f.day_entries.map((d) => strip(d, ['id'])), { onConflict: 'user_id,day' });
  await insertAll('focus_sessions', f.focus_sessions.map((s) => ({ ...strip(s, ['id']), linked_goal_id: re(s.linked_goal_id), linked_habit_id: re(s.linked_habit_id), linked_event_id: null })));
  await insertAll('plan_items', f.plan_items.map((p) => ({ ...strip(p, ['id']), category_id: null, linked_goal_id: re(p.linked_goal_id), linked_habit_id: re(p.linked_habit_id) })));
  return { habits: habits.length, goalsSkipped };
}
