import { decide } from '../../src/voice/nlp/decide';
import { INTENTS } from '../../src/voice/nlp/intents';
import { DECIDE } from '../../src/voice/nlp/params';
import { effectiveRisk, itemCount, missingSlots } from '../../src/voice/nlp/risk';
import type { Parsed } from '../../src/voice/nlp/types';

// run: npx tsx tools/unit/voice-decide.test.ts — Q5: exhaustive check of the risk matrix (kind × confidence × slots × group size)
let fail = 0, n = 0;
const bad = (m: string) => { if (fail++ < 20) console.log('✗', m); };
const opts = { lang: 'ru' as const, preview: () => 'p', ask: () => 'q', clarifyQuestion: () => 'c', examples: () => ['a', 'b'] };

for (const spec of INTENTS) {
  for (let ci = 0; ci <= 20; ci++) {
    const conf = ci / 20;
    for (const filled of [true, false]) for (const group of [1, 3, 4, 9]) {
      const slots: Record<string, unknown> = {};
      if (filled) for (const k of spec.required) slots[k] = 'x';
      if (group > 1) slots.items = Array.from({ length: group }, (_, i) => 'i' + i);
      const miss = missingSlots(spec.kind, slots);
      const parsed: Parsed = { kind: spec.kind, slots, confidence: conf, risk: spec.risk, missing: miss, why: [] };
      const d = decide([parsed], opts);
      n++;
      const risk = effectiveRisk(spec.kind, slots);
      const tag = `${spec.kind} conf=${conf} filled=${filled} group=${group} → ${d.action}`;
      if (d.action === 'execute') {
        if (risk === 'R4') bad('R4 executed: ' + tag);
        if (risk === 'R3') bad('R3 executed without a confirmation: ' + tag);
        if (risk === 'R2' && (conf < DECIDE.r2Execute || miss.length)) bad('R2 executed below threshold or with a missing slot: ' + tag);
        if (risk === 'R1' && conf < DECIDE.r1Execute) bad('R1 executed below threshold: ' + tag);
        if (risk === 'R0' && conf < DECIDE.r0Execute) bad('R0 executed below threshold: ' + tag);
        if (spec.risk !== 'R0' && itemCount(slots) > DECIDE.bulkConfirmAbove) bad('a group of more than 3 executed: ' + tag);
      }
      if (d.action === 'confirm' && (risk === 'R4' || risk === 'R0')) bad('confirm for the wrong risk: ' + tag);
      if (risk === 'R4' && d.action !== 'reject') bad('R4 must be refused: ' + tag);
      if (spec.kind === 'oos' && d.action !== 'reject') bad('oos must be refused: ' + tag);
    }
  }
}
// no candidates → refused as out of scope
const empty = decide([], opts);
if (empty.action !== 'reject' || empty.reason !== 'oos') bad('no candidates should be oos');
// the health refusal carries the extra line
const health = decide([], { ...opts, text: 'у меня болит голова' });
if (health.action !== 'reject' || !health.reply.screen.includes('медицинск')) bad('health question must say no medical advice');
console.log(fail ? `${fail} violations in ${n} combinations` : `all ${n} combinations of the risk matrix hold`);
if (fail) process.exit(1);
