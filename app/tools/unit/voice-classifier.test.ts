import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMAIN_OF, classify, pOos } from '../../src/voice/nlp/classifier';

// run: npx tsx tools/unit/voice-classifier.test.ts — held-out check of the classifier on the golden TEST split
const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '../voice/golden');
type Row = { text: string; split: string; expect: { kind: string; multi?: { kind: string }[] }; tags?: string[] };
const rows: Row[] = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).flatMap((f) => readFileSync(join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Row)).filter((r) => r.split === 'test' && !r.tags?.includes('noise'));
const neg = rows.filter((r) => r.tags?.includes('negative'));
const pos = rows.filter((r) => !r.tags?.includes('negative') && !r.expect.multi);
// fragments of one or two words («отметь», «завтра») are not off-topic by themselves — the parser asks about them (Q3 is measured on the whole pipeline)
const long = neg.filter((r) => r.text.split(' ').length >= 3);
const refused = long.filter((r) => pOos(r.text) >= 0.6).length;
const falseOos = pos.filter((r) => pOos(r.text) >= 0.6).length;
const domainOk = pos.filter((r) => classify(r.text)[0].domain === DOMAIN_OF(r.expect.kind)).length;
console.log(`oos recall (3+ words) ${refused}/${long.length} · positives wrongly oos ${falseOos}/${pos.length} · domain accuracy ${domainOk}/${pos.length}`);
let fail = 0;
if (refused / Math.max(1, long.length) < 0.5) { fail++; console.log('✗ oos recall below 50%'); }
if (falseOos / Math.max(1, pos.length) > 0.04) { fail++; console.log('✗ too many commands taken for out-of-scope'); }
if (domainOk / Math.max(1, pos.length) < 0.7) { fail++; console.log('✗ domain accuracy below 70%'); }
console.log(fail ? `${fail} checks failed` : 'classifier checks passed');
if (fail) process.exit(1);
