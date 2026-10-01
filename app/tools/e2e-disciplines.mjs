import { APP, guestOnboard, log, open } from './e2e-lib.mjs';
/* Disciplines (Master Changeset task 15): Core/Extra, composer, move to Extra, quits + relapse, persisted after reload. */
const { browser, page, errors } = await open();
const S = '/tmp/claude-0/-home-claude-repo/2a26a2d0-2e4a-50c4-9d86-2549853ae036/scratchpad/';
try {
  await guestOnboard(page, { 'Тело': ['Холодный душ'] });
  await page.goto(APP + '/disciplines');
  await page.locator('[data-zone="core"]').getByText('Холодный душ').waitFor(); log('onboarding pick is Core');
  await page.locator('#disc-composer').fill('Отжимания');
  await page.locator('#disc-composer').press('Enter');
  await page.locator('[data-zone="core"]').getByText('Отжимания').waitFor(); log('habit added as Core (fewer than 3 Core)');
  // open it and move to Extra
  await page.locator('[data-zone="core"]').getByRole('button', { name: /Отжимания/ }).click();
  await page.getByRole('button', { name: /в Extra/i }).first().click();
  await page.locator('[data-zone="extra"]').getByText('Отжимания').waitFor(); log('moved to Extra');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  // quits
  await page.getByRole('tab', { name: /Отказы/ }).click();
  await page.getByRole('button', { name: /Добавить отказ/ }).click();
  await page.getByPlaceholder(/От чего отказываешься/).fill('Кофе');
  await page.locator('[class*="quitForm"]').getByRole('button', { name: 'Добавить', exact: true }).click();
  await page.getByText('Кофе').first().waitFor(); log('quit added');
  await page.waitForTimeout(800);
  await page.locator('.tl-light').filter({ hasText: 'Кофе' }).getByRole('button', { name: 'Отметить срыв' }).click();
  await page.getByRole('button', { name: 'Я оступился' }).last().click();
  await page.waitForTimeout(1200);
  await page.goto(APP + '/disciplines');
  await page.locator('[data-zone="extra"]').getByText('Отжимания').waitFor(); log('after reload: Отжимания still Extra');
  await page.getByRole('tab', { name: /Отказы/ }).click();
  const quit = await page.locator('.tl-light').filter({ hasText: 'Кофе' }).innerText();
  log('quit card:', quit.replace(/\n/g, ' ').slice(0, 120));
  if (!/срыв/.test(quit)) throw new Error('relapse not persisted');
  console.log(errors.length ? 'page errors: ' + errors.join(' | ') : 'no page errors');
} catch (e) {
  await page.screenshot({ path: S + 'e2e-fail.png' });
  console.error('✗', e.message.split('\n')[0], '@', page.url()); process.exitCode = 1;
} finally { await browser.close(); }
