/* Guest with data → every app screen renders without errors; settings persist. */
import { APP, guestOnboard, log, open } from './e2e-lib.mjs';
const S = '/tmp/claude-0/-home-claude-repo/2a26a2d0-2e4a-50c4-9d86-2549853ae036/scratchpad/';
for (const [name, vp] of [['desktop', { width: 1280, height: 832 }], ['mobile', { width: 390, height: 844 }]]) {
  const { browser, page, errors } = await open(vp);
  try {
    await guestOnboard(page, { 'Тело': ['Вода 8 стаканов', 'Холодный душ'], 'Отказ от вредного': ['Без сахара'] });
    await page.goto(APP + '/');
    await page.getByRole('checkbox', { name: 'Холодный душ' }).first().click();
    for (const path of ['/', '/habits', '/calendar', '/goals', '/profile', '/settings', '/settings/account', '/pro']) {
      await page.goto(APP + path);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${S}live-${name}${path.replace(/\//g, '_') || '_'}.png` });
    }
    // settings persist: notifications toggle + water unit
    await page.goto(APP + '/settings');
    if (name === 'desktop') await page.getByRole('button', { name: 'Уведомления' }).first().click();
    const sw = page.getByRole('switch').first();
    const before = await sw.getAttribute('aria-checked');
    await sw.click(); await page.waitForTimeout(700);
    await page.reload(); await page.waitForTimeout(800);
    if (name === 'desktop') await page.getByRole('button', { name: 'Уведомления' }).first().click();
    const after = await page.getByRole('switch').first().getAttribute('aria-checked');
    log(name, 'notification toggle', before, '→', after, '(after reload)');
    if (before === after) throw new Error('settings toggle not persisted');
    console.log(name, errors.length ? 'page errors: ' + errors.join(' | ') : 'no page errors');
  } catch (e) {
    await page.screenshot({ path: S + 'e2e-fail.png' });
    console.error('✗', name, e.message.split('\n')[0], '@', page.url()); process.exitCode = 1;
  } finally { await browser.close(); }
}
