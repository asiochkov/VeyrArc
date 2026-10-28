import { DECIDE } from './params';
import { effectiveRisk } from './risk';
import { forbiddenReply, lowReply, oosReply } from '../reply';
import type { Decision, Parsed, Risk } from './types';
import type { Lang } from '../stt/types';

/*
 * Confidence × risk → what to do (ТЗ 6.7.4). The only place where the decision is made; the matrix is tested
 * exhaustively (tools/unit/voice-decide.test.ts): nothing that writes data runs below its threshold.
 */
export type DecideOpts = {
  lang: Lang;
  /** one-line preview for «confirm» («Отметить «Зарядка»?») */
  preview: (p: Parsed) => string;
  /** a question for a missing slot */
  ask: (p: Parsed, slot: string) => string;
  /** the clarification question over several candidates */
  clarifyQuestion: (opts: Parsed[]) => string;
  /** example commands for refusals */
  examples: () => string[];
  /** the phrase itself (to recognise health questions for the refusal) */
  text?: string;
};

export function decide(candidates: Parsed[], o: DecideOpts): Decision {
  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
  const top = sorted[0];
  const ex = o.examples();
  const oos = (): Decision => ({ action: 'reject', reason: 'oos', reply: oosReply(o.lang, [ex[0] ?? '', ex[1] ?? ex[0] ?? ''], o.text) });
  if (!top || top.kind === 'oos') return oos();
  const risk: Risk = effectiveRisk(top.kind, top.slots);
  const p: Parsed = { ...top, risk };
  if (risk === 'R4') return { action: 'reject', reason: 'forbidden', reply: forbiddenReply(top.kind, o.lang) };

  // two different, close candidates: ask which one instead of guessing (writes only)
  const second = sorted.find((c) => c.kind !== top.kind);
  const ambiguous = !!second && risk !== 'R0' && top.confidence - second.confidence < DECIDE.ambiguousMargin && second.confidence >= (risk === 'R1' ? DECIDE.r1Confirm : DECIDE.r2Confirm);
  if (ambiguous && second) { const options = [p, second].slice(0, 3); return { action: 'clarify', options, question: o.clarifyQuestion(options) }; }

  const c = p.confidence;
  const slotMissing = p.missing[0];
  switch (risk) {
    case 'R0':
      if (c >= DECIDE.r0Execute) return { action: 'execute', parsed: p };
      if (c >= DECIDE.r0Clarify) { const options = sorted.slice(0, 3); return { action: 'clarify', options, question: o.clarifyQuestion(options) }; }
      return { action: 'reject', reason: 'low', reply: lowReply(o.lang, ex) };
    case 'R1':
      if (slotMissing && c >= DECIDE.r1Confirm) return { action: 'ask-slot', parsed: p, slot: slotMissing, question: o.ask(p, slotMissing) };
      if (c >= DECIDE.r1Execute) return { action: 'execute', parsed: p };
      if (c >= DECIDE.r1Confirm) return { action: 'confirm', parsed: p, preview: o.preview(p) };
      return { action: 'reject', reason: 'low', reply: lowReply(o.lang, ex) };
    case 'R2':
      if (c < DECIDE.r2Confirm) return { action: 'reject', reason: 'low', reply: lowReply(o.lang, ex) };
      if (slotMissing) return { action: 'ask-slot', parsed: p, slot: slotMissing, question: o.ask(p, slotMissing) };
      if (c >= DECIDE.r2Execute) return { action: 'execute', parsed: p };
      return { action: 'confirm', parsed: p, preview: o.preview(p) };
    default: // R3: always confirmed, never below the floor
      if (c < DECIDE.r3Confirm) return { action: 'reject', reason: 'low', reply: lowReply(o.lang, ex) };
      if (slotMissing) return { action: 'ask-slot', parsed: p, slot: slotMissing, question: o.ask(p, slotMissing) };
      return { action: 'confirm', parsed: p, preview: o.preview(p) };
  }
}
