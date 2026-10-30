import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutbox, type Op } from '../../src/data/outbox.ts';
const op = (value: number): Op => ({ t: 'day_entries', a: 'upsert', v: { day: '2026-10-30', mood: value } });
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
function setup(existing = new Map<string, string>()) {
  const env = { uid: 'A', online: false, pending: 0, errors: [] as unknown[], writes: [] as { owner: string; op: Op }[] };
  const storage = { getItem: (k: string) => existing.get(k) ?? null, setItem: (k: string, v: string) => { existing.set(k,v); }, removeItem: (k: string) => { existing.delete(k); } };
  const options = { storage, online: () => env.online, session: () => env.uid,
    send: async (operation: Op, owner: string, _signal: AbortSignal) => { env.writes.push({ owner, op: operation }); },
    changed: (n: number) => { env.pending = n; }, network: (e: unknown) => (e as Error).message === 'network',
    failed: (e: unknown) => { env.errors.push(e); }, storageFailed: () => { env.errors.push('storage'); }, drained: () => {},
  };
  return { env, storage, existing, options, q: createOutbox(options) };
}
test('A’s offline operations never run as B; returning to A resumes them once', async () => {
  const {q,env}=setup(); q.bind('A'); q.enqueue(op(2)); env.uid='B';q.bind('B');env.online=true;await q.flush();assert.deepEqual(env.writes,[]);
  env.uid='A';q.bind('A');await q.flush();assert.equal(env.writes.length,1);assert.equal(env.writes[0].owner,'A');q.dispose();
});
test('sign-out preserves work without sending or relabelling it', async () => {
  const {q,env,existing}=setup();q.bind('A');q.enqueue(op(2));env.uid='';q.bind('');env.online=true;await q.flush();assert.equal(env.writes.length,0);assert.ok(existing.has('veyrarc.queue.A'));q.dispose();
});
test('reload restores create, update, delete and diary operations in order', async () => {
  const a=setup();a.q.bind('A');for(const action of ['insert','update','delete','upsert'] as const)a.q.enqueue({...op(2),a:action});a.q.dispose();
  const b=setup(a.existing);b.q.bind('A');b.env.online=true;await b.q.flush();assert.deepEqual(b.env.writes.map(x=>x.op.a),['insert','update','delete','upsert']);assert.equal(b.env.pending,0);b.q.dispose();
});
test('online writes are serialized even when the first response is slow', async () => {
  const a=setup();let release!:()=>void;let active=0,max=0;const order:number[]=[];
  const q=createOutbox({...a.options,send:async operation=>{active++;max=Math.max(max,active);if(operation.v?.mood===1)await new Promise<void>(r=>{release=r});order.push(operation.v?.mood as number);active--;}});
  a.env.online=true;q.bind('A');q.enqueue(op(1));q.enqueue(op(2));assert.equal(max,1);release();await q.flush();assert.deepEqual(order,[1,2]);q.dispose();
});
test('switching accounts during a request aborts it and suppresses stale callbacks', async () => {
  const a=setup();let release!:()=>void;let signal!:AbortSignal;let callbacks=0;
  const q=createOutbox({...a.options,send:async(_op,_owner,s)=>{signal=s;await new Promise<void>(r=>{release=r});}});
  a.env.online=true;q.bind('A');q.enqueue(op(1),{done:()=>{callbacks++}});a.env.uid='B';q.bind('B');assert.ok(signal.aborted);release();await q.flush();await tick();assert.equal(callbacks,0);assert.ok(a.existing.has('veyrarc.queue.A'));q.dispose();
});
test('legacy storage is migrated only by its owner, without duplicating memory jobs', async () => {
  const a=setup(new Map([['veyrarc.queue',JSON.stringify({uid:'A',ops:[op(3)]})]]));a.env.uid='B';a.q.bind('B');assert.equal(a.env.pending,0);a.env.uid='A';a.q.bind('A');a.q.bind('A');assert.equal(a.env.pending,1);assert.equal(a.existing.has('veyrarc.queue'),false);a.env.online=true;await a.q.flush();assert.equal(a.env.writes.length,1);a.q.dispose();
});
test('a transient failure retains the oldest write ahead of later writes', async () => {
  const a=setup();let first=true;const seen:number[]=[];const q=createOutbox({...a.options,send:async o=>{if(first){first=false;throw Error('network')}seen.push(o.v?.mood as number);}});
  q.bind('A');q.enqueue(op(1));q.enqueue(op(2));a.env.online=true;await q.flush();assert.equal(a.env.pending,2);await q.flush();assert.deepEqual(seen,[1,2]);q.dispose();
});
test('rejected work is retained separately and unrelated work continues', async () => {
  const a=setup();const q=createOutbox({...a.options,send:async o=>{if(o.v?.mood===1)throw Error('constraint')}});q.bind('A');q.enqueue(op(1));q.enqueue(op(2));a.env.online=true;await q.flush();assert.equal(a.env.pending,0);assert.ok(a.existing.has('veyrarc.queue.A.failed'));assert.equal(a.env.errors.length,1);q.dispose();
});
test('multi-operation jobs use one atomic transport request', async () => {
  const a=setup();let batches=0;const q=createOutbox({...a.options,sendBatch:async(ops,owner,id)=>{assert.equal(owner,'A');assert.ok(id);assert.equal(ops.length,2);batches++;}});q.bind('A');q.enqueue([op(1),op(2)]);a.env.online=true;await q.flush();assert.equal(batches,1);assert.equal(a.env.writes.length,0);q.dispose();
});
test('a throwing UI callback cannot discard the following queued write', async () => {
  const a=setup();a.q.bind('A');a.q.enqueue(op(1),{done:()=>{throw Error('UI failed')}});a.q.enqueue(op(2));a.env.online=true;
  await a.q.flush();assert.deepEqual(a.env.writes.map(x=>x.op.v?.mood),[1,2]);assert.equal(a.env.pending,0);a.q.dispose();
});
