/* Mobile static checks on every screen: horizontal overflow, overlapping touch targets
   (44 px hit areas), text fields under 16 px, icon-only controls without a label. */
import { APP, guestOnboard, open } from './e2e-lib.mjs';
const SIZES = (process.env.SIZES || '375x667,390x844,393x852,430x932').split(',').map((x) => x.split('x').map(Number));
const ROUTES = ['/', '/disciplines', '/planner', '/goals', '/analytics', '/settings', '/settings/account', '/pro'];
let problems = 0;
for (const [width, height] of SIZES) {
  const { browser, page, errors } = await open({ width, height });
  try {
    await guestOnboard(page, { 'Тело': ['Холодный душ', 'Вода 8 стаканов'] });
    for (const r of ROUTES) {
      await page.goto(APP + r);
      await page.waitForTimeout(900);
      const res = await page.evaluate(() => {
        const out = [];
        const vw = document.documentElement.clientWidth;
        for (const el of document.querySelectorAll('body *')) {
          const b = el.getBoundingClientRect();
          if (b.width && b.right > vw + 1 && getComputedStyle(el).position !== 'fixed' && !el.closest('[data-hscroll]')) {
            let clipped = false;
            for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'hidden' || o === 'auto' || o === 'scroll' || o === 'clip') { if (p.getBoundingClientRect().right <= vw + 1) { clipped = true; break; } } }
            if (!clipped) out.push('overflow: ' + (el.className || el.tagName) + ' right=' + Math.round(b.right));
          }
        }
        const sel = 'button, a[href], [role=button], [role=checkbox], [role=switch], input, textarea, select';
        const els = [...document.querySelectorAll(sel)].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== 'hidden'; });
        const hit = (e) => { const b = e.getBoundingClientRect(); if (e.matches('input, textarea, select') || e.dataset.hit === 'off') return b; const dx = Math.max(0, (44 - b.width) / 2), dy = Math.max(0, (44 - b.height) / 2); return { left: b.left - dx, right: b.right + dx, top: b.top - dy, bottom: b.bottom + dy }; };
        const name = (e) => (e.getAttribute('aria-label') || e.textContent || e.className || e.tagName).trim().slice(0, 24);
        for (const e of els) {
          if (e.matches('input, textarea, select') && !e.dataset.large && parseFloat(getComputedStyle(e).fontSize) < 16) out.push('small input font: ' + name(e));
          if (e.matches('button, [role=button]') && !e.textContent.trim() && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby')) out.push('no label: ' + (e.className || e.outerHTML.slice(0, 60)));
          const b = e.getBoundingClientRect();
          if (e.dataset.hit === 'off' && (b.width < 32 || b.height < 32)) out.push('tiny opted-out target: ' + name(e));
        }
        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
          const a = els[i], c = els[j];
          if (a.contains(c) || c.contains(a) || a.closest('label') === c || c.closest('label') === a) continue;
          const ha = hit(a), bc = c.getBoundingClientRect(), hc = hit(c), ba = a.getBoundingClientRect();
          const ov = (x, y) => x.left < y.right - 1 && x.right > y.left + 1 && x.top < y.bottom - 1 && x.bottom > y.top + 1;
          if ((ov(ha, bc) && !ov(ba, bc)) || (ov(hc, ba) && !ov(bc, ba))) out.push('hit overlap: «' + name(a) + '» ↔ «' + name(c) + '»');
        }
        return [...new Set(out)];
      });
      if (res.length) { problems += res.length; console.log(`${width}x${height} ${r}\n  ` + res.join('\n  ')); }
    }
    if (errors.length) { problems++; console.log('page errors:', errors.join(' | ')); }
  } finally { await browser.close(); }
}
console.log(problems ? `✗ ${problems} findings` : '✓ no mobile findings');
if (problems) process.exitCode = 1;
