/* Shared helpers for the e2e runs against the local stack. */
import { chromium } from '@playwright/test';
export const APP = process.env.APP_URL || 'http://localhost:4173';
export const log = (...a) => console.log('✓', ...a);

export async function open(viewport = { width: 390, height: 844 }, ctx = {}) {
  // E2E_PROXY=1: reach a real Supabase through the environment's HTTPS proxy
  const proxy = process.env.E2E_PROXY && process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, proxy });
  const page = await browser.newPage({ viewport, ignoreHTTPSErrors: !!proxy, ...ctx });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { browser, page, errors };
}

/** Guest through onboarding with the given habit chips (dir label → chip labels). */
export async function guestOnboard(page, picks) {
  await page.goto(APP + '/welcome');
  await page.getByRole('button', { name: 'Начать свой Arc' }).click();
  await page.waitForURL('**/onboarding');
  await page.getByPlaceholder('напр. Иван').fill('Анна');
  await page.getByPlaceholder('Например: каждое утро — спорт и чтение').fill('Каждое утро — бег');
  await page.getByRole('button', { name: 'Далее' }).click();
  for (const [dir, chips] of Object.entries(picks)) {
    if (dir !== 'Тело') await page.getByRole('button', { name: new RegExp(dir) }).click();
    for (const c of chips) await page.getByRole('button', { name: new RegExp(c) }).click();
  }
  await page.getByRole('button', { name: 'Далее' }).click();
  await page.getByRole('button', { name: 'Далее' }).click();
  const hold = page.getByRole('button', { name: 'Я в деле' });
  const box = await hold.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.waitForTimeout(1700); await page.mouse.up();
  await page.waitForURL((u) => new URL(u).pathname === '/', { timeout: 10000 });
}
