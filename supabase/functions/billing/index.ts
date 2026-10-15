// VeyrArc · subscription billing through YooKassa (https://yookassa.ru/developers/api).
//  POST {action:'checkout', period}     — signed-in user: a payment with redirect, card saved for auto-renew
//  POST {action:'sync', payment}        — signed-in user, back from the payment page: apply it now
//                                         without waiting for the notification
//  POST ?hook=yookassa                  — YooKassa notifications. The body is not trusted: the payment
//                                         (or refund) is fetched again from the API by its id
//  POST {action:'renew'} + x-cron-secret — daily, from pg_cron: charges saved cards for renewals
// Deploy with --no-verify-jwt (the webhook comes without a Supabase token; user calls are checked here).
// Secrets: YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY, BILLING_CRON_SECRET, APP_URL,
//          optional PRICE_MONTHLY / PRICE_YEARLY (rubles), YOOKASSA_RECEIPT=0 to send no 54-FZ receipt.
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (k: string, d = '') => Deno.env.get(k) ?? d;
const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const API = env('YOOKASSA_API', 'https://api.yookassa.ru/v3');
const AUTH = 'Basic ' + btoa(`${env('YOOKASSA_SHOP_ID')}:${env('YOOKASSA_SECRET_KEY')}`);
const APP_URL = env('APP_URL', 'https://veyrarc.onrender.com').replace(/\/$/, '');
const RECEIPT = env('YOOKASSA_RECEIPT', '1') !== '0';
type Period = 'monthly' | 'yearly';
const PRICE: Record<Period, number> = { monthly: Number(env('PRICE_MONTHLY', '490')), yearly: Number(env('PRICE_YEARLY', '3490')) };
const TITLE: Record<Period, string> = { monthly: 'VeyrArc Pro — 1 месяц', yearly: 'VeyrArc Pro — 1 год' };

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret', 'access-control-allow-methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

// deno-lint-ignore no-explicit-any
type Payment = { id: string; status: string; paid: boolean; amount: { value: string; currency: string }; metadata?: Record<string, string>; payment_method?: any; confirmation?: { confirmation_url?: string } };

async function yk<T>(path: string, init: { method?: string; body?: unknown; key?: string } = {}): Promise<T> {
  const r = await fetch(API + path, {
    method: init.method ?? 'GET',
    headers: { authorization: AUTH, 'content-type': 'application/json', ...(init.key ? { 'idempotence-key': init.key } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`yookassa ${r.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

const money = (v: number) => v.toFixed(2);
function paymentBody(user: string, email: string | null, period: Period, kind: 'initial' | 'renew') {
  const amount = { value: money(PRICE[period]), currency: 'RUB' };
  return {
    amount, capture: true, description: TITLE[period],
    metadata: { user_id: user, period, kind },
    ...(RECEIPT && email ? { receipt: { customer: { email }, items: [{ description: TITLE[period], quantity: '1.00', amount, vat_code: 1, payment_mode: 'full_payment', payment_subject: 'service' }] } } : {}),
  };
}
const cardOf = (m: Payment['payment_method']) => m?.card ? `${m.card.card_type ?? 'Card'} •• ${m.card.last4}` : m?.type === 'sbp' ? 'СБП' : m?.type === 'sberbank' ? 'SberPay' : null;

/** bring our records in line with what YooKassa says about one payment */
async function settle(p: Payment) {
  const user = p.metadata?.user_id, period = p.metadata?.period as Period | undefined, kind = (p.metadata?.kind ?? 'initial') as 'initial' | 'renew';
  if (!user || (period !== 'monthly' && period !== 'yearly')) return null;
  const amount = Number(p.amount.value), currency = p.amount.currency;
  if (p.status === 'succeeded' && p.paid) {
    const saved = p.payment_method?.saved ? String(p.payment_method.id) : null;
    const { data, error } = await sb.rpc('billing_apply', { p_id: p.id, p_user: user, p_period: period, p_kind: kind, p_amount: amount, p_currency: currency, p_method: saved, p_card: cardOf(p.payment_method) });
    if (error) throw error;
    return data;
  }
  const { error } = await sb.rpc('billing_record', { p_id: p.id, p_user: user, p_period: period, p_kind: kind, p_amount: amount, p_currency: currency, p_status: p.status });
  if (error) throw error;
  return null;
}

async function webhook(req: Request) {
  // deno-lint-ignore no-explicit-any
  const n = await req.json().catch(() => null) as any;
  const event = String(n?.event ?? ''), id = String(n?.object?.id ?? '');
  if (!id) return json({ ok: false }, 400);
  if (event.startsWith('payment.')) await settle(await yk<Payment>(`/payments/${encodeURIComponent(id)}`));
  else if (event === 'refund.succeeded') {
    const r = await yk<{ status: string; payment_id: string }>(`/refunds/${encodeURIComponent(id)}`);
    if (r.status === 'succeeded') { const { error } = await sb.rpc('billing_refund', { p_payment: r.payment_id }); if (error) throw error; }
  }
  return json({ ok: true });
}

async function renew() {
  const { data, error } = await sb.rpc('billing_due');
  if (error) throw error;
  const out: { user: string; status: string }[] = [];
  for (const row of (data ?? []) as { user_id: string; method_id: string; period: Period; email: string | null; renews_at: string }[]) {
    try {
      // one key per user and paid-until date: a retry of the same run never charges twice
      const p = await yk<Payment>('/payments', { method: 'POST', key: `renew-${row.user_id}-${row.renews_at.slice(0, 10)}-${new Date().toISOString().slice(0, 10)}`, body: { ...paymentBody(row.user_id, row.email, row.period, 'renew'), payment_method_id: row.method_id } });
      await settle(p);
      out.push({ user: row.user_id, status: p.status });
    } catch (e) { out.push({ user: row.user_id, status: 'error: ' + (e as Error).message.slice(0, 120) }); }
  }
  return json({ ok: true, renewed: out });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const url = new URL(req.url);
  try {
    if (url.searchParams.get('hook') === 'yookassa') return await webhook(req);
    const body = await req.json().catch(() => ({})) as { action?: string; period?: Period; payment?: string };
    if (body.action === 'renew') {
      if (!env('BILLING_CRON_SECRET') || req.headers.get('x-cron-secret') !== env('BILLING_CRON_SECRET')) return json({ error: 'forbidden' }, 403);
      return await renew();
    }
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) return json({ error: 'auth' }, 401);
    if (body.action === 'checkout') {
      // a receipt needs an e-mail, and a guest account could lose what it paid for
      if (user.is_anonymous || !user.email) return json({ error: 'account' }, 400);
      if (body.period !== 'monthly' && body.period !== 'yearly') return json({ error: 'period' }, 400);
      const p = await yk<Payment>('/payments', {
        method: 'POST', key: crypto.randomUUID(),
        body: { ...paymentBody(user.id, user.email, body.period, 'initial'), save_payment_method: true, confirmation: { type: 'redirect', return_url: `${APP_URL}/pro?paid=1` } },
      });
      await settle(p);
      return json({ url: p.confirmation?.confirmation_url, payment: p.id });
    }
    if (body.action === 'sync') {
      const id = body.payment ? String(body.payment) : null;
      if (!id) return json({ error: 'payment' }, 400);
      const p = await yk<Payment>(`/payments/${encodeURIComponent(id)}`);
      if (p.metadata?.user_id !== user.id) return json({ error: 'forbidden' }, 403);
      await settle(p);
      return json({ status: p.status });
    }
    return json({ error: 'action' }, 400);
  } catch (e) {
    console.error(e);
    // non-2xx makes YooKassa retry the notification later
    return json({ error: 'server' }, 500);
  }
});
