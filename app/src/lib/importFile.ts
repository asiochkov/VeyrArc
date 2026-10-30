type Row = Record<string, unknown>;
export const IMPORT_TABLES = ['habits', 'habit_logs', 'quits', 'quit_relapses', 'goals', 'goal_tasks', 'goal_entries', 'day_entries', 'plan_items', 'focus_sessions'] as const;
type Table = typeof IMPORT_TABLES[number];
export type ImportFile = Record<Table, Row[]>;
export type ImportSummary = { habits: number; logs: number; quits: number; goals: number; events: number; days: number; focus: number };
const object = (x: unknown): x is Row => !!x && typeof x === 'object' && !Array.isArray(x);
export function parseImport(text: string): { file: ImportFile; summary: ImportSummary } | null {
  if (text.length > 10_000_000) return null;
  try {
    const j: unknown = JSON.parse(text);
    if (!object(j) || !Array.isArray(j.habits)) return null;
    const file = {} as ImportFile;
    let count = 0;
    for (const t of IMPORT_TABLES) {
      const rows = j[t] ?? [];
      if (!Array.isArray(rows) || !rows.every(object)) return null;
      count += rows.length; if (count > 50000) return null;
      file[t] = rows;
    }
    return { file, summary: { habits: file.habits.length, logs: file.habit_logs.length, quits: file.quits.length, goals: file.goals.length, events: file.plan_items.length, days: file.day_entries.length, focus: file.focus_sessions.length } };
  } catch { return null; }
}
const COLUMNS: Record<Table, string[]> = {
  habits: ['id','name','icon','hue','type','target','unit','minutes','cadence','category','core','sort','archived_at','created_at','days'],
  habit_logs: ['habit_id','day','value','done'],
  quits: ['id','name','icon','hue','unit','per_day','clean_since','best_days','goal_days','archived_at','created_at'],
  quit_relapses: ['id','quit_id','at','note','prev_clean_since','prev_best'],
  goals: ['id','title','hue','type','deadline','started_on','status','best_streak','created_at','linked_core_habit_id','completed_at'],
  goal_tasks: ['id','goal_id','text','detail','sort'],
  goal_entries: ['goal_id','day','done_task_ids','diary'],
  day_entries: ['day','mood','water','frozen','note'],
  plan_items: ['id','day','title','note','done','starts_at','ends_at','linked_goal_id','linked_habit_id','focus'],
  focus_sessions: ['id','started_at','minutes','category','completed','session_type','linked_goal_id','linked_habit_id','linked_event_id'],
};
async function uuid(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))).slice(0, 16);
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const h = [...bytes].map((n) => n.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
export async function prepareImport(file: ImportFile) {
  const id = await uuid(JSON.stringify(file));
  const ids = new Map<string, string>();
  for (const t of IMPORT_TABLES) {
    if (!COLUMNS[t].includes('id')) continue;
    for (const [i, row] of file[t].entries()) {
      const old = typeof row.id === 'string' ? row.id : `row-${i}`;
      const key = t + ':' + old;
      if (ids.has(key)) throw Error('Duplicate source id');
      ids.set(key, await uuid(id + ':' + key));
    }
  }
  const link = (t: Table, old: unknown) => {
    if (old == null) return null;
    const result = ids.get(t + ':' + String(old));
    if (!result) throw Error('Broken import reference');
    return result;
  };
  const tables = {} as ImportFile;
  for (const t of IMPORT_TABLES) tables[t] = file[t].map((row, i) => {
    const out: Row = {};
    for (const k of COLUMNS[t]) if (Object.hasOwn(row, k)) out[k] = row[k];
    if (COLUMNS[t].includes('id')) out.id = ids.get(t + ':' + (typeof row.id === 'string' ? row.id : `row-${i}`));
    for (const [col, parent] of Object.entries({ habit_id: 'habits', quit_id: 'quits', goal_id: 'goals', linked_core_habit_id: 'habits', linked_habit_id: 'habits', linked_goal_id: 'goals', linked_event_id: 'plan_items' } as Record<string, Table>)) {
      if (Object.hasOwn(out, col)) out[col] = link(parent, out[col]);
    }
    if (t === 'goal_entries') {
      if (row.done_task_ids != null && !Array.isArray(row.done_task_ids)) throw Error('Invalid goal steps');
      out.done_task_ids = ((row.done_task_ids ?? []) as unknown[]).map((x) => link('goal_tasks', x));
    }
    if (t === 'habits') {
      out.core = !!(row.core ?? row.required);
      out.days ??= row.cadence === 'weekdays' ? 31 : row.cadence === 'weekends' ? 96 : 127;
    }
    return out;
  });
  return { id, tables };
}
