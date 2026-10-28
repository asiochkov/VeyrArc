// Runs every tools/unit/*.test.ts one after another; exit code 1 if any fails.
// run: npx tsx tools/unit/run-all.ts
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith('.test.ts')).sort();
let failed = 0;
for (const f of files) {
  const r = spawnSync('npx', ['tsx', join(dir, f)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const last = (r.stdout || '').trim().split('\n').pop() || (r.stderr || '').trim().split('\n').pop();
  console.log(`${r.status === 0 ? '✓' : '✗'} ${f} — ${last}`);
  if (r.status !== 0) { failed++; console.log((r.stdout || '') + (r.stderr || '')); }
}
console.log(failed ? `${failed} unit file(s) failed` : `all ${files.length} unit file(s) passed`);
process.exit(failed ? 1 : 0);
