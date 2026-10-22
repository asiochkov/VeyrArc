/*
 * Invite a friend: A gets a link; B opens it, starts, makes the first check-in → both get one bonus freeze.
 * Guards: nobody can reward themselves, an old account cannot claim, a repeat changes nothing,
 * the client cannot write the bonus.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { APP, guestOnboard, log, open } from './e2e-lib.mjs';
const GW = 'http://127.0.0.1:54321';
const keys = Object.fromEntries(readFileSync('/home/claude/localsb/keys.env', 'utf8').trim().split('\n').map((l) => l.split('=')));
const sql = (q) => execSync(`psql -qAt -h 127.0.0.1 -p 54322 -U postgres -c ${JSON.stringify(q)}`, { encoding: 'utf8' }).trim();
const assert = (c, m) => { if (!c) throw new Error('✗ ' + m); };
const a = await open(); const b = await open();
try {
  // A: starts, opens Settings and reads the invite link
  await guestOnboard(a.page, { 'Тело': ['Вода 8 стаканов'] });
  const uidA = sql("select id from auth.users order by created_at desc limit 1");
  await a.page.goto(APP + '/settings');
  const linkBtn = a.page.getByRole('button', { name: 'Скопировать ссылку' });
  await linkBtn.waitFor();
  const link = (await linkBtn.innerText()).trim();
  const code = link.split('ref=')[1];
  assert(/^[a-z0-9]{8}$/.test(code), 'invite code looks right: ' + link);
  assert(sql(`select code from referral_codes where user_id='${uidA}'`) === code, 'code stored for A');
  log('A has an invite link', link);

  // B: opens the link, starts, the code is handed to the server, the address bar is clean
  await b.page.goto(APP + `/?ref=${code}`);
  await b.page.waitForTimeout(800);
  assert(!b.page.url().includes('ref='), 'ref removed from the address bar');
  await guestOnboard(b.page, { 'Тело': ['Вода 8 стаканов'], 'Дисциплина': ['Ранний подъём'] });
  const uidB = sql("select id from auth.users order by created_at desc limit 1");
  assert(uidB !== uidA, 'B is another account');
  await b.page.waitForTimeout(1500);
  assert(sql(`select referrer from referrals where referred='${uidB}'`) === uidA, 'B is recorded as invited by A');
  assert(sql(`select rewarded_at is null from referrals where referred='${uidB}'`) === 't', 'no reward before the first check-in');
  log('B recorded as invited, reward pending');

  // B's first check-in
  const rise = b.page.getByRole('checkbox', { name: 'Ранний подъём' });
  await rise.waitFor(); await rise.click();
  await b.page.waitForTimeout(2500);
  assert(sql(`select rewarded_at is not null from referrals where referred='${uidB}'`) === 't', 'reward granted on the first check-in');
  assert(sql(`select freezes from referral_bonus where user_id='${uidA}'`) === '1' && sql(`select freezes from referral_bonus where user_id='${uidB}'`) === '1', 'both have one bonus freeze');
  log('both got a bonus freeze');

  // more check-ins change nothing
  await rise.click(); await b.page.waitForTimeout(800); await rise.click(); await b.page.waitForTimeout(1500);
  assert(sql(`select freezes from referral_bonus where user_id='${uidA}'`) === '1', 'no second reward for the same friend');

  // A sees it in Settings
  await a.page.reload();
  await a.page.getByText(/заморозок в запасе: 1/).waitFor({ timeout: 15000 });
  await a.page.getByText(/Приглашено: 1 · засчитано: 1/).waitFor();
  log('A sees: invited 1, counted 1, one freeze in stock');

  // guards (as B, through the API)
  const tokB = await b.page.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.includes('auth-token')); return JSON.parse(localStorage.getItem(k)).access_token; });
  const call = (fn, body, tok) => fetch(`${GW}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { 'content-type': 'application/json', apikey: keys.ANON_KEY, authorization: `Bearer ${tok}` }, body: JSON.stringify(body) });
  assert((await (await call('claim_referral', { p_code: code }, tokB)).json()) === false, 'claiming twice is refused');
  const own = await (await call('my_referral', {}, tokB)).json();
  assert((await (await call('claim_referral', { p_code: own.code }, tokB)).json()) === false, 'cannot invite oneself');
  const w = await fetch(`${GW}/rest/v1/referral_bonus?user_id=eq.${uidB}`, { method: 'PATCH', headers: { 'content-type': 'application/json', apikey: keys.ANON_KEY, authorization: `Bearer ${tokB}` }, body: JSON.stringify({ freezes: 5 }) });
  assert(sql(`select freezes from referral_bonus where user_id='${uidB}'`) === '1', 'the client cannot write its own bonus (' + w.status + ')');
  sql(`update auth.users set created_at = now() - interval '30 days' where id='${uidA}'`);
  const old = await (await call('claim_referral', { p_code: own.code }, await a.page.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.includes('auth-token')); return JSON.parse(localStorage.getItem(k)).access_token; }))).json();
  assert(old === false, 'an old account cannot claim');
  log('guards hold');

  // a bonus freeze is spent when the week's own freeze is used up
  sql(`insert into day_entries (user_id, day, frozen) values ('${uidB}', current_date - 1, true) on conflict (user_id, day) do update set frozen = true`);
  const beta = sql('select beta from private.flags'); sql('update private.flags set beta = false');
  const frz = await (await call('use_freeze', { p_day: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10) }, tokB)).json();
  const left = sql(`select freezes from referral_bonus where user_id='${uidB}'`);
  sql(`update private.flags set beta = ${beta === 't'}`);
  assert(frz === true && left === '0', 'the bonus freeze is spent after the weekly one: ' + frz + ' / ' + left);
  log('bonus freeze spent after the weekly allowance');

  assert(a.errors.length + b.errors.length === 0, 'page errors: ' + [...a.errors, ...b.errors].join(' | '));
  console.log('no page errors');
} finally { await a.browser.close(); await b.browser.close(); }
