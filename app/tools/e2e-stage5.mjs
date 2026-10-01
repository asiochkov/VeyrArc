/* Free Core limit (6th Core), recovery banner → manual freeze of a missed yesterday, arc rollover after 90 days → Arc Recap. Needs the local backend (psql). */
import { execSync } from 'node:child_process';
import { APP, guestOnboard, log, open } from './e2e-lib.mjs';
const sql = (q) => execSync(`psql -h 127.0.0.1 -p 54322 -U postgres -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const { browser, page, errors } = await open();
try {
  await guestOnboard(page, { 'Тело': ['Вода 8 стаканов', 'Холодный душ', 'Сон до 23:00', 'Прогулка 30 мин'], 'Разум': ['Медитация'] });
  const uid = sql("select id from auth.users order by created_at desc limit 1");
  log('Core after onboarding:', sql(`select count(*) from habits where user_id='${uid}' and core`));
  await page.goto(APP + '/disciplines');
  await page.locator('#disc-composer').fill('Шестая');
  await page.locator('#disc-composer').press('Enter');
  await page.locator('[data-zone="extra"]').getByText('Шестая').waitFor(); log('6th habit goes to Extra (Extra is unlimited)');
  await page.waitForTimeout(800);
  await page.locator('[data-zone="extra"]').getByRole('button', { name: /Шестая/ }).click();
  await page.getByRole('button', { name: 'В Core' }).click();
  await page.getByText('Core — до 5 привычек').waitFor(); log('6th Core on Free → limit dialog');
  let dbErr = '';
  try { sql(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false); insert into habits (user_id, name, core) values ('${uid}','Седьмая', true)`); } catch (e) { dbErr = String(e.message).match(/limit:core/)?.[0] ?? String(e.message).slice(0, 80); }
  log('database refuses the 6th Core too:', dbErr);
  if (dbErr !== 'limit:core') throw new Error('no database Core limit');

  // history: habits exist since 3 days ago, the day before yesterday done, yesterday missed
  sql(`update habits set created_at = now() - interval '3 days' where user_id='${uid}'`);
  sql(`insert into habit_logs (habit_id, user_id, day) select id, user_id, current_date - 2 from habits where user_id='${uid}'`);
  // the banner shows in the morning only (RC-9): today, 09:00 local time
  const d = new Date(); d.setHours(9, 0, 0, 0);
  await page.clock.setSystemTime(d);
  await page.goto(APP + '/');
  await page.getByRole('button', { name: /Заморозить/ }).click();
  await page.getByText('Заморозка включена').waitFor();
  await page.waitForTimeout(800);
  const frozen = sql(`select string_agg(day::text, ',') from day_entries where user_id='${uid}' and frozen`);
  log('recovery banner → frozen days:', frozen);
  if (!frozen) throw new Error('freeze missing');

  // the arc started 95 days ago: it closes on the next start and Today opens its Recap
  sql(`update arcs set started_on = current_date - 95 where user_id='${uid}'`);
  await page.reload();
  await page.waitForURL(/\/arc\/recap\/.+end=1/, { timeout: 15000 });
  log('Today → Arc Recap:', new URL(page.url()).pathname);
  const arcs = sql(`select string_agg(number || ':' || started_on || '→' || coalesce(ended_on::text,'…'), ' | ' order by number) from arcs where user_id='${uid}'`);
  log('arcs:', arcs, '| summary:', sql(`select summary::text from arcs where user_id='${uid}' and number = 1`));
  await page.getByRole('button', { name: /Начать Arc II/ }).click({ timeout: 10000 });
  await page.waitForURL((u) => new URL(u).pathname === '/');
  await page.waitForTimeout(1500);
  if (!/\/arc\/recap/.test(page.url()) && arcs.includes('2:')) log('back on Today, Recap is not shown again');
  else throw new Error('rollover or recap flow broken');
  console.log(errors.length ? 'page errors: ' + errors.join(' | ') : 'no page errors');
} catch (e) {
  await page.screenshot({ path: '/tmp/claude-0/-home-claude-repo/2a26a2d0-2e4a-50c4-9d86-2549853ae036/scratchpad/e2e-fail.png' });
  console.error('✗', e.message.split('\n')[0], '@', page.url()); process.exitCode = 1;
} finally { await browser.close(); }
