/* Free limit (6th habit), automatic freeze of a missed yesterday, arc rollover after 90 days. Needs the local backend (psql). */
import { execSync } from 'node:child_process';
import { APP, guestOnboard, log, open } from './e2e-lib.mjs';
const sql = (q) => execSync(`psql -h 127.0.0.1 -p 54322 -U postgres -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const { browser, page, errors } = await open();
try {
  await guestOnboard(page, { 'Тело': ['Вода 8 стаканов', 'Холодный душ', 'Сон до 23:00', 'Прогулка 30 мин'], 'Разум': ['Медитация'] });
  const uid = sql("select id from auth.users order by created_at desc limit 1");
  await page.goto(APP + '/habits');
  await page.getByText('Медитация').waitFor();
  await page.locator('[class*="fab"]').click();
  await page.getByText('Достигнут лимит привычек').waitFor(); log('6th habit on Free → limit dialog');
  let dbErr = '';
  try { sql(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false); insert into habits (user_id, name) values ('${uid}','Шестая')`); } catch (e) { dbErr = String(e.message).match(/limit:habits/)?.[0] ?? String(e.message).slice(0, 80); }
  log('database refuses the 6th habit too:', dbErr);

  // history: habits exist since 3 days ago, the day before yesterday done, yesterday missed
  sql(`update habits set created_at = now() - interval '3 days' where user_id='${uid}'`);
  sql(`insert into habit_logs (habit_id, user_id, day) select id, user_id, current_date - 2 from habits where user_id='${uid}'`);
  // the arc started 95 days ago
  sql(`update arcs set started_on = current_date - 95 where user_id='${uid}'`);
  await page.goto(APP + '/');
  await page.waitForTimeout(3000);
  const frozen = sql(`select string_agg(day::text, ',') from day_entries where user_id='${uid}' and frozen`);
  const arcs = sql(`select string_agg(number || ':' || started_on || '→' || coalesce(ended_on::text,'…') || ' ' || coalesce(summary::text,''), ' | ' order by number) from arcs where user_id='${uid}'`);
  log('frozen days:', frozen);
  log('arcs:', arcs);
  const week = await page.locator('[class*="circle"][data-state="freeze"]').count();
  log('freeze circles on Today:', week, '| header:', (await page.locator('[class*="dayTitle"]').innerText()));
  if (!frozen || !arcs.includes('2:')) throw new Error('freeze or rollover missing');
  console.log(errors.length ? 'page errors: ' + errors.join(' | ') : 'no page errors');
} catch (e) {
  await page.screenshot({ path: '/tmp/claude-0/-home-claude-repo/2a26a2d0-2e4a-50c4-9d86-2549853ae036/scratchpad/e2e-fail.png' });
  console.error('✗', e.message.split('\n')[0], '@', page.url()); process.exitCode = 1;
} finally { await browser.close(); }
