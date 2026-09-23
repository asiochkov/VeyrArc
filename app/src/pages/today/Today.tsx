import { Link } from 'react-router-dom';
import { useT, type T } from '../../i18n';
import { useIsDesktop } from '../../lib/useIsDesktop';
import { plannerToday, todayStats as st, weekStates } from '../../mock/today';
import { Icon } from '../../ui/Icon';
import { Avatar, MoodFace, ProgressRing, Segmented } from '../../ui/primitives';
import { HabitRow } from './HabitRow';
import s from './today.module.css';
import { useTodayState } from './useTodayState';

type State = ReturnType<typeof useTodayState>;

export function Today() {
  const isDesktop = useIsDesktop();
  const state = useTodayState();
  const t = useT();
  return isDesktop ? <DesktopToday t={t} state={state} /> : <MobileToday t={t} state={state} />;
}

/* ---------------- shared pieces ---------------- */

function Header({ t, size }: { t: T; size: 'd' | 'm' }) {
  const d = size === 'd';
  return (
    <div className={s.header}>
      <div>
        <div className={s.brand}>{t('common.brandCaps')}</div>
        <div className={s.dayRow} style={{ gap: d ? 10 : 9 }}>
          <div className={s.dayTitle} style={{ fontSize: d ? 34 : 30 }}>{t('arc.day', { n: st.arcDay })}</div>
          <div className={s.dayOf} style={{ fontSize: d ? 13 : 12 }}>{t('arc.ofTotal', { n: st.arcLength })}</div>
        </div>
      </div>
      <div className={s.headRight} style={{ gap: d ? 14 : 12 }}>
        <Link to="/settings" className={s.gear} aria-label="settings"><Icon name="gear" size={17} /></Link>
        <Avatar initials={st.initials} />
      </div>
    </div>
  );
}

function Week({ t, size }: { t: T; size: 'd' | 'm' }) {
  const d = size === 'd';
  const labels = t.list('weekdays.short');
  const sz = d ? 64 : 28;
  return (
    <div className={s.card} style={{ marginTop: d ? 24 : 22, padding: d ? '20px 26px' : '16px 18px' }}>
      <div className={s.weekHead}>
        <div className={s.weekLabel}>{t('today.thisWeek')}</div>
        <div className={s.freeze}>
          <Icon name="snow" size={13} />
          <span>{t('today.freeze')}<span className={s.mono}>{st.freezesUsed}/{st.freezesAllowed}</span></span>
        </div>
      </div>
      <div className={s.weekRow} style={d ? { alignItems: 'center', marginTop: 18, padding: '0 4px' } : { marginTop: 14 }}>
        {weekStates.map((state, i) => (
          <div key={i} className={s.dayCol} style={{ gap: d ? 14 : 8 }}>
            <div className={s.circle} data-state={state} style={{ width: sz, height: sz }}>
              {state === 'freeze' && <Icon name="snow" size={Math.round(sz * 0.5)} sw={1.6} />}
            </div>
            <span style={{ font: `600 ${d ? 14 : 11}px var(--font-ui)`, color: state === 'today' ? '#E8B75E' : 'rgba(232,237,243,.4)' }}>{labels[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HabitsList({ state, mobile }: { state: State; mobile: boolean }) {
  return (
    <>
      {state.habits.map((h) => (
        <HabitRow key={h.id} h={h} flash={state.flashId === h.id} mobile={mobile} {...state.actions(h)} />
      ))}
    </>
  );
}

function MoodFaces({ state }: { state: State }) {
  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => {
        const sel = i === state.moodSel;
        return (
          <button key={i} type="button" className={s.moodBtn} aria-pressed={sel} onClick={() => state.setMoodSel(i)}>
            <MoodFace level={i} color={sel ? '#A8CBEF' : 'rgba(232,237,243,.3)'} />
          </button>
        );
      })}
    </>
  );
}

function PomodoroTabs({ t, state }: { t: T; state: State }) {
  const labels = t.list('today.tabs');
  return (
    <Segmented
      variant="pomodoro"
      value={String(state.activeTab)}
      onChange={(v) => state.setActiveTab(Number(v))}
      options={labels.map((l, i) => ({ id: String(i), label: l }))}
    />
  );
}

function pomoSummary(t: T) {
  return (
    <>
      {t('today.sessionsSummary', { n: st.sessionsToday })} &nbsp;·&nbsp; {t('today.bodyTime', { t: t.hm(st.focusBodyMin) })} &nbsp;·&nbsp; {t('today.mindTime', { t: t.hm(st.focusMindMin) })}
    </>
  );
}

function recordLine(t: T) {
  return (
    <>
      {t('today.recordPrefix')}<span className={s.recordNum}>{st.streakRecord}</span>{t('today.recordDays', { n: st.streakRecord })}
    </>
  );
}

/* ---------------- desktop ---------------- */

function DesktopToday({ t, state }: { t: T; state: State }) {
  const todayCount = t('today.countOf', { a: state.doneN, b: state.habits.length });
  const moodWords = t.list('today.moodWords');
  return (
    <div className={s.desktop}>
      <Header t={t} size="d" />
      <Week t={t} size="d" />

      <div className={s.grid}>
        {/* pro */}
        <div className={s.pro} style={{ gridArea: 'pro', background: 'linear-gradient(160deg,rgba(232,183,94,.10),rgba(13,17,22,.9) 60%)', padding: '26px 22px', gap: 12 }}>
          <div className={s.proIcon} style={{ width: 46, height: 46, borderRadius: 14 }}><Icon name="lock" size={18} /></div>
          <div className={s.proTitle} style={{ fontSize: 15 }}>{t('today.proTitle')}</div>
          <div className={s.proDesc} style={{ fontSize: 12, lineHeight: 1.5, maxWidth: 210 }}>{t('today.proDesc')}</div>
          <Link to="/pro" className={s.proLink} style={{ marginTop: 6, maxWidth: 220, padding: '12px 26px', fontSize: 13 }}>{t('today.proCta')}</Link>
        </div>

        {/* planner */}
        <div className={s.card} style={{ gridArea: 'planner', padding: '22px 24px', display: 'flex', flexDirection: 'column' }}>
          <div className={s.cardHead}>
            <span className={s.cardTitle}>{t('today.planner')}</span>
            <span className={s.cardCount}>{t('today.plannerCount', { n: plannerToday.length })}</span>
          </div>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column' }}>
            {plannerToday.map((it, i) => (
              <div key={i} className={s.planRow}>
                <span className={s.planTime} data-accent={!!it.accent}>{t.pick(it.time)}</span>
                <span className={s.planText} style={{ fontSize: 13.5 }}>{t.pick(it.text)}</span>
              </div>
            ))}
          </div>
          <Link to="/calendar" className={s.openPlanner} style={{ marginTop: 'auto', paddingTop: 16, gap: 6 }}>
            {t('today.openPlanner')} <Icon name="chevron" size={16} sw={2} />
          </Link>
        </div>

        {/* today */}
        <div className={s.card} style={{ gridArea: 'today', padding: '22px 24px' }}>
          <div className={s.cardHead}>
            <span className={s.cardTitle}>{t('today.today')}</span>
            <span className={s.cardCount}>{todayCount}</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <HabitsList state={state} mobile={false} />
          </div>
        </div>

        {/* mood */}
        <div className={s.card} style={{ gridArea: 'mood', padding: '22px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div className={s.cardHead}>
            <span className={s.cardTitle}>{t('today.mood')}</span>
            <span className={s.cardCount}>{t('today.moodToday')}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
            <MoodFaces state={state} />
          </div>
          <div className={s.moodNote}>{t('today.moodNote', { m: moodWords[state.moodSel] })}</div>
        </div>

        {/* pomodoro */}
        <div className={s.card} style={{ gridArea: 'pomo', padding: '22px 24px', display: 'flex', flexDirection: 'column' }}>
          <PomodoroTabs t={t} state={state} />
          <div style={{ textAlign: 'center', marginTop: 18 }}>
            <div className={s.timerBig} style={{ fontSize: 68, letterSpacing: '.01em' }}>{st.focusMinutes}:00</div>
            <div className={s.sessionLine} style={{ marginTop: 10 }}>{t('today.session', { a: st.session, b: st.sessionsPerCycle })}</div>
          </div>
          <div className={s.controls} style={{ marginTop: 20 }}>
            <button type="button" className={s.ctrlSmall}><Icon name="reset" size={18} /></button>
            <button type="button" className={s.ctrlPlay} style={{ width: 60, height: 60 }}><Icon name="play" size={22} color="#06121f" /></button>
            <button type="button" className={s.ctrlSmall}><Icon name="tune" size={18} /></button>
          </div>
          <div className={s.pomoSummary} style={{ marginTop: 20, paddingTop: 16 }}>{pomoSummary(t)}</div>
        </div>

        {/* streak */}
        <div className={s.streakCard} style={{ gridArea: 'streak', padding: '22px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className={s.capLabel}>{t('today.streak')}</div>
            <div style={{ color: '#6FA0D6' }}><Icon name="flameToday" size={20} /></div>
          </div>
          <div>
            <div className={s.bigMono} style={{ fontSize: 56 }}>{st.streak}</div>
            <div className={s.sub13} style={{ marginTop: 8 }}>{t('today.daysInRow')}</div>
            <div className={s.record} style={{ fontSize: 11, marginTop: 4 }}>{recordLine(t)}</div>
          </div>
          <div className={s.bars}>
            {st.streakBars.map((on, i) => <div key={i} className={s.bar} data-on={!!on} />)}
          </div>
        </div>

        {/* analytics */}
        <div className={s.card} style={{ gridArea: 'analytics', padding: '22px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div className={s.capLabel}>{t('today.analytics')}</div>
          <div style={{ margin: '6px auto 4px' }}>
            <ProgressRing size={132} r={48} strokeWidth={9} pct={state.dayPct / 100}>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ font: '700 26px var(--font-mono)' }}>{state.dayPct}%</div>
                <div style={{ font: '500 11px var(--font-mono)', color: 'rgba(232,237,243,.5)' }}>{todayCount}</div>
              </div>
            </ProgressRing>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 4 }}>
            <AnalyticsStat val={state.catBody} label={t('today.catBody')} size="d" />
            <AnalyticsStat val={state.catMind} label={t('today.catMind')} size="d" />
            <AnalyticsStat val={state.catDisc} label={t('today.catDisc')} size="d" />
            <div>
              <div style={{ height: 19, display: 'grid', placeItems: 'center' }}><MoodFace level={state.moodSel} color="#A8CBEF" /></div>
              <div className={s.statLab} style={{ fontSize: 9, letterSpacing: '.1em', marginTop: 4 }}>{t('today.catMood')}</div>
            </div>
          </div>
        </div>

        {/* focus hours */}
        <div className={s.card} style={{ gridArea: 'focus', padding: '22px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div className={s.capLabel}>{t('today.focusHours')}</div>
          <div>
            <div className={s.bigMono} style={{ fontSize: 44 }}>{t.hm(st.focusTodayMin)}</div>
            <div className={s.sub13} style={{ marginTop: 8 }}>{t('today.forToday')}</div>
          </div>
          <div className={s.focusBars}>
            {st.focusBars.map((v, i) => <div key={i} className={s.focusBar} data-last={i === st.focusBars.length - 1} style={{ height: v + '%' }} />)}
          </div>
          <div style={{ font: '600 12px var(--font-mono)', color: '#6FA0D6' }}>{t('today.vsYesterday', { m: st.focusVsYesterdayMin })}</div>
        </div>

        {/* personal best */}
        <div className={s.bestCard} style={{ gridArea: 'best', padding: '22px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className={s.capLabel}>{t('today.personalBest')}</div>
            <span className={s.recordBadge}>{t('today.recordBadge')}</span>
          </div>
          <div>
            <div style={{ font: '400 13px var(--font-ui)', color: 'rgba(232,237,243,.55)' }}>{t('today.bestFocusDay')}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
              <span className={s.bigMono} style={{ fontSize: 40, color: '#f2e2c4', whiteSpace: 'nowrap' }}>{t.hm(st.bestFocusDayMin)}</span>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', font: '400 12px var(--font-ui)', color: 'rgba(232,237,243,.42)' }}>
            <span>{t('today.daysAgo', { n: st.bestFocusDaysAgo })}</span>
            <span style={{ color: '#E8B75E', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{t('today.plusMin', { m: st.bestFocusGainMin })}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalyticsStat({ val, label, size }: { val: string; label: string; size: 'd' | 'm' }) {
  const d = size === 'd';
  return (
    <div>
      <div className={s.statVal} style={{ fontSize: d ? 16 : 13 }}>{val}</div>
      <div className={s.statLab} style={{ fontSize: d ? 9 : 8, letterSpacing: d ? '.1em' : '.08em', marginTop: d ? 4 : 2 }}>{label}</div>
    </div>
  );
}

/* ---------------- mobile ---------------- */

function MobileToday({ t, state }: { t: T; state: State }) {
  const todayCount = t('today.countOf', { a: state.doneN, b: state.habits.length });
  const moodLabels = t.list('today.moodLabels');
  return (
    <div className={s.mobileScroll} data-scroll>
      <Header t={t} size="m" />
      <Week t={t} size="m" />

      {/* analytics + pro row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
        <div className={s.card} style={{ padding: '16px 14px', textAlign: 'center' }}>
          <div style={{ font: '700 9px var(--font-mono)', letterSpacing: '.14em', color: 'rgba(232,237,243,.4)' }}>{t('today.analytics')}</div>
          <div style={{ margin: '10px auto 6px', width: 92 }}>
            <ProgressRing size={92} r={48} strokeWidth={10} pct={state.dayPct / 100}>
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', font: '700 19px var(--font-mono)' }}>
                <span style={{ whiteSpace: 'nowrap' }}>{state.dayPct}%</span>
              </div>
            </ProgressRing>
          </div>
          <div style={{ font: '500 11px var(--font-mono)', color: 'rgba(232,237,243,.5)' }}>{t('today.habitsOf', { a: state.doneN, b: state.habits.length })}</div>
          <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 12 }}>
            <AnalyticsStat val={state.catBody} label={t('today.catBody')} size="m" />
            <AnalyticsStat val={state.catMind} label={t('today.catMind')} size="m" />
            <AnalyticsStat val={state.catDisc} label={t('today.catDiscShort')} size="m" />
            <div>
              <div style={{ height: 16, display: 'grid', placeItems: 'center' }}><MoodFace level={state.moodSel} color="#A8CBEF" /></div>
              <div className={s.statLab} style={{ fontSize: 8, letterSpacing: '.08em', marginTop: 2 }}>{t('today.catMood')}</div>
            </div>
          </div>
        </div>
        <div className={s.pro} style={{ background: 'linear-gradient(160deg,rgba(232,183,94,.12),rgba(13,17,22,.9) 65%)', padding: '16px 14px', gap: 8 }}>
          <div className={s.proIcon} style={{ width: 40, height: 40, borderRadius: 12 }}><Icon name="lock" size={18} /></div>
          <div className={s.proTitle} style={{ fontSize: 14 }}>{t('today.proTitle')}</div>
          <div className={s.proDesc} style={{ fontSize: 11, lineHeight: 1.45 }}>{t('today.proDescShort')}</div>
          <Link to="/pro" className={s.proLink} style={{ marginTop: 4, padding: 10, fontSize: 12.5 }}>{t('today.proCta')}</Link>
        </div>
      </div>

      {/* today */}
      <div className={s.card} style={{ marginTop: 12, padding: '18px 18px' }}>
        <div className={s.cardHead}>
          <span className={s.cardTitle} style={{ fontSize: 18 }}>{t('today.today')}</span>
          <span className={s.cardCount} style={{ fontSize: 12 }}>{todayCount}</span>
        </div>
        <div style={{ marginTop: 6 }}>
          <HabitsList state={state} mobile />
        </div>
      </div>

      {/* mood */}
      <div className={s.card} style={{ marginTop: 12, padding: 18 }}>
        <div className={s.cardHead}>
          <span className={s.cardTitle} style={{ fontSize: 17 }}>{t('today.mood')}</span>
          <span style={{ font: '600 11px var(--font-ui)', color: 'rgba(232,237,243,.45)' }}>{moodLabels[state.moodSel]}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
          <MoodFaces state={state} />
        </div>
      </div>

      {/* pomodoro */}
      <div className={s.card} style={{ marginTop: 12, padding: 18 }}>
        <PomodoroTabs t={t} state={state} />
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <div className={s.timerBig} style={{ fontSize: 60 }}>{st.focusMinutes}:00</div>
          <div className={s.sessionLine} style={{ marginTop: 8 }}>{t('today.session', { a: st.session, b: st.sessionsPerCycle })}</div>
        </div>
        <div className={s.controls} style={{ marginTop: 16 }}>
          <button type="button" className={s.ctrlSmall}><Icon name="reset" size={18} /></button>
          <button type="button" className={s.ctrlPlay} style={{ width: 58, height: 58 }}><Icon name="play" size={22} color="#06121f" /></button>
          <button type="button" className={s.ctrlSmall}><Icon name="tune" size={18} /></button>
        </div>
        <div className={s.pomoSummary} style={{ marginTop: 16, paddingTop: 14 }}>{pomoSummary(t)}</div>
      </div>

      {/* planner */}
      <div className={s.card} style={{ marginTop: 12, padding: 18 }}>
        <div className={s.cardHead}>
          <span className={s.cardTitle} style={{ fontSize: 18 }}>{t('today.planner')}</span>
          <span className={s.cardCount} style={{ fontSize: 12 }}>{t('today.plannerCount', { n: plannerToday.length })}</span>
        </div>
        <div style={{ marginTop: 10 }}>
          {plannerToday.map((it, i) => (
            <div key={i} className={s.planRow}>
              <span className={s.planTime} data-accent={!!it.accent}>{t.pick(it.time)}</span>
              <span className={s.planText} style={{ fontSize: 14 }}>{t.pick(it.text)}</span>
            </div>
          ))}
        </div>
        <Link to="/calendar" className={s.openPlanner} style={{ marginTop: 6, paddingTop: 14, borderTop: '1px solid rgba(168,203,239,.07)', justifyContent: 'space-between', fontSize: 14 }}>
          {t('today.openPlanner')} <Icon name="chevron" size={16} sw={2} />
        </Link>
      </div>

      {/* streak + record */}
      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ background: 'linear-gradient(160deg,rgba(111,160,214,.10),rgba(13,17,22,.9) 65%)', border: '1px solid rgba(168,203,239,.12)', borderRadius: 20, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ font: '700 9px var(--font-mono)', letterSpacing: '.16em', color: 'rgba(232,237,243,.4)' }}>{t('today.streak')}</span>
            <span style={{ color: '#6FA0D6' }}><Icon name="flameToday" size={20} /></span>
          </div>
          <div className={s.bigMono} style={{ fontSize: 36, marginTop: 12 }}>{st.streak}</div>
          <div style={{ font: '400 11px var(--font-ui)', color: 'rgba(232,237,243,.5)', marginTop: 6 }}>{t('today.daysInRow')}</div>
          <div className={s.record} style={{ fontSize: 10.5, marginTop: 3, whiteSpace: 'nowrap' }}>{recordLine(t)}</div>
        </div>
        <div className={s.bestCard} style={{ padding: 16 }}>
          <span style={{ font: '700 9px var(--font-mono)', letterSpacing: '.16em', color: 'rgba(232,237,243,.4)', whiteSpace: 'nowrap' }}>{t('today.personalBest')}</span>
          <div className={s.bigMono} style={{ fontSize: 30, color: '#f2e2c4', marginTop: 14, whiteSpace: 'nowrap' }}>{t.hm(st.bestFocusDayMin)}</div>
          <div style={{ font: '400 11px var(--font-ui)', color: 'rgba(232,237,243,.5)', marginTop: 6 }}>{t('today.bestFocusDayLower')}</div>
          <div style={{ font: '600 10.5px var(--font-mono)', color: '#E8B75E', marginTop: 3 }}>{t('today.plusMin', { m: st.bestFocusGainMin })}</div>
        </div>
      </div>
    </div>
  );
}
