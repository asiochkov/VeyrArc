// Runs a Supabase edge function locally on a chosen port: Deno.serve(handler) → Deno.serve({port}, handler).
const port = Number(Deno.env.get('FN_PORT') ?? 8000);
const serve = Deno.serve.bind(Deno);
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (h: Deno.ServeHandler) => serve({ port, hostname: '127.0.0.1' }, h);
await import(Deno.env.get('FN_FILE')!);
