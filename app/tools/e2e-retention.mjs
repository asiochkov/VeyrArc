/* 1.2 retention: index tile, all-Core wave + toast, comeback after a pause, weekly review, assistant hints. */
import { execSync } from 'node:child_process';
import { APP, guestOnboard, log, open } from './e2e-lib.mjs';
const S = '/tmp/claude-0/-home-claude-repo/2a26a2d0-2e4a-50c4-9d86-2549853ae036/scratchpad/';
const { browser, page, errors } = await open({ width: 390, height: 844 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
await page.addInitScript(() => { Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true }); Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true }); });
const expect = (c, m) => { if (!c) throw new Error(m); };
try {
  await guestOnboard(page, { 'Тело': ['Холодный душ'] });
  await page.goto(APP + '/'); await page.waitForTimeout(1500);
  log('greeting:', (await page.locator('h1').first().innerText()).replace(/\n/g, ' '));
  const idx = await page.locator('[data-tour="today-score"]').innerText();
  log('index tile:', idx.replace(/\n+/g, ' · ')); expect(/Индекс/.test(idx), 'index tile missing');
  await page.getByRole('checkbox', { name: 'Холодный душ' }).tap();
  await page.waitForTimeout(400);
  log('wave on grid:', await page.locator('[data-wave="true"]').count() > 0);
  await page.getByText(/Все Core на сегодня/).waitFor({ timeout: 4000 }); log('day kept toast shown');
  log('week dots on tile:', await page.locator('[class*="weekDots"]').count());
  // assistant hints on open
  await page.getByRole('button', { name: 'Ассистент VeyrArc' }).first().tap(); await page.waitForTimeout(700);
  const chips = await page.getByRole('dialog').locator('button[class*="chip"]').allInnerTexts();
  log('hints on open:', chips.join(' | ')); expect(chips.length > 0, 'no hints on open');
  // weekly review by voice
  const b = page.getByRole('dialog').getByPlaceholder('Скажите или напишите…'); await b.fill('подведи итоги недели'); await b.press('Enter');
  await page.waitForTimeout(2200);
  const wk = await page.getByRole('dialog').first().innerText();
  log('weekly review:', wk.replace(/\n+/g, ' · ').slice(0, 200)); expect(/дней в ритме/.test(wk), 'weekly review not opened');
  await page.getByRole('button', { name: 'Ложиться до 23:00' }).tap();
  await page.getByRole('button', { name: 'Сохранить фокус недели' }).tap(); await page.waitForTimeout(600);
  // comeback: last seen 8 days ago
  const uid = await page.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.includes('auth-token')); return k ? JSON.parse(localStorage.getItem(k)).user.id : ''; });
  execSync(`psql postgresql://postgres:postgres@localhost:54322/postgres -c "update arcs set started_on = current_date - 20 where user_id = '${uid}'; update habits set created_at = now() - interval '20 days' where user_id = '${uid}'"`);
  await page.evaluate(() => { const d = new Date(Date.now() - 8 * 86400000); localStorage.setItem('veyrarc.lastSeen', d.toISOString().slice(0, 10)); });
  await page.reload(); await page.waitForTimeout(2000);
  const cb = page.getByRole('dialog');
  const txt = (await cb.count()) ? await cb.first().innerText() : '';
  log('comeback:', txt.replace(/\n+/g, ' · ').slice(0, 220)); expect(/С возвращением/.test(txt), 'comeback not shown');
  await page.getByRole('button', { name: /Продолжить Arc/ }).tap(); await page.waitForTimeout(500);
  await page.reload(); await page.waitForTimeout(1800);
  log('comeback once per return:', (await page.getByText('С возвращением').count()) === 0);
  log('week focus line:', await page.getByText(/Фокус недели/).first().innerText().catch(() => '—'));
  await page.screenshot({ path: S + 'comeback.png' });
  // a 3-day streak: two earlier days marked in the DB, today's tap opens the milestone moment
  await page.getByRole('checkbox', { name: 'Холодный душ' }).tap(); await page.waitForTimeout(800); // unmark today
  execSync(`psql postgresql://postgres:postgres@localhost:54322/postgres -c "insert into habit_logs (user_id, habit_id, day, value, done) select user_id, id, current_date - g, 1, true from habits, generate_series(1,2) g where user_id = '${uid}' on conflict do nothing"`);
  await page.reload(); await page.waitForTimeout(1800);
  await page.getByRole('checkbox', { name: 'Холодный душ' }).tap();
  await page.waitForTimeout(2000); log('after tap:', (await page.locator('body').innerText()).match(/Все Core[^\n]*|Три дня[^\n]*|серия \d+/g));
  await page.getByText('Три дня подряд').waitFor({ timeout: 5000 });
  await page.waitForTimeout(1600); await page.screenshot({ path: S + 'milestone.png' });
  log('milestone:', (await page.getByRole('dialog').last().innerText()).replace(/\n+/g, ' · '));
  await page.getByRole('button', { name: 'Продолжить' }).last().tap(); await page.waitForTimeout(400);
  log('milestone closed:', (await page.getByText('Три дня подряд').count()) === 0);
  console.log(errors.length ? 'page errors: ' + errors.join(' | ') : 'no page errors');
} catch (e) {
  await page.screenshot({ path: S + 'e2e-fail.png' });
  console.error('✗', e.message.split('\n')[0], '@', page.url()); process.exitCode = 1;
} finally { await browser.close(); }
