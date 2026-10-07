/* «Режим восстановления»: a low mood with open planner tasks → the card offers to move them to
   tomorrow; nothing moves until «Применить»; «Вернуть» brings them back; «Не сейчас» hides it for the day. */
import { APP, guestOnboard, log, open } from './e2e-lib.mjs';
const S = '/tmp/claude-0/-home-claude-repo/2a26a2d0-2e4a-50c4-9d86-2549853ae036/scratchpad/';
const { browser, page, errors } = await open({ width: 390, height: 844 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const card = () => page.getByRole('status', { name: 'Режим восстановления' });
const addTask = async (title) => {
  await page.getByRole('button', { name: 'Добавить событие' }).first().tap();
  await page.getByPlaceholder(/Название/).fill(title);
  await page.getByRole('button', { name: /Создать/ }).last().tap();
  await page.waitForTimeout(600);
};
try {
  await guestOnboard(page, { 'Тело': ['Холодный душ'] });
  await page.goto(APP + '/'); await page.waitForTimeout(1500);
  await addTask('Отчёт e2e'); await addTask('Звонок e2e');
  log('no card before mood:', (await card().count()) === 0);
  await page.getByRole('button', { name: 'плохо' }).tap(); await page.waitForTimeout(500);
  await card().waitFor({ timeout: 4000 });
  log('card:', (await card().innerText()).replace(/\n+/g, ' · '));
  await card().scrollIntoViewIfNeeded(); await page.waitForTimeout(400); await page.screenshot({ path: S + 'lighten.png' });
  const box = await card().boundingBox(); log('card on screen after mood tap:', box.y > 0 && box.y < 844);
  const clip = await card().evaluate((el) => el.scrollHeight - el.clientHeight); log('card content fits (overflow px):', clip);
  if (clip > 2) throw new Error('card content clipped');
  await page.goto(APP + '/planner'); await page.waitForTimeout(1200);
  log('nothing moved before «Применить»:', await page.getByText('Отчёт e2e').count() > 0);
  await page.goto(APP + '/'); await card().waitFor();
  await card().getByRole('button', { name: 'Применить' }).tap();
  await page.getByText(/перенесен/).first().waitFor({ timeout: 4000 }); log('toast:', await page.getByText(/перенесен/).first().innerText());
  log('card hidden after apply:', (await card().count()) === 0);
  await page.waitForTimeout(1500); await page.reload(); await page.waitForTimeout(1500);
  await page.goto(APP + '/planner'); await page.waitForTimeout(1200);
  const todayCnt = await page.getByText('Отчёт e2e').count();
  log('task gone from today in planner:', todayCnt === 0);
  if (todayCnt !== 0) throw new Error('tasks not moved');
  await page.goto(APP + '/'); await page.waitForTimeout(1200);
  log('card stays hidden today after reload:', (await card().count()) === 0);
  console.log(errors.length ? 'page errors: ' + errors.join(' | ') : 'no page errors');
} catch (e) {
  await page.screenshot({ path: S + 'e2e-fail.png' });
  console.error('✗', e.message.split('\n')[0], '@', page.url()); process.exitCode = 1;
} finally { await browser.close(); }
