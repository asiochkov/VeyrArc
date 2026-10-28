import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMAIN_OF, classify, pOos } from '../../src/voice/nlp/classifier';

// run: npx tsx tools/unit/voice-classifier.test.ts — held-out check of the classifier on the golden TEST split
const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '../voice/golden');
type Row = { text: string; split: string; expect: { kind: string; multi?: { kind: string }[] }; tags?: string[] };
const rows: Row[] = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).flatMap((f) => readFileSync(join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Row)).filter((r) => r.split === 'test' && !r.tags?.includes('noise'));
const test = (lang: 'ru' | 'en', min: { oos: number; domain: number }) => {
  const rs = rows.filter((r) => (/[а-я]/i.test(r.text) ? 'ru' : 'en') === lang);
  const neg = rs.filter((r) => r.tags?.includes('negative'));
  const pos = rs.filter((r) => !r.tags?.includes('negative') && !r.expect.multi);
  // fragments of one or two words («отметь», «завтра») are not off-topic by themselves — the parser asks about them (Q3 is measured on the whole pipeline)
  const long = neg.filter((r) => r.text.split(' ').length >= 3);
  const refused = long.filter((r) => pOos(r.text) >= 0.6).length;
  const falseOos = pos.filter((r) => pOos(r.text) >= 0.6).length;
  const domainOk = pos.filter((r) => classify(r.text)[0].domain === DOMAIN_OF(r.expect.kind)).length;
  console.log(`${lang}: oos recall (3+ words) ${refused}/${long.length} · positives wrongly oos ${falseOos}/${pos.length} · domain accuracy ${domainOk}/${pos.length}`);
  let fail = 0;
  if (refused / Math.max(1, long.length) < min.oos) { fail++; console.log(`✗ ${lang}: oos recall below ${min.oos * 100}%`); }
  if (falseOos / Math.max(1, pos.length) > 0.04) { fail++; console.log(`✗ ${lang}: too many commands taken for out-of-scope`); }
  if (domainOk / Math.max(1, pos.length) < min.domain) { fail++; console.log(`✗ ${lang}: domain accuracy below ${min.domain * 100}%`); }
  return fail;
};
// English has far fewer training phrases (the rules carry it, the classifier only mixes in): looser floors, raised as the sets grow
const fail = test('ru', { oos: 0.5, domain: 0.65 }) + test('en', { oos: 0, domain: 0.6 });
console.log(fail ? `${fail} checks failed` : 'classifier checks passed');
if (fail) process.exit(1);
