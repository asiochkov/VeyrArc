/* Sign-up when the project confirms emails automatically (no code step): guest linking and a fresh sign-up. */
import { APP, guestOnboard, log, open } from './e2e-lib.mjs';
const { browser, page, errors } = await open();
page.on('response', async (r) => { if (r.status() >= 400 && r.url().includes('supabase')) console.log('HTTP', r.status(), r.request().method(), r.url().slice(0, 110), (await r.text().catch(() => '')).slice(0, 200)); });
page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text().slice(0, 200)); });
const email = `ac+${Date.now()}@veyrarc.test`;
const fill = async (em) => {
  await page.getByPlaceholder('напр. Иван').fill('Тест');
  await page.getByPlaceholder('напр. Петров').fill('Тестов');
  await page.getByPlaceholder('напр. ivan@mail.ru').fill(em);
  await page.getByPlaceholder('минимум 8 символов').fill('Str0ngPass!');
  await page.getByText('Я принимаю').click();
  await page.getByRole('button', { name: 'Продолжить' }).click();
};
try {
  await guestOnboard(page, { 'Тело': ['Холодный душ'] });
  await page.getByRole('button', { name: /Холодный душ/ }).click();
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await page.waitForURL('**/signup');
  await fill(email);
  await page.waitForURL(APP + '/', { timeout: 15000 }); log('guest → sign-up → straight to Today (no code step)');
  await page.getByRole('checkbox', { name: 'Холодный душ' }).waitFor(); log('guest data kept after sign-up');
  await page.context().clearCookies(); await page.evaluate(() => localStorage.clear());
  await page.goto(APP + '/login');
  await page.getByPlaceholder('напр. ivan@mail.ru').fill(email);
  await page.locator('input[type="password"]').fill('Str0ngPass!');
  await page.getByRole('button', { name: 'Войти' }).last().click();
  await page.waitForURL(APP + '/'); log('signed in again with the password');
  await page.evaluate(() => localStorage.clear());
  await page.goto(APP + '/signup');
  await fill('fresh+' + email);
  await page.waitForURL('**/onboarding', { timeout: 15000 }); log('fresh sign-up → onboarding');
  console.log(errors.length ? 'page errors: ' + errors.join(' | ') : 'no page errors');
} catch (e) {
  await page.screenshot({ path: '/tmp/claude-0/-home-claude-repo/2a26a2d0-2e4a-50c4-9d86-2549853ae036/scratchpad/e2e-fail.png' });
  console.error('✗', e.message.split('\n')[0], '@', page.url()); process.exitCode = 1;
} finally { await browser.close(); }
