import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppHeader, roman } from '../../app/AppHeader';
import { buildProfile } from '../../data/profile';
import { useHeader } from '../../data/header';
import { EVENT_ICON, eventText, eventWhen, useEvents } from '../../data/events';
import { addDays, daysBetween, indexLogs, isLogged } from '../../data/model';
import { useT, type T } from '../../i18n';
import { isProPlan, useAuth } from '../../lib/auth';
import { isoDay } from '../../lib/day';
import { hasBackend } from '../../lib/supabase';
import { useIsDesktop } from '../../lib/useIsDesktop';
import { HEAT_COLORS } from '../../mock/profile';
import { computeIndex, INDEX_WEIGHTS } from '../../state/compute';
import { computeInsights } from '../../state/insights';
import { activeArc, profileRawOf, useSystem, type SystemRaw } from '../../state/system';
import { Icon, type IconName } from '../../ui/Icon';
import { PageState } from '../../ui/PageState';
import { InfoDialog, Segmented } from '../../ui/primitives';
import { ProModule } from '../../ui/ProModule';
import { useAutoTour } from '../../ui/Tour';
import a from './analytics.module.css';

/*
 * Analytics (Master Changeset section 8, was Profile): the index, the arc, domain cards on one
 * 12-column grid for every screen size, insights, Pro modules folded instead of blurred.
 */
type Period = 'week' | 'month' | 'arc' | 'year';
type Range = '3m' | '6m' | '1y';

export function Analytics() {
  const t = useT();
  const q = useSystem((r) => r);
  const plan = useAuth((x) => x.plan);
  const hd = useHeader();
  const pro = !hasBackend || isProPlan(plan);
  const [period, setPeriod] = useState<Period>('month');
  const [compare, setCompare] = useState(false);
  const [range, setRange] = useState<Range>('6m');
  const [info, setInfo] = useState(false);
  const desktop = useIsDesktop();
  useAutoTour('analytics', !!q.data);
  const data = useMemo(() => {
    const sys = q.data;
    if (!sys) return null;
    const raw = profileRawOf(sys);
    const p = buildProfile(raw, { pro, initials: hd.initials });
    const arc = activeArc(sys);
    const today = isoDay();
    const from = period === 'week' ? addDays(today, -6) : period === 'month' ? addDays(today, -29) : period === 'arc' ? (arc?.started_on ?? addDays(today, -29)) : addDays(today, -364);
    const idx = computeIndex(raw, from, today);
    return { sys, p, arc, idx, insights: computeInsights(sys) };
  }, [q.data, pro, hd.initials, period]);
  if (!data) return <PageState variant="grid" error={q.isError && !q.data} onRetry={() => { void q.refetch(); }} />;
  const { sys, p, arc, idx, insights } = data;
  const cur = p.PERIOD_DATA[period];
  const prev = cur.value - cur.delta;
  const status = cur.value >= 800 ? 'great' : cur.value >= 550 ? 'steady' : 'grow';

  return (
    <div className={a.scroll} data-scroll>
      <div className={a.page}>
        <AppHeader title={t('nav.analytics')} />
        <div className={a.toolbar}>
          <Segmented variant="goals" value={period} onChange={setPeriod}
            options={[{ id: 'week', label: t('analytics.p.week') }, { id: 'month', label: t('analytics.p.month') }, { id: 'arc', label: 'Arc' }, { id: 'year', label: t('analytics.p.year') }]} />
          <button type="button" className={a.chip} aria-pressed={compare} onClick={() => setCompare(!compare)}>{t('analytics.compare')}</button>
          <ExportButton t={t} sys={sys} />
        </div>

        <section className={a.hero}>
          <div className={a.indexBox} data-tour="an-index">
            <button type="button" className={a.q} onClick={() => setInfo(true)}>{t('analytics.indexTitle')} <Icon name="alert" size={12} /></button>
            <div className={a.indexRow}>
              <span className={a.index}>{cur.value}</span>
              <span className={a.delta} data-neg={cur.delta < 0}>{cur.delta >= 0 ? '+' : '−'}{Math.abs(cur.delta)}</span>
            </div>
            <div className={a.status} data-s={status}>{t(`profile.status.${status}`)}</div>
            {compare && <div className={a.prev}>{t('analytics.prevPeriod', { n: prev })}</div>}
          </div>
          <ArcTrack t={t} day={hd.arcDay} len={hd.arcLength} n={arc?.number ?? 1} oath={arc?.oath ?? ''} />
        </section>

        <div className={a.grid}>
          <Card className={a.span6} title={t('profile.habits')} icon="checklist" to="/disciplines">
            <div className={a.big}>{p.habitsCard.total}%<span className={a.small}>{t('analytics.streakAvg', { n: p.habitsCard.streakAvg })}</span></div>
            <Spark vals={p.habitsSpark} />
            <div className={a.domains}>
              {p.habitsCard.types.filter((x) => x.key !== 'total').map((x) => <div key={x.key} className={a.dom}><b>{x.pct}%</b><span>{t(`profile.types.${x.key}`)}</span></div>)}
            </div>
          </Card>
          <Card className={a.span6} title={t('profile.focus')} icon="bolt" to="/">
            <div className={a.big}>{p.focusCard.sessions}<span className={a.small}>{t('analytics.sessions30')}</span></div>
            <Bars vals={p.focusCard.history} />
            <div className={a.meta}>{t('analytics.bestFocusDay', { t: t.hm(bestFocus(sys)), n: bestFocusAgo(sys) })}</div>
          </Card>
          <Card className={a.span4} title={t('profile.quits')} icon="banProfile" to="/disciplines?tab=quits">
            <div className={a.big} style={{ color: 'var(--success)' }}>{p.quitCard.streak}<span className={a.small}>{t('profile.daysNoSlip')}</span></div>
            <div className={a.strip}>{p.quitCard.days.map((x, i) => <i key={i} data-ok={x === 1} />)}</div>
            <div className={a.meta}>{t('analytics.quitMeta', { b: p.quitCard.best, r: p.quitCard.relapses })}</div>
          </Card>
          <Card className={a.span4} title={t('profile.goals')} icon="target" to="/goals">
            <div className={a.big}>{p.goalsCard.active}<span className={a.small}>{t('profile.active')}</span></div>
            <div className={a.bar}><span style={{ width: p.goalsCard.avgPct + '%' }} /></div>
            <div className={a.meta}>{t.pick(p.goalsCard.nearestDeadline) || t('analytics.noDeadline')}</div>
          </Card>
          <Card className={a.span4} title={t('profile.planner')} icon="clipboard" to="/planner">
            <div className={a.big}>{p.plannerCard.pct}%<span className={a.small}>{p.plannerCard.done}/{p.plannerCard.planned}</span></div>
            <div className={a.bar}><span style={{ width: p.plannerCard.pct + '%' }} /></div>
            <div className={a.meta}>{t('analytics.overdue', { n: p.plannerCard.overdue })}</div>
          </Card>

          <Card className={a.span12} title={t('profile.activity6')} icon="cal">
            <div className={a.heat} data-weeks={desktop ? 12 : 6}>
              {p.heatLevels.slice(desktop ? 0 : 42).map((l, i) => <i key={i} style={{ background: HEAT_COLORS[l] }} />)}
            </div>
            <div className={a.meta}>{t('analytics.heatBest', { n: p.heatBestStreak })}</div>
          </Card>

          <Card className={a.span6} title={t('analytics.insights')} icon="spark">
            {insights.length === 0 ? <div className={a.meta}>{t('analytics.noInsights')}</div> : (
              <div className={a.insights}>
                {(pro ? insights : insights.slice(0, 1)).map((x) => (
                  <div key={x.id} className={a.insight}>
                    <span>{t(x.text.key as never, x.text.vars)}</span>
                    {x.action && <Link to={x.action.to} className={a.insightAct}>{t(x.action.key as never)}</Link>}
                  </div>
                ))}
                {!pro && insights.length > 1 && <div className={a.meta}>{t('analytics.moreInPro', { n: insights.length - 1 })}</div>}
              </div>
            )}
          </Card>
          <Card className={a.span6} title={t('events.title')} icon="pulse">
            <Activity t={t} />
          </Card>
          <Card className={a.span12} title={t('profile.achievements')} icon="trophy">
            <div className={a.ach}>
              {p.achievements.map((x, i) => (
                <div key={i} className={a.achItem} data-on={x.unlocked}>
                  <Icon name={x.icon} size={16} />
                  <span className={a.achName}>{t.pick(x.label)}</span>
                  <span className={a.achProg}>{x.unlocked ? '✓' : x.progress}</span>
                </div>
              ))}
            </div>
          </Card>

          {pro ? (
            <Card className={a.span6} title={t('profile.correlationWeek')} icon="pulse">
              <div className={a.corr}>{correlationText(t, insights) ?? t('analytics.corrWait')}</div>
            </Card>
          ) : (
            <ProModule className={a.span6} title={t('profile.correlationWeek')} line={t('analytics.corrLine')}
              demo={<div className={a.corr}>{t('analytics.corrExample')}</div>} />
          )}
          {pro ? (
            <Card className={a.span6} title={t('profile.arcCompare')} icon="archive">
              <CompareBars t={t} p={p} />
            </Card>
          ) : (
            <ProModule className={a.span6} title={t('profile.arcCompare')} line={t('analytics.arcLine')}
              demo={<CompareBars t={t} p={{ ...p, arcCompare: { current: 742, previous: 690, delta: 52, currentPct: 74, previousPct: 69, currentN: 2, previousN: 1 } }} />} />
          )}

          <Card className={a.span12} title={t('profile.history')} icon="pulse"
            right={<Segmented variant="rangeSm" value={range} onChange={setRange} options={(['3m', '6m', '1y'] as Range[]).map((id) => ({ id, label: t(`profile.ranges.${id}`) }))} />}>
            <History vals={p.HIST[range]} />
          </Card>
        </div>
      </div>
      <InfoDialog open={info} title={t('analytics.indexTitle')} okLabel={t('common.ok')} onClose={() => setInfo(false)} body={(
        <>
          <span>{t('analytics.indexBody')}</span>
          <span className={a.parts}>
            {(Object.keys(INDEX_WEIGHTS) as (keyof typeof INDEX_WEIGHTS)[]).map((k) => (
              <span key={k} className={a.part}>
                <span>{t(`cockpit.parts.${k}`)} · {INDEX_WEIGHTS[k]}</span>
                <span className={a.partBar}><span style={{ width: (idx.parts[k] ?? 0) * 100 + '%', opacity: idx.parts[k] == null ? 0.3 : 1 }} /></span>
                <span>{idx.parts[k] == null ? '—' : Math.round((idx.parts[k] ?? 0) * INDEX_WEIGHTS[k])}</span>
              </span>
            ))}
          </span>
        </>
      )} />
    </div>
  );
}

function Activity({ t }: { t: T }) {
  const q = useEvents();
  const list = (q.data ?? []).slice(0, 8);
  if (!list.length) return <div className={a.meta}>{t('events.empty')}</div>;
  return (
    <ul className={a.feed}>
      {list.map((e) => (
        <li key={e.id}><Icon name={EVENT_ICON[e.domain] ?? 'check'} size={13} /><span className={a.feedText}>{eventText(t, e)}</span><span className={a.feedWhen}>{eventWhen(t, e.at)}</span></li>
      ))}
    </ul>
  );
}

function Card({ className, title, icon, to, right, children }: { className: string; title: string; icon: IconName; to?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={`${a.card} ${className}`}>
      <div className={a.cardHead}>
        <span className={a.cardTitle}><Icon name={icon} size={14} />{title}</span>
        {right}
        {to && <Link to={to} className={a.arrow} aria-label={title}><Icon name="arrow" size={12} sw={2.2} /></Link>}
      </div>
      {children}
    </section>
  );
}

function ArcTrack({ t, day, len, n, oath }: { t: T; day: number; len: number; n: number; oath: string }) {
  const [open, setOpen] = useState(false);
  const pt = (f: number) => { const ang = Math.PI * (1 - f); return [60 + 50 * Math.cos(ang), 60 - 50 * Math.sin(ang)]; };
  const [x, y] = pt(Math.min(1, day / len));
  const large = 0;
  return (
    <button type="button" className={a.arc} onClick={() => setOpen(true)} aria-label={t('arc.oathTitle')}>
      <svg viewBox="0 0 120 66" className={a.arcSvg} aria-hidden="true">
        <path d="M10 60 A50 50 0 0 1 110 60" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="5" strokeLinecap="round" />
        <path d={`M10 60 A50 50 0 ${large} 1 ${x.toFixed(2)} ${y.toFixed(2)}`} fill="none" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
        {[30, 60, 90].map((c) => { const [cx, cy] = pt(c / len); return <circle key={c} cx={cx} cy={cy} r="2.4" fill={day >= c ? '#FFFFFF' : 'rgba(255,255,255,.35)'} />; })}
        <circle cx={x} cy={y} r="5" fill="#FFFFFF" stroke="var(--c-on)" strokeWidth="2.5" />
      </svg>
      <span className={a.arcLabel}>Arc {roman(n)} · {t('analytics.dayOf', { d: day, l: len })}</span>
      <span className={a.oath}>{oath ? `«${oath}»` : t('arc.noOathShort')}</span>
      <InfoDialog open={open} title={t('arc.oathTitle')} okLabel={t('common.ok')} onClose={() => setOpen(false)}
        body={<>{oath ? <span style={{ fontStyle: 'italic' }}>«{oath}»</span> : t('arc.noOath')}<br /><br />{t('analytics.arcCheckpoints', { d: day, l: len })}</>} />
    </button>
  );
}

function Spark({ vals }: { vals: number[] }) {
  const max = Math.max(1, ...vals);
  return (
    <svg className={a.spark} viewBox={`0 0 ${Math.max(1, vals.length - 1)} 10`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={vals.map((v, i) => `${i},${10 - (v / max) * 9}`).join(' ')} fill="none" stroke="var(--c-on)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
function Bars({ vals }: { vals: number[] }) {
  const max = Math.max(1, ...vals);
  return <div className={a.bars} aria-hidden="true">{vals.map((v, i) => <i key={i} style={{ height: Math.max(4, (v / max) * 100) + '%' }} data-last={i === vals.length - 1} />)}</div>;
}
function History({ vals }: { vals: number[] }) {
  const max = Math.max(1000, ...vals), min = Math.min(0, ...vals);
  return (
    <svg className={a.history} viewBox={`0 0 ${Math.max(1, vals.length - 1)} 100`} preserveAspectRatio="none" role="img" aria-label={vals.join(', ')}>
      <polyline points={vals.map((v, i) => `${i},${100 - ((v - min) / (max - min)) * 96}`).join(' ')} fill="none" stroke="var(--c-on)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
function CompareBars({ t, p }: { t: T; p: ReturnType<typeof buildProfile> }) {
  const c = p.arcCompare;
  return (
    <div className={a.compare}>
      {[[c.currentN, c.current, 'var(--accent)'], [c.previousN, c.previous, 'rgba(255,255,255,.25)']].map(([n, v, col]) => (
        <div key={String(n) + col} className={a.cmpRow}>
          <span>Arc {roman(Number(n))}</span>
          <span className={a.cmpTrack}><span style={{ width: (Number(v) / 10) + '%', background: String(col) }} /></span>
          <b>{v}</b>
        </div>
      ))}
      <div className={a.meta}>{t('profile.pts', { d: (c.delta >= 0 ? '+' : '') + c.delta })}</div>
    </div>
  );
}
function correlationText(t: T, ins: ReturnType<typeof computeInsights>) {
  const c = ins.find((x) => x.kind === 'correlation');
  return c ? t(c.text.key as never, c.text.vars) : null;
}
function bestFocus(sys: SystemRaw) {
  const by = new Map<string, number>();
  for (const f of sys.focus) if (f.completed) { const d = isoDay(new Date(f.started_at)); by.set(d, (by.get(d) ?? 0) + f.minutes); }
  return Math.max(0, ...by.values());
}
function bestFocusAgo(sys: SystemRaw) {
  const by = new Map<string, number>();
  for (const f of sys.focus) if (f.completed) { const d = isoDay(new Date(f.started_at)); by.set(d, (by.get(d) ?? 0) + f.minutes); }
  let best = '', m = 0;
  for (const [d, v] of by) if (v > m) { m = v; best = d; }
  return best ? daysBetween(best, isoDay()) : 0;
}

/* Export (section 8): a CSV of daily checks, or print / save as PDF. */
function ExportButton({ t, sys }: { t: T; sys: SystemRaw }) {
  const [open, setOpen] = useState(false);
  const csv = () => {
    const ix = indexLogs(sys.logs);
    const habits = sys.habits.filter((h) => !h.archived_at);
    const days = [...new Set(sys.logs.map((l) => l.day))].sort();
    const rows = [['day', ...habits.map((h) => `"${h.name.replace(/"/g, '""')}"`), 'mood'].join(',')];
    for (const d of days) rows.push([d, ...habits.map((h) => (isLogged(ix, h.id, d) ? 1 : 0)), sys.days.find((x) => x.day === d)?.mood ?? ''].join(','));
    const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' }));
    const el = document.createElement('a');
    el.href = url; el.download = `veyrarc-${isoDay()}.csv`; el.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setOpen(false);
  };
  return (
    <div className={a.exportWrap}>
      <button type="button" className={a.chip} aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="download" size={13} />{t('analytics.export')}</button>
      {open && (
        <div className={a.menu} role="menu">
          <button type="button" role="menuitem" onClick={csv}>CSV</button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); window.print(); }}>PDF</button>
        </div>
      )}
    </div>
  );
}
