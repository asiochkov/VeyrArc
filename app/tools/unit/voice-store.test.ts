import { store } from '../../src/voice/store';
import { DEFAULT_PREFS } from '../../src/voice/prefs';

// run: npx tsx tools/unit/voice-store.test.ts — the storage wrapper never throws and survives a broken storage
let fail = 0;
const ok = (c: boolean, m: string) => { if (!c) { fail++; console.log('✗', m); } };
(globalThis as any).localStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
store.set('x.v1', { v: 1, a: 1 });
ok(JSON.stringify(store.get('x.v1', null)) === '{"v":1,"a":1}', 'memory copy works when storage throws');
ok(store.get('missing.v1', 7) === 7, 'fallback for a missing key');
store.remove('x.v1');
ok(store.get('x.v1', 0) === 0, 'remove works from memory');
ok(store.update('n.v1', 1, (n) => n + 1) === 2, 'update');
ok(store.trim([1, 2, 3, 4, 5], 3).join() === '3,4,5', 'trim keeps the newest');
ok(store.trim(['x'.repeat(1000), 'y'.repeat(1000), 'z'], 10, 1500).length === 2, 'trim by size drops the oldest');
ok(DEFAULT_PREFS.v === 1 && DEFAULT_PREFS.shareText === false && DEFAULT_PREFS.allowLinks === false, 'privacy defaults are off');
console.log(fail ? `${fail} failed` : 'all 7 passed');
if (fail) process.exit(1);
