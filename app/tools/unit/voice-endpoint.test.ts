import { attachEndpointing, tailIncomplete, type Clock } from '../../src/voice/stt/endpointing';
import type { SttEngine, SttEvent } from '../../src/voice/stt/types';

// run: npx tsx tools/unit/voice-endpoint.test.ts — when a phrase ends (ТЗ 6.3), with a fake clock
let fail = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fail++; console.log('✗', m); } };

function world() {
  let t = 0; let id = 0;
  const jobs = new Map<number, { at: number; fn: () => void }>();
  const clock: Clock = {
    now: () => t,
    setTimeout: (fn, ms) => { jobs.set(++id, { at: t + ms, fn }); return id; },
    clearTimeout: (i) => { jobs.delete(i as number); },
  };
  const advance = (ms: number) => { const end = t + ms; for (;;) { const next = [...jobs.entries()].filter(([, j]) => j.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!next) break; jobs.delete(next[0]); t = next[1].at; next[1].fn(); } t = end; };
  const listeners: ((e: SttEvent) => void)[] = [];
  let stops = 0, early = 0;
  const engine: SttEngine = { id: 'webspeech', available: async () => true, start() {}, stop() { stops++; }, abort() {}, on: (cb) => { listeners.push(cb); return () => {}; } };
  const emit = (e: SttEvent) => listeners.forEach((l) => l(e));
  return { clock, advance, engine, emit, stops: () => stops, early: () => early, bumpEarly: () => { early++; } };
}
const interim = (text: string): SttEvent => ({ type: 'interim', text, alts: [{ text, confidence: null }] });

ok(tailIncomplete('завтра в') && tailIncomplete('перенеси на') && tailIncomplete('и ещё') && tailIncomplete('ну') && !tailIncomplete('завтра в десять'), 'hanging tails');

// silence after interim words ends the phrase after 1.4 s
let w = world(); attachEndpointing(w.engine, { clock: w.clock });
w.emit({ type: 'start' }); w.emit(interim('сделал зарядку'));
w.advance(1300); ok(w.stops() === 0, 'not yet at 1.3 s');
w.advance(200); ok(w.stops() === 1, 'stops after 1.4 s of silence');

// a hanging phrase waits the tail time, not the short one; more words extend it
w = world(); attachEndpointing(w.engine, { clock: w.clock });
w.emit({ type: 'start' }); w.emit(interim('завтра в'));
w.advance(1350); ok(w.stops() === 1, 'hanging phrase is cut at 1.3 s tail (not earlier than the tail window)');
w = world(); attachEndpointing(w.engine, { clock: w.clock });
w.emit({ type: 'start' }); w.emit(interim('завтра в')); w.advance(1000); w.emit(interim('завтра в десять')); w.advance(1000);
ok(w.stops() === 0, 'new words restart the wait');

// a final result ends after 0.7 s
w = world(); attachEndpointing(w.engine, { clock: w.clock });
w.emit({ type: 'start' }); w.emit({ type: 'final', alts: [{ text: 'настроение четыре', confidence: 0.9 }] });
w.advance(750); ok(w.stops() === 1, 'final result: 0.7 s');

// nothing heard: 7 s
w = world(); attachEndpointing(w.engine, { clock: w.clock });
w.emit({ type: 'start' }); w.advance(6900); ok(w.stops() === 0, 'no stop at 6.9 s of nothing'); w.advance(200); ok(w.stops() === 1, 'no words at all: stop at 7 s');

// the longest phrase: 15 s even if words keep arriving
w = world(); attachEndpointing(w.engine, { clock: w.clock });
w.emit({ type: 'start' });
for (let i = 0; i < 20; i++) { w.emit(interim('слово ' + i)); w.advance(900); }
ok(w.stops() >= 1, 'a phrase is cut at 15 s');

// early finish: a complete, stable light command ends in ~0.35 s instead of 1.4 s
w = world(); let early = 0;
attachEndpointing(w.engine, { clock: w.clock, speculate: () => ({ confidence: 0.9, missing: [], risk: 'R1' }), onEarly: () => early++ });
w.emit({ type: 'start' }); w.emit(interim('настроение четыре'));
w.advance(500); ok(w.stops() === 1 && early === 1, 'early finish for a complete R1 command');

// but never early for something that writes data (R2) or with a missing slot
w = world(); attachEndpointing(w.engine, { clock: w.clock, speculate: () => ({ confidence: 0.95, missing: [], risk: 'R2' }) });
w.emit({ type: 'start' }); w.emit(interim('добавь задачу созвон')); w.advance(600);
ok(w.stops() === 0, 'no early finish for R2');
w = world(); attachEndpointing(w.engine, { clock: w.clock, speculate: () => ({ confidence: 0.95, missing: ['time'], risk: 'R1' }) });
w.emit({ type: 'start' }); w.emit(interim('отметь')); w.advance(600);
ok(w.stops() === 0, 'no early finish with a missing slot');

// dictation: 2.5 s of silence, no early finish
w = world(); attachEndpointing(w.engine, { clock: w.clock, dictation: true, speculate: () => ({ confidence: 1, missing: [], risk: 'R0' }) });
w.emit({ type: 'start' }); w.emit(interim('длинная мысль'));
w.advance(2000); ok(w.stops() === 0, 'dictation waits'); w.advance(600); ok(w.stops() === 1, 'dictation: 2.5 s');

console.log(fail ? `${fail} failed of ${n}` : `all ${n} passed`);
if (fail) process.exit(1);
