/*
 * Renders the same element from a project/*.dc.html prototype and from the
 * running app, then writes a side-by-side "design / implementation" PNG.
 *
 *   STAGE=stage-1 APP_URL=http://localhost:4173 node tools/design-compare.mjs [caseName…]
 *   (CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome in the cloud sandbox)
 *
 * The prototypes load React/Babel from unpkg; those requests are served from
 * local node_modules so rendering works offline.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const designDir = path.resolve(appRoot, '../project');
const outDir = path.resolve(appRoot, '../docs/compare', process.env.STAGE || 'current');
const APP_URL = process.env.APP_URL || 'http://localhost:4173';
const nm = (p) => path.join(appRoot, 'node_modules', p);

const LOCAL = {
  'https://unpkg.com/react@18.3.1/umd/react.production.min.js': nm('react/umd/react.production.min.js'),
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js': nm('react-dom/umd/react-dom.production.min.js'),
  'https://unpkg.com/@babel/standalone@7.29.0/babel.min.js': nm('@babel/standalone/babel.min.js'),
};

/* Google Fonts are unreachable from the sandboxed browser; serve the same faces from @fontsource. */
const FONT_CSS = [
  ...[400, 500, 600, 700, 800].map((w) => nm(`@fontsource/manrope/${w}.css`)),
  ...[500, 600, 700].map((w) => nm(`@fontsource/jetbrains-mono/${w}.css`)),
].map((file) => fs.readFileSync(file, 'utf8').replace(/url\(\.\/files\//g, `url(https://fonts.local/${path.basename(path.dirname(file))}/`)).join('\n');

async function routeFonts(page) {
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: FONT_CSS, contentType: 'text/css', headers: { 'access-control-allow-origin': '*' } }));
  await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
  await page.route('https://fonts.local/**', (r) => {
    const [, pkg, file] = new URL(r.request().url()).pathname.split('/');
    r.fulfill({ path: nm(`@fontsource/${pkg}/files/${file}`), headers: { 'access-control-allow-origin': '*' } });
  });
}

const DESKTOP = { width: 1280, height: 832 };
// The design's phone frame is 390px with a 1px border, so its content is 388px wide.
const MOBILE = { width: 388, height: 844 };

/* Element finders run in the page. They return a DOMRect-like box. */
const FIND = {
  // desktop rail: the 104px-wide column inside the design frame / the app <nav>
  rail: `(() => { const el = [...document.querySelectorAll('div,nav')].find(e => { const cs = getComputedStyle(e); return cs.width === '104px' && cs.flexDirection === 'column'; }); const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, 832) }; })()`,
  // mobile bottom bar: background rgba(9,12,16,.96)
  // full screen: inner box of the design frame (inside its 1px border); the app is sized to match
  frame: `(() => { const lab = [...document.querySelectorAll('div')].filter(e => /^(DESKTOP|MOBILE) · \\d+ × \\d+$/.test(e.textContent.trim())).pop(); const r = lab.nextElementSibling.getBoundingClientRect(); return { x: r.x + 1, y: r.y + 1, width: r.width - 2, height: r.height - 2 }; })()`,
  bar: `(() => { const el = [...document.querySelectorAll('div,nav')].find(e => getComputedStyle(e).backgroundColor === 'rgba(9, 12, 16, 0.96)'); const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`,
};

/*
 * Full-screen case helper. scrollTops: mobile pages are captured at several
 * scroll offsets so the whole scroll content is compared.
 */
function screen(name, file, route, { langs = ['ru', 'en'], desktop = true, mobile = true, scrollTops = [0, 700, 1400], designSetup, appSetup, clock } = {}) {
  const out = [];
  for (const lang of langs) {
    if (desktop) out.push({ name: `${name}-desktop-${lang}`, lang, clock, design: { file, device: 'Desktop', find: 'frame', setup: designSetup?.desktop }, app: { path: route, find: 'frame', setup: appSetup?.desktop } });
    if (mobile) for (const top of scrollTops) out.push({ name: `${name}-mobile-${lang}-s${top}`, lang, clock, scrollTop: top, design: { file, device: 'Mobile', find: 'frame', setup: designSetup?.mobile }, app: { path: route, find: 'frame', setup: appSetup?.mobile } });
  }
  return out;
}

/* Frozen "now" for screens with live timers, so both sides render the same second. */
const FIXED_NOW = new Date('2026-09-23T12:34:56');

const SCREENS = [
  ...screen('today', 'VeyrArc Today.dc.html', '/'),
  ...screen('habits', 'VeyrArc Tracker.dc.html', '/habits', { scrollTops: [0, 600] }),
  ...screen('quits', 'VeyrArc Tracker.dc.html', '/habits', {
    clock: true, scrollTops: [0, 500],
    designSetup: { desktop: (p) => p.getByRole('button', { name: /^(Отказы|Quits)$/ }).first().click(), mobile: (p) => p.getByRole('button', { name: /^(Отказы|Quits)$/ }).first().click() },
    appSetup: { desktop: (p) => p.getByRole('button', { name: /^(Отказы|Quits)$/ }).first().click(), mobile: (p) => p.getByRole('button', { name: /^(Отказы|Quits)$/ }).first().click() },
  }),
  ...screen('calendar', 'VeyrArc Calendar.dc.html', '/calendar', { clock: true, scrollTops: [0, 700, 1400] }),
  ...['day', 'month'].flatMap((v) => {
    const label = { day: /^(День|Day)$/, month: /^(Месяц|Month)$/ }[v];
    const click = (p) => p.getByRole('button', { name: label }).first().click();
    return screen(`calendar-${v}`, 'VeyrArc Calendar.dc.html', '/calendar', { clock: true, mobile: false, designSetup: { desktop: click }, appSetup: { desktop: click } });
  }),
  ...screen('calendar-monthopen', 'VeyrArc Calendar.dc.html', '/calendar', {
    clock: true, desktop: false, scrollTops: [0],
    designSetup: { mobile: (p) => p.getByRole('button', { name: /(Сентябрь|September)/ }).first().click() },
    appSetup: { mobile: (p) => p.getByRole('button', { name: /(Сентябрь|September)/ }).first().click() },
  }),
  ...screen('goals', 'VeyrArc Training.dc.html', '/goals', { scrollTops: [0, 300] }),
  ...(() => {
    const both = (fn) => ({ desktop: fn, mobile: fn });
    const month = (p) => p.getByRole('button', { name: /^(Месяц|Month)$/ }).first().click();
    const panels = async (p) => { await p.getByRole('button', { name: /^0$/ }).first().click(); };
    const limit = async (p) => { await p.locator('button:has(svg path[d="M12 6v12"])').filter({ hasNotText: /./ }).nth(1).click(); };
    const menu = async (p) => { await p.getByRole('button', { name: /(Выучить английский|Learn English)/ }).first().click({ button: 'right' }); };
    const recap = async (p) => { await menu(p); await p.getByRole('button', { name: /^(Завершить цель|Complete goal)$/ }).click(); };
    return [
      ...screen('goals-month', 'VeyrArc Training.dc.html', '/goals', { scrollTops: [0, 500], designSetup: both(month), appSetup: both(month) }),
      ...screen('goals-streak', 'VeyrArc Training.dc.html', '/goals', { scrollTops: [0], designSetup: both(panels), appSetup: both(panels) }),
      ...screen('goals-limit', 'VeyrArc Training.dc.html', '/goals', { scrollTops: [0], designSetup: both(limit), appSetup: both(limit) }),
      ...screen('goals-menu', 'VeyrArc Training.dc.html', '/goals', { scrollTops: [0], designSetup: both(menu), appSetup: both(menu) }),
    ];
  })(),
  ...screen('profile', 'VeyrArc Profile.dc.html', '/profile', { scrollTops: [0, 700, 1400, 2100] }),
  ...screen('settings', 'VeyrArc Settings.dc.html', '/settings', { scrollTops: [0, 700] }),
  ...[['app', /^(Приложение|App)$/], ['notif', /^(Уведомления|Notifications)$/], ['pro', /^VeyrArc Pro$/], ['arc', /^(Арка|Arc)$/], ['data', /^(Данные|Data)$/]].flatMap(([id, re]) => {
    const click = async (p) => { await p.getByRole('button', { name: re }).first().click(); if (id === 'arc') await p.getByRole('button', { name: /(Архив Arc|Arc archive)/ }).click(); };
    return screen(`settings-${id}`, 'VeyrArc Settings.dc.html', '/settings', { mobile: false, designSetup: { desktop: click }, appSetup: { desktop: click } });
  }),
  ...(() => {
    const lang = (p) => p.getByRole('button', { name: /(Язык|Language)/ }).first().click();
    return screen('settings-lang', 'VeyrArc Settings.dc.html', '/settings', { desktop: false, scrollTops: [0], designSetup: { mobile: lang }, appSetup: { mobile: lang } });
  })(),
  ...screen('pro', 'VeyrArc Pro.dc.html', '/pro', { scrollTops: [0] }),
  ...[['welcome', 'Welcome', '/welcome'], ['onboarding', 'Onboarding', '/onboarding'], ['dayone', 'Day 1', '/day-one'], ['firsthome', 'Home', '/start'],
    ['signup', 'Sign up', '/signup'], ['otp', 'OTP', '/verify'], ['login', 'Sign in', '/login'], ['reset', 'Reset', '/reset'], ['account', 'Account', '/settings/account']].flatMap(([id, tab, route]) => {
    const pick = (p) => p.getByRole('button', { name: tab, exact: true }).first().click();
    return screen(`auth-${id}`, 'VeyrArc Auth.dc.html', route, { scrollTops: [0, 400], designSetup: { desktop: pick, mobile: pick } });
  }),
];

/* Stage 1: navigation shell. */
const CASES = [
  ...SCREENS,
  ...['Today', 'Tracker', 'Calendar', 'Training', 'Profile'].flatMap((screen) => {
    const route = { Today: '/', Tracker: '/habits', Calendar: '/calendar', Training: '/goals', Profile: '/profile' }[screen];
    return ['ru', 'en'].flatMap((lang) => [
      { name: `rail-${screen.toLowerCase()}-${lang}`, lang, design: { file: `VeyrArc ${screen}.dc.html`, device: 'Desktop', find: 'rail' }, app: { path: route, viewport: DESKTOP, find: 'rail' } },
      { name: `bar-${screen.toLowerCase()}-${lang}`, lang, design: { file: `VeyrArc ${screen}.dc.html`, device: 'Mobile', find: 'bar' }, app: { path: route, viewport: MOBILE, find: 'bar' } },
    ]);
  }),
  { name: 'rail-settings-ru', lang: 'ru', design: { file: 'VeyrArc Settings.dc.html', device: 'Desktop', find: 'rail' }, app: { path: '/settings', viewport: DESKTOP, find: 'rail' } },
];

/* The prototypes inject the Google Fonts <link> at runtime; force-load the faces used. */
async function loadFonts(page) {
  await page.evaluate(async () => {
    const faces = ['400 12px Manrope', '500 12px Manrope', '600 12px Manrope', '700 12px Manrope', '800 12px Manrope', '500 12px "JetBrains Mono"', '600 12px "JetBrains Mono"', '700 12px "JetBrains Mono"'];
    await Promise.all(faces.map((f) => document.fonts.load(f, 'АаZz09')));
    await document.fonts.ready;
  });
  const ok = await page.evaluate(() => document.fonts.check('700 12px Manrope', 'Аа') && [...document.fonts].some((f) => f.family.includes('Manrope') && f.status === 'loaded'));
  if (!ok) throw new Error('Manrope did not load — screenshots would use fallback fonts');
}

/* Scroll container: design = the overflow-y:auto element inside the frame; app = [data-scroll]. */
const SCROLL = {
  design: `(() => { const lab = [...document.querySelectorAll('div')].filter(e => /^(DESKTOP|MOBILE) · \\d+ × \\d+$/.test(e.textContent.trim())).pop(); const f = lab.nextElementSibling; return [f, ...f.querySelectorAll('*')].find(e => { const cs = getComputedStyle(e); return /auto|scroll/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 2; }) || null; })()`,
  app: `(document.querySelector('[data-scroll]') || null)`,
};
/* Infinite animations (breathing glows, pulses) are parked at frame 0 on both sides. */
async function freezeLoops(page) {
  await page.evaluate(() => document.getAnimations().forEach((a) => {
    if (a.effect && a.effect.getTiming().iterations === Infinity) { a.pause(); a.currentTime = 0; }
  }));
}

async function scrollTo(page, which, top) {
  return page.evaluate(`(() => { const el = ${SCROLL[which]}; if (!el) return 0; el.scrollTop = ${top}; return el.scrollTop; })()`);
}

async function shootDesign(browser, c) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
  await ctx.addInitScript((lang) => { try { localStorage.setItem('ww.lang', lang); } catch {} }, c.lang);
  const page = await ctx.newPage();
  if (c.clock) await page.clock.setFixedTime(FIXED_NOW);
  await routeFonts(page);
  await page.route('https://unpkg.com/**', (route) => {
    const file = LOCAL[route.request().url()];
    return file ? route.fulfill({ path: file, contentType: 'application/javascript' }) : route.abort();
  });
  await page.goto(pathToFileURL(path.join(designDir, c.design.file)).href);
  await page.getByRole('button', { name: c.design.device, exact: true }).click();
  await loadFonts(page);
  if (c.design.setup) await c.design.setup(page);
  await page.waitForTimeout(1500); // navReady (500ms) + spring
  if (c.scrollTop) await scrollTo(page, 'design', c.scrollTop);
  await page.waitForTimeout(100);
  await freezeLoops(page);
  const box = await page.evaluate(FIND[c.design.find]);
  const buf = await page.screenshot({ clip: box, fullPage: true });
  await ctx.close();
  return { buf, box };
}

async function shootApp(browser, c, designBox) {
  // full-screen cases: size the app viewport to the design frame's inner box
  const viewport = c.app.find === 'frame' ? { width: Math.round(designBox.width), height: Math.round(designBox.height) } : c.app.viewport;
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  await ctx.addInitScript((lang) => { try { localStorage.setItem('ww.lang', lang); } catch {} }, c.lang);
  const page = await ctx.newPage();
  if (c.clock) await page.clock.setFixedTime(FIXED_NOW);
  await page.goto(APP_URL + c.app.path);
  await loadFonts(page);
  if (c.app.setup) await c.app.setup(page);
  await page.waitForTimeout(1500);
  if (c.scrollTop) await scrollTo(page, 'app', c.scrollTop);
  await page.waitForTimeout(100);
  await freezeLoops(page);
  const box = c.app.find === 'frame' ? { x: 0, y: 0, ...viewport } : await page.evaluate(FIND[c.app.find]);
  const buf = await page.screenshot({ clip: box, fullPage: true });
  await ctx.close();
  return buf;
}

async function pair(browser, name, design, impl) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const page = await ctx.newPage();
  const img = (b) => `data:image/png;base64,${b.toString('base64')}`;
  await page.setContent(`<body style="margin:0;background:#11151b;font:600 13px system-ui;color:#c9d3de">
    <div id="w" style="display:inline-flex;gap:24px;padding:16px;align-items:flex-start">
      <figure style="margin:0"><figcaption style="margin-bottom:8px">дизайн</figcaption><img src="${img(design)}" style="zoom:.5"></figure>
      <figure style="margin:0"><figcaption style="margin-bottom:8px">реализация</figcaption><img src="${img(impl)}" style="zoom:.5"></figure>
    </div></body>`);
  const out = path.join(outDir, `${name}.png`);
  await page.locator('#w').screenshot({ path: out });
  // share of pixels whose RGB differs by more than 24 on any channel (same-size crops only)
  const diff = await page.evaluate(async ([a, b]) => {
    const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = src; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    // frame borders make the design crop 1–4px smaller; compare the common top-left area
    const w = Math.min(ia.width, ib.width), h = Math.min(ia.height, ib.height);
    const px = (img) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
    const [da, db] = [px(ia), px(ib)];
    let n = 0;
    for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) > 24 || Math.abs(da[i + 1] - db[i + 1]) > 24 || Math.abs(da[i + 2] - db[i + 2]) > 24) n++;
    return (100 * n / (da.length / 4)).toFixed(2) + '%';
  }, [img(design), img(impl)]);
  await ctx.close();
  return `${out}  diff=${diff}`;
}

const only = process.argv.slice(2);
const cases = only.length ? CASES.filter((c) => only.some((o) => c.name.startsWith(o))) : CASES;
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
for (const c of cases) {
  const d = await shootDesign(browser, c);
  const a = await shootApp(browser, c, d.box);
  console.log(await pair(browser, c.name, d.buf, a));
}
await browser.close();
