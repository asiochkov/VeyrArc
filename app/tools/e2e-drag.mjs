import { APP, guestOnboard, log, open } from './e2e-lib.mjs';
// Planner, phone: press and hold a task, drag it two hours down, undo; a short tap still opens it
const S = '/tmp/claude-0/-home-claude-repo/2a26a2d0-2e4a-50c4-9d86-2549853ae036/scratchpad/';
const { browser, page, errors } = await open({ width: 390, height: 844 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const cdp = await page.context().newCDPSession(page);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
try {
  await guestOnboard(page, { 'Тело': ['Холодный душ'] });
  await page.goto(APP + '/planner');
  const area = page.locator('[class*="mArea"]');
  await area.waitFor();
  const hourRow = await page.locator('[class*="mHour"]').first().boundingBox();
  const row = hourRow.height;
  const hours = await page.locator('[class*="mHour"]').allTextContents();
  const h0 = parseInt(hours[0]);
  // tap at 10:00 of the grid → editor
  await area.scrollIntoViewIfNeeded();
  const box = await area.boundingBox();
  await area.click({ position: { x: 60, y: (10 - h0) * row + 10 } });
  await page.getByPlaceholder(/Название/).fill('Тяни меня');
  await page.getByRole('button', { name: 'Создать задачу' }).click();
  await page.waitForTimeout(600);
  const ev = page.locator('[data-ev]', { hasText: 'Тяни меня' });
  await ev.scrollIntoViewIfNeeded();
  let b = await ev.boundingBox();
  const x = b.x + b.width / 2, y = b.y + 14;
  log('before', await ev.textContent());
  // hold, then move
  await touch('touchStart', x, y);
  await page.waitForTimeout(450);
  log('lifted =', await ev.getAttribute('data-drag'));
  for (let i = 1; i <= 10; i++) { await touch('touchMove', x, y + (2 * row * i) / 10); await page.waitForTimeout(25); }
  await page.screenshot({ path: S + 'drag-mid.png' });
  await touch('touchEnd', x, y + 2 * row);
  await page.waitForTimeout(500);
  const after = await ev.textContent();
  log('after', after);
  if (!after.includes('12:00')) throw new Error('task did not move to 12:00');
  await page.screenshot({ path: S + 'drag-toast.png' });
  await page.getByRole('button', { name: 'Отменить' }).click();
  await page.waitForTimeout(500);
  log('after undo', await ev.textContent());
  if (!(await ev.textContent()).includes('10:00')) throw new Error('undo failed');
  // short tap opens the editor
  b = await ev.boundingBox();
  await page.evaluate(() => { window.__pe = []; for (const t of ['pointerdown','pointerup','pointercancel','click']) window.addEventListener(t, (e) => window.__pe.push(t + ':' + e.pointerType), true); });
  await touch('touchStart', b.x + 30, b.y + 12); await page.waitForTimeout(80); await touch('touchEnd', b.x + 30, b.y + 12);
  await page.waitForTimeout(300); log('events', await page.evaluate(() => window.__pe.join(' ')));
  await page.getByText('Редактировать задачу').or(page.getByRole('dialog')).first().waitFor({ timeout: 3000 });
  log('tap opens editor');
  console.log(errors.length ? 'page errors: ' + errors.join(' | ') : 'no page errors');
} catch (e) {
  await page.screenshot({ path: S + 'e2e-fail.png' });
  console.error('✗', e.message.split('\n')[0], '@', page.url()); process.exitCode = 1;
} finally { await browser.close(); }
