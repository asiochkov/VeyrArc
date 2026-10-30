import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
// Execute each module directly: node:test still reports all cases and sets a failing exit code.
for (const file of readdirSync(new URL('./unit/', import.meta.url)).filter((x) => x.endsWith('.test.ts')).sort()) {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', new URL('./unit/' + file, import.meta.url).pathname], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
