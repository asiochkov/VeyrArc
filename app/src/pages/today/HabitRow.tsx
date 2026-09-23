import type { TodayHabit } from '../../mock/today';
import { useT } from '../../i18n';
import { Icon } from '../../ui/Icon';
import { StepButton } from '../../ui/primitives';
import s from './today.module.css';

const pad = (n: number) => String(n).padStart(2, '0');

export function isDone(h: TodayHabit) {
  if (h.type === 'counter') return h.count >= h.goal;
  if (h.type === 'duration') return h.left === 0;
  return h.checked;
}

/* One row of the "Сегодня" list — VeyrArc Today.dc.html habits[] */
export function HabitRow({
  h, flash, mobile, onToggle, onInc, onDec, onPlay, onStop,
}: {
  h: TodayHabit;
  flash: boolean;
  mobile: boolean;
  onToggle: () => void;
  onInc: () => void;
  onDec: () => void;
  onPlay: () => void;
  onStop: () => void;
}) {
  const t = useT();
  const done = isDone(h);
  const pct = h.type === 'counter' ? h.count / h.goal : h.type === 'duration' ? 1 - h.left / (h.minutes * 60) : 0;
  const expanded = h.type === 'duration' && h.started && h.left > 0;

  return (
    <div className={s.habitRow} style={{ gap: mobile ? 12 : 13 }}>
      {h.type === 'binary' && (
        <button type="button" className={s.hit} onClick={onToggle} role="checkbox" aria-checked={done} aria-label={t.pick(h.title)}>
          <span className={s.box} data-on={done}>{done && <Icon name="check" size={13} sw={3.2} />}</span>
        </button>
      )}
      {h.type === 'duration' && (
        <button type="button" className={s.hit} onClick={onPlay} aria-label={t.pick(h.title)}>
          <span className={s.play} data-done={done}>
            {done ? <Icon name="check" size={13} sw={3} /> : h.running ? <Icon name="pause" size={13} sw={2.6} /> : <Icon name="play" size={13} color="#06121f" />}
          </span>
        </button>
      )}

      <div className={s.iconWrap} data-binary={h.type === 'binary'}>
        <span className={s.iconInner}>
          {h.type !== 'binary' && (
            <svg width="34" height="34" viewBox="0 0 34 34" className={s.ring}>
              <circle cx="17" cy="17" r="15" fill="none" stroke="rgba(168,203,239,.14)" strokeWidth="2.5" />
              <circle cx="17" cy="17" r="15" fill="none" stroke="#6FA0D6" strokeWidth="2.5" strokeLinecap="round"
                strokeDasharray="94.25" strokeDashoffset={94.25 * (1 - pct)} style={{ transition: 'stroke-dashoffset .3s' }} />
            </svg>
          )}
          <span className={s.habitIcon} style={{ color: done ? '#A8CBEF' : 'rgba(168,203,239,.75)', opacity: flash ? 0 : 1 }}>
            <Icon name={h.icon} size={17} />
          </span>
          {flash && (
            <span className={s.flash}><Icon name="check" size={16} sw={3} /></span>
          )}
        </span>
      </div>

      <div className={s.habitMain}>
        <div className={s.habitTitle} style={{ fontSize: mobile ? 15 : 14.5 }}>{t.pick(h.title)}</div>
        <div className={s.habitMeta}>
          <span className={s.habitCat}>{t.pick(h.cat)}</span>
          <div className={s.dots}>
            {h.dots.map((d, i) => <span key={i} className={s.dot} data-on={!!d} />)}
          </div>
        </div>
        {h.type === 'counter' && (
          <div className={s.counter}>
            <StepButton onClick={onDec}>−</StepButton>
            <span className={s.countLabel}>{h.count + '/' + h.goal}</span>
            <StepButton onClick={onInc}>+</StepButton>
          </div>
        )}
        {expanded && (
          <div className={s.timer}>
            <span className={s.timerLeft}>{pad(Math.floor(h.left / 60)) + ':' + pad(h.left % 60)}</span>
            <button type="button" className={s.miniBtn} onClick={onPlay}>
              {h.running ? <Icon name="pause" size={14} sw={2.6} /> : <Icon name="play" size={14} />}
            </button>
            <button type="button" className={s.miniBtn} onClick={onStop}><Icon name="stop" size={14} /></button>
          </div>
        )}
      </div>

      <span className={s.habitStreak} style={{ fontSize: mobile ? 16 : 15 }}>{h.streak}</span>
    </div>
  );
}
