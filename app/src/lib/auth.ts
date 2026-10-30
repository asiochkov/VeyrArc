import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { useLangStore } from '../i18n';
import { db, hasBackend, supabase } from './supabase';

/*
 * Session + profile. Guests (B23) are Supabase anonymous users; "Сохрани
 * прогресс" links an email or Google to the same user id, so their data stays.
 */

export type Profile = {
  id: string; first_name: string | null; last_name: string | null; nickname: string | null;
  lang: 'ru' | 'en'; timezone: string; water_unit: 'ml' | 'oz'; directions: string[];
  reminder_time: string | null; notify_habits: boolean; notify_summary: boolean; notify_focus: boolean; notify_arc: boolean;
  onboarded_at: string | null; avatar_url?: string | null; pomodoro?: { lengths?: [number, number, number]; endsAt?: number | null; label?: string | null; tab?: number } | null; tour_done?: Record<string, boolean>; density?: 'comfortable' | 'compact'; quiet_from?: string | null; quiet_to?: string | null;
};
type AuthState = {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  profileError: boolean;
  loadProfile: () => Promise<void>;
};

export const useAuth = create<AuthState>((set, get) => ({
  ready: !hasBackend,
  session: null,
  profile: null,
  profileError: false,
  loadProfile: async () => {
    const uid = get().session?.user.id;
    if (!uid) { set({ profile: null, profileError: false }); return; }
    try {
      const p = await db().from('profiles').select('*').eq('id', uid).maybeSingle();
      if (get().session?.user.id !== uid) return;
      if (p.error || !p.data) throw p.error ?? new Error('Profile is missing');
      const profile = p.data as Profile;
      set({ profile, profileError: false });
      if (profile.lang !== useLangStore.getState().lang) useLangStore.getState().setLang(profile.lang);
    } catch {
      if (get().session?.user.id === uid) set({ profileError: true });
      return;
    }
    void import('./analytics').then((m) => { m.trackOnce('open', 'app_open'); m.flushPushOpen(); }).catch(() => {});
  },
}));

export const isAnon = (s: Session | null) => !!s?.user.is_anonymous;
export const userEmail = (s: Session | null) => s?.user.email ?? s?.user.new_email ?? '';

let started = false;
export function initAuth() {
  if (!supabase || started) return;
  started = true;
  let authRevision = 0;
  supabase.auth.getSession().then(async ({ data, error }) => {
    if (authRevision) return;
    useAuth.setState({ session: data.session, profileError: !!error });
    await useAuth.getState().loadProfile();
    useAuth.setState({ ready: true });
  }).catch(() => useAuth.setState({ ready: true, profileError: true }));
  supabase.auth.onAuthStateChange((event, session) => {
    authRevision++;
    const prev = useAuth.getState().session;
    const changed = session?.user.id !== prev?.user.id;
    useAuth.setState({ session, ...(changed ? { profile: null, profileError: false } : {}), ready: true });
    if (session && (changed || event === 'USER_UPDATED' || event === 'INITIAL_SESSION')) {
      // Never call Supabase inside its auth callback (the auth lock is held).
      setTimeout(() => { void useAuth.getState().loadProfile(); }, 0);
    }
  });
}

const redirectTo = () => window.location.origin + '/';

/* ---- actions (all throw on failure; screens show the design's error states) ---- */

export async function startGuest() {
  if (useAuth.getState().session) return;
  const { data, error } = await db().auth.signInAnonymously({ options: { data: { lang: useLangStore.getState().lang } } });
  if (error) throw error;
  useAuth.setState({ session: data.session });
  await useAuth.getState().loadProfile();
}

/** Sign-up form. A guest keeps their user id: the email is attached to it. */
/**
 * Sign-up form. A guest keeps their user id: the email is attached to it.
 * 'done' = the project confirms emails automatically (no code step), the account is ready.
 */
export async function signUpOrLink(v: { first: string; last: string; email: string; pw: string }): Promise<'signup' | 'link' | 'done'> {
  const session = useAuth.getState().session;
  const meta = { first_name: v.first.trim(), last_name: v.last.trim(), lang: useLangStore.getState().lang };
  if (session && isAnon(session)) {
    const { data, error } = await db().auth.updateUser({ email: v.email, data: meta }, { emailRedirectTo: redirectTo() });
    if (error) throw error;
    await db().from('profiles').update({ first_name: meta.first_name, last_name: meta.last_name }).eq('id', session.user.id);
    if (data.user?.email === v.email) {
      const r = await db().auth.updateUser({ password: v.pw });
      if (r.error) throw r.error;
      await useAuth.getState().loadProfile();
      return 'done';
    }
    return 'link';
  }
  const { data, error } = await db().auth.signUp({ email: v.email, password: v.pw, options: { data: meta, emailRedirectTo: redirectTo() } });
  if (error) throw error;
  if (data.session) { useAuth.setState({ session: data.session }); await useAuth.getState().loadProfile(); return 'done'; }
  return 'signup';
}

/** 6-digit code from the email. For a linked guest the password is set once the email is confirmed. */
export async function verifyEmail(kind: 'signup' | 'link', email: string, code: string, pw: string) {
  const { error } = await db().auth.verifyOtp({ email, token: code, type: kind === 'link' ? 'email_change' : 'signup' });
  if (error) throw error;
  void import('./analytics').then((m) => m.track('signup', { via: kind })).catch(() => {});
  if (kind === 'link' && pw) {
    const r = await db().auth.updateUser({ password: pw });
    if (r.error) throw r.error;
  }
  await useAuth.getState().loadProfile();
}

export async function resendEmail(kind: 'signup' | 'link', email: string) {
  const { error } = await db().auth.resend({ type: kind === 'link' ? 'email_change' : 'signup', email });
  if (error) throw error;
}

export async function signIn(email: string, pw: string) {
  const { error } = await db().auth.signInWithPassword({ email, password: pw });
  if (error) throw error;
  await useAuth.getState().loadProfile();
}

/** Google: a guest links it to the same account, anyone else signs in. Leaves the page. */
export async function google() {
  const session = useAuth.getState().session;
  const { error } = session && isAnon(session)
    ? await db().auth.linkIdentity({ provider: 'google', options: { redirectTo: redirectTo() } })
    : await db().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await db().auth.signOut();
  if (error) throw error;
}

export async function deleteAccount() {
  const { error } = await db().rpc('delete_my_account');
  if (error) throw error;
  await db().auth.signOut({ scope: 'local' });
}

/** Where to go after signing in: onboarding until it has been completed once. */
export function nextPath() {
  return useAuth.getState().profile?.onboarded_at ? '/' : '/onboarding';
}
