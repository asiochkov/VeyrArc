import { QUIT_GOALS, type Refusal } from '../../mock/tracker';
import { formatNumber, type T } from '../../i18n';
import { Icon } from '../../ui/Icon';
import { localDay } from './ComposerOptions';
import { useNow } from '../../lib/useNow';
import s from './tracker.module.css';

const hueBg = (hue: string) => ({ background: `linear-gradient(160deg,${hue}22,rgba(13,17,22,.92) 60%)`, border: `1px solid ${hue}3a` });

const pad = (n: number) => String(n).padStart(2, '0');

function sinceLabel(t: T, iso: string) {
  const d = new Date(iso);
  const m = t.list('tracker.monthsShort')[d.getMonth()];
  return t('tracker.since', { d: t.lang === 'en' ? `${m} ${d.getDate()}` : `${d.getDate()} ${m}` });
}

export function RefusalCard({
  t, r, mobile, goalOverride, menuOpen, onToggleMenu, onPickGoal, onDelete, onSlip, onSetSince,
}: {
  t: T; r: Refusal; mobile: boolean; goalOverride?: number; menuOpen: boolean;
  onToggleMenu: () => void; onPickGoal: (g: number) => void; onDelete: () => void; onSlip: () => void; onSetSince: (day: string) => void;
}) {
  const now = useNow(1000); // only this card ticks every second
  const totalSec = Math.floor(Math.max(0, now - new Date(r.quit).getTime()) / 1000);
  const days = Math.floor(totalSec / 86400);
  const hh = Math.floor((totalSec % 86400) / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  const nextGoal = goalOverride || QUIT_GOALS.find((g) => g > days) || 180;
  const prevGoal = goalOverride ? 0 : [0, 3, 7, 14, 30, 90].filter((g) => g <= days).pop()!;
  const pct = Math.min(100, Math.round(((days - prevGoal) / Math.max(1, nextGoal - prevGoal)) * 100));
  const saved = Math.round(r.savedUnit * (totalSec / 86400));
  const big = mobile ? 34 : 26;
  const savedLabel = r.unit ? t('tracker.savedCustom', { u: r.unit.toUpperCase() }) : t(`tracker.saved.${r.savedLabel ?? 'slips'}`);
  const best = Math.max(r.best, days);

  return (
    <div className={s.hueCard} style={hueBg(r.hue)}>
      <div className={s.rTop}>
        <div className={s.left}>
          <div className={s.iconWrap} style={{ background: r.hue + '26', color: r.hue }}><Icon name={r.icon} size={17} /></div>
          <div style={{ minWidth: 0 }}>
            <div className={s.name}>{t.pick(r.name)}</div>
            {/* tap the date to move the start of the count */}
            <label className={s.since + ' ' + s.sinceEdit}>
              {sinceLabel(t, r.quit)} <Icon name="pencil" size={9} />
              <input type="date" className={s.sinceInput} value={localDay(new Date(r.quit))} max={localDay()} aria-label={t('tracker.optSince')}
                onChange={(e) => e.target.value && onSetSince(e.target.value)} />
            </label>
          </div>
        </div>
        {/* A6: the "saved" block is shown on desktop too (the design has it on mobile only) */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flex: 'none' }}>
          <div style={{ textAlign: 'right' }}>
            <div className={s.savedVal} style={{ color: r.hue }}>{formatNumber(t.lang, saved)}</div>
            <div className={s.savedLab}>{savedLabel}</div>
          </div>
          <button type="button" className={s.del} onClick={onDelete} aria-label={t('common.delete')}><Icon name="trash" size={15} /></button>
        </div>
      </div>

      <div className={s.timerRow} style={{ gap: mobile ? 10 : 8 }}>
        <div style={{ textAlign: 'center' }}>
          <div className={`${s.num} ${s.daysNum}`} style={{ fontSize: big }}>{days}</div>
          <div className={s.numLab} style={{ fontSize: mobile ? 9 : 8 }}>{t('tracker.days')}</div>
        </div>
        <div className={s.sep} style={{ fontSize: mobile ? 30 : 22 }}>·</div>
        <div style={{ textAlign: 'center' }}>
          <div className={`${s.num} ${s.clock}`} style={{ fontSize: big }}>
            <span className={s.c2}>{pad(hh)}</span><span className={s.c1}>:</span><span className={s.c2}>{pad(mm)}</span><span className={s.c1}>:</span><span className={s.c2}>{pad(ss)}</span>
          </div>
          <div className={s.numLab} style={{ fontSize: mobile ? 9 : 8 }}>{t('tracker.hms')}</div>
        </div>
      </div>

      {/* A6: slip counter, best clean run and the slip action */}
      <div className={s.slipRow}>
        <span className={s.slipMeta}>{t('tracker.relapses', { n: r.relapses })} · {t('tracker.bestShort', { n: best })}</span>
        <button type="button" className={s.slipBtn} onClick={onSlip}>{t('tracker.relapse')}</button>
      </div>

      <div className={s.goalBlock}>
        <button type="button" className={s.goalBtn} onClick={onToggleMenu}>
          {t('tracker.nextGoal', { n: nextGoal })}{t('tracker.nextGoalDays', { n: nextGoal })} <span style={{ fontSize: 11, color: r.hue }}>▾</span>
        </button>
        {menuOpen && (
          <div className={s.goalMenu}>
            {QUIT_GOALS.map((g) => (
              <button key={g} type="button" className={s.goalOpt} onClick={() => onPickGoal(g)}
                style={g === nextGoal ? { background: r.hue, color: '#06121f' } : undefined}>
                {t('tracker.goalShort', { n: g })}
              </button>
            ))}
          </div>
        )}
        <div className={s.barTrack}><div className={s.barFill} style={{ width: pct + '%', background: r.hue }} /></div>
        <div className={s.miles}>
          {QUIT_GOALS.map((g) => {
            const reached = days >= g;
            const isNext = g === nextGoal;
            return (
              <div key={g} className={s.mcol}>
                <div className={s.mdot} style={reached ? { background: r.hue, border: 'none' } : isNext ? { background: 'transparent', border: `2px solid ${r.hue}` } : undefined}>
                  {reached && <Icon name="check" size={13} sw={3.2} />}
                </div>
                <span className={s.mlab} style={reached || isNext ? { color: r.hue } : undefined}>{t('tracker.goalShort', { n: g })}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
