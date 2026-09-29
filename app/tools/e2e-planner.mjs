import { APP, guestOnboard, log, open } from './e2e-lib.mjs';
const S = '/tmp/claude-0/-home-claude-repo/2a26a2d0-2e4a-50c4-9d86-2549853ae036/scratchpad/';
const { browser, page, errors } = await open({ width: 1280, height: 832 });
try {
  await guestOnboard(page, { 'Тело': ['Холодный душ'] });
  // Calendar: create a task by clicking the grid, then reload
  await page.goto(APP + '/calendar');
  const col = page.locator('[class*="col"][data-today="true"]').first();
  await col.waitFor();
  const box = await col.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + 64 * 3 + 10);
  await page.getByPlaceholder(/Название/).fill('Созвон e2e');
  await page.getByRole('button', { name: 'Создать задачу' }).click();
  await page.waitForTimeout(700);
  await page.reload();
  await page.getByText('Созвон e2e').first().waitFor(); log('calendar task persisted');
  await page.getByText('Созвон e2e').first().click();
  await page.locator('textarea').fill('Заметка e2e');
  await page.waitForTimeout(1200);
  await page.reload();
  await page.getByText('Созвон e2e').first().click();
  const note = await page.locator('textarea').inputValue();
  log('note after reload =', note);
  await page.goto(APP + '/');
  await page.getByText('Созвон e2e').first().waitFor(); log('task shows in Today planner');
  // Goals: create a goal, tick the task, write diary, reload
  await page.goto(APP + '/goals');
  await page.getByRole('button', { name: /Новая цель|Создать цель|Добавить цель|\+/ }).first().click().catch(() => {});
  await page.getByPlaceholder('Название цели').fill('Марафон');
  await page.getByRole('button', { name: 'Создать', exact: true }).first().click();
  await page.getByText('Марафон').first().waitFor(); log('goal created');
  await page.waitForTimeout(700);
  await page.getByText('Добавьте задание на сегодня').first().click();
  await page.locator('textarea').first().fill('Пробежал 5 км');
  await page.waitForTimeout(1200);
  await page.reload();
  await page.getByText('Марафон').first().waitFor();
  const diary = await page.locator('textarea').first().inputValue();
  log('goal diary after reload =', diary);
  if (note !== 'Заметка e2e' || diary !== 'Пробежал 5 км') throw new Error('planner/goals not persisted');
  await page.screenshot({ path: S + 'goals-live.png' });
  console.log(errors.length ? 'page errors: ' + errors.join(' | ') : 'no page errors');
} catch (e) {
  await page.screenshot({ path: S + 'e2e-fail.png' });
  console.error('✗', e.message.split('\n')[0], '@', page.url()); process.exitCode = 1;
} finally { await browser.close(); }
