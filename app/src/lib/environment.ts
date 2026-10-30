/** Public project identity, never a credential. Staging must declare its separate project. */
export const PRODUCTION_PROJECT_REF = 'lvmglqnzlvvfeqruqouj';
export function validateEnvironment(env: Record<string, string | undefined>, development = false) {
  const kind = env.VITE_APP_ENV ?? (development ? 'local' : 'production');
  if (!['production','staging','local'].includes(kind)) throw Error('Unknown VITE_APP_ENV');
  const demo = env.VITE_DEMO === '1' || env.VITE_PREVIEW === '1' || (development && !env.VITE_SUPABASE_URL && !env.VITE_SUPABASE_ANON_KEY);
  const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_ANON_KEY;
  if (demo) {
    if (url || key) throw Error('Demo must not contain backend credentials');
    return;
  }
  if (!url || !key) throw Error('Set both Supabase variables, or use an explicit demo build');
  const parsed = new URL(url);
  if (parsed.username || parsed.password || parsed.search || parsed.hash || !['/', ''].includes(parsed.pathname)) throw Error('Invalid Supabase URL');
  if (kind === 'local') {
    if (!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)) throw Error('Local tests must use a loopback backend');
  } else if (parsed.protocol !== 'https:') throw Error('Hosted Supabase requires HTTPS');
  if (kind === 'staging') {
    const ref = env.VITE_STAGING_SUPABASE_REF;
    if (!ref || ref === PRODUCTION_PROJECT_REF || parsed.hostname !== `${ref}.supabase.co`) throw Error('Staging requires an explicitly declared separate Supabase project');
  }
}
