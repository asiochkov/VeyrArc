import { create } from 'zustand';
import { translate, useLangStore, type TKey } from '../i18n';
import { hasBackend } from '../lib/supabase';
import { toast } from '../ui/toast';

/*
 * Every write goes through here (UI → page hook → mutate → data/*.ts → Supabase):
 *  - design preview without a backend: nothing is sent, the local (optimistic) state is the state;
 *  - offline or a network failure: the write waits in a queue and is sent when the connection is back;
 *  - the server refused it: the optimistic change is rolled back and an error toast explains it.
 * The queue lives in memory: a reload while offline drops unsent changes (the toast says so).
 */
type Job = { run: () => Promise<unknown>; rollback?: () => void; done?: () => void; error?: TKey };
const queue: Job[] = [];
export const useSyncState = create<{ pending: number }>(() => ({ pending: 0 }));
const setPending = () => useSyncState.setState({ pending: queue.length });
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

export function mutate(run: () => Promise<unknown>, opts: { rollback?: () => void; done?: () => void; error?: TKey } = {}) {
  if (!hasBackend) return;
  const job = { run, ...opts };
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
  if (!queue.length) toast.success(tr('common.syncedBack'));
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void flushQueue(); });
  // leaving with unsent changes: the browser asks to stay
  window.addEventListener('beforeunload', (e) => { if (queue.length) e.preventDefault(); });
}
