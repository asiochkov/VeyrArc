import { create } from 'zustand';
import { translate, useLangStore, type TKey } from '../i18n';
import { useAuth } from '../lib/auth';
import { db, hasBackend } from '../lib/supabase';
import { toast } from '../ui/toast';
import { createOutbox, type Op } from './outbox';
export type { Op } from './outbox';

export const useSyncState = create<{ pending: number }>(() => ({ pending: 0 }));
const tr = (k: TKey) => translate(useLangStore.getState().lang, k);
const TABLES = new Set(['profiles', 'habits', 'habit_logs', 'day_entries', 'focus_sessions', 'plan_items', 'goal_tasks', 'goal_entries', 'quits', 'quit_relapses', 'goals', 'arcs']);
/** Explicit ownership is required even if auth changes while the request is being prepared. */
export async function runOp(op: Op, owner: string, signal: AbortSignal) {
  if (useAuth.getState().session?.user.id !== owner) throw Error('Session changed');
  if (!TABLES.has(op.t)) throw Error('Unsupported outbox table');
  const q = db().from(op.t);
  let result;
  if (op.a === 'insert' || op.a === 'upsert') {
    const row: Record<string, unknown> = { ...op.v, user_id: owner };
    if (op.a === 'insert') {
      if (typeof row.id !== 'string') throw Error('Durable inserts require an id');
      // Retry the same client-generated ID without replacing an existing row.
      result = await q.upsert(row, { onConflict: 'id', ignoreDuplicates: true }).abortSignal(signal);
    } else result = await q.upsert(row, op.oc ? { onConflict: op.oc } : undefined).abortSignal(signal);
  } else {
    if (!Object.keys(op.eq ?? {}).length) throw Error('A write must identify its row');
    const patch = { ...op.v }; delete patch.user_id; delete patch.id;
    let f = op.a === 'update' ? q.update(patch) : q.delete();
    for (const [k, v] of Object.entries(op.eq ?? {})) f = f.eq(k, v);
    f = f.eq(op.t === 'profiles' ? 'id' : 'user_id', owner);
    result = await f.select(op.t === 'profiles' ? 'id' : 'user_id').abortSignal(signal);
    if (!result.error && op.a === 'update' && !result.data?.length) throw Error('Row not found or access denied');
  }
  if (result.error) throw result.error;
}
let onDrained = () => {};
export const setDrainedHandler = (fn: () => void) => { onDrained = fn; };
let warnedStorage = false;
let hadOfflineWork = false;
const storage = {
  getItem: (k: string) => localStorage.getItem(k),
  setItem: (k: string, v: string) => localStorage.setItem(k, v),
  removeItem: (k: string) => localStorage.removeItem(k),
};
const outbox = createOutbox({
  storage, session: () => useAuth.getState().session?.user.id ?? '',
  online: () => navigator.onLine, send: runOp,
  sendBatch: async (ops, owner, id, signal) => {
    if (useAuth.getState().session?.user.id !== owner) throw Error('Session changed');
    const { error } = await db().rpc('apply_my_operations', { p_id: id, p_owner: owner, p_ops: ops }).abortSignal(signal);
    if (error) throw error;
  },
  network: (e) => !navigator.onLine || /Failed to fetch|NetworkError|Load failed|network|fetch failed|ERR_INTERNET/i.test(String((e as { message?: string })?.message ?? e)),
  changed: (pending) => { if (pending && !navigator.onLine) hadOfflineWork = true; useSyncState.setState({ pending }); },
  failed: (e) => { console.error('[sync]', e); toast.error(tr('common.saveFailed')); },
  storageFailed: () => { if (!warnedStorage) { warnedStorage = true; toast.error(tr('common.storageFailed')); } },
  drained: (failed) => { if (!failed && hadOfflineWork) toast.success(tr('common.syncedBack')); hadOfflineWork = false; onDrained(); },
});
export function mutate(op: Op | Op[], opts: { rollback?: () => void; done?: () => void; error?: TKey } = {}) {
  if (!hasBackend) return;
  if (!navigator.onLine && !outbox.pending()) toast.info(tr('common.savedOffline'), 5000);
  outbox.enqueue(op, opts);
}
export const flushQueue = () => outbox.flush();
export const resumeQueue = (uid: string) => outbox.bind(uid);
export function hasStoredQueue() {
  try {
    const uid = useAuth.getState().session?.user.id;
    return !!(uid && (localStorage.getItem('veyrarc.queue.' + uid) || JSON.parse(localStorage.getItem('veyrarc.queue') ?? 'null')?.uid === uid));
  } catch { return false; }
}
if (typeof window !== 'undefined') window.addEventListener('online', () => { void flushQueue(); });
