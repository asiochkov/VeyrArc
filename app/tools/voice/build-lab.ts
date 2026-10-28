// Builds the Voice Lab phrase lists (ТЗ 6.19.1) from the golden set so that the lab and the tests never disagree.
// run: npx tsx tools/voice/build-lab.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
type Row = { id: string; lang: 'ru' | 'en'; text: string; expect: { kind: string; slots?: Record<string, unknown>; multi?: unknown[] }; tags?: string[] };
const read = (f: string) => readFileSync(join(here, 'golden', f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Row);
const pos = read('positive.jsonl'), neg = read('negative.jsonl');
const GROUPS: [string, number, (r: Row) => boolean][] = [
  ['marks', 15, (r) => /^(habit\.(done|undone|doneAll|markGroup|markPast)|water\.)/.test(r.expect.kind)],
  ['mood', 8, (r) => r.expect.kind.startsWith('mood.')],
  ['tasks-time-date', 20, (r) => r.expect.kind === 'task.add'],
  ['move-delete', 8, (r) => /^task\.(move|moveBulk|delete|duration|doneAll)/.test(r.expect.kind)],
  ['questions', 12, (r) => /^(plan\.|stats\.|habit\.(streak|weakest)|quit\.days|list\.|focus\.sum|arc\.day)/.test(r.expect.kind)],
  ['focus-timers', 6, (r) => /^(focus\.|timer\.)/.test(r.expect.kind)],
  ['goals-steps', 6, (r) => r.expect.kind.startsWith('goal.')],
  ['quits', 5, (r) => r.expect.kind.startsWith('quit.')],
  ['settings', 4, (r) => /^(settings\.|export\.|account\.)/.test(r.expect.kind)],
  ['batch', 4, (r) => r.expect.kind === 'multi'],
  ['talk-noise', 6, (r) => r.expect.kind.startsWith('chat.')],
];
for (const lang of ['ru', 'en'] as const) {
  const out: { id: string; group: string; text: string; expect: { kind: string; slots?: Record<string, unknown> } }[] = [];
  const used = new Set<string>();
  for (const [group, n, fits] of GROUPS) {
    const pool = pos.filter((r) => r.lang === lang && fits(r) && !used.has(r.id));
    for (const r of pool.slice(0, lang === 'en' ? Math.ceil(n / 3) : n)) { used.add(r.id); out.push({ id: r.id, group, text: r.text, expect: { kind: r.expect.kind, slots: r.expect.slots } }); }
  }
  // out-of-scope phrases must be refused: a few of them in the lab too
  for (const r of neg.filter((x) => x.lang === lang).slice(0, lang === 'ru' ? 6 : 4)) out.push({ id: r.id, group: 'talk-noise', text: r.text, expect: { kind: 'oos' } });
  writeFileSync(join(here, `../../src/voice/lab/phrases.${lang}.json`), JSON.stringify(out, null, 1) + '\n');
  console.log(lang, out.length, 'phrases');
}
