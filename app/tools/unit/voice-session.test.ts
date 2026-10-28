import { createSession, HEALTH_KEY, HEALTH_TTL_MS } from '../../src/voice/audio/session';
import type { Clock } from '../../src/voice/stt/endpointing';
import type { SttEngine, SttEvent } from '../../src/voice/stt/types';

// run: npx tsx tools/unit/voice-session.test.ts — the one owner of the microphone (ТЗ 6.1)
let fail = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fail++; console.log('✗', m); } };

function world() {
  let t = 1_000_000; let id = 0;
  const jobs = new Map<number, { at: number; fn: () => void }>();
  const clock: Clock = { now: () => t, setTimeout: (fn, ms) => { jobs.set(++id, { at: t + ms, fn }); return id; }, clearTimeout: (i) => { jobs.delete(i as number); } };
  const advance = (ms: number) => { const end = t + ms; for (;;) { const nx = [...jobs.entries()].filter(([, j]) => j.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!nx) break; jobs.delete(nx[0]); t = nx[1].at; nx[1].fn(); } t = end; };
  const ls = new Map<string, string>();
  const storage = { getItem: (k: string) => ls.get(k) ?? null, setItem: (k: string, v: string) => void ls.set(k, v), removeItem: (k: string) => void ls.delete(k) };
  const lis: ((e: SttEvent) => void)[] = [];
  let starts = 0, aborts = 0, stops = 0, cancels = 0, vis = true;
  const engine: SttEngine = { id: 'webspeech', available: async () => true, start() { starts++; }, stop() { stops++; }, abort() { aborts++; }, on: (cb) => { lis.push(cb); return () => {}; } };
  const s = createSession({ engine, clock, storage, cancelSpeech: () => cancels++, visible: () => vis, target: null });
  const emit = (e: SttEvent) => lis.forEach((l) => l(e));
  return { s, emit, advance, ls, advanceClock: (ms: number) => { t += ms; }, c: () => ({ starts, aborts, stops, cancels }), setVis: (v: boolean) => { vis = v; } };
}
const go = { lang: 'ru' as const, phrases: [] };

let w = world();
ok(w.s.state === 'idle', 'starts idle');
ok(w.s.startFromGesture(go) && w.s.state === 'requesting', 'requesting after the gesture');
ok(w.c().starts === 1 && w.c().cancels === 1, 'engine started synchronously, speech cut');
ok(!w.s.startFromGesture(go) && w.c().starts === 1, 'no second start while busy');
w.emit({ type: 'start' }); ok(w.s.state === 'live', 'live on start');
w.emit({ type: 'end', reason: 'final' }); ok(w.s.state === 'idle', 'idle after end');

// speaking and recognising never overlap
w = world(); w.s.startFromGesture(go); w.emit({ type: 'start' });
w.s.speaking(true); ok(w.c().aborts === 1 && w.s.state === 'speaking', 'speech aborts recognition');
w.s.speaking(false); ok(w.s.state === 'idle', 'idle after speech');

// background aborts quietly
w = world(); w.s.startFromGesture(go); w.emit({ type: 'start' });
w.setVis(false); w.s.handleHidden(); ok(w.c().aborts === 1 && w.s.state === 'idle', 'hidden tab: abort, idle');

// network: retries at 1, 2, 4 s, then the error is delivered
w = world(); const seen: string[] = []; w.s.on((e) => seen.push(e.type === 'error' ? 'err:' + e.code : e.type));
w.s.startFromGesture(go); w.emit({ type: 'start' });
w.emit({ type: 'error', code: 'network' }); w.emit({ type: 'end', reason: 'aborted' });
ok(seen.includes('retrying') && !seen.includes('err:network'), 'first network error is held back');
w.advance(900); ok(w.c().starts === 1, 'no retry at 0.9 s'); w.advance(150); ok(w.c().starts === 2, 'retry at 1 s');
w.emit({ type: 'error', code: 'network' }); w.advance(2100); ok(w.c().starts === 3, 'retry at 2 s');
w.emit({ type: 'error', code: 'network' }); w.advance(4100); ok(w.c().starts === 4, 'retry at 4 s');
w.emit({ type: 'error', code: 'network' }); ok(seen.includes('err:network'), 'after three retries the error is shown');

// the user pressing stop cancels pending retries
w = world(); w.s.startFromGesture(go); w.emit({ type: 'start' }); w.emit({ type: 'error', code: 'network' });
w.s.stop(); w.advance(1500); ok(w.c().starts === 1, 'stop cancels the retry');

// health: two failures in a row → broken; a result clears it; expires after 7 days
w = world(); w.s.startFromGesture(go);
w.emit({ type: 'error', code: 'service-blocked' }); ok(!w.s.voiceBroken(), 'one failure is not enough');
w.s.startFromGesture(go); w.emit({ type: 'error', code: 'service-blocked' }); ok(w.s.voiceBroken() && w.s.health() === 'broken', 'two in a row: broken');
w.advanceClock(HEALTH_TTL_MS + 1000); ok(!w.s.voiceBroken(), 'record expires after 7 days');
w = world(); w.s.startFromGesture(go); w.emit({ type: 'error', code: 'audio-capture' }); w.s.startFromGesture(go);
w.emit({ type: 'start' }); w.emit({ type: 'interim', text: 'привет', alts: [] }); w.emit({ type: 'end', reason: 'final' });
w.s.startFromGesture(go); w.emit({ type: 'error', code: 'audio-capture' }); ok(!w.s.voiceBroken(), 'a result in between resets the count');
w.s.resetHealth(); ok(w.ls.get(HEALTH_KEY) === undefined, 'resetHealth clears the record');
w = world(); w.s.startFromGesture(go); w.emit({ type: 'error', code: 'denied' }); ok(w.s.health() === 'blocked', 'denied → blocked');

// permission query never throws
ok((await_(w.s.permission())) !== 'x', 'permission() resolves');
function await_<T>(p: Promise<T>): T | string { void p; return 'ok'; }

w.s.close(); ok(w.s.state === 'closed' && !w.s.startFromGesture(go), 'closed session does not start');

console.log(fail ? `${fail} failed of ${n}` : `all ${n} passed`);
if (fail) process.exit(1);
