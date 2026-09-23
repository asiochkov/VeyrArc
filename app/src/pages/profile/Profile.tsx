import { useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useT, type T } from '../../i18n';
import { useIsDesktop } from '../../lib/useIsDesktop';
import {
  achievements, arcCompare, correlation, focusCard, goalsCard, habitsCard, habitsSpark, HEAT_COLORS, heatBestStreak, heatLevels,
  HIST, PERIOD_DATA, plannerCard, PROFILE_IS_PRO, quitCard, REC_GRADIENTS, recommendations, type HistRange, type Period,
} from '../../mock/profile';
import { todayStats } from '../../mock/today';
import { Icon, type IconName } from '../../ui/Icon';
import { ProgressRing, Segmented } from '../../ui/primitives';
import s from './profile.module.css';

/* VeyrArc Profile.dc.html */

const mono: CSSProperties = { fontFamily: 'var(--font-mono)' };
const cap = (size: number, ls: string, alpha = '.4'): CSSProperties => ({ font: `700 ${size}px var(--font-mono)`, letterSpacing: ls, color: `rgba(232,237,243,${alpha})` });

function spark(vals: number[], w: number, h: number, color: string) {
  const max = Math.max(...vals), min = Math.min(...vals);
  const pts = vals.map((v, i) => (i / (vals.length - 1)) * w + ',' + (h - ((v - min) / Math.max(1, max - min)) * h)).join(' ');
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}><polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function bars(vals: number[], w: number, h: number, color: string) {
  const max = Math.max(...vals);
  const bw = w / vals.length - 4;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {vals.map((v, i) => <rect key={i} x={i * (bw + 4)} y={h - (v / max) * h} width={bw} height={(v / max) * h} rx={2} fill={color} />)}
    </svg>
  );
}

function useProfile() {
  const [period, setPeriod] = useState<Period>('month');
  const [histRange, setHistRange] = useState<HistRange>('6m');
  const [menuOpen, setMenuOpen] = useState(false);
  return { period, setPeriod, histRange, setHistRange, menuOpen, setMenuOpen };
}
type P = ReturnType<typeof useProfile>;

export function Profile() {
  const t = useT();
  const isDesktop = useIsDesktop();
  const p = useProfile();
  return isDesktop ? <Desktop t={t} p={p} /> : <Mobile t={t} p={p} />;
}

/* ---------------- shared ---------------- */

function derived(t: T, p: P) {
  const cur = PERIOD_DATA[p.period];
  const status = cur.value >= 720 ? t('profile.status.great') : cur.value >= 650 ? t('profile.status.steady') : t('profile.status.grow');
  return {
    value: cur.value, delta: cur.delta, status,
    deltaLabel: t('profile.pts', { d: (cur.delta >= 0 ? '+' : '') + cur.delta }),
    deltaColor: cur.delta >= 0 ? '#5FBF9B' : '#D96A5B',
    pct: Math.round((cur.value / 1000) * 100),
  };
}

function PeriodSeg({ t, p, m }: { t: T; p: P; m: boolean }) {
  return (
    <Segmented variant="period" value={p.period} onChange={p.setPeriod}
      options={(['week', 'month', 'year', 'arc'] as Period[]).map((id) => ({ id, label: <span style={m ? { display: 'block', minHeight: 20 } : undefined}>{t(`profile.periods.${id}`)}</span> }))}
      style={m ? { position: 'relative', zIndex: 1, marginTop: 18, background: 'rgba(5,7,10,.65)' } : { marginTop: 18, width: '100%', maxWidth: 400 }} />
  );
}

function Menu({ t, m }: { t: T; m: boolean }) {
  return (
    <div className={s.menu} style={m ? { margin: '8px 16px 0' } : { marginTop: 10, maxWidth: 220 }}>
      <Link to="/" className={s.menuLink}>{t('nav.today')}</Link>
      <Link to="/habits" className={s.menuLink}>{t('nav.habits')}</Link>
      <Link to="/calendar" className={s.menuLink}>{t('nav.calendar')}</Link>
      <Link to="/goals" className={s.menuLink}>{t('nav.goals')}</Link>
    </div>
  );
}

function CardIcon({ name, color }: { name: IconName; color: string }) {
  return <span className={s.cardIcon} style={{ background: color + '22', color }}><Icon name={name} size={15} color={color} sw={name === 'bolt' ? 1.5 : 1.7} /></span>;
}

function Lock({ t }: { t: T }) {
  return (
    <div className={s.lock}>
      <span style={{ color: '#E8B75E' }}><Icon name="lock" size={18} /></span>
      <span style={{ font: '700 12px var(--font-ui)', color: '#f2e2c4' }}>{t('profile.inPro')}</span>
    </div>
  );
}
const blur: CSSProperties = PROFILE_IS_PRO ? {} : { filter: 'blur(5px)', userSelect: 'none' };

function ProBanner({ t }: { t: T }) {
  return (
    <div className={s.proBanner}>
      <div className={s.proIcon}><Icon name="lock" size={18} /></div>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ font: '700 15px var(--font-ui)', color: '#f2e2c4' }}>{t('today.proTitle')}</div>
        <div style={{ font: '400 12px/1.5 var(--font-ui)', color: 'rgba(232,237,243,.55)' }}>{t('today.proDesc')}</div>
      </div>
      <Link to="/pro" className={s.goldLink}>{t('today.proCta')}</Link>
    </div>
  );
}

function Recs({ t, m }: { t: T; m: boolean }) {
  return (
    <div style={{ marginTop: m ? 18 : 16 }}>
      <div style={{ ...cap(m ? 9.5 : 10, m ? '.16em' : '.18em', m ? '.45' : '.4'), whiteSpace: 'nowrap', marginBottom: 10 }}>{t('profile.recommendations')}</div>
      <div className={s.hscroll} style={{ gap: m ? 10 : 12 }}>
        {recommendations.map((r, i) => (
          <div key={i} className={s.rec} style={{ background: REC_GRADIENTS[i % REC_GRADIENTS.length], width: m ? 200 : 210 }}>
            <div className={s.recIcon}><Icon name={r.icon} size={18} color="#fff" /></div>
            <div style={{ font: `700 ${m ? 13 : 13.5}px/1.35 var(--font-ui)`, marginTop: 12 }}>{t.pick(r.title)}</div>
            <div style={{ font: '400 11.5px/1.5 var(--font-ui)', color: m ? 'rgba(255,255,255,.78)' : 'rgba(255,255,255,.75)', marginTop: 6 }}>{t.pick(r.desc)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Achievements({ t, m }: { t: T; m: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: m ? 'repeat(4,1fr)' : '1fr 1fr', gap: m ? 8 : 12, marginTop: 14 }}>
      {achievements.map((a, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: m ? undefined : 'center' }}>
          <div className={s.achIcon} style={{ background: a.unlocked ? '#E8A54B' : 'rgba(255,255,255,.05)' }}>
            <Icon name={a.icon} size={20} color={a.unlocked ? '#06121f' : 'rgba(232,237,243,.35)'} />
          </div>
          <span style={{ font: `600 ${m ? 9.5 : 10.5}px var(--font-ui)`, color: a.unlocked ? 'rgba(232,237,243,.75)' : 'rgba(232,237,243,.35)', textAlign: m ? 'center' : undefined }}>{t.pick(a.label)}</span>
        </div>
      ))}
    </div>
  );
}

const quitDay = (d: number, h: number, r: number): CSSProperties => ({ height: h, borderRadius: r, background: d ? '#5FBF9B' : 'rgba(217,106,91,.55)' });

/* ---------------- desktop ---------------- */

function Desktop({ t, p }: { t: T; p: P }) {
  const d = derived(t, p);
  const hist = HIST[p.histRange];
  const hMax = Math.max(...hist), hMin = Math.min(...hist);
  const lastY = 100 - ((hist[hist.length - 1] - hMin) / Math.max(1, hMax - hMin)) * 100;
  const weekLabels = Array.from({ length: 12 }, (_, i) => (i % 4 === 0 ? t.list('monthsShortCap')[(6 + Math.floor(i / 4)) % 12] : ''));
  const wdShort = t.list('weekdays.short').map((w, i) => (i % 2 === 0 && i < 5 ? w : ''));

  const card = (area: string, children: ReactNode, extra?: CSSProperties) => (
    <div className={s.card} style={{ gridArea: area, borderRadius: 20, padding: 22, ...extra }}>{children}</div>
  );
  const head = (icon: IconName, color: string, label: string, right?: ReactNode) => (
    <div style={{ paddingRight: 40, display: 'flex', justifyContent: right ? 'space-between' : undefined, alignItems: 'center', gap: right ? undefined : 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><CardIcon name={icon} color={color} /><span style={cap(10, '.18em')}>{label}</span></div>
      {right}
    </div>
  );
  const arrow = <div className={s.arrow}><Icon name="arrow" size={13} sw={2.2} /></div>;

  return (
    <div className={s.desktop}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button type="button" className={s.menuBtn} style={{ width: 38, height: 38 }} onClick={() => p.setMenuOpen(!p.menuOpen)}><Icon name="menu" size={18} sw={2} /></button>
          <div style={{ font: '700 10px/1 var(--font-mono)', letterSpacing: '.26em', color: 'rgba(232,237,243,.34)' }}>{t('common.brandCaps')}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {PROFILE_IS_PRO && <span className={s.proBadge}>{t('profile.proBadge')}</span>}
          <button type="button" className={s.avatarBtn} style={{ width: 40, height: 40, fontSize: 12 }}>{todayStats.initials}</button>
        </div>
      </div>
      {p.menuOpen && <Menu t={t} m={false} />}

      <div className={s.hero} style={{ marginTop: 20, borderRadius: 22, padding: '30px 32px' }}>
        <div className={s.heroGlow} />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 24 }}>
          <div style={{ minWidth: 220 }}>
            <div style={cap(10, '.2em')}>{t('profile.index')}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 10 }}>
              <span style={{ font: '800 64px/1 var(--font-mono)', letterSpacing: '-.02em' }}>{d.value}</span>
              <span style={{ font: '600 13px var(--font-mono)', color: 'rgba(232,237,243,.4)' }}>{t('profile.of1000')}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
              <span style={{ font: '700 15px var(--font-mono)', color: d.deltaColor }}>{d.deltaLabel}</span>
              <span style={{ font: '700 15px var(--font-ui)', color: '#5FBF9B' }}>{d.status}</span>
            </div>
            <PeriodSeg t={t} p={p} m={false} />
          </div>
          <div style={{ flex: 'none' }}>
            <ProgressRing size={120} r={50} strokeWidth={9} pct={d.value / 1000}>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ font: '700 20px var(--font-mono)' }}>{d.pct}%</div>
                <div style={{ font: '600 9px var(--font-ui)', color: 'rgba(232,237,243,.4)', marginTop: 2 }}>{t('profile.ofGoal')}</div>
              </div>
            </ProgressRing>
          </div>
        </div>
      </div>

      <div className={s.bento}>
        {card('habits', <>
          {arrow}
          {head('checklist', '#6FA0D6', t('profile.habits'), <span style={{ font: '600 11px var(--font-mono)', color: 'rgba(232,237,243,.4)', whiteSpace: 'nowrap' }}>{t('profile.streakAvg', { n: habitsCard.streakAvg })}</span>)}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginTop: 14 }}>
            {habitsCard.types.map((h) => (
              <div key={h.key} style={{ textAlign: 'center' }}>
                <div style={{ font: '700 18px var(--font-mono)' }}>{h.pct}%</div>
                <div style={{ font: '600 10px var(--font-ui)', color: 'rgba(232,237,243,.45)', marginTop: 3 }}>{t(`profile.types.${h.key}`)}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14 }}>{spark(habitsSpark, 220, 34, '#6FA0D6')}</div>
        </>)}
        {card('quit', <>
          {arrow}
          {head('banProfile', '#5FBF9B', t('profile.quits'))}
          <div style={{ display: 'flex', gap: 22, marginTop: 12 }}>
            <Stat v={quitCard.streak} l={t('profile.daysInRow')} color="#5FBF9B" />
            <Stat v={quitCard.best} l={t('profile.bestStreak')} />
            <Stat v={quitCard.relapses} l={t('profile.slips')} color="#D96A5B" />
          </div>
          <div style={{ display: 'flex', gap: 3, marginTop: 16 }}>
            {quitCard.days.map((x, i) => <div key={i} style={{ flex: 1, ...quitDay(x, 22, 5) }} />)}
          </div>
        </>)}
        {card('workouts', <>
          {arrow}
          {head('bolt', '#6FA0D6', t('profile.focus'))}
          <div style={{ display: 'flex', gap: 26, marginTop: 12, alignItems: 'flex-end' }}>
            <Stat v={focusCard.sessions} l={t('profile.sessions')} />
            <Stat v={t.hm(focusCard.bodyMin)} l={t('profile.body')} />
            <Stat v={t.hm(focusCard.mindMin)} l={t('profile.mind')} />
          </div>
          <div style={{ marginTop: 14 }}>{bars(focusCard.history, 200, 34, '#6FA0D6')}</div>
        </>)}
        {card('goals', <>
          {arrow}
          {head('target', '#E8A54B', t('profile.goals'))}
          <div>
            <div style={{ font: '700 30px var(--font-mono)' }}>{goalsCard.active}</div>
            <div style={{ font: '600 10px var(--font-ui)', color: 'rgba(232,237,243,.45)' }}>{t('profile.activeDot')}<span style={mono}>{goalsCard.avgPct}%</span>{t('profile.done')}</div>
          </div>
          <div style={{ font: '600 11px var(--font-ui)', color: '#E8A54B', marginTop: 10 }}>{t.pick(goalsCard.nearestDeadline)}</div>
        </>, { display: 'flex', flexDirection: 'column', justifyContent: 'space-between' })}
        {card('tasks', <>
          {arrow}
          {head('clipboard', '#9B87D6', t('profile.planner'))}
          <div>
            <div style={{ font: '700 30px var(--font-mono)' }}>{plannerCard.pct}%</div>
            <div style={{ font: '600 10px var(--font-ui)', color: 'rgba(232,237,243,.45)' }}><span style={mono}>{plannerCard.done}</span>{t('profile.of')}<span style={mono}>{plannerCard.planned}</span></div>
          </div>
          <div style={{ font: '600 11px var(--font-ui)', color: '#D96A5B', marginTop: 10 }}><span style={mono}>{plannerCard.overdue}</span>{t('profile.overdue')}</div>
        </>, { display: 'flex', flexDirection: 'column', justifyContent: 'space-between' })}
        <div className={s.card} style={{ gridArea: 'heat', borderRadius: 20, padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div>
              <div style={cap(10, '.18em')}>{t('profile.activity')}</div>
              <div style={{ font: '400 11px var(--font-ui)', color: 'rgba(232,237,243,.4)', marginTop: 4 }}>{t('profile.activityDesc')}</div>
            </div>
            <span style={{ font: '600 11px var(--font-mono)', color: 'rgba(232,237,243,.4)', whiteSpace: 'nowrap' }}>{t('profile.series', { n: heatBestStreak })}</span>
          </div>
          <div style={{ marginTop: 14, paddingLeft: 26 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 3, marginBottom: 4 }}>
              {weekLabels.map((w, i) => <div key={i} style={{ font: '600 9px var(--font-mono)', color: 'rgba(232,237,243,.35)' }}>{w}</div>)}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 'none' }}>
                {wdShort.map((w, i) => <div key={i} style={{ height: 11, font: '600 8px var(--font-mono)', color: 'rgba(232,237,243,.3)', display: 'flex', alignItems: 'center' }}>{w}</div>)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gridAutoFlow: 'column', gridAutoRows: 11, gap: 3, flex: 1, gridTemplateRows: 'repeat(7, 11px)' }}>
                {heatLevels.map((l, i) => <div key={i} style={{ borderRadius: 3, background: HEAT_COLORS[l] }} />)}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14, paddingLeft: 26, font: '600 10px var(--font-ui)', color: 'rgba(232,237,243,.4)' }}>
            {t('profile.less')}
            {HEAT_COLORS.map((c) => <span key={c} style={{ width: 10, height: 10, borderRadius: 3, background: c }} />)}
            {t('profile.more')}
          </div>
        </div>
        <div className={s.card} style={{ gridArea: 'achieve', borderRadius: 20, padding: 22 }}>
          <div style={cap(10, '.18em')}>{t('profile.achievements')}</div>
          <Achievements t={t} m={false} />
        </div>
        <div className={s.card} style={{ gridArea: 'corr', position: 'relative', borderRadius: 20, padding: 22, overflow: 'hidden' }}>
          <div style={cap(10, '.18em')}>{t('profile.correlations')}</div>
          <div style={blur}><div style={{ font: '600 14px/1.5 var(--font-ui)', color: '#E8EDF3', marginTop: 14 }}>{t.pick(correlation)}</div></div>
          {!PROFILE_IS_PRO && <Lock t={t} />}
        </div>
        <div className={s.card} style={{ gridArea: 'arc', position: 'relative', borderRadius: 20, padding: 22, overflow: 'hidden' }}>
          <div style={cap(10, '.18em')}>{t('profile.arcCompare')}</div>
          <div style={{ ...blur, display: 'flex', gap: 20, marginTop: 14, alignItems: 'flex-end' }}>
            <div><div style={{ font: '700 22px var(--font-mono)' }}>{arcCompare.current}</div><div style={{ font: '600 10px var(--font-ui)', color: 'rgba(232,237,243,.45)' }}>{t('profile.arcN', { n: 2 })}</div></div>
            <div><div style={{ font: '700 22px var(--font-mono)', color: 'rgba(232,237,243,.5)' }}>{arcCompare.previous}</div><div style={{ font: '600 10px var(--font-ui)', color: 'rgba(232,237,243,.45)' }}>{t('profile.arcN', { n: 1 })}</div></div>
            <div style={{ font: '700 13px var(--font-mono)', color: '#5FBF9B' }}>{t('profile.pts', { d: '+' + arcCompare.delta })}</div>
          </div>
          {!PROFILE_IS_PRO && <Lock t={t} />}
        </div>
      </div>

      <div className={s.card} style={{ marginTop: 16, borderRadius: 20, padding: '24px 26px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={cap(10, '.18em')}>{t('profile.history')}</div>
            <div style={{ font: '800 22px var(--font-ui)', marginTop: 6 }}>{d.value} <span style={{ font: '600 12px var(--font-ui)', color: 'rgba(232,237,243,.45)' }}>{d.status}</span></div>
          </div>
          <Segmented variant="range" value={p.histRange} onChange={p.setHistRange}
            options={(['3m', '6m', '1y'] as HistRange[]).map((id) => ({ id, label: t(`profile.ranges.${id}`) }))} />
        </div>
        <div style={{ marginTop: 18, position: 'relative' }}>
          {spark(hist, 900, 100, '#6FA0D6')}
          <div className={s.tooltip} style={{ left: 900 - 90, top: lastY - 56 }}>
            <div style={{ font: '700 15px var(--font-mono)' }}>{d.value}</div>
            <div style={{ font: '600 10px var(--font-ui)', color: 'rgba(232,237,243,.55)', whiteSpace: 'nowrap' }}>{d.status}</div>
          </div>
        </div>
      </div>

      {!PROFILE_IS_PRO && <ProBanner t={t} />}
      <Recs t={t} m={false} />
    </div>
  );
}

function Stat({ v, l, color }: { v: ReactNode; l: string; color?: string }) {
  return (
    <div>
      <div style={{ font: '700 26px var(--font-mono)', color }}>{v}</div>
      <div style={{ font: '600 10px var(--font-ui)', color: 'rgba(232,237,243,.45)' }}>{l}</div>
    </div>
  );
}

/* ---------------- mobile ---------------- */

function Mobile({ t, p }: { t: T; p: P }) {
  const d = derived(t, p);
  const hist = HIST[p.histRange];
  const mcap = cap(9.5, '.16em', '.45');
  const mcard = (children: ReactNode, extra?: CSSProperties) => (
    <div className={s.card} style={{ position: 'relative', borderRadius: 22, padding: 16, ...extra }}>{children}</div>
  );
  const mhead = (icon: IconName, color: string, label: string, gap = 8) => (
    <div style={{ display: 'flex', alignItems: 'center', gap }}><CardIcon name={icon} color={color} /><span style={{ ...mcap, whiteSpace: 'nowrap' }}>{label}</span></div>
  );
  const small: CSSProperties = { font: '500 10.5px var(--font-ui)', color: 'rgba(232,237,243,.4)', marginTop: 8, whiteSpace: 'nowrap' };
  const monoText = (v: ReactNode, color = '#E8EDF3') => <span style={{ ...mono, color }}>{v}</span>;

  return (
    <>
      <div style={{ flex: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 16px 0' }}>
        <button type="button" className={s.menuBtn} style={{ width: 44, height: 44 }} onClick={() => p.setMenuOpen(!p.menuOpen)}><Icon name="menu" size={18} sw={2} /></button>
        {PROFILE_IS_PRO && <span className={s.proBadge}>{t('profile.proBadge')}</span>}
        <button type="button" className={s.avatarBtn} style={{ width: 36, height: 36, fontSize: 11 }}>{todayStats.initials}</button>
      </div>
      {p.menuOpen && <Menu t={t} m />}

      <div className={s.mobileScroll} data-scroll>
        <div className={s.hero} style={{ background: 'linear-gradient(170deg,rgba(111,160,214,.16),rgba(13,17,22,.9) 70%)', border: '1px solid rgba(168,203,239,.14)', borderRadius: 26, padding: '22px 20px 18px' }}>
          <div className={s.heroGlow} />
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ ...mcap, whiteSpace: 'nowrap' }}>{t('profile.index')}</div>
            <div style={{ marginTop: 14 }}>
              <ProgressRing size={170} r={50} strokeWidth={9} pct={d.value / 1000}>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ font: '800 46px/1 var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{d.value}</div>
                  <div style={{ font: '600 11px var(--font-mono)', color: 'rgba(232,237,243,.4)', marginTop: 4 }}>{t('profile.of1000')}</div>
                </div>
              </ProgressRing>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <span style={{ font: '700 12px var(--font-mono)', color: d.deltaColor, background: 'rgba(95,191,155,.12)', borderRadius: 999, padding: '4px 10px' }}>{d.deltaLabel}</span>
              <span style={{ font: '700 13px var(--font-ui)', color: '#5FBF9B' }}>{d.status}</span>
            </div>
          </div>
          <PeriodSeg t={t} p={p} m />
        </div>

        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 }}>
          {mcard(<>
            <div className={s.arrowM}><Icon name="arrow" size={13} sw={2.2} /></div>
            {mhead('checklist', '#6FA0D6', t('profile.habits'), 9)}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 14 }}>
              <span style={{ font: '700 34px/1 var(--font-mono)' }}>{habitsCard.total}%</span>
              <span style={{ font: '500 12px var(--font-ui)', color: 'rgba(232,237,243,.5)' }}>{t('profile.doneAvgStreak')}<span style={mono}>{habitsCard.streakAvg}</span>{t('profile.days')}</span>
            </div>
            <div style={{ marginTop: 12 }}>{spark(habitsSpark, 320, 40, '#6FA0D6')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 12 }}>
              {habitsCard.types.slice(0, 3).map((h) => (
                <div key={h.key} style={{ background: 'rgba(255,255,255,.04)', borderRadius: 12, padding: '9px 10px' }}>
                  <div style={{ font: '700 15px var(--font-mono)' }}>{h.pct}%</div>
                  <div style={{ font: '600 10px var(--font-ui)', color: 'rgba(232,237,243,.45)', marginTop: 2 }}>{t(`profile.types.${h.key}`)}</div>
                </div>
              ))}
            </div>
          </>, { gridColumn: '1 / -1' })}

          {mcard(<>
            {mhead('banProfile', '#5FBF9B', t('profile.quits'))}
            <div style={{ font: '700 30px/1 var(--font-mono)', color: '#5FBF9B', marginTop: 14 }}>{quitCard.streak}</div>
            <div style={{ font: '500 11px var(--font-ui)', color: 'rgba(232,237,243,.5)', marginTop: 4 }}>{t('profile.daysNoSlip')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginTop: 12 }}>
              {quitCard.days.map((x, i) => <div key={i} style={quitDay(x, 14, 4)} />)}
            </div>
            <div style={small}>{t('profile.record')}{monoText(quitCard.best)}{t('profile.slipsDot')}{monoText(quitCard.relapses, '#D96A5B')}</div>
          </>)}

          {mcard(<>
            {mhead('bolt', '#6FA0D6', t('profile.focus'))}
            <div style={{ font: '700 30px/1 var(--font-mono)', marginTop: 14 }}>{focusCard.sessions}</div>
            <div style={{ font: '500 11px var(--font-ui)', color: 'rgba(232,237,243,.5)', marginTop: 4 }}>{t('profile.sessions')}</div>
            <div style={{ marginTop: 12 }}>{bars(focusCard.history, 140, 30, '#6FA0D6')}</div>
            <div style={small}>{t('profile.bodyDot')}{monoText(t.hm(focusCard.bodyMin))}{t('profile.mindDot')}{monoText(t.hm(focusCard.mindMin))}</div>
          </>)}

          {mcard(<>
            {mhead('target', '#E8A54B', t('profile.goals'))}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 14 }}>
              <span style={{ font: '700 30px/1 var(--font-mono)' }}>{goalsCard.active}</span>
              <span style={{ font: '500 11px var(--font-ui)', color: 'rgba(232,237,243,.5)' }}>{t('profile.active')}</span>
            </div>
            <div className={s.mbar}><div style={{ height: '100%', borderRadius: 3, background: '#E8A54B', width: goalsCard.avgPct + '%' }} /></div>
            <div style={{ font: '500 10.5px var(--font-ui)', color: 'rgba(232,237,243,.45)', marginTop: 8 }}>{monoText(goalsCard.avgPct + '%')}{t('profile.onAverage')}</div>
          </>)}

          {mcard(<>
            {mhead('clipboard', '#9B87D6', t('profile.planner'))}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 14 }}><span style={{ font: '700 30px/1 var(--font-mono)' }}>{plannerCard.pct}%</span></div>
            <div className={s.mbar}><div style={{ height: '100%', borderRadius: 3, background: '#9B87D6', width: plannerCard.pct + '%' }} /></div>
            <div style={{ ...small, color: 'rgba(232,237,243,.45)' }}>{monoText(plannerCard.done + '/' + plannerCard.planned)} · <span style={{ color: '#D96A5B' }}><span style={mono}>{plannerCard.overdue}</span>{t('profile.overdue')}</span></div>
          </>)}

          {mcard(<>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <span style={{ ...mcap, whiteSpace: 'nowrap' }}>{t('profile.activity6')}</span>
              <span style={{ font: '600 10.5px var(--font-ui)', color: 'rgba(232,237,243,.45)', whiteSpace: 'nowrap' }}>{t('profile.seriesPrefix')}{monoText(heatBestStreak, '#A8CBEF')}{t('profile.days')}</span>
            </div>
            <div style={{ font: '400 11.5px/1.45 var(--font-ui)', color: 'rgba(232,237,243,.45)', marginTop: 6 }}>{t('profile.activity6Desc')}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              <div style={{ display: 'grid', gridTemplateRows: 'repeat(7,1fr)', gap: 4, flex: 'none' }}>
                {t.list('weekdays.short').map((w) => <div key={w} style={{ font: '600 8.5px var(--font-mono)', color: 'rgba(232,237,243,.35)', display: 'flex', alignItems: 'center', height: '100%' }}>{w}</div>)}
              </div>
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gridTemplateRows: 'repeat(7,18px)', gridAutoFlow: 'column', gap: 4 }}>
                {heatLevels.slice(0, 42).map((l, i) => <div key={i} style={{ borderRadius: 4, background: HEAT_COLORS[l] }} />)}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginTop: 10, font: '600 10px var(--font-ui)', color: 'rgba(232,237,243,.4)' }}>
              0{HEAT_COLORS.map((c) => <span key={c} style={{ width: 11, height: 11, borderRadius: 3, background: c }} />)}5+
            </div>
          </>, { gridColumn: '1 / -1' })}

          {mcard(<>
            <span style={{ ...mcap, whiteSpace: 'nowrap' }}>{t('profile.correlationWeek')}</span>
            <div style={{ ...blur, font: '700 15px/1.45 var(--font-ui)', color: '#E8EDF3', marginTop: 10, textWrap: 'pretty' } as CSSProperties}>{t.pick(correlation)}</div>
            {!PROFILE_IS_PRO && <Lock t={t} />}
          </>, { gridColumn: '1 / -1', background: 'linear-gradient(160deg,rgba(155,135,214,.16),rgba(13,17,22,.9) 70%)', overflow: 'hidden' })}

          {mcard(<>
            <span style={{ ...mcap, whiteSpace: 'nowrap' }}>{t('profile.arcCompare')}</span>
            <div style={{ ...blur, display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
              {[[2, arcCompare.currentPct, arcCompare.current, '#6FA0D6', undefined], [1, arcCompare.previousPct, arcCompare.previous, 'rgba(168,203,239,.35)', 'rgba(232,237,243,.55)']].map(([n, w, v, c, tc]) => (
                <div key={String(n)} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ font: '600 11px var(--font-ui)', color: 'rgba(232,237,243,.55)', width: 40, flex: 'none' }}>{t('profile.arcN', { n: n as number })}</span>
                  <div style={{ flex: 1, height: 10, borderRadius: 5, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}><div style={{ height: '100%', width: w + '%', borderRadius: 5, background: c as string }} /></div>
                  <span style={{ font: '700 13px var(--font-mono)', width: '3ch', textAlign: 'right', color: tc as string | undefined }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ ...blur, font: '700 12px var(--font-mono)', color: '#5FBF9B', marginTop: 12 }}>{t('profile.pts', { d: '+' + arcCompare.delta })}</div>
            {!PROFILE_IS_PRO && <Lock t={t} />}
          </>, { gridColumn: '1 / -1', overflow: 'hidden' })}

          {mcard(<>
            <span style={{ ...mcap, whiteSpace: 'nowrap' }}>{t('profile.achievements')}</span>
            <Achievements t={t} m />
          </>, { gridColumn: '1 / -1' })}

          {mcard(<>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ ...mcap, whiteSpace: 'nowrap' }}>{t('profile.history')}</span>
              <Segmented variant="rangeSm" value={p.histRange} onChange={p.setHistRange}
                options={(['3m', '6m', '1y'] as HistRange[]).map((id) => ({ id, label: t(`profile.ranges.${id}`) }))} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 12 }}>
              <span style={{ font: '700 24px var(--font-mono)' }}>{d.value}</span>
              <span style={{ font: '600 11px var(--font-ui)', color: '#5FBF9B' }}>{d.status}</span>
            </div>
            <div style={{ marginTop: 10 }}>{spark(hist, 340, 80, '#6FA0D6')}</div>
          </>, { gridColumn: '1 / -1' })}
        </div>

        <Recs t={t} m />
      </div>
    </>
  );
}
