import { QueryClient } from '@tanstack/react-query';
import { bindSystem, getSystem } from '../../src/state/system';
import { handlePhrase } from '../../src/voice/dialog/manager';
import { dialog } from '../../src/voice/dialog/context';
import { envFromSystem } from '../../src/voice/exec/env';
import { journal } from '../../src/voice/journal';
import type { Reply } from '../../src/voice/exec/types';

// run: npx tsx --import ./tools/unit/css-register.mjs tools/unit/voice-exec.test.ts
// Every executor on the seeded demo data: the answer says the right thing and, for a change, do → undo gives back the same state (Q6).
(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
(globalThis as any).document = { documentElement: { dataset: {}, setAttribute: () => {} }, querySelector: () => null };
(globalThis as any).matchMedia = () => ({ matches: false, addEventListener: () => {} });
bindSystem(new QueryClient());
const NOW = new Date(2026, 9, 28, 15, 0);
const sys = () => getSystem()!;
const norm = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(norm).map((e) => JSON.stringify(e)).sort();
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== null && x !== '' && x !== undefined).sort(([x], [y]) => x.localeCompare(y)).map(([k, x]) => [k, norm(x)]));
  return v;
};
const snap = () => {
  const s = JSON.parse(JSON.stringify(sys()));
  s.days = s.days.filter((d: any) => d.mood != null || d.water || d.frozen || d.note);
  s.entries = s.entries.filter((e: any) => e.done_task_ids?.length || e.diary);
  return JSON.stringify(norm(s));
};
let fail = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fail++; console.log('✗', m); } };

export type Case = { say: string | string[]; expect?: RegExp; writes?: boolean; lang?: 'ru' | 'en'; answer?: number; /** the phrases cancel each other out in the end (add, then archive): only check that undo restores */ net?: boolean };
const say = (t: string, lang: 'ru' | 'en') => handlePhrase(t, 'text', null, envFromSystem(lang, NOW));
/** the first button of a question is pressed (the confirmation) */
const press = (r: Reply, i = 0): Reply => (r.choices?.[i] ? (r.choices[i].run() as Reply) : r);

function run(cs: Case[]) {
  for (const c of cs) {
    const lang = c.lang ?? 'ru';
    dialog.reset();
    const before = snap();
    journal.clear();
    const jBefore = 0;
    let r: Reply = { ok: true, kind: 'info', screen: '', speech: '' };
    for (const phrase of Array.isArray(c.say) ? c.say : [c.say]) { r = say(phrase, lang); if (r.choices?.length && c.answer !== -1) r = press(r, c.answer ?? 0); }
    const label = Array.isArray(c.say) ? c.say.join(' → ') : c.say;
    if (c.expect) ok(c.expect.test(r.screen + ' ' + (r.list ?? []).join(' ')), `«${label}» → «${r.screen}» does not match ${c.expect}`);
    if (c.writes) {
      const during = snap();
      if (!c.net) ok(during !== before, `«${label}»: nothing changed (${r.screen})`);
      const added = journal.list().length - jBefore;
      ok(added >= 1 || !!r.undoable, `«${label}»: no journal entry`);
      journal.undo(Math.max(1, added));
      const after = snap();
      ok(after === before, `«${label}»: state differs after undo`);
    }
  }
}
export { run, ok, sys, say, press };

if (process.argv[1]?.endsWith('voice-exec.test.ts')) {
  const { cases } = await import('./voice-exec-cases');
  run(cases);
  console.log(fail ? `${fail} failed of ${n}` : `all ${n} passed`);
  if (fail) process.exit(1);
}
