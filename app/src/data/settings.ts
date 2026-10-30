import { allRows, rowKeys } from './pagination';
import { mutate } from './sync';
import { useAuth, type Profile } from '../lib/auth';
import { db } from '../lib/supabase';
import type { ArcRow } from './model';

export async function fetchArcs() {
  const r = await db().from('arcs').select('*').order('number');
  if (r.error) throw r.error;
  return r.data as ArcRow[];
}

/** Change profile fields at once on screen; the write is queued / rolled back by data/sync.ts. */
export function setProfile(patch: Partial<Profile>) {
  const cur = useAuth.getState().profile;
  if (cur) useAuth.setState({ profile: { ...cur, ...patch } });
  if (!cur) return;
  mutate({ t: 'profiles', a: 'update', v: patch, eq: { id: cur.id } }, { rollback: () => { void useAuth.getState().loadProfile(); } });
}

export async function updateProfile(patch: Partial<Profile>) {
  const uid = useAuth.getState().session?.user.id;
  if (!uid) return;
  const cur = useAuth.getState().profile;
  if (cur) useAuth.setState({ profile: { ...cur, ...patch } });
  const r = await db().from('profiles').update(patch).eq('id', uid);
  if (r.error) throw r.error;
}

export async function startNewArc() {
  const r = await db().rpc('start_new_arc', {});
  if (r.error) throw r.error;
}

/** «Экспортировать данные»: everything the user owns as one JSON file (B20). */
export async function exportData() {
  const uid = useAuth.getState().session?.user.id;
  if (!uid) throw new Error('Not signed in');
  const tables = ['profiles', 'arcs', 'habits', 'habit_logs', 'quits', 'quit_relapses', 'day_entries', 'focus_sessions', 'plan_items', 'goals', 'goal_tasks', 'goal_entries'];
  const out: Record<string, unknown> = { exported_at: new Date().toISOString() };
  for (const t of tables) {
    out[t] = await allRows((from, to) => {
      let q = db().from(t).select('*').eq(t === 'profiles' ? 'id' : 'user_id', uid);
      for (const k of rowKeys[t]) q = q.order(k);
      return q.range(from, to);
    });
  }
  if (useAuth.getState().session?.user.id !== uid) throw new Error('Account changed');
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `veyrarc-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
