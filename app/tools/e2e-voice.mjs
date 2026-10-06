import { APP, guestOnboard, log, open } from './e2e-lib.mjs';
// Assistant: tap the mark next to the dock, «say» a phrase (fake SpeechRecognition), check the app did it
const S = '/tmp/claude-0/-home-claude-repo/2a26a2d0-2e4a-50c4-9d86-2549853ae036/scratchpad/';
const { browser, page, errors } = await open({ width: 390, height: 844 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
await page.addInitScript(() => {
  class R { start() { window.__rec = this; } stop() { setTimeout(() => this.onend?.(), 30); } abort() { this.onend?.(); } }
  Object.defineProperty(window, 'webkitSpeechRecognition', { value: R, configurable: true, writable: true });
  Object.defineProperty(window, 'SpeechRecognition', { value: R, configurable: true, writable: true });
  window.__say = (t) => { const r = window.__rec; r.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: t }], { isFinal: true })] }); r.stop(); };
});
const ask = async (text) => {
  await page.getByRole('button', { name: 'Ассистент VeyrArc' }).first().tap();
  await page.waitForFunction(() => !!window.__rec, null, { timeout: 4000 });
  await page.evaluate((t) => window.__say(t), text);
  await page.waitForTimeout(900);
  const reply = await page.getByRole('dialog').innerText();
  await page.locator('nav[aria-label]').last().tap(); // the merged pill closes it
  await page.waitForTimeout(700);
  await page.evaluate(() => { window.__rec = null; });
  return reply.split('\n').filter(Boolean).slice(-6).join(' · ');
};
try {
  await guestOnboard(page, { 'Тело': ['Холодный душ'] });
  await page.goto(APP + '/'); await page.waitForTimeout(1800);
  log('old «+» gone:', (await page.getByRole('button', { name: /^Добавить \(удерживайте|^Создать$/ }).count()) === 0);
  log('mood →', await ask('настроение отличное'));
  log('habit →', await ask('сделал холодный душ'));
  log('task →', await ask('задача позвонить маме завтра в 15:30'));
  log('unknown →', await ask('какая сегодня погода'));
  await page.goto(APP + '/'); await page.waitForTimeout(1500);
  const done = await page.getByRole('checkbox', { name: 'Холодный душ' }).getAttribute('aria-checked');
  log('habit checked on Today:', done);
  if (done !== 'true') throw new Error('voice habit not applied');
  // manual add moved from «+» into the assistant panel
  await page.getByRole('button', { name: 'Ассистент VeyrArc' }).first().tap();
  await page.waitForTimeout(600);
  await page.getByRole('dialog').getByRole('button', { name: /Событие/ }).tap();
  await page.waitForTimeout(700);
  log('manual «Событие» opens Add:', await page.getByPlaceholder(/Название/).count() > 0);
  await page.screenshot({ path: S + 'voice-manual.png' });
  console.log(errors.length ? 'page errors: ' + errors.join(' | ') : 'no page errors');
} catch (e) {
  await page.screenshot({ path: S + 'e2e-fail.png' });
  console.error('✗', e.message.split('\n')[0], '@', page.url()); process.exitCode = 1;
} finally { await browser.close(); }
