/* Audit fixes: slip with note + 5-min undo; 7-day Pro trial lifts the habit limit. Needs the local backend. */
import { execSync } from 'node:child_process';
import { APP, guestOnboard, log, open } from './e2e-lib.mjs';
const sql = (q) => execSync(`psql -h 127.0.0.1 -p 54322 -U postgres -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const { browser, page, errors } = await open();
try {
  await guestOnboard(page, { 'Тело': ['Холодный душ'], 'Отказ от вредного': ['Без сахара'] });
  const uid = sql('select id from auth.users order by created_at desc limit 1');
  sql(`update quits set clean_since = now() - interval '12 days', best_days = 20 where user_id='${uid}'`);
  await page.goto(APP + '/habits');
  await page.getByRole('button', { name: 'Отказы' }).click();
  await page.getByRole('button', { name: 'Отметить срыв' }).click();
  const body = await page.locator('[role="dialog"]').innerText();
  log('dialog:', body.replace(/\n+/g, ' | ').slice(0, 160));
  await page.getByPlaceholder('Что произошло? (необязательно)').fill('стресс на работе');
  await page.getByRole('button', { name: 'Я оступился' }).click();
  await page.getByText('Срыв отмечен').waitFor();
  await page.waitForTimeout(800);
  log('after slip:', sql(`select extract(day from now()-clean_since)::int || ' days, best ' || best_days from quits where user_id='${uid}'`), '| note:', sql(`select note from quit_relapses where user_id='${uid}'`));
  await page.getByRole('button', { name: 'Отменить' }).click();
  await page.waitForTimeout(1200);
  log('after undo:', sql(`select extract(day from now()-clean_since)::int || ' days, best ' || best_days from quits where user_id='${uid}'`), '| relapses:', sql(`select count(*) from quit_relapses where user_id='${uid}'`));

  // undo a habit deletion
  await page.getByRole('button', { name: 'Привычки' }).click();
  await page.locator('[class*="hueCard"]').filter({ hasText: 'Холодный душ' }).getByRole('button', { name: 'Удалить' }).click();
  await page.getByText('Привычка удалена').waitFor();
  await page.getByRole('button', { name: 'Отменить' }).click();
  await page.waitForTimeout(1000);
  log('habit after undo delete:', sql(`select name || ' archived=' || (archived_at is not null) from habits where user_id='${uid}'`), '| on screen:', await page.getByText('Холодный душ').count());
  // explainers
  await page.goto(APP + '/');
  await page.getByRole('button', { name: /заморозка/ }).click();
  log('freeze explainer:', (await page.locator('[role="dialog"]').innerText()).split('\n')[0]);
  await page.getByRole('button', { name: 'Понятно' }).click();
  await page.goto(APP + '/profile');
  await page.getByRole('button', { name: /ИНДЕКС ДИСЦИПЛИНЫ/i }).first().click();
  log('index explainer:', (await page.locator('[role="dialog"]').innerText()).split('\n')[0]);
  await page.getByRole('button', { name: 'Понятно' }).click();
  await page.goto(APP + '/pro');
  await page.getByRole('button', { name: /Попробовать 7 дней бесплатно/ }).click();
  await page.waitForURL(APP + '/');
  log('trial:', sql(`select plan || ' until ' || renews_at::date from subscriptions where user_id='${uid}'`));
  await page.goto(APP + '/pro');
  log('pro screen now:', (await page.locator('button').filter({ hasText: /Pro активен/ }).count()) ? 'Pro активен' : '??');
  console.log(errors.length ? 'page errors: ' + errors.join(' | ') : 'no page errors');
} catch (e) {
  await page.screenshot({ path: '/tmp/claude-0/-home-claude-repo/2a26a2d0-2e4a-50c4-9d86-2549853ae036/scratchpad/e2e-fail.png' });
  console.error('✗', e.message.split('\n')[0], '@', page.url()); process.exitCode = 1;
} finally { await browser.close(); }
