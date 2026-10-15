import { useAuth } from './auth';
import { db } from './supabase';

/*
 * Paid Pro through YooKassa (edge function «billing»). The card form lives on YooKassa's page:
 * we create the payment, go there, and on return ask the server to settle it right away
 * (the YooKassa notification does the same in the background).
 */
export type Period = 'monthly' | 'yearly';
const PENDING = 'veyrarc.payment';

export class BillingError extends Error {}

export async function checkout(period: Period) {
  const { data, error } = await db().functions.invoke('billing', { body: { action: 'checkout', period } });
  if (error || !data?.url) {
    // supabase-js wraps non-2xx; the body says why (account / period / server)
    let code = 'server';
    try { code = (await (error as { context?: Response })?.context?.json())?.error ?? code; } catch { /* no body */ }
    throw new BillingError(code);
  }
  try { localStorage.setItem(PENDING, data.payment); } catch { /* no storage */ }
  window.location.assign(data.url as string);
}

/** back from the payment page: settle the payment, refresh the plan. Polls a little while YooKassa is still «pending». */
export async function settlePending(): Promise<'succeeded' | 'canceled' | 'pending' | 'none'> {
  let id: string | null = null;
  try { id = localStorage.getItem(PENDING); } catch { /* no storage */ }
  if (!id) return 'none';
  for (let i = 0; i < 8; i++) {
    const { data } = await db().functions.invoke('billing', { body: { action: 'sync', payment: id } });
    const status = (data?.status as string | undefined) ?? 'pending';
    if (status === 'succeeded' || status === 'canceled') {
      try { localStorage.removeItem(PENDING); } catch { /* no storage */ }
      await useAuth.getState().loadProfile();
      return status;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return 'pending';
}

export async function cancelAutoRenew() {
  const { error } = await db().rpc('cancel_auto_renew');
  if (error) throw error;
  await useAuth.getState().loadProfile();
}
