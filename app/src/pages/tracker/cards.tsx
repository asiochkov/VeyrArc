import { buildGrid, habitRate, QUIT_GOALS, type Refusal, type TrackerHabit } from '../../mock/tracker';
import { formatNumber, type T } from '../../i18n';
import { Icon } from '../../ui/Icon';
import s from './tracker.module.css';

const MISS = 'rgba(229,57,43,.62)';
const hueBg = (hue: string) => ({ background: `linear-gradient(160deg,${hue}22,rgba(13,17,22,.92) 60%)`, border: `1px solid ${hue}3a` });

/* ---------------- habit card ---------------- */

export function HabitCard({
  t, h, expanded, mobile, onToggleExpand, onDelete, onToggleToday,
}: {
  t: T; h: TrackerHabit; expanded: boolean; mobile: boolean;
  onToggleExpand: () => void; onDelete: () => void; onToggleToday: () => void;
}) {
  const labels = t.list('weekdays.short');
  return (
    <div className={s.hueCard} style={hueBg(h.hue)}>
      <div className={s.cardTop} onClick={onToggleExpand}>
        <div className={s.left}>
          <div className={s.iconWrap} style={{ background: h.hue + '26', color: h.hue }}><Icon name={h.icon} size={17} /></div>
          <div style={{ minWidth: 0 }}>
            <div className={s.name}>{t.pick(h.name)}</div>
            <div className={s.meta}>
              <span className={s.flame} style={{ color: h.hue }}><Icon name="flameDrop" size={13} /></span>
              <span className={s.streak} style={{ color: h.hue }}>{h.streak}</span>
              <span className={s.cadence}>{t.pick(h.cadence)}</span>
              {h.required && <span className={s.inStreak}>{t('tracker.inStreak')}</span>}
            </div>
          </div>
        </div>
        <div className={s.right}>
          <button type="button" className={s.del} onClick={(e) => { e.stopPropagation(); onDelete(); }} aria-label={t('common.delete')}>
            <Icon name="trash" size={15} />
          </button>
          <div className={s.chev} style={{ transform: `rotate(${expanded ? 90 : 0}deg)` }}><Icon name="chevron" size={16} sw={2} /></div>
        </div>
      </div>

      <div className={s.week}>
        {h.week.map((st, i) => {
          const isToday = st === 'today' || st === 'today-done';
          const done = st === 'done' || st === 'today-done';
          const mark = done ? 'done' : st === 'miss' ? 'miss' : isToday ? 'today' : 'future';
          const style = done ? { background: h.hue } : mark === 'today' ? { border: `2px dashed ${h.hue}` } : undefined;
          return (
            <div key={i} className={s.wcol}>
              <button type="button" className={s.wdot} data-s={mark} style={{ ...style, cursor: done || isToday ? 'pointer' : 'default' }}
                onClick={isToday ? onToggleToday : undefined}>
                {done && <Icon name="check" size={13} sw={3.2} />}
              </button>
              <span className={s.wlabel} style={isToday ? { color: h.hue } : undefined}>{labels[i]}</span>
            </div>
          );
        })}
      </div>

      {expanded && (
        <div className={s.expanded}>
          <div className={s.stats}>
            <div><div className={s.statVal}>{h.rate ?? habitRate(h)}%</div><div className={s.statLab}>{t('tracker.statDone')}</div></div>
            <div><div className={s.statVal}>{t('tracker.bestDays', { n: h.best })}</div><div className={s.statLab}>{t('tracker.statBest')}</div></div>
            <div><div className={s.statVal}>{h.total}</div><div className={s.statLab}>{t('tracker.statTotal')}</div></div>
          </div>
          <div className={s.grid12} style={{ gap: mobile ? 4 : 5 }}>
            {(h.grid ?? buildGrid(h)).map((c, i) => (
              <div key={i} className={s.cell} style={{ background: c === 'done' ? h.hue : c === 'miss' ? MISS : c === 'empty' ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.03)' }} />
            ))}
          </div>
          <div className={s.legend}>
            <span className={s.legendItem}><span className={s.sw} style={{ background: h.hue }} />{t('tracker.legendDone')}</span>
            <span className={s.legendItem}><span className={s.sw} style={{ background: MISS }} />{t('tracker.legendMiss')}</span>
            <span className={s.legendItem}><span className={s.sw} style={{ background: 'rgba(255,255,255,.07)' }} />{t('tracker.legendNone')}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- refusal card ---------------- */

const pad = (n: number) => String(n).padStart(2, '0');

export function sinceLabel(t: T, iso: string) {
  const d = new Date(iso);
  const m = t.list('tracker.monthsShort')[d.getMonth()];
  return t('tracker.since', { d: t.lang === 'en' ? `${m} ${d.getDate()}` : `${d.getDate()} ${m}` });
}

export function RefusalCard({
  t, r, now, mobile, goalOverride, menuOpen, onToggleMenu, onPickGoal, onDelete, onSlip,
}: {
  t: T; r: Refusal; now: number; mobile: boolean; goalOverride?: number; menuOpen: boolean;
  onToggleMenu: () => void; onPickGoal: (g: number) => void; onDelete: () => void; onSlip: () => void;
}) {
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
            <div className={s.since}>{sinceLabel(t, r.quit)}</div>
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
