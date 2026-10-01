import { APP, guestOnboard, log, open } from './e2e-lib.mjs';
/* Today tiles: a binary habit tile toggles, a counter tile counts, mood picks; state survives leaving and reloading. */
const { browser, page, errors } = await open();
try {
  await guestOnboard(page, { 'Тело': ['Вода 8 стаканов'], 'Разум': ['Чтение 20 мин'], 'Дисциплина': ['Ранний подъём'] });
  await page.goto(APP + '/');
  const rise = page.getByRole('checkbox', { name: 'Ранний подъём' });
  await rise.waitFor();
  const water = page.locator('[class*="_tile_"]').filter({ hasText: 'Вода 8 стаканов', has: page.getByRole('button', { name: '+' }) }).first();
  log('Today tiles:', await page.locator('[class*="_tile_"]').count());
  await rise.click();
  await water.getByRole('button', { name: '+' }).click();
  await water.getByRole('button', { name: '+' }).click();
  await page.getByRole('button', { name: 'отлично' }).click();
  await page.waitForTimeout(800);
  // leave and come back without a reload: the cached day must show what was just saved
  await page.locator('a[href="/disciplines"]').first().click();
  await page.waitForURL('**/disciplines');
  await page.locator('a[href="/"]').first().click();
  await rise.waitFor();
  await page.waitForTimeout(600);
  const moodBack = await page.getByRole('button', { name: 'отлично' }).getAttribute('aria-pressed');
  const riseBack = await rise.getAttribute('aria-checked');
  log('after leaving and coming back: mood 5 =', moodBack, '| rise =', riseBack);
  if (moodBack !== 'true' || riseBack !== 'true') throw new Error('state lost when coming back to Today');
  await page.reload();
  await rise.waitFor();
  await page.waitForTimeout(800);
  const checked = await rise.getAttribute('aria-checked');
  const waterText = await water.innerText();
  const mood = await page.getByRole('button', { name: 'отлично' }).getAttribute('aria-pressed');
  log('after reload: rise checked =', checked, '| water =', waterText.replace(/\n/g, ' '), '| mood 5 selected =', mood);
  if (checked !== 'true' || !/2\s*\/\s*8/.test(waterText) || mood !== 'true') throw new Error('state not persisted');
  await page.screenshot({ path: '/tmp/claude-0/-home-claude-repo/2a26a2d0-2e4a-50c4-9d86-2549853ae036/scratchpad/today-live.png', fullPage: false });
  console.log(errors.length ? 'page errors: ' + errors.join(' | ') : 'no page errors');
} catch (e) {
  await page.screenshot({ path: '/tmp/claude-0/-home-claude-repo/2a26a2d0-2e4a-50c4-9d86-2549853ae036/scratchpad/e2e-fail.png' });
  console.error('✗', e.message.split('\n')[0], '@', page.url()); process.exitCode = 1;
} finally { await browser.close(); }
