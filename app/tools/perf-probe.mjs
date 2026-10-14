/* Lag probe: CPU ×4 (a mid phone), long main-thread tasks per action, tap → paint latency. */
import { APP, guestOnboard, open } from './e2e-lib.mjs';
const { browser, page } = await open({ width: 390, height: 844 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
await page.addInitScript(() => {
  window.__lt = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true });
});
const cdp = await page.context().newCDPSession(page);
const measure = async (label, fn) => {
  await page.evaluate(() => { window.__lt = []; });
  const t0 = Date.now(); await fn(); const dt = Date.now() - t0;
  await page.waitForTimeout(400);
  const lt = await page.evaluate(() => window.__lt);
  console.log(label.padEnd(30), `${String(dt).padStart(5)} ms`, '· long tasks:', lt.length ? lt.join(', ') + ' ms' : '—');
};
await guestOnboard(page, { 'Тело': ['Холодный душ', 'Прогулка 30 мин', 'Вода 8 стаканов'] });
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await measure('cold load /', async () => { await page.goto(APP + '/'); await page.getByRole('checkbox').first().waitFor(); });
await page.waitForTimeout(1500);
const lat = await page.evaluate(() => new Promise((res) => {
  const el = document.querySelector('[role=checkbox]');
  const t0 = performance.now();
  new MutationObserver(() => requestAnimationFrame(() => res(Math.round(performance.now() - t0)))).observe(el, { attributes: true, attributeFilter: ['aria-checked'] });
  el.click();
}));
console.log('tap habit → painted'.padEnd(30), `${String(lat).padStart(5)} ms`);
for (const [n, path, sel] of [['→ Дисциплины', '/disciplines', 'main'], ['→ Планер', '/planner', 'main'], ['→ Цели', '/goals', 'main'], ['→ Аналитика', '/analytics', 'main'], ['→ Сегодня', '/', 'main']]) {
  await measure(n, async () => { await page.locator(`nav a[href="${path}"]`).last().tap(); await page.waitForURL((u) => new URL(u).pathname === path); await page.waitForTimeout(50); });
}
await measure('open assistant', async () => { await page.getByRole('button', { name: 'Ассистент VeyrArc' }).first().tap(); await page.getByRole('dialog').waitFor(); });
await measure('assistant command', async () => {
  if (await page.getByRole('dialog').getByRole('button', { name: 'Написать' }).count()) await page.getByRole('dialog').getByRole('button', { name: 'Написать' }).tap();
  const b = page.getByRole('dialog').getByPlaceholder('Скажите или напишите…'); await b.fill('что у меня сегодня'); await b.press('Enter');
  await page.waitForFunction(() => /Сегодня|пусто/.test(document.querySelector('[role=dialog]')?.textContent ?? ''));
});
await measure('close assistant', async () => { await page.getByRole('dialog').getByRole('button', { name: 'Закрыть' }).tap(); await page.getByRole('dialog').waitFor({ state: 'detached' }); });
await browser.close();
