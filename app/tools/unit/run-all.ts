import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

// run: npx tsx tools/unit/run-all.ts
const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const files = readdirSync(dir).filter((f) => f.endsWith('.test.ts')).sort();
const tsxCli = createRequire(import.meta.url).resolve('tsx/cli');

let failed = 0;
for (const file of files) {
  console.log(`\n— ${file} —`);
  const res = spawnSync(process.execPath, [tsxCli, path.join(dir, file)], { stdio: 'inherit' });
  if (res.status !== 0) failed++;
}

console.log(failed ? `\n${failed} of ${files.length} test file(s) failed` : `\nall ${files.length} test file(s) passed`);
if (failed) process.exit(1);
