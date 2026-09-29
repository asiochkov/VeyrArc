import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { isAnon, useAuth } from '../lib/auth';
import { hasBackend } from '../lib/supabase';

/* Backend only: app screens need a session and a finished onboarding. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { ready, session, profile } = useAuth();
  if (!hasBackend) return children;
  if (!ready) return <div style={{ height: '100%', background: 'var(--bg)' }} />;
  if (!session) return <Navigate to="/welcome" replace />;
  if (profile && !profile.onboarded_at) return <Navigate to="/onboarding" replace />;
  return children;
}

/* Welcome / sign-in / sign-up: a signed-in, onboarded account goes straight to Today. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { ready, session, profile } = useAuth();
  if (hasBackend && ready && session && !isAnon(session) && profile?.onboarded_at) return <Navigate to="/" replace />;
  return children;
}
