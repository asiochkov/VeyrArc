/* Assistant v2 against the real app: loose phrases, several commands in one, undo, questions back,
   answers about the day, tasks moved, habits/goals created, navigation — typed into the panel
   (the same path as speech after recognition). */
import { APP, guestOnboard, log, open } from './e2e-lib.mjs';
const S = (process.env.SHOT_DIR || (await import('node:path')).join((await import('node:os')).tmpdir(), 'veyrarc-shots')) + '/';
const { browser, page, errors } = await open({ width: 390, height: 844 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
await page.addInitScript(() => { Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true }); Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true }); });
const dlg = () => page.getByRole('dialog');
const openPanel = async () => {
  if (await dlg().count()) return;
  await page.getByRole('button', { name: 'Ассистент VeyrArc' }).first().tap();
  await dlg().getByPlaceholder('Скажите или напишите…').waitFor();
};
const say = async (text) => {
  await openPanel();
  const box = dlg().getByPlaceholder('Скажите или напишите…');
  await box.fill(text); await box.press('Enter');
  await page.waitForTimeout(700);
  const out = (await dlg().count()) ? (await dlg().innerText()).replace(/\n+/g, ' · ') : '(closed)';
  return out.replace(/^.*?(Готово|Не получилось|Уточняю|Думаю)\s·\s/, '$1 · ').slice(0, 260);
};
const close = async () => { if (await dlg().count()) { await dlg().getByRole('button', { name: 'Закрыть' }).tap(); await page.waitForTimeout(400); } };
const checked = (n) => page.evaluate((name) => {
  const el = [...document.querySelectorAll('[class*="tileName"]')].find((x) => x.textContent === name);
  const tile = el?.closest('[class*="tile"][class*="sq"]');
  return tile ? String(/Готово/.test(tile.textContent)) : 'missing';
}, n);
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
try {
  await guestOnboard(page, { 'Тело': ['Холодный душ', 'Прогулка 30 мин'] });
  await page.goto(APP + '/'); await page.waitForTimeout(1500);
  let r = await say('сделал холодный душ и прогулку'); log('two habits →', r);
  await close(); expect(await checked('Холодный душ') === 'true' && await checked('Прогулка 30 мин') === 'true', 'two habits not marked');
  r = await say('отмени'); log('undo →', r); await close();
  expect(await checked('Холодный душ') === 'false' && await checked('Прогулка 30 мин') === 'false', 'undo did not revert both');
  r = await say('душ'); log('bare name asks →', r); expect(/Отметить/.test(r), 'no question for a bare name');
  await dlg().getByRole('button', { name: 'Да' }).tap(); await page.waitForTimeout(600);
  log('answered «Да» →', (await dlg().innerText()).replace(/\n+/g, ' · ').slice(0, 120)); await close();
  expect(await checked('Холодный душ') === 'true', 'choice did not mark');
  r = await say('слушай а можно завтра в девять утра поставить встречу с врачом'); log('task →', r); expect(/Встреча с врачом.*завтра в 09:00/.test(r), 'task not parsed');
  r = await say('что у меня завтра'); log('plan tomorrow →', r); expect(/09:00 · Встреча с врачом/.test(r), 'plan answer missing');
  r = await say('перенеси встречу с врачом на пятницу в 12'); log('move →', r); expect(/Перенёс/.test(r), 'move failed');
  r = await say('задача купить хлеб'); log('task today →', r);
  r = await say('вычеркни хлеб'); log('cross out →', r); expect(/Выполнено|Отметить/.test(r), 'cross out failed');
  if (/Отметить/.test(r)) await dlg().getByRole('button', { name: 'Да' }).tap();
  r = await say('мне что-то грустно'); log('mood →', r); expect(/настроение плохое/.test(r), 'mood failed');
  r = await say('добавь привычку чтение 20 минут'); log('habit add →', r); expect(/Чтение/.test(r), 'habit add failed');
  r = await say('я сегодня почитал 20 минут'); log('duration →', r); expect(/Чтение/.test(r), 'duration log failed');
  r = await say('что осталось'); log('left →', r);
  r = await say('как мои дела'); log('progress →', r); expect(/Индекс \d+/.test(r), 'progress missing');
  r = await say('фокус 25'); log('focus →', r);
  r = await say('пауза'); log('pause →', r);
  r = await say('хочу научиться играть на гитаре'); log('goal →', r); expect(/цель/.test(r), 'goal add failed');
  r = await say('в цель гитара добавь аккорды'); log('step →', r); expect(/Аккорды/.test(r), 'step add failed');
  r = await say('какая сегодня погода'); log('off topic →', r); expect(/не помогу/.test(r), 'off-topic misread');
  r = await say('что ты умеешь'); log('help →', r.slice(0, 140));
  await page.screenshot({ path: S + 'assistant-help.png' });
  r = await say('открой цели'); await page.waitForTimeout(800); log('nav →', page.url(), '· panel closed:', (await dlg().count()) === 0);
  expect(page.url().endsWith('/goals'), 'navigation failed');
  r = await say('итоги дня'); await page.waitForTimeout(1800);
  log('review → url', new URL(page.url()).pathname, '· dialog:', (await page.getByRole('dialog').first().innerText()).replace(/\n+/g, ' · ').slice(0, 80));
  console.log(errors.length ? 'page errors: ' + errors.join(' | ') : 'no page errors');
} catch (e) {
  await page.screenshot({ path: S + 'e2e-fail.png' });
  console.error('✗', e.message.split('\n')[0], '@', page.url()); process.exitCode = 1;
} finally { await browser.close(); }
