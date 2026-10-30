/** Durable FIFO outbox. Storage and transport are injected so account boundaries can be tested. */
export type Op = { t: string; a: 'upsert' | 'insert' | 'update' | 'delete'; v?: Record<string, unknown>; eq?: Record<string, unknown>; oc?: string };
type Callbacks = { done?: () => void; rollback?: () => void };
type Job = Callbacks & { id: string; ops: Op[]; cursor: number };
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Options = {
  storage: Storage; online: () => boolean; session: () => string;
  send: (op: Op, owner: string, signal: AbortSignal) => Promise<void>;
  sendBatch?: (ops: Op[], owner: string, id: string, signal: AbortSignal) => Promise<void>;
  network: (e: unknown) => boolean;
  changed: (pending: number) => void; failed: (e: unknown) => void;
  storageFailed: () => void; drained: (failed: boolean) => void;
};
export function createOutbox(o: Options) {
  let disposed = false;
  let owner = '', epoch = 0, jobs: Job[] = [];
  let running: Promise<void> | undefined;
  let controller = new AbortController();
  let retry: ReturnType<typeof setTimeout> | undefined;
  let backoff = 1000;
  let failures = false;
  const key = (uid: string) => 'veyrarc.queue.' + uid;
  const persist = () => {
    if (!owner) return;
    try {
      if (jobs.length) o.storage.setItem(key(owner), JSON.stringify({ version: 2, jobs }));
      else o.storage.removeItem(key(owner));
    } catch { o.storageFailed(); }
  };
  const changed = () => { persist(); o.changed(jobs.length); };
  const current = (uid: string, generation: number) => owner === uid && epoch === generation && o.session() === uid;
  const read = (uid: string): Job[] => {
    try {
      const saved = JSON.parse(o.storage.getItem(key(uid)) ?? 'null');
      if (!saved) return [];
      if (saved.version !== 2 || !Array.isArray(saved.jobs) || !saved.jobs.every((j: Job) =>
        typeof j.id === 'string' && Array.isArray(j.ops) && j.ops.length && Number.isInteger(j.cursor) && j.cursor >= 0 && j.cursor <= j.ops.length &&
        j.ops.every((p) => typeof p.t === 'string' && ['insert', 'upsert', 'update', 'delete'].includes(p.a)))) throw Error('Invalid saved outbox');
      return saved.jobs;
    } catch (e) { o.failed(e); return []; }
  };
  const flush = (): Promise<void> => {
    if (disposed) return Promise.resolve();
    if (running) return running;
    if (!owner || !jobs.length || !o.online() || o.session() !== owner) return Promise.resolve();
    const uid = owner, generation = epoch, signal = controller.signal;
    running = (async () => {
      while (jobs.length && o.online() && current(uid, generation)) {
        const job = jobs[0];
        try {
          if (o.sendBatch && job.ops.length > 1 && job.cursor === 0) {
            await o.sendBatch(job.ops, uid, job.id, signal);
            if (!current(uid, generation)) return;
            job.cursor = job.ops.length; persist();
          }
          while (job.cursor < job.ops.length) {
            if (!current(uid, generation)) return;
            await o.send(job.ops[job.cursor], uid, signal);
            if (!current(uid, generation)) return;
            job.cursor++; persist();
          }
          jobs.shift(); changed(); backoff = 1000;
          try { job.done?.(); } catch (e) { o.failed(e); }
        } catch (e) {
          if (!current(uid, generation) || signal.aborted) return;
          if (o.network(e)) {
            retry = setTimeout(() => { retry = undefined; void flush(); }, backoff);
            backoff = Math.min(backoff * 2, 30000);
            return;
          }
          // Keep rejected work for recovery, without blocking unrelated writes forever.
          try {
            const failedKey = key(uid) + '.failed';
            const rejected = JSON.parse(o.storage.getItem(failedKey) ?? '[]');
            o.storage.setItem(failedKey, JSON.stringify([...rejected, { id: job.id, ops: job.ops, cursor: job.cursor }]));
          } catch { o.storageFailed(); }
          jobs.shift(); changed(); failures = true;
          try { job.rollback?.(); } catch (callbackError) { o.failed(callbackError); }
          o.failed(e);
        }
      }
      if (!jobs.length && current(uid, generation)) { o.drained(failures); failures = false; }
    })().finally(() => { running = undefined; if (!disposed && jobs.length && !retry && o.online() && owner && o.session() === owner) void flush(); });
    return running;
  };
  return {
    bind(uid: string) {
      if (owner === uid) { void flush(); return; }
      persist(); controller.abort(); controller = new AbortController();
      clearTimeout(retry); retry = undefined; epoch++; owner = uid; failures = false;
      jobs = uid ? read(uid) : [];
      // One-time upgrade: never move another account's legacy operations to this account.
      if (uid) {
        try {
          const legacy = JSON.parse(o.storage.getItem('veyrarc.queue') ?? 'null');
          if (legacy?.uid === uid && Array.isArray(legacy.ops)) {
            jobs.push({ id: crypto.randomUUID(), ops: legacy.ops, cursor: 0 });
            persist(); o.storage.removeItem('veyrarc.queue');
          }
        } catch { o.storageFailed(); }
      }
      o.changed(jobs.length);
      // A previous request may still be unwinding after abort. Start only after it finishes.
      if (running) void running.then(() => flush()); else void flush();
    },
    enqueue(op: Op | Op[], callbacks: Callbacks = {}) {
      const uid = o.session();
      if (!uid) { callbacks.rollback?.(); o.failed(Error('No session')); return; }
      if (uid !== owner) this.bind(uid);
      const ops = Array.isArray(op) ? op : [op];
      if (!ops.length) { callbacks.done?.(); return; }
      jobs.push({ id: crypto.randomUUID(), ops, cursor: 0, ...callbacks });
      changed(); void flush();
    },
    flush,
    pending: () => jobs.length,
    dispose() { disposed = true; controller.abort(); clearTimeout(retry); epoch++; },
  };
}
