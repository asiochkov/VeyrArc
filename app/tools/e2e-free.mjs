import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { localUrl } from './e2e-safety.mjs';
const app = localUrl('http://127.0.0.1:4197');
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4197', '--strictPort'], {
  env: { ...process.env, VITE_DEMO: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', x => { serverLog += x; });
server.stderr.on('data', x => { serverLog += x; });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw Error(serverLog);
    try { if ((await fetch(app)).ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  if (!ready) throw Error('Preview did not start: ' + serverLog);
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined) });
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    const errors = [], external = [];
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin !== app) { external.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    for (const route of ['/', '/disciplines', '/planner', '/goals', '/analytics', '/settings', '/settings/account', '/login', '/terms', '/privacy', '/contacts']) {
      await page.goto(app + route);
      await expect(page.locator('#root')).not.toBeEmpty();
      await expect(page.locator('body')).not.toContainText(/Something went wrong|Что-то пошло не так|VeyrArc Pro|Открыть Pro|Пригласи друга|Забыли пароль\?/);
      await expect(page.locator('#root')).toContainText(/Сегодня|Дисциплины|Планер|Цели|Шаги на каждый день|Аналитика|Настройки|Аккаунт|Войти|Условия|Конфиденциальность|Контакты/i);
      console.log(`✓ ${viewport.width}px ${route}`);
    }
    for (const old of ['/pro', '/pricing', '/offer']) {
      await page.goto(app + old); await expect(page).toHaveURL(app + '/');
    }
    await page.goto(app + '/reset'); await expect(page).toHaveURL(app + '/login');
    await page.goto(app + '/open?to=%25broken'); await expect(page).toHaveURL(app + '/');
    // Four extra goals exceed the former free-plan limit and exercise shared state and routing.
    await page.goto(app + '/goals?new=1');
    for (let i = 1; i <= 4; i++) {
      if (i > 1) await page.getByRole('button', { name: 'Цель', exact: true }).click();
      await page.getByRole('textbox', { name: 'Название цели', exact: true }).fill(`Тестовая цель ${i}`);
      await page.getByRole('textbox', { name: 'Шаг на каждый день', exact: true }).fill(`Тестовый шаг ${i}`);
      await page.getByRole('button', { name: 'Создать', exact: true }).click();
      await expect(page.getByRole('heading', { name: `Тестовая цель ${i}`, exact: true })).toBeVisible();
      const step = page.getByRole('checkbox', { name: new RegExp(`Тестовый шаг ${i}`) });
      await step.click(); await expect(step).toBeChecked();
    }
    await page.goto(app + '/settings/account');
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    for (const route of ['/settings', '/analytics', '/login']) {
      await page.goto(app + route);
      await expect(page.locator('#root')).toContainText(/Settings|Analytics|Sign in/);
      await expect(page.locator('body')).not.toContainText(/VeyrArc Pro|Get Pro|Invite a friend|Forgot password\?/);
    }
    expect(errors).toEqual([]); expect(external).toEqual([]);
    await context.close();
  }
} finally {
  await browser?.close(); server.kill('SIGTERM');
}
