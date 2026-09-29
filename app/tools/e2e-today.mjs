import { APP, guestOnboard, log, open } from './e2e-lib.mjs';
const { browser, page, errors } = await open();
try {
  await guestOnboard(page, { 'Тело': ['Вода 8 стаканов'], 'Разум': ['Чтение 20 мин'], 'Дисциплина': ['Ранний подъём'] });
  await page.goto(APP + '/');
  const rows = page.locator('[class*="habitRow"]');
  await rows.first().waitFor();
  log('Today rows:', await rows.count(), '→', (await rows.allInnerTexts()).map((x) => x.split('\n')[0]).join(', '));
  await page.getByRole('checkbox', { name: 'Ранний подъём' }).click();
  const water = rows.filter({ hasText: 'Вода 8 стаканов' });
  await water.getByRole('button', { name: '+' }).click();
  await water.getByRole('button', { name: '+' }).click();
  await page.locator('[class*="moodBtn"]').nth(4).click();
  await page.waitForTimeout(800);
  const streakBefore = await page.locator('[class*="bigMono"]').first().innerText();
  await page.reload();
  await rows.first().waitFor();
  const checked = await page.getByRole('checkbox', { name: 'Ранний подъём' }).getAttribute('aria-checked');
  const waterText = await rows.filter({ hasText: 'Вода 8 стаканов' }).innerText();
  const mood = await page.locator('[class*="moodBtn"]').nth(4).getAttribute('aria-pressed');
  log('after reload: rise checked =', checked, '| water row =', waterText.replace(/\n/g, ' '), '| mood 5 selected =', mood, '| streak =', streakBefore);
  if (checked !== 'true' || !/2\s*\/\s*8/.test(waterText) || mood !== 'true') throw new Error('state not persisted');
  await page.getByRole('button', { name: /^play|^$/ }).count();
  await page.screenshot({ path: '/tmp/claude-0/-home-claude-repo/2a26a2d0-2e4a-50c4-9d86-2549853ae036/scratchpad/today-live.png', fullPage: false });
  console.log(errors.length ? 'page errors: ' + errors.join(' | ') : 'no page errors');
} catch (e) {
  await page.screenshot({ path: '/tmp/claude-0/-home-claude-repo/2a26a2d0-2e4a-50c4-9d86-2549853ae036/scratchpad/e2e-fail.png' });
  console.error('✗', e.message.split('\n')[0], '@', page.url()); process.exitCode = 1;
} finally { await browser.close(); }
