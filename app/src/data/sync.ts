import { create } from 'zustand';
import { translate, useLangStore, type TKey } from '../i18n';
import { db, hasBackend } from '../lib/supabase';
import { toast } from '../ui/toast';

/*
 * Every write goes through here (UI → page hook → mutate → data/*.ts → Supabase):
 *  - design preview without a backend: nothing is sent, the local (optimistic) state is the state;
 *  - offline or a network failure: the write waits in a queue and is sent when the connection is back;
 *  - the server refused it: the optimistic change is rolled back and an error toast explains it.
 * Daily writes (habit marks, mood, planner tasks, goal steps, focus) are described as plain data
 * (`Op`) and the queue of them is kept in localStorage: closing the app offline doesn't lose them,
 * they are sent on the next start once the same account is signed in.
 */
type Val = string | number | boolean | null | undefined | string[];
/** A write as data, so it can wait in localStorage: one table, one action. */
export type Op = { t: string; a: 'upsert' | 'insert' | 'update' | 'delete'; v?: Record<string, Val>; eq?: Record<string, Val>; oc?: string };
type Job = { run: () => Promise<unknown>; op?: Op; rollback?: () => void; done?: () => void; error?: TKey };
const queue: Job[] = [];
export const useSyncState = create<{ pending: number }>(() => ({ pending: 0 }));
const QKEY = 'veyrarc.queue';
let uid = '';
const save = () => {
  const ops = queue.flatMap((j) => (j.op ? [j.op] : []));
  try { if (ops.length) localStorage.setItem(QKEY, JSON.stringify({ uid, ops })); else localStorage.removeItem(QKEY); } catch { /* no storage */ }
};
const setPending = () => { useSyncState.setState({ pending: queue.length }); save(); };

export async function runOp(op: Op) {
  const q = db().from(op.t);
  let r: { error: { code?: string } | null };
  if (op.a === 'upsert') r = await q.upsert(op.v!, op.oc ? { onConflict: op.oc } : undefined);
  else if (op.a === 'insert') r = await q.insert(op.v!);
  else {
    let f = op.a === 'update' ? q.update(op.v!) : q.delete();
    for (const [k, v] of Object.entries(op.eq ?? {})) f = f.eq(k, v);
    r = await f;
  }
  // an insert that reached the server before the connection dropped: already there, fine
  if (r.error && !(op.a === 'insert' && r.error.code === '23505')) throw r.error;
}
const tr = (k: TKey) => translate(useLangStore.getState().lang, k);

const isNetwork = (e: unknown) => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  const m = String((e as { message?: string })?.message ?? e);
  return /Failed to fetch|NetworkError|Load failed|network|fetch failed|ERR_INTERNET/i.test(m);
};

async function attempt(job: Job): Promise<'ok' | 'offline' | 'failed'> {
  try { await job.run(); job.done?.(); return 'ok'; }
  catch (e) {
    if (isNetwork(e)) return 'offline';
    console.error('[sync]', e);
    job.rollback?.();
    toast.error(tr(job.error ?? 'common.saveFailed'));
    return 'failed';
  }
}

export function mutate(run: (() => Promise<unknown>) | Op, opts: { rollback?: () => void; done?: () => void; error?: TKey } = {}) {
  if (!hasBackend) return;
  const job: Job = typeof run === 'function' ? { run, ...opts } : { run: () => runOp(run), op: run, ...opts };
  if (queue.length || !navigator.onLine) { enqueue(job); return; }
  void attempt(job).then((r) => { if (r === 'offline') enqueue(job); });
}

function enqueue(job: Job) {
  if (!queue.length) toast.info(tr('common.savedOffline'), 5000);
  queue.push(job);
  setPending();
}

let flushing = false;
export async function flushQueue() {
  if (flushing || !queue.length || !navigator.onLine) return;
  flushing = true;
  while (queue.length) {
    const r = await attempt(queue[0]);
    if (r === 'offline') break; // still no connection: keep the rest in order
    queue.shift();
    setPending();
  }
  flushing = false;
  if (!queue.length) { toast.success(tr('common.syncedBack')); onDrained(); }
}
let onDrained = () => {};
/** Called once the queue is empty again (the app reloads its data from the server). */
export const setDrainedHandler = (fn: () => void) => { onDrained = fn; };

/** Hydrated optimistic cache is worth restoring at start while writes are still waiting. */
export function hasStoredQueue() { try { return !!localStorage.getItem(QKEY); } catch { return false; } }
/**
 * Signed in (or out): writes saved by this account on an earlier run go back into the queue and
 * are sent; another account's leftovers are dropped.
 */
export function resumeQueue(userId: string) {
  if (uid === userId) return;
  uid = userId;
  let stored: { uid: string; ops: Op[] } | null = null;
  try { stored = JSON.parse(localStorage.getItem(QKEY) ?? 'null'); } catch { /* broken */ }
  if (!stored?.ops?.length || stored.uid !== userId || !userId) { save(); return; }
  queue.unshift(...stored.ops.map((op) => ({ run: () => runOp(op), op })));
  setPending();
  void flushQueue();
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void flushQueue(); });
}
