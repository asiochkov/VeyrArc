import { ENDPOINT } from '../nlp/params';
import type { SttEngine, SttEvent } from './types';

/*
 * Decides when a phrase is over (ТЗ 6.3). Fixed timers cut off «завтра в… в десять» and always add dead time, so the
 * controller watches the words: a complete, stable command ends early; a phrase that hangs on a preposition waits;
 * otherwise a short silence ends it. It calls engine.stop() itself.
 */
export type Clock = { now(): number; setTimeout(fn: () => void, ms: number): unknown; clearTimeout(id: unknown): void };
export const realClock: Clock = { now: () => Date.now(), setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (i) => clearTimeout(i as ReturnType<typeof setTimeout>) };

/** a speculative parse of the words so far: used only to end early, never executed */
export type Speculation = { confidence: number; missing: string[]; risk: string } | null;

const HANGING = new Set('в во на к ко с со у по до от из за для про и а но или что чтобы потом ещё еще ну э эм at to for and or but then the a of'.split(' '));
const clean = (t: string) => t.toLowerCase().replace(/ё/g, 'е').replace(/[.,!?;:…]/g, ' ').replace(/\s+/g, ' ').trim();

/** the phrase hangs: it ends on a preposition, a conjunction, a particle or a filler */
export function tailIncomplete(text: string): boolean {
  const w = clean(text).split(' ');
  return w.length > 0 && HANGING.has(w[w.length - 1]);
}

export type EndpointOpts = {
  speculate?: (text: string) => Speculation;
  dictation?: boolean;
  clock?: Clock;
  onEarly?: () => void;
};

/** attach to an engine; returns a function that detaches and clears the timers */
export function attachEndpointing(engine: SttEngine, o: EndpointOpts = {}): () => void {
  const clock = o.clock ?? realClock;
  const dictation = !!o.dictation;
  let text = '';
  let changedAt = 0;
  let startedAt = 0;
  let timer: unknown = null;
  let hardTimer: unknown = null;
  let specTimer: unknown = null;
  let done = false;

  const clear = () => { for (const t of [timer, hardTimer, specTimer]) if (t) clock.clearTimeout(t); timer = hardTimer = specTimer = null; };
  const finish = (early = false) => { if (done) return; done = true; clear(); if (early) o.onEarly?.(); engine.stop(); };

  const arm = (ms: number) => { if (timer) clock.clearTimeout(timer); timer = clock.setTimeout(() => finish(), ms); };
  const speculate = () => {
    if (!o.speculate || dictation || done) return;
    if (specTimer) clock.clearTimeout(specTimer);
    specTimer = clock.setTimeout(() => {
      const sp = o.speculate!(text);
      // early finish only for read-only and light commands, only when complete and unchanged for a moment
      if (sp && sp.confidence >= ENDPOINT.earlyConfidence && sp.missing.length === 0 && (sp.risk === 'R0' || sp.risk === 'R1') && !tailIncomplete(text)) {
        const wait = Math.max(0, ENDPOINT.earlyStableMs - (clock.now() - changedAt));
        if (timer) clock.clearTimeout(timer);
        timer = clock.setTimeout(() => finish(true), wait);
      }
    }, 80);
  };

  const off = engine.on((e: SttEvent) => {
    if (e.type === 'start') {
      done = false; text = ''; startedAt = clock.now(); changedAt = startedAt;
      // nothing heard at all: stop with no-speech after 7 s; one phrase never lasts longer than 15 s (dictation: 60 s)
      arm(ENDPOINT.noSpeechMs);
      hardTimer = clock.setTimeout(() => finish(), dictation ? ENDPOINT.dictationMaxMs : ENDPOINT.maxUtteranceMs);
      return;
    }
    if (e.type === 'interim' || e.type === 'final') {
      const t = e.type === 'interim' ? e.text : e.alts[0]?.text ?? '';
      if (!t) return;
      if (t !== text) { text = t; changedAt = clock.now(); }
      if (dictation) { arm(ENDPOINT.dictationSilenceMs); return; }
      if (e.type === 'final') { arm(tailIncomplete(t) ? ENDPOINT.tailIncompleteMs : ENDPOINT.silenceAfterFinalMs); return; }
      arm(tailIncomplete(t) ? ENDPOINT.tailIncompleteMs : ENDPOINT.silenceAfterInterimMs);
      speculate();
      return;
    }
    if (e.type === 'end' || e.type === 'error') { done = true; clear(); }
  });
  return () => { off(); clear(); };
}
