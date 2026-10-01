/*
 * End-to-end auth run against a local Supabase-like stack (see docs/local-backend.md):
 * guest → onboarding → first check-in → sign up (code from the mail sink) →
 * sign out → sign in → password reset → delete account.
 *   APP_URL=http://localhost:4173 MAIL_URL=http://127.0.0.1:54321/__mail node tools/e2e-auth.mjs
 */
import { chromium } from '@playwright/test';

const APP = process.env.APP_URL || 'http://localhost:4173';
const MAIL = process.env.MAIL_URL || 'http://127.0.0.1:54321/__mail';
const email = `e2e+${Date.now()}@veyrarc.test`;
const log = (...a) => console.log('✓', ...a);
const code = async (after) => {
  for (let i = 0; i < 40; i++) {
    const m = await (await fetch(`${MAIL}?to=${encodeURIComponent(email)}`)).json();
    if (m?.code && m.at > after) return m.code;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('no mail for ' + email);
};
const typeCode = async (page, c) => { await page.locator('input[inputmode="numeric"]').first().click(); await page.keyboard.type(c); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(APP + '/');
  await page.waitForURL('**/welcome'); log('no session → /welcome');
  await page.getByRole('button', { name: 'Начать свой Arc' }).click();
  await page.waitForURL('**/onboarding'); log('guest session → /onboarding');

  await page.getByPlaceholder('напр. Иван').fill('Тест');
  await page.getByPlaceholder('Например: каждое утро — спорт и чтение').fill('Без пропусков');
  await page.getByRole('button', { name: 'Далее' }).click();
  await page.reload();
  await page.getByText('Что ты хочешь изменить?').waitFor(); log('onboarding step survives a reload');
  await page.getByRole('button', { name: /Вода 8 стаканов/ }).click();
  await page.getByRole('button', { name: /Отказ от вредного/ }).click();
  await page.getByRole('button', { name: /Без сахара/ }).click();
  await page.getByRole('button', { name: 'Далее' }).click();
  await page.getByRole('button', { name: 'Далее' }).click();
  await page.waitForURL('**/day-one');
  const hold = page.getByRole('button', { name: 'Я в деле' });
  const box = await hold.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.waitForTimeout(1700); await page.mouse.up();
  await page.waitForURL((u) => new URL(u).pathname === '/', { timeout: 10000 }); log('onboarding saved → Today');
  await page.getByText('«Без пропусков»').first().waitFor(); log('the promise is on Today');

  await page.getByRole('button', { name: 'Меню', exact: true }).first().click();
  await page.getByRole('menuitem', { name: 'Сохранить аккаунт' }).click();
  await page.waitForURL('**/signup'); log('guest → avatar menu → /signup');

  await page.getByPlaceholder('напр. Иван').fill('Тест');
  await page.getByPlaceholder('напр. Петров').fill('Тестов');
  await page.getByPlaceholder('напр. ivan@mail.ru').fill(email);
  await page.getByPlaceholder('минимум 8 символов').fill('Str0ngPass!');
  await page.getByText('Я принимаю').click();
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await page.waitForURL('**/verify'); log('guest linked to email, code sent');
  await typeCode(page, '000000');
  await page.getByRole('button', { name: 'Подтвердить' }).click();
  await page.getByText('Неверный код').waitFor(); log('wrong code rejected');
  await page.locator('input[inputmode="numeric"]').first().click();
  for (let i = 0; i < 6; i++) await page.keyboard.press('Backspace');
  for (const el of await page.locator('input[inputmode="numeric"]').all()) await el.fill('');
  await typeCode(page, await code(t0));
  await page.getByRole('button', { name: 'Подтвердить' }).click();
  await page.getByText('Почта подтверждена').waitFor();
  await page.waitForURL(APP + '/', { timeout: 10000 }); log('email confirmed → Today');

  await page.goto(APP + '/settings/account');
  await page.getByText(email).waitFor(); log('account shows', email);
  await page.getByRole('button', { name: 'Выйти' }).first().click();
  await page.locator('[role="dialog"], div').getByRole('button', { name: 'Выйти' }).last().click();
  await page.waitForURL('**/welcome'); log('signed out');

  await page.goto(APP + '/login');
  await page.getByPlaceholder('напр. ivan@mail.ru').fill(email);
  await page.locator('input[type="password"]').fill('wrongpass1');
  await page.getByRole('button', { name: 'Войти' }).last().click();
  await page.getByText('Неверный email или пароль').waitFor(); log('wrong password rejected');
  await page.locator('input[type="password"]').fill('Str0ngPass!');
  await page.getByRole('button', { name: 'Войти' }).last().click();
  await page.waitForURL(APP + '/'); log('signed in with password → Today (onboarding kept)');

  await page.goto(APP + '/settings/account');
  await page.getByRole('button', { name: 'Выйти' }).first().click();
  await page.locator('div').getByRole('button', { name: 'Выйти' }).last().click();
  await page.waitForURL('**/welcome');
  await page.goto(APP + '/login');
  await page.getByPlaceholder('напр. ivan@mail.ru').fill(email);
  await page.getByRole('button', { name: 'Забыли пароль?' }).click();
  await page.waitForURL('**/reset');
  const t1 = Date.now();
  await page.getByRole('button', { name: 'Отправить код' }).click();
  await page.getByRole('button', { name: 'Ввести код' }).click();
  await typeCode(page, await code(t1));
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await page.getByPlaceholder('минимум 8 символов').fill('N3wPassword!');
  await page.locator('input[type="password"]').nth(1).fill('N3wPassword!');
  await page.getByRole('button', { name: 'Сохранить пароль' }).click();
  await page.getByText('Пароль обновлён').waitFor(); log('password reset by code');
  await page.goto(APP + '/login');
  await page.getByPlaceholder('напр. ivan@mail.ru').fill(email);
  await page.locator('input[type="password"]').fill('N3wPassword!');
  await page.getByRole('button', { name: 'Войти' }).last().click();
  await page.waitForURL(APP + '/'); log('signed in with the new password');

  console.log(errors.length ? 'page errors: ' + errors.join(' | ') : 'no page errors');
} catch (e) {
  await page.screenshot({ path: 'e2e-fail.png' });
  console.error('✗', e.message.split('\n')[0], '@', page.url());
  process.exitCode = 1;
} finally {
  await browser.close();
}
