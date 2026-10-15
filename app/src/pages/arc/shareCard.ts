/*
 * The shareable card (audit 1.13.2): a 1080×1920 story image drawn on the device — the arc name in
 * the display serif, the days kept as dots, three numbers, the promise. Shared through the system
 * share sheet where files can be shared, otherwise saved as a PNG.
 */
export type CardData = {
  arc: string; oath: string; kept: number; len: number; best: number; index: number; focusH: number; goals: number;
  days: string[]; labels: { kept: string; best: string; index: string; focus: string };
};

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const words = text.split(/\s+/); const lines: string[] = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > max && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  return lines.slice(0, 4);
}

export async function drawCard(d: CardData): Promise<Blob> {
  const W = 1080, H = 1920;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  const serif = "'Cormorant Variable', 'Cormorant', Georgia, serif";
  const sans = "-apple-system, 'SF Pro Display', 'Inter Variable', Inter, system-ui, sans-serif";
  try { await Promise.all([document.fonts.load(`500 200px ${serif}`), document.fonts.load(`italic 500 60px ${serif}`)]); } catch { /* fallback fonts */ }
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, 560, 40, W / 2, 560, 760);
  g.addColorStop(0, 'rgba(0,75,224,.55)'); g.addColorStop(1, 'rgba(0,75,224,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.font = `500 34px ${sans}`; ctx.fillText('VEYRARC', W / 2, 150);
  ctx.fillStyle = '#fff'; ctx.font = `500 220px ${serif}`; ctx.fillText(d.arc, W / 2, 470);
  // the arc of days: dots along a shallow curve
  const n = d.days.length, x0 = 110, x1 = W - 110;
  for (let k = 0; k < n; k++) {
    const t = n > 1 ? k / (n - 1) : 0;
    const x = x0 + (x1 - x0) * t, y = 760 - Math.sin(Math.PI * t) * 150;
    ctx.beginPath(); ctx.arc(x, y, d.days[k] === 'kept' ? 7 : 4.5, 0, Math.PI * 2);
    ctx.fillStyle = d.days[k] === 'kept' ? '#fff' : d.days[k] === 'pause' ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.12)';
    ctx.fill();
  }
  ctx.fillStyle = '#fff'; ctx.font = `300 230px ${sans}`; ctx.fillText(String(d.kept), W / 2, 1060);
  ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = `400 40px ${sans}`; ctx.fillText(`${d.labels.kept} · ${d.len}`, W / 2, 1130);
  const cells = [[String(d.best), d.labels.best], [String(d.index), d.labels.index], [String(d.focusH), d.labels.focus]];
  cells.forEach(([v, l], k) => {
    const cx = 220 + k * 320;
    ctx.fillStyle = '#fff'; ctx.font = `300 96px ${sans}`; ctx.fillText(v, cx, 1330);
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = `400 30px ${sans}`; ctx.fillText(l, cx, 1385);
  });
  if (d.oath) {
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = `italic 500 58px ${serif}`;
    wrap(ctx, `«${d.oath}»`, W - 220).forEach((ln, k) => ctx.fillText(ln, W / 2, 1550 + k * 72));
  }
  ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.font = `400 30px ${sans}`; ctx.fillText('veyrarc.online', W / 2, H - 110);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('no image'))), 'image/png'));
}

export async function shareCard(d: CardData): Promise<'shared' | 'saved'> {
  const blob = await drawCard(d);
  const file = new File([blob], `veyrarc-${d.arc.replace(/\s+/g, '-').toLowerCase()}.png`, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (x: unknown) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title: d.arc }); return 'shared'; } catch (e) { if ((e as Error).name === 'AbortError') return 'shared'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  return 'saved';
}
