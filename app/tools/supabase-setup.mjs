// Retired: the old no-argument command modified hosted Auth, applied the whole
// migration history, changed Render variables and triggered a deployment.
console.error('Automatic remote setup is retired. Follow docs/release/PROCESS.md: use an isolated test database, reconcile the migration baseline, then obtain approval for production changes.');
process.exitCode = 1;
