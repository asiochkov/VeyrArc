// Renders the PWA icons (PNG) from the logo mark: any-purpose and maskable variants.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const out = new URL('../../public/', import.meta.url).pathname;
const mark = (size, pad, radius) => `<html><body style="margin:0;background:transparent">
<div style="width:${size}px;height:${size}px;display:grid;place-items:center;background:${pad ? '#05070A' : 'transparent'}">
<div style="width:${size - pad * 2}px;height:${size - pad * 2}px;border-radius:${radius}px;background:linear-gradient(150deg,#A8CBEF,#6FA0D6 60%,#4F86C6);display:grid;place-items:center">
<svg width="${(size - pad * 2) * 0.62}" height="${(size - pad * 2) * 0.62}" viewBox="0 0 24 24" fill="none" stroke="#06121f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M4.2 7.5l15.6 9"/><path d="M4.2 16.5l15.6-9"/><path d="M9.5 4.5 12 6l2.5-1.5"/><path d="M9.5 19.5 12 18l2.5 1.5"/></svg>
</div></div></body></html>`;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const p = await b.newPage();
for (const [name, size, pad, r] of [['icon-192.png', 192, 0, 58], ['icon-512.png', 512, 0, 156], ['icon-maskable-512.png', 512, 0, 0], ['apple-touch-icon.png', 180, 0, 0]]) {
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(mark(size, pad, r));
  await p.screenshot({ path: out + name, omitBackground: r > 0 });
}
await b.close();
console.log(fs.readdirSync(out));
