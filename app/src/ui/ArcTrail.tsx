/*
 * Arc Trail — the product's own mark (audit 1.1.1): the 90 days of an arc drawn as a shallow arc,
 * the walked part bright, today a dot riding on it, the 30 / 45 / 60 marks along the way.
 * Used on Today's arc tile, as the loading mark and in the arc recap.
 */
import s from './arcTrail.module.css';

const P0 = { x: 4, y: 30 }, P1 = { x: 150, y: -14 }, P2 = { x: 296, y: 30 };
const at = (t: number) => ({
  x: (1 - t) ** 2 * P0.x + 2 * (1 - t) * t * P1.x + t ** 2 * P2.x,
  y: (1 - t) ** 2 * P0.y + 2 * (1 - t) * t * P1.y + t ** 2 * P2.y,
});
const PATH = `M${P0.x} ${P0.y} Q${P1.x} ${P1.y} ${P2.x} ${P2.y}`;

export function ArcTrail({ day, length, label }: { day: number; length: number; label?: string }) {
  const t = Math.max(0, Math.min(1, day / Math.max(1, length)));
  const dot = at(t);
  const marks = [30, 45, 60].filter((m) => m < length).map((m) => ({ m, p: at(m / length), done: day >= m }));
  return (
    <svg className={s.trail} viewBox="0 0 300 36" role="img" aria-label={label}>
      <path d={PATH} className={s.base} pathLength={1} />
      <path d={PATH} className={s.walked} pathLength={1} style={{ strokeDasharray: `${t} 1` }} />
      {marks.map(({ m, p, done }) => <circle key={m} cx={p.x} cy={p.y} r={2.4} className={s.mark} data-done={done} />)}
      <circle cx={dot.x} cy={dot.y} r={9} className={s.halo} />
      <circle cx={dot.x} cy={dot.y} r={4.6} className={s.dot} />
    </svg>
  );
}

/** the loading mark: the arc draws itself and a dot travels along it */
export function ArcLoader({ label }: { label?: string }) {
  return (
    <svg className={s.loader} viewBox="0 0 300 36" role="img" aria-label={label}>
      <path d={PATH} className={s.base} pathLength={1} />
      <path d={PATH} className={s.draw} pathLength={1} />
    </svg>
  );
}
