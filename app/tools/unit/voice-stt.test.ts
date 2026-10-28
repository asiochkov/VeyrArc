import { createWebSpeech } from '../../src/voice/stt/webSpeech';
import type { SttEvent } from '../../src/voice/stt/types';

// run: npx tsx tools/unit/voice-stt.test.ts — the Web Speech engine against a fake recogniser (ТЗ 6.2)
class Fake {
  static last: Fake | null = null;
  lang = ''; interimResults = false; maxAlternatives = 0; continuous = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onstart: any; onresult: any; onerror: any; onend: any;
  stopped = false; aborted = false;
  constructor() { Fake.last = this; }
  start() { setTimeout(() => this.onstart?.(), 0); }
  stop() { this.stopped = true; setTimeout(() => this.onend?.(), 0); }
  abort() { this.aborted = true; setTimeout(() => this.onend?.(), 0); }
  // a results list as the browser builds it: index → { isFinal, [0..n]: {transcript, confidence} }
  result(items: { final: boolean; alts: [string, number][] }[], resultIndex = 0) {
    const results = items.map((it) => Object.assign(it.alts.map(([transcript, confidence]) => ({ transcript, confidence })), { isFinal: it.final }));
    this.onresult?.({ resultIndex, results });
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).window = { SpeechRecognition: Fake };
let fail = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fail++; console.log('✗', m); } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const run = async (drive: (f: Fake) => void | Promise<void>, act?: (e: ReturnType<typeof createWebSpeech>) => void) => {
  const eng = createWebSpeech();
  const ev: SttEvent[] = [];
  eng.on((e) => ev.push(e));
  eng.start({ lang: 'ru', phrases: ['Зарядка'] });
  await sleep(10);
  act?.(eng);
  await drive(Fake.last!);
  await sleep(150);
  return { ev, f: Fake.last!, eng };
};
const lastEnd = (ev: SttEvent[]) => (ev.filter((e) => e.type === 'end').at(-1) as Extract<SttEvent, { type: 'end' }> | undefined)?.reason;
const finalText = (ev: SttEvent[]) => (ev.find((e) => e.type === 'final') as Extract<SttEvent, { type: 'final' }> | undefined)?.alts[0]?.text;

(async () => {
  let r = await run((f) => { f.result([{ final: true, alts: [['сделал зарядку', 0.9], ['сделал за рядку', 0.4]] }]); f.onend(); });
  ok(r.f.lang === 'ru-RU' && r.f.interimResults && r.f.maxAlternatives === 5 && !r.f.continuous, 'ru-RU, interim, 5 alternatives, not continuous');
  const fin = r.ev.find((e) => e.type === 'final') as Extract<SttEvent, { type: 'final' }>;
  ok(!!fin && fin.alts.length === 2 && fin.alts[0].text === 'сделал зарядку' && fin.alts[0].confidence === 0.9, 'final with alternatives');
  ok(lastEnd(r.ev) === 'final', 'ends with reason final');

  r = await run((f) => { f.result([{ final: true, alts: [['привет', 0]] }]); f.onend(); });
  ok((r.ev.find((e) => e.type === 'final') as Extract<SttEvent, { type: 'final' }>).alts[0].confidence === null, 'confidence 0 → null');

  r = await run((f) => { f.result([{ final: false, alts: [['сделал', 0]] }]); f.result([{ final: false, alts: [['сделал зарядку', 0]] }]); f.result([{ final: true, alts: [['сделал зарядку', 0.8]] }]); f.onend(); });
  const interims = r.ev.filter((e) => e.type === 'interim') as Extract<SttEvent, { type: 'interim' }>[];
  ok(interims.length === 3 && interims[1].text === 'сделал зарядку', 'interim events carry the growing text');

  r = await run((f) => { f.result([{ final: true, alts: [['отметь воду', 0.9]] }]); f.result([{ final: true, alts: [['отметь воду', 0.9]] }], 0); f.onend(); });
  ok(finalText(r.ev) === 'отметь воду', 'duplicate final replaced, not appended');

  r = await run((f) => { f.result([{ final: true, alts: [['фокус', 0.9]] }]); f.result([{ final: true, alts: [['фокус', 0.9]] }, { final: true, alts: [['двадцать пять', 0.9]] }], 1); f.onend(); });
  ok(finalText(r.ev) === 'фокус двадцать пять', 'two finals joined in order');

  for (const [raw, code] of [['not-allowed', 'denied'], ['service-not-allowed', 'service-blocked'], ['no-speech', 'no-speech'], ['audio-capture', 'audio-capture'], ['network', 'network'], ['aborted', 'aborted'], ['weird', 'unknown']] as const) {
    r = await run((f) => { f.onerror({ error: raw }); f.onend(); });
    ok((r.ev.find((e) => e.type === 'error') as Extract<SttEvent, { type: 'error' }> | undefined)?.code === code, `error ${raw} → ${code}`);
  }
  r = await run((f) => { f.onend(); });
  ok(lastEnd(r.ev) === 'no-speech', 'an empty end is reported as no-speech (never silent)');
  r = await run(() => {}, (eng) => eng.stop());
  ok(r.f.stopped && lastEnd(r.ev) === 'stopped', 'stop → reason stopped');
  r = await run(() => {}, (eng) => eng.abort());
  ok(r.f.aborted && lastEnd(r.ev) === 'aborted', 'abort → reason aborted');

  const eng = createWebSpeech(); eng.start({ lang: 'en', phrases: [], dictation: true }); await sleep(10);
  ok(Fake.last!.continuous && Fake.last!.lang === 'en-US', 'dictation: continuous, en-US');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window = {};
  const e2: SttEvent[] = []; const eng2 = createWebSpeech(); eng2.on((e) => e2.push(e)); eng2.start({ lang: 'ru', phrases: [] });
  ok((e2[0] as Extract<SttEvent, { type: 'error' }>)?.code === 'unsupported' && (await eng2.available()) === false, 'unsupported browser is reported, not a crash');
  console.log(fail ? `${fail} failed of ${n}` : `all ${n} passed`);
  if (fail) process.exit(1);
})();
