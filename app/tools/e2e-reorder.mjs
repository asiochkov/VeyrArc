import { APP, guestOnboard, log, open } from './e2e-lib.mjs';
// Disciplines, phone: hold a habit tile and drop it on another to swap places; carry one from Extra to Core
const S = '/tmp/claude-0/-home-claude-repo/2a26a2d0-2e4a-50c4-9d86-2549853ae036/scratchpad/';
const { browser, page, errors } = await open({ width: 390, height: 844 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const cdp = await page.context().newCDPSession(page);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
const names = (z) => page.locator(`[data-zone="${z}"] [data-hid] .tl-name`).allTextContents();
const dragTo = async (from, to) => {
  await from.evaluate((e) => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(300);
  const a = await from.boundingBox(), b = await to.boundingBox();
  const x = a.x + a.width / 2, y = a.y + a.height / 2, tx = b.x + b.width / 2, ty = b.y + b.height / 2;
  await touch('touchStart', x, y); await page.waitForTimeout(500);
  for (let i = 1; i <= 12; i++) { await touch('touchMove', x + ((tx - x) * i) / 12, y + ((ty - y) * i) / 12); await page.waitForTimeout(30); }
  await page.waitForTimeout(350); 
  await touch('touchEnd', tx, ty); await page.waitForTimeout(700);
};
try {
  await guestOnboard(page, { 'Тело': ['Холодный душ'], 'Разум': ['Чтение'] });
  await page.goto(APP + '/disciplines');
  await page.locator('[data-zone="core"] [data-hid]').first().waitFor();
  await page.locator('#disc-composer').fill('Растяжка');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  await page.locator('#disc-composer').fill('Дневник');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  log('core', await names('core'), '| extra', await names('extra'));
  const core0 = await names('core');
  // swap the two core tiles
  await dragTo(page.locator('[data-zone="core"] [data-hid]').nth(0), page.locator('[data-zone="core"] [data-hid]').nth(1));
  const core1 = await names('core');
  log('after swap', core1);
  if (core1[0] !== core0[1]) throw new Error('reorder failed');
  if (await page.getByRole('dialog').count()) throw new Error('detail opened after drop');
  // carry the last tile into Core (if it is in Extra)
  const ex = await names('extra');
  if (ex.length) {
    await dragTo(page.locator('[data-zone="extra"] [data-hid]').first(), page.locator('[data-zone="core"] [data-hid]').first());
    log('core', await names('core'), '| extra', await names('extra'));
    if (!(await names('core')).includes(ex[0])) throw new Error('move to core failed');
    await page.getByRole('button', { name: 'Отменить' }).click(); await page.waitForTimeout(600);
    log('after undo: extra', await names('extra'));
    if (!(await names('extra')).includes(ex[0])) throw new Error('undo failed');
    await page.screenshot({ path: S + 'reorder.png' });
  }
  await page.reload();
  await page.locator('[data-zone="core"] [data-hid]').first().waitFor();
  log('after reload', await names('core'));
  if ((await names('core'))[0] !== core1[0]) throw new Error('order not persisted');
  // a short tap still opens the habit
  const t0 = await page.locator('[data-hid]').first().boundingBox();
  await touch('touchStart', t0.x + 40, t0.y + 40); await page.waitForTimeout(60); await touch('touchEnd', t0.x + 40, t0.y + 40);
  await page.getByRole('dialog').first().waitFor({ timeout: 3000 }); log('tap opens the habit');
  console.log(errors.length ? 'page errors: ' + errors.join(' | ') : 'no page errors');
} catch (e) {
  await page.screenshot({ path: S + 'e2e-fail.png' });
  console.error('✗', e.message.split('\n')[0], '@', page.url()); process.exitCode = 1;
} finally { await browser.close(); }
