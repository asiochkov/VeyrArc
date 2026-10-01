import type { TodayHabit } from '../../mock/today';
import { useT } from '../../i18n';
import { Icon } from '../../ui/Icon';
import s from './habit.module.css';

const pad = (n: number) => String(n).padStart(2, '0');

export function isDone(h: TodayHabit) {
  if (h.type === 'counter') return h.count >= h.goal;
  if (h.type === 'duration') return h.left === 0;
  return h.checked;
}

/*
 * One habit inside a Today plate (design brief §6.5): check 28 px, icon 36 px, title,
 * a mono readout under it; on the right a counter pill, a timer or the streak.
 * Checking plays press → fill → settle (§4.4).
 */
export function HabitRow({
  h, flash, onToggle, onInc, onDec, onPlay, onStop,
}: {
  h: TodayHabit & { hue?: string };
  flash: boolean;
  mobile?: boolean;
  onToggle: () => void;
  onInc: () => void;
  onDec: () => void;
  onPlay: () => void;
  onStop: () => void;
}) {
  const t = useT();
  const done = isDone(h);
  const hue = h.hue ?? 'var(--accent)';
  const pct = h.type === 'counter' ? h.count / h.goal : h.type === 'duration' ? 1 - h.left / (h.minutes * 60) : 0;
  const timing = h.type === 'duration' && h.started && h.left > 0;
  const cat = t.pick(h.cat);

  return (
    <div className={s.row} data-just-done={flash} data-done={done}>
      {h.type === 'binary' ? (
        <button type="button" className={s.check} data-on={done} onClick={onToggle} role="checkbox" aria-checked={done} aria-label={t.pick(h.title)}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7.5 5.5 10.5 11.5 3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      ) : (
        <button type="button" className={s.icon} style={{ color: hue, background: `color-mix(in srgb, ${hue} 16%, transparent)` }}
          onClick={h.type === 'duration' ? onPlay : onInc} aria-label={t.pick(h.title)} disabled={done && h.type === 'counter'}>
          <svg className={s.ring} width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeOpacity=".18" strokeWidth="2.5" />
            <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="113.1" strokeDashoffset={113.1 * (1 - Math.min(1, pct))} />
          </svg>
          {done ? <Icon name="check" size={16} sw={3} /> : h.type === 'duration' ? <Icon name={h.running ? 'pause' : 'play'} size={15} sw={2.4} /> : <Icon name={h.icon} size={17} />}
        </button>
      )}
      {h.type === 'binary' && (
        <span className={s.icon} style={{ color: hue, background: `color-mix(in srgb, ${hue} 16%, transparent)` }} aria-hidden="true"><Icon name={h.icon} size={17} /></span>
      )}

      <div className={s.main}>
        <div className={s.title}>{t.pick(h.title)}</div>
        <div className="readout">
          <span>{cat}</span>
          {h.streak > 0 && <><span className="sep">·</span><span>{t('habit.streakDays', { n: h.streak })}</span></>}
        </div>
      </div>

      {h.type === 'counter' && (
        <div className={s.counter}>
          <button type="button" onClick={onDec} aria-label="−" data-hit="off">−</button>
          <span>{h.count}/{h.goal}</span>
          <button type="button" onClick={onInc} aria-label="+" data-hit="off" disabled={done}>+</button>
        </div>
      )}
      {h.type === 'duration' && (timing ? (
        <div className={s.timer}>
          <span>{pad(Math.floor(h.left / 60)) + ':' + pad(h.left % 60)}</span>
          <button type="button" onClick={onPlay} aria-label={h.running ? t('pomo.pause') : t('pomo.start')} data-hit="off">{h.running ? <Icon name="pause" size={13} sw={2.6} /> : <Icon name="play" size={13} />}</button>
          <button type="button" onClick={onStop} aria-label={t('pomo.stop')} data-hit="off"><Icon name="stop" size={13} /></button>
        </div>
      ) : <span className={s.streak}>{done ? '✓' : t('units.min', { m: h.minutes })}</span>)}
      {h.type === 'binary' && <span className={s.streak}>{h.streak}</span>}
    </div>
  );
}
