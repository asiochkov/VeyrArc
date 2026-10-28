// Golden-set runner (ТЗ 7.3): every phrase goes through normalize → parse → decide with no UI and no network.
// run: npx tsx tools/voice/run-golden.ts [--report-only] [--verbose] [--split=test|train|all] [--update-baseline]
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../../src/voice/nlp/pipeline';
import { riskOf } from '../../src/voice/nlp/intents';
import type { Decision, ParseEnv } from '../../src/voice/nlp/types';

const here = dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const opt = (k: string) => process.argv.slice(2).find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const cfg = JSON.parse(readFileSync(join(here, 'golden/config.json'), 'utf8')) as { enforce: boolean; q1: number; q2: number };
const reportOnly = args.has('--report-only') || !cfg.enforce;

type Expect = { kind: string; slots?: Record<string, unknown>; action?: string; noWrite?: boolean };
type Row = { id: string; lang: 'ru' | 'en'; text: string; expect: Expect & { multi?: Expect[] }; split: 'train' | 'test'; tags?: string[]; now?: string };

const fixture = JSON.parse(readFileSync(join(here, 'golden/fixture.json'), 'utf8'));
const rows: Row[] = readdirSync(join(here, 'golden')).filter((f) => f.endsWith('.jsonl')).sort()
  .flatMap((f) => readFileSync(join(here, 'golden', f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Row));

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9: -]/g, '').replace(/\s+/g, ' ').trim();
const TEXTY = new Set(['query', 'title', 'text', 'to', 'goal', 'name', 'a', 'b', 'target', 'alias', 'trigger', 'category', 'group', 'section', 'what', 'then', 'after']);
// a noisy phrase may swap words, glue them or change an ending: the same words in any order, endings loose, spaces ignored
const sameWords = (a: string, b: string) => {
  if (a.replace(/ /g, '') === b.replace(/ /g, '')) return true;
  const x = a.split(' ').sort(), y = b.split(' ').sort();
  return x.length === y.length && x.every((w, i) => w === y[i] || (Math.min(w.length, y[i].length) >= 5 && w.slice(0, Math.min(w.length, y[i].length) - 2) === y[i].slice(0, Math.min(w.length, y[i].length) - 2)));
};
function slotOk(key: string, want: unknown, got: unknown, lenient = false) {
  if (want === undefined) return true;
  if (got === undefined || got === null) return want === null;
  if (TEXTY.has(key) && typeof want === 'string') { const a = norm(want), b = norm(got); return !!a && !!b && (a === b || a.includes(b) || b.includes(a) || (lenient && sameWords(a, b))); }
  if (Array.isArray(want)) return Array.isArray(got) && want.length === got.length && want.every((w, i) => (typeof w === 'string' ? norm(w) === norm(got[i]) || norm(got[i]).includes(norm(w)) : JSON.stringify(w) === JSON.stringify(got[i])));
  return JSON.stringify(want) === JSON.stringify(got);
}
function matches(e: Expect, d: Decision, lenient = false): boolean {
  if (d.action === 'reject') return e.kind === 'oos' || e.action === 'reject';
  const p = d.action === 'clarify' ? d.options[0] : d.parsed;
  if (!p || p.kind !== e.kind) return false;
  return Object.entries(e.slots ?? {}).every(([k, v]) => slotOk(k, v, p.slots[k], lenient));
}
const defaultAction = (kind: string) => (riskOf(kind) === 'R3' ? 'confirm' : riskOf(kind) === 'R4' ? 'reject' : 'execute');
const actionOk = (e: Expect, d: Decision) => {
  const want = (e.action ?? defaultAction(e.kind)).split('|');
  return want.includes(d.action);
};
const isWrite = (d: Decision) => d.action === 'execute' && riskOf(d.parsed.kind) !== 'R0';

type Res = { row: Row; ok: boolean; why: string; got: string };
const run = (row: Row): Res => {
  const env = { ...fixture, now: new Date(row.now ?? fixture.now), lang: row.lang } as ParseEnv;
  const ds = analyze(row.text, env);
  const got = ds.map((d) => (d.action === 'reject' ? 'reject' : `${d.action}:${d.action === 'clarify' ? d.options[0]?.kind : d.parsed.kind}${d.action === 'reject' ? '' : ' ' + JSON.stringify(d.action === 'clarify' ? d.options[0]?.slots : d.parsed.slots)}`)).join(' + ') || 'nothing';
  const exp = row.expect.multi ?? [row.expect];
  const neg = exp.length === 1 && (exp[0].kind === 'oos' || exp[0].noWrite);
  if (neg) {
    const bad = ds.filter((d) => d.action === 'execute' && (exp[0].noWrite ? true : d.parsed.kind !== 'oos'));
    const allowed = (exp[0].action ?? 'reject').split('|');
    const violated = bad.some((d) => !allowed.includes('execute')) || ds.some((d) => isWrite(d));
    return { row, ok: !violated && ds.every((d) => allowed.includes(d.action) || (d.action === 'reject')), why: violated ? 'executed' : 'unexpected action', got };
  }
  if (ds.length !== exp.length) return { row, ok: false, why: `count ${ds.length} ≠ ${exp.length}`, got };
  for (let i = 0; i < exp.length; i++) {
    if (!matches(exp[i], ds[i], !!row.tags?.includes('noise'))) return { row, ok: false, why: 'intent/slots', got };
    if (!actionOk(exp[i], ds[i])) return { row, ok: false, why: 'action', got };
  }
  return { row, ok: true, why: '', got };
};

const split = opt('split') ?? 'all';
const picked = rows.filter((r) => split === 'all' || r.split === split);
const results = picked.map(run);
const isNeg = (r: Row) => r.tags?.includes('negative');
const isNoise = (r: Row) => r.tags?.includes('noise');
const pos = results.filter((r) => !isNeg(r.row) && !isNoise(r.row));
const noise = results.filter((r) => isNoise(r.row));
const neg = results.filter((r) => isNeg(r.row));
const pct = (a: number, b: number) => (b ? ((a / b) * 100).toFixed(1) + '%' : '—');
const posTest = pos.filter((r) => r.row.split === 'test');

const by = (key: (r: Res) => string[]) => { const m = new Map<string, [number, number]>(); for (const r of results) for (const k of key(r)) { const v = m.get(k) ?? [0, 0]; v[1]++; if (r.ok) v[0]++; m.set(k, v); } return m; };
console.log(`golden: ${rows.length} phrases (${picked.length} run) · positive ${pos.length} · noisy ${noise.length} · negative ${neg.length}`);
console.log('\nby tag'); for (const [k, [a, b]] of [...by((r) => r.row.tags ?? [])].sort()) console.log(`  ${k.padEnd(14)} ${String(a).padStart(4)}/${String(b).padEnd(4)} ${pct(a, b)}`);
const byKind = by((r) => [r.row.expect.multi ? 'multi' : r.row.expect.kind]);
if (args.has('--verbose')) { console.log('\nby intent'); for (const [k, [a, b]] of [...byKind].sort()) console.log(`  ${k.padEnd(24)} ${a}/${b}`); }
const fails = results.filter((r) => !r.ok);
if (fails.length) { console.log(`\nfailures (${fails.length}):`); for (const f of fails.slice(0, args.has('--verbose') ? 400 : 25)) console.log(`  ✗ [${f.row.id}] «${f.row.text}» — ${f.why}; want ${f.row.expect.multi ? 'multi' : f.row.expect.kind + ' ' + JSON.stringify(f.row.expect.slots ?? {}) + (f.row.expect.action ? ' ' + f.row.expect.action : '')}, got ${f.got}`); }
const q1 = posTest.filter((r) => r.ok).length / Math.max(1, posTest.length);
const q2 = noise.filter((r) => r.ok).length / Math.max(1, noise.length);
const q3 = neg.filter((r) => !r.ok).length;
console.log(`\nQ1 positive (test split)  ${pct(posTest.filter((r) => r.ok).length, posTest.length)}  (≥ ${cfg.q1 * 100}%)`);
console.log(`Q2 noisy variants         ${pct(noise.filter((r) => r.ok).length, noise.length)}  (≥ ${cfg.q2 * 100}%)`);
console.log(`Q3 negative violations    ${q3}  (must be 0)`);

if (args.has('--update-baseline')) {
  const f = join(here, '../../../docs/voice/baseline.md');
  const stamp = `\n## Golden set (${new Date().toISOString().slice(0, 10)}, parser: ${process.env.PARSER ?? 'current'})\n\n- positive (test split): ${pct(posTest.filter((r) => r.ok).length, posTest.length)}\n- noisy: ${pct(noise.filter((r) => r.ok).length, noise.length)}\n- negative violations: ${q3}\n- phrases: ${rows.length}\n`;
  writeFileSync(f, (existsSync(f) ? readFileSync(f, 'utf8') : '# Baseline\n') + stamp);
  console.log('baseline.md updated');
}
const fail = q1 < cfg.q1 || q2 < cfg.q2 || q3 > 0;
if (fail && !reportOnly) { console.log('\n✗ thresholds not met'); process.exit(1); }
if (fail) console.log('\n(thresholds not enforced yet: tools/voice/golden/config.json → enforce)');
