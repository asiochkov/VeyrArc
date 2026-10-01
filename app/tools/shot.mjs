/* Screenshots of app screens for a fresh guest: VP=390x844 R=/,/planner node tools/shot.mjs */
import { APP, guestOnboard, open } from './e2e-lib.mjs';
const OUT = process.env.OUT || '/tmp/claude-0/-home-claude-repo/2a26a2d0-2e4a-50c4-9d86-2549853ae036/scratchpad/';
const [w, h] = (process.env.VP || '390x844').split('x').map(Number);
const { browser, page, errors } = await open({ width: w, height: h });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await guestOnboard(page, { 'Тело': ['Холодный душ', 'Вода 8 стаканов'], 'Разум': ['Чтение 20 мин'] });
  for (const r of (process.env.R || '/').split(',')) {
    await page.goto(APP + r); await page.waitForTimeout(1500);
    await page.screenshot({ path: OUT + `v2${r.replace(/[/?=]/g, '_')}-${w}.png`, fullPage: false });
  }
} catch (e) { console.error('✗', e.message.split('\n')[0]); await page.screenshot({ path: OUT + 'e2e-fail.png' }); }
console.log(errors.join('\n') || 'no page errors');
await browser.close();
