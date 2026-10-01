import { QUIT_GOALS, type Refusal } from '../../mock/tracker';
import { type T } from '../../i18n';
import { useNow } from '../../lib/useNow';
import { Icon } from '../../ui/Icon';
import { localDay } from '../tracker/ComposerOptions';
import q from './quit.module.css';

/*
 * A quit is a choice that stays «on» (design brief §8.3): always a light tile.
 * One big day counter, the clock in a quiet line, the next goal as a bar with milestones.
 */
export function QuitTile({
  t, r, goalOverride, menuOpen, onToggleMenu, onPickGoal, onDelete, onSlip, onSetSince,
}: {
  t: T; r: Refusal; goalOverride?: number; menuOpen: boolean;
  onToggleMenu: () => void; onPickGoal: (g: number) => void; onDelete: () => void; onSlip: () => void; onSetSince: (day: string) => void;
}) {
  const now = useNow(1000);
  const totalSec = Math.floor(Math.max(0, now - new Date(r.quit).getTime()) / 1000);
  const days = Math.floor(totalSec / 86400);
  const pad = (n: number) => String(n).padStart(2, '0');
  const clock = `${pad(Math.floor((totalSec % 86400) / 3600))}:${pad(Math.floor((totalSec % 3600) / 60))}:${pad(totalSec % 60)}`;
  const nextGoal = goalOverride || QUIT_GOALS.find((g) => g > days) || 180;
  const prevGoal = goalOverride ? 0 : [0, 3, 7, 14, 30, 90].filter((g) => g <= days).pop()!;
  const pct = Math.min(100, Math.round(((days - prevGoal) / Math.max(1, nextGoal - prevGoal)) * 100));
  const best = Math.max(r.best, days);
  const since = new Date(r.quit).toLocaleDateString(t.lang === 'en' ? 'en-US' : 'ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <div className={`tl tl-light ${q.tile}`}>
      <div className="tl-top">
        <span className="cb" style={{ background: `color-mix(in srgb, ${r.hue} 40%, #fff)` }}><Icon name={r.icon} size={18} sw={1.8} /></span>
        <span className={q.topRight}>
          <button type="button" className="cb cb-sm" onClick={onToggleMenu} aria-label={t('tracker.nextGoal', { n: nextGoal })}><Icon name="target" size={16} sw={1.8} /></button>
          <button type="button" className="cb cb-sm" onClick={onDelete} aria-label={t('common.delete')}><Icon name="trash" size={15} /></button>
        </span>
      </div>
      {menuOpen && (
        <div className={q.menu}>
          {QUIT_GOALS.map((g) => (
            <button key={g} type="button" className="pill pill-sm" data-on={g === nextGoal} onClick={() => onPickGoal(g)}>{t('tracker.goalShort', { n: g })}</button>
          ))}
        </div>
      )}
      <div className={q.counter}>
        <span className={q.days}>{days}</span>
        <span className="tl-sub">{t('tracker.days').toLowerCase()} · {clock}</span>
      </div>
      <div className="tl-text">
        <span className="tl-name">{t.pick(r.name)}</span>
        <label className={`tl-sub ${q.since}`}>
          {t('quit.since', { d: since })} · {t('tracker.relapses', { n: r.relapses })} · {t('tracker.bestShort', { n: best })}
          <input type="date" className={q.dateInput} value={localDay(new Date(r.quit))} max={localDay()} aria-label={t('tracker.optSince')} onChange={(e) => e.target.value && onSetSince(e.target.value)} />
        </label>
      </div>
      <div className={q.goal}>
        <div className={q.track}><i style={{ width: pct + '%' }} /></div>
        <div className={q.miles}>
          {QUIT_GOALS.map((g) => <span key={g} data-on={days >= g} data-next={g === nextGoal}>{g}</span>)}
        </div>
      </div>
      <button type="button" className="pill pill-ink" style={{ alignSelf: 'flex-start' }} onClick={onSlip}>{t('tracker.relapse')}</button>
    </div>
  );
}
