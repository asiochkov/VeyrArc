// run: npx tsx --import ./tools/unit/css-register.mjs tools/voice/explain.ts "фраза" — what the parser sees and why
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { candidates } from '../../src/voice/nlp/parse';
import { analyze } from '../../src/voice/nlp/pipeline';
import { buildCtx } from '../../src/voice/nlp/parse/engine';
import { buildLexicon } from '../../src/voice/nlp/lexicon';
import { classify } from '../../src/voice/nlp/classifier';
import type { ParseEnv } from '../../src/voice/nlp/types';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = { ru: JSON.parse(readFileSync(join(here, 'golden/fixture.json'), 'utf8')), en: JSON.parse(readFileSync(join(here, 'golden/fixture-en.json'), 'utf8')) };
for (const text of process.argv.slice(2)) {
  const lang = /[a-z]/i.test(text) && !/[а-я]/i.test(text) ? 'en' : 'ru';
  const fixture = fixtures[lang];
  const env = { ...fixture, now: new Date(fixture.now), lang } as ParseEnv;
  const ctx = buildCtx(text, env, buildLexicon(env));
  console.log(`\n«${text}»\n  c:    ${ctx.c}\n  body: ${ctx.body}\n  when: ${JSON.stringify(ctx.when)}`);
  console.log('  classifier:', classify(ctx.c).slice(0, 3).map((x) => `${x.domain} ${x.p.toFixed(2)}`).join(', '));
  for (const c of candidates(text, env)) console.log(`  · ${c.kind} ${c.confidence} ${JSON.stringify(c.slots)} missing=${c.missing}`);
  for (const d of analyze(text, env)) console.log('  →', d.action, d.action === 'reject' ? d.reason : d.action === 'clarify' ? d.options.map((o) => o.kind).join('|') : d.parsed.kind);
}
