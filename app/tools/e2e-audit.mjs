/* Audit fixes: slip with note + 5-min undo; beta has no subscription screens. Needs the local backend. */
import { execSync } from 'node:child_process';
import { APP, guestOnboard, log, open } from './e2e-lib.mjs';
const sql = (q) => execSync(`psql -h 127.0.0.1 -p 54322 -U postgres -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const { browser, page, errors } = await open();
try {
  await guestOnboard(page, { 'Тело': ['Холодный душ'], 'Отказ от вредного': ['Без сахара'] });
  const uid = sql('select id from auth.users order by created_at desc limit 1');
  sql(`update quits set clean_since = now() - interval '12 days', best_days = 20 where user_id='${uid}'`);
  await page.goto(APP + '/disciplines');
  await page.getByRole('tab', { name: /Отказы/ }).click();
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

  // undo archiving a habit
  await page.getByRole('tab', { name: /Активные/ }).click();
  await page.getByRole('button', { name: /Холодный душ/ }).first().click();
  await page.getByRole('button', { name: 'В архив' }).click();
  await page.getByText('«Холодный душ» в архиве').waitFor();
  await page.getByRole('button', { name: 'Отменить' }).click();
  await page.waitForTimeout(1000);
  log('habit after undo delete:', sql(`select name || ' archived=' || (archived_at is not null) from habits where user_id='${uid}'`), '| on screen:', await page.getByText('Холодный душ').count());
  // explainers
  await page.goto(APP + '/');
  await page.getByRole('button', { name: 'Заморозка серии' }).click();
  log('freeze explainer:', (await page.locator('[role="dialog"]').innerText()).split('\n')[0]);
  await page.getByRole('dialog').getByRole('button', { name: 'Ок' }).click();
  await page.goto(APP + '/analytics');
  await page.getByRole('button', { name: /Индекс дисциплины/i }).first().click();
  log('index explainer:', (await page.locator('[role="dialog"]').innerText()).split('\n')[0]);
  await page.getByRole('dialog').getByRole('button', { name: 'Ок' }).click();
  // beta: no subscription anywhere — /pro leads home
  await page.goto(APP + '/pro'); await page.waitForURL(APP + '/');
  log('beta: /pro redirects home');
  console.log(errors.length ? 'page errors: ' + errors.join(' | ') : 'no page errors');
} catch (e) {
  await page.screenshot({ path: '/tmp/claude-0/-home-claude-repo/2a26a2d0-2e4a-50c4-9d86-2549853ae036/scratchpad/e2e-fail.png' });
  console.error('✗', e.message.split('\n')[0], '@', page.url()); process.exitCode = 1;
} finally { await browser.close(); }
