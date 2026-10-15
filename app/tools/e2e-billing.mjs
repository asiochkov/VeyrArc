/*
 * Paid Pro through YooKassa against the local stack + mock YooKassa (tools/local-backend/functions.sh):
 * sign in → Pro → consent → «payment page» → back: Pro on, card saved → auto-renew charges the card →
 * a declined renewal changes nothing → turn auto-renew off in Settings → a refund takes Pro back.
 * The app must be built with VITE_BETA=0. Run:
 *   bash tools/local-backend/functions.sh && VITE_BETA=0 npm run build && node tools/e2e-billing.mjs
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { APP, open, log } from './e2e-lib.mjs';

const GW = 'http://127.0.0.1:54321';
const FN = `${GW}/functions/v1/billing`;
const YK = 'http://127.0.0.1:54401';
const keys = Object.fromEntries(readFileSync('/home/claude/localsb/keys.env', 'utf8').trim().split('\n').map((l) => l.split('=')));
const sql = (q) => execSync(`psql -qAt -h 127.0.0.1 -p 54322 -U postgres -c ${JSON.stringify(q)}`, { encoding: 'utf8' }).trim();
const sub = (uid) => sql(`select plan||'|'||coalesce(period,'')||'|'||status||'|'||auto_renew||'|'||coalesce(card,'')||'|'||coalesce(renews_at::date::text,'') from public.subscriptions where user_id='${uid}'`).split('|');
const assert = (c, m) => { if (!c) throw new Error('✗ ' + m); };
const cron = (secret = 'local-cron') => fetch(FN, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cron-secret': secret }, body: JSON.stringify({ action: 'renew' }) });

const beta = sql('select beta from private.flags');
sql('update private.flags set beta = false');
await fetch(`${YK}/__reset`, { method: 'POST' });
const { browser, page, errors } = await open({ width: 390, height: 844 });
try {
  // a confirmed, onboarded account
  const email = `pay+${Date.now()}@veyrarc.test`, password = 'Billing-test-1';
  const u = await (await fetch(`${GW}/auth/v1/admin/users`, { method: 'POST', headers: { 'content-type': 'application/json', apikey: keys.SERVICE_KEY, authorization: `Bearer ${keys.SERVICE_KEY}` }, body: JSON.stringify({ email, password, email_confirm: true }) })).json();
  const uid = u.id; assert(uid, 'user created');
  sql(`update public.profiles set onboarded_at = now(), first_name = 'Пэй' where id = '${uid}'`);

  // the server refuses without a token, and the cron call without the secret
  assert((await fetch(FN, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"action":"checkout","period":"monthly"}' })).status === 401, 'checkout needs a user');
  assert((await cron('wrong')).status === 403, 'renew needs the cron secret');
  // the client cannot grant itself Pro
  const anonTry = await fetch(`${GW}/rest/v1/rpc/billing_apply`, { method: 'POST', headers: { 'content-type': 'application/json', apikey: keys.ANON_KEY, authorization: `Bearer ${keys.ANON_KEY}` }, body: JSON.stringify({ p_id: 'x', p_user: uid, p_period: 'yearly', p_kind: 'initial', p_amount: 1, p_currency: 'RUB', p_method: null, p_card: null }) });
  assert(anonTry.status >= 400, 'billing_apply closed to clients');
  log('server guards');

  await page.goto(APP + '/login');
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.waitForURL((x) => new URL(x).pathname === '/', { timeout: 15000 });

  await page.goto(APP + '/pro');
  await page.getByRole('button', { name: /Попробовать 7 дней/ }).waitFor();
  await page.getByRole('button', { name: /Оформить сразу/ }).click();
  // no consent — no payment
  await page.getByRole('button', { name: /Оформить за/ }).click();
  await page.getByText('Отметь согласие на автопродление').waitFor();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /Оформить за .*в год/ }).click();
  // the mock payment page pays and sends us back to /pro?paid=1
  await page.waitForURL((x) => new URL(x).pathname === '/pro', { timeout: 15000 });
  await page.getByText('Pro подключён').waitFor({ timeout: 20000 });
  let s = sub(uid);
  assert(s[0] === 'pro' && s[1] === 'yearly' && s[2] === 'active' && s[3] === 'true' && s[4] === 'Visa •• 4477', 'subscription after pay: ' + s);
  const until = s[5];
  assert(sql(`select count(*) from public.payments where user_id='${uid}' and status='succeeded' and kind='initial' and amount=3490`) === '1', 'payment recorded');
  assert(sql(`select count(*) from private.billing_methods where user_id='${uid}'`) === '1', 'card saved server-side');
  log('paid yearly, Pro until', until);

  // the webhook for the same payment changes nothing (idempotent)
  const pid = sql(`select id from public.payments where user_id='${uid}'`);
  assert((await fetch(`${FN}?hook=yookassa`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'notification', event: 'payment.succeeded', object: { id: pid } }) })).ok, 'webhook ok');
  assert(sub(uid)[5] === until, 'repeat notification does not extend twice');
  // a forged notification for an unknown payment is not trusted
  assert(!(await fetch(`${FN}?hook=yookassa`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event: 'payment.succeeded', object: { id: 'forged' } }) })).ok, 'forged notification rejected');
  log('webhook idempotent, forged rejected');

  // renewal: the period is about to end → the saved card is charged, Pro extends by a year
  sql(`update public.subscriptions set renews_at = now() + interval '2 hours' where user_id='${uid}'`);
  let r = await (await cron()).json();
  assert(r.renewed?.some((x) => x.status === 'succeeded'), 'renewal charged: ' + JSON.stringify(r));
  s = sub(uid);
  assert(new Date(s[5]) > new Date(Date.now() + 300 * 86400e3) && sql(`select count(*) from public.payments where user_id='${uid}' and kind='renew' and status='succeeded'`) === '1', 'renewed: ' + s);
  // the same day again: nothing to charge
  r = await (await cron()).json();
  assert(!r.renewed?.some((x) => x.user === uid), 'no double charge');
  log('auto-renew charged once');

  // a declined renewal: Pro stays until the paid date, the payment is recorded as canceled
  sql(`delete from public.payments where user_id='${uid}' and kind='renew'`);
  sql(`update public.subscriptions set renews_at = now() - interval '1 day' where user_id='${uid}'`);
  await fetch(`${YK}/__decline`, { method: 'POST' });
  r = await (await cron()).json();
  assert(r.renewed?.some((x) => x.user === uid && x.status === 'canceled'), 'declined renewal: ' + JSON.stringify(r));
  s = sub(uid); assert(s[0] === 'pro' && s[3] === 'true' && sql(`select status from public.payments where user_id='${uid}' and kind='renew'`) === 'canceled', 'declined keeps the state: ' + s);
  sql(`update public.subscriptions set renews_at = now() + interval '20 days' where user_id='${uid}'`);
  log('declined renewal handled');

  // Settings: turn auto-renew off
  await page.goto(APP + '/settings');
  await page.getByRole('button', { name: 'План' }).click().catch(() => {});
  await page.getByText(/Карта: Visa/).waitFor();
  await page.getByRole('button', { name: 'Отключить автопродление' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Отключить' }).click();
  await page.getByText('Автопродление выключено').first().waitFor();
  s = sub(uid);
  assert(s[3] === 'false' && sql(`select count(*) from private.billing_methods where user_id='${uid}'`) === '0', 'auto-renew off, card removed: ' + s);
  r = await (await cron()).json();
  assert(!r.renewed?.some((x) => x.user === uid), 'nothing charged after cancel');
  log('auto-renew turned off in Settings');

  // a refund takes Pro back
  const rf = await (await fetch(`${YK}/__refund/${pid}`, { method: 'POST' })).json();
  assert((await fetch(`${FN}?hook=yookassa`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event: 'refund.succeeded', object: { id: rf.id } }) })).ok, 'refund webhook');
  s = sub(uid); assert(s[2] === 'expired', 'refund expires Pro: ' + s);
  log('refund handled');

  assert(errors.length === 0, 'page errors: ' + errors.join(' | '));
  console.log('no page errors');
} finally {
  sql(`update private.flags set beta = ${beta === 't'}`);
  await browser.close();
}
