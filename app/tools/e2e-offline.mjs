/* Offline: a change made without network waits in the queue, is sent when the network is back,
   and survives a reload; an offline reload shows the last data instead of an empty screen. */
import { APP, guestOnboard, log, open } from './e2e-lib.mjs';
const { browser, page, errors } = await open();
const ctx = page.context();
try {
  await guestOnboard(page, { 'Тело': ['Холодный душ'] });
  await page.goto(APP + '/');
  const box = page.getByRole('checkbox', { name: 'Холодный душ' });
  await box.waitFor();
  await page.waitForTimeout(1500); // service worker installs, cache persists
  await ctx.setOffline(true);
  await box.click();
  await page.getByText(/Нет сети/).first().waitFor({ timeout: 5000 }); log('offline notice shown');
  log('banner:', await page.getByRole('alert').first().innerText().catch(() => '—'));
  await ctx.setOffline(false);
  await page.getByText('Связь есть — всё сохранено').waitFor({ timeout: 10000 }); log('queued change sent after reconnect');
  await page.reload();
  await box.waitFor();
  const on = await box.getAttribute('aria-checked');
  log('after reload checked =', on);
  if (on !== 'true') throw new Error('offline change lost');
  // offline reload: the app shell comes from the service worker, data from the saved cache
  await page.waitForTimeout(1500);
  await ctx.setOffline(true);
  await page.reload().catch(() => {});
  const shown = await page.getByRole('checkbox', { name: 'Холодный душ' }).getAttribute('aria-checked', { timeout: 10000 }).catch(() => null);
  log('offline reload shows cached habit, checked =', shown);
  if (shown !== 'true') throw new Error('no cached data offline');
  // a change made offline survives closing the app offline and is sent on the next start
  const box2 = page.getByRole('checkbox', { name: 'Холодный душ' });
  await box2.click(); await page.waitForTimeout(1500);
  log('queue stored:', await page.evaluate(() => !!localStorage.getItem('veyrarc.queue')));
  await page.reload().catch(() => {});
  log('offline reload keeps unsent change, checked =', await box2.getAttribute('aria-checked', { timeout: 10000 }).catch(() => null));
  await ctx.setOffline(false);
  await page.getByText('Связь есть — всё сохранено').waitFor({ timeout: 15000 }); log('stored queue sent after reconnect');
  await page.waitForTimeout(800);
  await page.reload(); await box2.waitFor();
  const fin = await box2.getAttribute('aria-checked');
  log('server state after restart, checked =', fin, '· queue left:', await page.evaluate(() => localStorage.getItem('veyrarc.queue')));
  if (fin !== 'false') throw new Error('stored offline change not sent');
  console.log(errors.length ? 'page errors: ' + errors.join(' | ') : 'no page errors');
} catch (e) {
  await page.screenshot({ path: '/tmp/claude-0/-home-claude-repo/2a26a2d0-2e4a-50c4-9d86-2549853ae036/scratchpad/e2e-fail.png' });
  console.error('✗', e.message.split('\n')[0], '@', page.url()); process.exitCode = 1;
} finally { await browser.close(); }
