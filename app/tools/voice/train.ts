// Offline training of the domain / out-of-scope classifier (ТЗ 6.7.3): `npm run train:voice`.
// Data: golden TRAIN split (never test) + generated templates (gen-templates.ts). Output: src/voice/nlp/model.json.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMAIN_OF, cleanForModel, featuresOf } from '../../src/voice/nlp/classifier';
import { generate } from './gen-templates';

const here = dirname(fileURLToPath(import.meta.url));
type Row = { id: string; text: string; split: 'train' | 'test'; expect: { kind: string; multi?: { kind: string }[] }; tags?: string[] };
const golden: Row[] = readdirSync(join(here, 'golden')).filter((f) => f.endsWith('.jsonl'))
  .flatMap((f) => readFileSync(join(here, 'golden', f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Row));
const train = golden.filter((r) => r.split === 'train' && !r.tags?.includes('noise'));
const testTexts = new Set(golden.filter((r) => r.split === 'test').map((r) => r.text.toLowerCase()));

type Ex = { text: string; domain: string };
const data: Ex[] = [];
for (const r of train) {
  const kinds = r.expect.multi ? r.expect.multi.map((m) => m.kind) : [r.expect.kind];
  for (const k of kinds) data.push({ text: r.text, domain: r.tags?.includes('negative') ? 'oos' : DOMAIN_OF(k) });
}
let leaked = 0;
for (const g of generate(9)) { if (testTexts.has(g.text.toLowerCase())) { leaked++; continue; } data.push({ text: g.text, domain: g.domain }); }
if (leaked) console.log(`dropped ${leaked} generated phrases that equal a golden test phrase`);
// the overlap guard (ТЗ 6.7.3): no golden test phrase may be in the training data
for (const d of data) if (testTexts.has(d.text.toLowerCase())) throw new Error('test phrase in training data: ' + d.text);

const classes = [...new Set(data.map((d) => d.domain))].sort();
const C = classes.length, ci = new Map(classes.map((c, i) => [c, i]));
const docs = new Float64Array(C), counts = new Map<string, Float64Array>();
for (const d of data) {
  const c = ci.get(d.domain)!; docs[c]++;
  for (const f of featuresOf(d.text)) { let a = counts.get(f); if (!a) { a = new Float64Array(C); counts.set(f, a); } a[c]++; }
}
// keep features seen in at least 2 examples
const feats = [...counts.entries()].filter(([, a]) => a.reduce((x, y) => x + y, 0) >= 2).map(([f]) => f).sort();
const alpha = 0.5, V = feats.length + 1;
const classTotal = new Float64Array(C);
for (const f of feats) { const a = counts.get(f)!; for (let c = 0; c < C; c++) classTotal[c] += a[c]; }
const SCALE = 10, q = (lp: number) => Math.max(-127, Math.round(lp * SCALE));
const w = new Int8Array(feats.length * C);
feats.forEach((f, i) => { const a = counts.get(f)!; for (let c = 0; c < C; c++) w[i * C + c] = q(Math.log((a[c] + alpha) / (classTotal[c] + alpha * V))); });
const floor = Array.from(classTotal, (t) => q(Math.log(alpha / (t + alpha * V))));
const total = docs.reduce((a, b) => a + b, 0);
const prior = Array.from(docs, (d) => q(Math.log(d / total)));
// the app's own vocabulary: 6-letter stems of the words of every non-oos example
const dv = new Set<string>();
for (const d of data) if (d.domain !== 'oos') for (const wd of cleanForModel(d.text).split(' ')) if (wd.length >= 4) dv.add(wd.slice(0, 6));
const model = { v: 1, classes, scale: SCALE, floor, prior, feats, w: Buffer.from(w.buffer).toString('base64'), dv: [...dv].sort().join(' ') };
const out = join(here, '../../src/voice/nlp/model.json');
writeFileSync(out, JSON.stringify(model));
const json = readFileSync(out);
console.log(`trained on ${data.length} examples, ${classes.length} classes, ${feats.length} features · model ${(json.length / 1024).toFixed(0)} KB, gzip ${(gzipSync(json).length / 1024).toFixed(0)} KB (limit 150)`);
if (gzipSync(json).length > 150 * 1024) { console.log('✗ model too large'); process.exit(1); }
