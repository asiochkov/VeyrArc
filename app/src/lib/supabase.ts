import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

/*
 * Supabase client. Without VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (or in
 * the preview build) the app runs on the design's mock data, as in stage 2.
 */
const url = env.VITE_SUPABASE_URL as string | undefined;
const key = env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const hasBackend = !!(url && key) && !(env.VITE_PREVIEW && env.MODE === 'preview');

export const supabase: SupabaseClient | null = hasBackend
  ? createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

/** Supabase client; only call from code paths guarded by `hasBackend`. */
export function db(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}
