import { useQuery } from '@tanstack/react-query';
import { useAuth } from './auth';
import { db, hasBackend } from './supabase';

/*
 * Invite a friend: a personal link (…/?ref=code). A visitor's code is remembered on the device, and once
 * there is an account (guest or registered) it is handed to the server (claim_referral). The server rewards
 * both people with one bonus streak freeze when the friend makes their first check-in.
 */
const KEY = 'veyrarc.ref';
const get = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const put = (v: string | null) => { try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch { /* no storage */ } };

/** called once at startup: remember ?ref=… and clean it from the address bar */
export function captureReferral() {
  try {
    const u = new URL(window.location.href);
    const c = u.searchParams.get('ref');
    if (!c) return;
    if (/^[a-z0-9]{4,16}$/i.test(c)) put(c.toLowerCase());
    u.searchParams.delete('ref');
    window.history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
  } catch { /* ignore */ }
}

/** hand the remembered code to the server (once); it ignores old accounts, itself and repeats */
export async function claimStored() {
  const c = get();
  if (!c || !hasBackend) return;
  const { error } = await db().rpc('claim_referral', { p_code: c });
  if (!error) { put(null); void import('./analytics').then((m) => m.track('referral_joined')).catch(() => {}); }
}

export type MyReferral = { code: string; invited: number; rewarded: number; bonus: number };
export const referralLink = (code: string) => `${window.location.origin}/?ref=${code}`;
export function useMyReferral() {
  const uid = useAuth((x) => x.session?.user.id);
  return useQuery({
    queryKey: ['referral', uid], enabled: hasBackend && !!uid, staleTime: 60_000,
    queryFn: async () => { const { data, error } = await db().rpc('my_referral'); if (error) throw error; return data as MyReferral; },
  });
}
