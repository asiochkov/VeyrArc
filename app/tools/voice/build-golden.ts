// Authoring file for the golden set (ТЗ 7.2). The phrases below are the source of truth; run
//   npx tsx tools/voice/build-golden.ts
// to write golden/*.jsonl. Ids and the train/test split are derived from the text, so adding phrases never
// reshuffles old ones, and the split is never edited to make a test pass (decisions.md #15).
// now = Wed 28 Oct 2026 15:00 unless a row says otherwise. Slot semantics: docs/voice/intents.md.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash, perturb } from './perturb';
import { POSITIVE } from './golden-src/positive';
import { NEGATIVE } from './golden-src/negative';

const here = dirname(fileURLToPath(import.meta.url));
export type Slots = Record<string, unknown>;
export type Row = [lang: 'ru' | 'en', text: string, kind: string, slots?: Slots, action?: string, tags?: string[]];
export type Multi = [lang: 'ru' | 'en', text: string, kinds: [string, Slots?][], tags?: string[]];

const lines = (xs: object[]) => xs.map((x) => JSON.stringify(x)).join('\n') + '\n';
const split = (text: string) => (hash('split|' + text) % 10 < 3 ? 'test' : 'train');
let n = 0;
const id = (p: string) => p + String(++n).padStart(4, '0');

const positive: object[] = [];
const seen = new Set<string>();
for (const r of POSITIVE) {
  const [lang, text, kind, slots, action, tags] = r as Row;
  if (seen.has(text)) throw new Error('duplicate phrase: ' + text); seen.add(text);
  if (Array.isArray(kind)) { // multi-command phrase
    const m = r as unknown as Multi;
    positive.push({ id: id('g'), lang: m[0], text: m[1], expect: { kind: 'multi', multi: m[2].map(([k, s]) => ({ kind: k, slots: s ?? {} })) }, split: split(text), tags: [...(m[3] ?? []), 'multi'] });
    continue;
  }
  positive.push({ id: id('g'), lang, text, expect: { kind, slots: slots ?? {}, ...(action ? { action } : {}) }, split: split(text), tags: tags ?? [] });
}
const negative = NEGATIVE.map(([lang, text, action, tags]) => ({ id: id('n'), lang, text, expect: { kind: 'oos', noWrite: true, action: action ?? 'reject' }, split: split(text), tags: ['negative', ...(tags ?? [])] }));

// noisy variants: damage the phrase the way recognition does; the expectation stays the same
const noisy: object[] = [];
for (const p of positive as { text: string; lang: string; expect: object; tags: string[] }[]) {
  if (p.lang !== 'ru' || p.tags.includes('multi') || p.tags.includes('regress') || hash('noisy|' + p.text) % 3 !== 0) continue;
  const v = perturb(p.text, 'veyrarc-golden-v1');
  if (v) noisy.push({ id: id('z'), lang: p.lang, text: v.text, expect: p.expect, split: 'test', tags: ['noise', v.damage, ...p.tags.filter((t) => t !== 'noise')], from: p.text });
}
writeFileSync(join(here, 'golden/positive.jsonl'), lines(positive));
writeFileSync(join(here, 'golden/negative.jsonl'), lines(negative));
writeFileSync(join(here, 'golden/noisy.jsonl'), lines(noisy));
console.log(`positive ${positive.length} (RU ${positive.filter((p: any) => p.lang === 'ru').length}, EN ${positive.filter((p: any) => p.lang === 'en').length}) · negative ${negative.length} · noisy ${noisy.length}`);
