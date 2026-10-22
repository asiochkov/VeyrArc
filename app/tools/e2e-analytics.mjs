/* Product events land in app_events: onboarding steps, onboarding_done, app_open, first_check; the client cannot read them back. */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { APP, guestOnboard, log, open } from './e2e-lib.mjs';
const GW = 'http://127.0.0.1:54321';
const keys = Object.fromEntries(readFileSync('/home/claude/localsb/keys.env', 'utf8').trim().split('\n').map((l) => l.split('=')));
const sql = (q) => execSync(`psql -qAt -h 127.0.0.1 -p 54322 -U postgres -c ${JSON.stringify(q)}`, { encoding: 'utf8' }).trim();
const assert = (c, m) => { if (!c) throw new Error('✗ ' + m); };
const { browser, page, errors } = await open();
try {
  await page.goto(APP + '/welcome?from=push&k=reminder');
  await guestOnboard(page, { 'Тело': ['Вода 8 стаканов'], 'Дисциплина': ['Ранний подъём'] });
  const uid = sql("select id from auth.users order by created_at desc limit 1");
  const rise = page.getByRole('checkbox', { name: 'Ранний подъём' }); await rise.waitFor(); await rise.click();
  await page.waitForTimeout(2500);
  const names = sql(`select string_agg(distinct name, ',' order by name) from app_events where user_id='${uid}'`);
  log('events:', names);
  for (const n of ['app_open', 'onboarding_step', 'onboarding_done', 'first_check']) assert(names.split(',').includes(n), 'event ' + n);
  assert(Number(sql(`select count(*) from app_events where user_id='${uid}' and name='onboarding_step'`)) >= 2, 'onboarding steps recorded');
  assert(!page.url().includes('from=push'), 'push marker removed from the address');
  // clients can add their own events but cannot read or forge another person's
  const tok = await page.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.includes('auth-token')); return JSON.parse(localStorage.getItem(k)).access_token; });
  const h = { 'content-type': 'application/json', apikey: keys.ANON_KEY, authorization: `Bearer ${tok}` };
  const read = await fetch(`${GW}/rest/v1/app_events?select=*`, { headers: h });
  assert(read.status >= 400 || (await read.json()).length === 0, 'the client cannot read events');
  const forge = await fetch(`${GW}/rest/v1/app_events`, { method: 'POST', headers: h, body: JSON.stringify({ user_id: '00000000-0000-0000-0000-000000000000', name: 'x' }) });
  assert(forge.status >= 400, 'cannot write an event for someone else');
  log('events are write-only for the client');
  assert(errors.length === 0, 'page errors: ' + errors.join(' | '));
  console.log('no page errors');
} finally { await browser.close(); }
