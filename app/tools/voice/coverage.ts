// Catalog coverage (Q7, WP5): every one of the 243 capabilities must map to an intent in nlp/intents.ts or to docs/voice/not-done.md.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INTENTS } from '../../src/voice/nlp/intents';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const notDone = readFileSync(join(root, 'docs/voice/not-done.md'), 'utf8');
const mentioned = new Set([...notDone.matchAll(/№\s*(\d+)|\b#(\d+)\b/g)].map((m) => Number(m[1] ?? m[2])));
const covered = new Map<number, string[]>();
for (const i of INTENTS) for (const n of i.catalog) covered.set(n, [...(covered.get(n) ?? []), i.kind]);
const missing: number[] = [];
for (let n = 1; n <= 243; n++) if (!covered.has(n) && !mentioned.has(n)) missing.push(n);
console.log(`catalog: ${covered.size} of 243 mapped to intents, ${[...mentioned].filter((n) => !covered.has(n)).length} in not-done.md`);
if (missing.length) { console.log('✗ not covered:', missing.join(', ')); process.exit(1); }
console.log('✓ no gaps (Q7)');
