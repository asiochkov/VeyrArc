import { APP, guestOnboard, log, open } from './e2e-lib.mjs';
const { browser, page, errors } = await open();
const S = '/tmp/claude-0/-home-claude-repo/2a26a2d0-2e4a-50c4-9d86-2549853ae036/scratchpad/';
try {
  await guestOnboard(page, { 'Тело': ['Холодный душ'] });
  await page.goto(APP + '/habits');
  await page.getByText('Холодный душ').waitFor(); log('onboarding habit listed in Tracker');
  await page.getByRole('button', { name: 'Добавить' }).first().click().catch(() => {});
  await page.locator('[class*="fab"]').click();
  await page.locator('[class*="composerInput"]').fill('Отжимания');
  await page.locator('[class*="addBtn"]').click();
  await page.getByText('Отжимания').waitFor(); log('habit added');
  await page.waitForTimeout(600);
  const card = page.locator('[class*="hueCard"]').filter({ hasText: 'Отжимания' });
  await card.locator('[class*="wdot"][data-s="today"]').click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Отказы' }).click();
  await page.locator('[class*="fab"]').click();
  await page.locator('[class*="composerInput"]').fill('Кофе');
  await page.locator('[class*="addBtn"]').click();
  await page.getByText('Кофе').waitFor(); log('quit added');
  await page.waitForTimeout(800);
  await page.locator('[class*="hueCard"]').filter({ hasText: 'Кофе' }).getByRole('button', { name: 'Срыв' }).click();
  await page.getByRole('button', { name: 'Отметить' }).last().click();
  await page.waitForTimeout(800);
  await page.reload();
  await page.getByText('Отжимания').waitFor();
  const doneNow = await page.locator('[class*="hueCard"]').filter({ hasText: 'Отжимания' }).locator('[data-s="done"]').count();
  log('after reload: Отжимания today done dots =', doneNow);
  await page.getByRole('button', { name: 'Отказы' }).click();
  const quit = await page.locator('[class*="hueCard"]').filter({ hasText: 'Кофе' }).innerText();
  log('quit card:', quit.replace(/\n/g, ' ').slice(0, 120));
  if (!doneNow || !/срывов 1/.test(quit)) throw new Error('tracker state not persisted');
  await page.screenshot({ path: S + 'tracker-live.png' });
  console.log(errors.length ? 'page errors: ' + errors.join(' | ') : 'no page errors');
} catch (e) {
  await page.screenshot({ path: S + 'e2e-fail.png' });
  console.error('✗', e.message.split('\n')[0], '@', page.url()); process.exitCode = 1;
} finally { await browser.close(); }
