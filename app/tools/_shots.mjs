import { APP, guestOnboard, open } from './e2e-lib.mjs';
const S = '/tmp/claude-0/-home-claude-repo/2a26a2d0-2e4a-50c4-9d86-2549853ae036/scratchpad/ui/';
const theme = process.argv[2] || 'light';
const { browser, page } = await open({ width: 390, height: 844 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
await page.addInitScript((th) => { localStorage.setItem('veyrarc.theme', th); Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true }); Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true }); }, theme);
await guestOnboard(page, { 'Тело': ['Холодный душ', 'Прогулка 30 мин', 'Вода 8 стаканов'] });
await page.goto(APP + '/'); await page.waitForTimeout(1200);
const say = async (t) => { if (!(await page.getByRole('dialog').count())) { await page.getByRole('button', { name: 'Ассистент VeyrArc' }).first().tap(); await page.waitForTimeout(500); } const b = page.getByRole('dialog').getByPlaceholder('Скажите или напишите…'); await b.fill(t); await b.press('Enter'); await page.waitForTimeout(450); };
for (const t of ['сделал холодный душ', 'выпил 3 стакана воды', 'задача созвон с командой сегодня в 18', 'задача купить продукты', 'настроение 4', 'хочу пробежать марафон', 'в цель марафон добавь растяжка', 'добавь привычку чтение 20 минут']) await say(t);
await page.getByRole('dialog').getByRole('button', { name: 'Закрыть' }).tap(); await page.waitForTimeout(700);
const shot = async (n) => { await page.waitForTimeout(1200); await page.screenshot({ path: `${S}${theme}-${n}.png` }); };
await shot('01-today');
await page.evaluate(() => document.querySelector('[data-scroll]')?.scrollTo(0, 700)); await shot('02-today-mid');
await page.evaluate(() => document.querySelector('[data-scroll]')?.scrollTo(0, 99999)); await shot('03-today-end');
for (const [n, p] of [['04-disc', '/disciplines'], ['05-planner', '/planner'], ['06-goals', '/goals'], ['07-analytics', '/analytics'], ['08-settings', '/settings']]) { await page.goto(APP + p); await shot(n); }
await page.goto(APP + '/settings'); await page.waitForTimeout(800);
await page.evaluate(() => document.querySelector('[data-scroll]')?.scrollTo(0, 500)); await shot('09-settings-2');
await page.goto(APP + '/'); await page.waitForTimeout(1000); await page.locator('[data-tour="today-score"]').tap(); await shot('10-dialog');
await browser.close();
