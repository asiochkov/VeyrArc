import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppHeader, roman } from '../../app/AppHeader';
import { useAddAction } from '../../app/nav';
import { useT, type T } from '../../i18n';
import { pendingRecap } from '../../lib/maintenance';
import type { TodayHabit } from '../../mock/today';
import { logHabit, logMood, saveFreeze } from '../../state/actions';
import { INDEX_WEIGHTS, periodOf, type NowAction } from '../../state/compute';
import { pomo, usePomodoro, fmtClock, remaining } from '../../state/pomodoro';
import { Icon } from '../../ui/Icon';
import { PageState } from '../../ui/PageState';
import { InfoDialog, MoodFace, ProgressRing } from '../../ui/primitives';
import { toast } from '../../ui/toast';
import { EveningReview } from './EveningReview';
import { OathSheet } from '../../ui/OathSheet';
import { useAutoTour } from '../../ui/Tour';
import { HabitRow, isDone } from './HabitRow';
import c from './cockpit.module.css';
import { dismissRecovery, useToday, type TodayData } from './useToday';

/*
 * Today — the cockpit of the day (Master Changeset section 4). One layout for desktop and
 * mobile: main column (arc ribbon → score + Now Card → Core → Extra → focus & mood → planner)
 * and a side panel of secondary stats (a collapsible «Статистика» block on mobile).
 */
export function Today() {
  const t = useT();
  const st = useToday();
  const [review, setReview] = useState(false);
  const [oath, setOath] = useState(false);
  const setHandler = useAddAction((x) => x.setHandler);
  useEffect(() => { setHandler(null); return () => setHandler(null); }, [setHandler]);
  // an arc has just ended: its Recap comes first (Master Changeset F14)
  const navigate = useNavigate();
  useEffect(() => {
    const go = () => { const id = pendingRecap(); if (id) navigate(`/arc/recap/${id}?end=1`); };
    go();
    window.addEventListener('veyrarc:recap', go);
    return () => window.removeEventListener('veyrarc:recap', go);
  }, [navigate]);

  useAutoTour('today', !!st.data);

  if (!st.ready || !st.data) return <PageState error={st.loadError} onRetry={st.retry} />;
  const d = st.data;
  return (
    <div className={c.scroll} data-scroll>
      <div className={c.layout}>
        <div className={c.main}>
          <AppHeader />
          <ArcRibbon t={t} d={d} />
          {d.recovery && <RecoveryBanner t={t} rec={d.recovery} />}
          <section className={c.hero} aria-label={t('cockpit.heroLabel')}>
            <TodayScore t={t} d={d} />
            <NowCard t={t} d={d} onReview={() => setReview(true)} onOath={() => setOath(true)} />
          </section>
          <HabitSection t={t} d={d} core />
          <HabitSection t={t} d={d} core={false} />
          <div className={c.secondary}>
            <PomodoroEntry t={t} d={d} />
            <MoodEntry t={t} d={d} />
          </div>
          <PlannerStrip t={t} d={d} />
        </div>
        <SidePanel t={t} d={d} />
      </div>
      <EveningReview open={review} onClose={() => setReview(false)} />
      <OathSheet open={oath} onClose={() => setOath(false)} arcId={d.arc?.id ?? null} current={d.arc?.oath ?? ''} />
    </div>
  );
}

/* ---------------- arc ribbon: the week + the whole arc ---------------- */

function ArcRibbon({ t, d }: { t: T; d: TodayData }) {
  const [info, setInfo] = useState<'streak' | 'freeze' | null>(null);
  const dows = t.list('weekdays.short');
  const arcDay = d.view.stats.arcDay, arcLen = d.view.stats.arcLength;
  return (
    <section className={c.ribbon} aria-label={t('cockpit.week')}>
      <div className={c.week}>
        {d.week.map((w, i) => (
          <div key={w.day} className={c.dayCol}>
            <span className={c.dayDot} data-s={w.status} data-today={w.day === d.day} aria-label={`${dows[i]}: ${t(`cockpit.status.${w.status}`)}`}>
              {w.status === 'earned' && <Icon name="check" size={12} sw={3} />}
              {w.status === 'frozen' && <Icon name="snowSm" size={12} />}
            </span>
            <span className={c.dayLab} data-today={w.day === d.day}>{dows[i]}</span>
          </div>
        ))}
      </div>
      <div className={c.ribbonRow}>
        <div className={c.arcBar} role="progressbar" aria-valuenow={arcDay} aria-valuemin={1} aria-valuemax={arcLen} aria-label={t('cockpit.arcProgress')}>
          <span style={{ width: (arcDay / arcLen) * 100 + '%' }} />
          {[30, 60].map((m) => <i key={m} style={{ left: (m / arcLen) * 100 + '%' }} data-passed={arcDay >= m} />)}
        </div>
        <span className={c.arcDay}>{arcDay}/{arcLen}</span>
        <button type="button" className={c.chip} onClick={() => setInfo('streak')} aria-label={t('cockpit.streakInfo')}>
          <span className={c.chipNum}>{d.view.stats.streak}</span>{t('cockpit.streakShort')}
        </button>
        <button type="button" className={c.chip} onClick={() => setInfo('freeze')} aria-label={t('explain.freezeTitle')}>
          <Icon name="snowSm" size={12} />{d.freezes.used}/{d.freezes.allowed}
        </button>
      </div>
      <InfoDialog open={info === 'streak'} title={t('cockpit.streakTitle')} body={t('cockpit.streakBody')} okLabel={t('common.ok')} onClose={() => setInfo(null)} />
      <InfoDialog open={info === 'freeze'} title={t('explain.freezeTitle')} body={t('cockpit.freezeBody', { n: d.freezes.allowed })} okLabel={t('common.ok')} onClose={() => setInfo(null)} />
    </section>
  );
}

/* ---------------- recovery after a missed day (RC-9) ---------------- */

function RecoveryBanner({ t, rec }: { t: T; rec: { day: string; left: number } }) {
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  if (gone) return null;
  const close = () => { dismissRecovery(rec.day); setGone(true); };
  const freeze = async () => {
    setBusy(true);
    const ok = await saveFreeze(rec.day);
    setBusy(false);
    if (ok) { toast.success(t('cockpit.recoverySaved')); close(); } else toast.error(t('cockpit.recoveryFailed'));
  };
  return (
    <div className={c.recovery} role="status">
      <span className={c.recoveryText}>{rec.left > 0 ? t('cockpit.recoveryAsk') : t('cockpit.recoveryNone')}</span>
      {rec.left > 0 && <button type="button" className={c.recoveryBtn} disabled={busy} onClick={() => { void freeze(); }}><Icon name="snowSm" size={13} />{t('cockpit.recoveryUse', { n: rec.left })}</button>}
      <button type="button" className={c.iconBtn} onClick={close} aria-label={t('common.close')}><Icon name="close" size={13} sw={2} /></button>
    </div>
  );
}

/* ---------------- Today Score (RC-1) ---------------- */

function TodayScore({ t, d }: { t: T; d: TodayData }) {
  const [info, setInfo] = useState(false);
  const { score, delta, parts, index } = d.score;
  const color = score >= 100 ? 'var(--success)' : score >= 50 ? 'var(--accent)' : '#8A9AAF';
  return (
    <div className={c.scoreBox} data-tour="today-score">
      <button type="button" className={c.scoreBtn} onClick={() => setInfo(true)} aria-label={t('cockpit.scoreInfo')}>
        <ProgressRing size={120} r={52} strokeWidth={8} pct={score / 100} color={color}>
          <div className={c.scoreInner}>
            <span className={c.scoreNum}>{score}</span>
            <span className={c.scoreCap}>{t('cockpit.today')}</span>
          </div>
        </ProgressRing>
      </button>
      <div className={c.scoreDelta} data-neg={delta < 0}>{t('cockpit.contribution', { d: (delta >= 0 ? '+' : '−') + Math.abs(delta) })}</div>
      <InfoDialog open={info} title={t('cockpit.scoreTitle')} okLabel={t('common.ok')} onClose={() => setInfo(false)} body={(
        <>
          <span>{t('cockpit.scoreBody', { i: index })}</span>
          <span className={c.parts}>
            {(Object.keys(INDEX_WEIGHTS) as (keyof typeof INDEX_WEIGHTS)[]).map((k) => (
              <span key={k} className={c.part}>
                <span className={c.partName}>{t(`cockpit.parts.${k}`)} · {INDEX_WEIGHTS[k] / 10}%</span>
                <span className={c.partBar}><span style={{ width: (parts[k] ?? 0) * 100 + '%', opacity: parts[k] == null ? 0.3 : 1 }} /></span>
                <span className={c.partVal}>{parts[k] == null ? '—' : Math.round((parts[k] ?? 0) * 100) + '%'}</span>
              </span>
            ))}
          </span>
        </>
      )} />
    </div>
  );
}

/* ---------------- Now Card (RC-13) ---------------- */

function NowCard({ t, d, onReview, onOath }: { t: T; d: TodayData; onReview: () => void; onOath: () => void }) {
  const navigate = useNavigate();
  const a = d.action;
  const period = periodOf();
  const key = a.kind + ('habit' in a ? a.habit.id : 'event' in a ? a.event.id : '');
  const doHabit = (a: Extract<NowAction, { kind: 'habit' }>) => {
    const h = d.habits.find((x) => x.id === a.habit.id);
    if (!h) return;
    navigator.vibrate?.(15);
    if (h.type === 'binary') logHabit(h.id, 1, true);
    else if (h.type === 'counter') logHabit(h.id, h.count + 1, h.count + 1 >= h.goal);
    else pomo.openSheet({ habitId: h.id, label: t.pick(h.title) });
  };
  let call: string, sub: string | null = null, cta: { label: string; run: () => void } | null = null;
  switch (a.kind) {
    case 'oath':
      call = a.oath ? `«${a.oath}»` : t('cockpit.now.oathEmpty');
      sub = t('cockpit.now.oathSub', { n: roman(d.arc?.number ?? 1) });
      cta = { label: a.oath ? t('cockpit.now.oathEdit') : t('cockpit.now.oathWrite'), run: onOath };
      break;
    case 'event':
      call = a.event.title;
      sub = t('cockpit.now.eventIn', { m: a.inMin, t: a.event.starts_at?.slice(0, 5) ?? '' });
      cta = a.event.focus
        ? { label: t('cockpit.now.focus'), run: () => pomo.openSheet({ eventId: a.event.id, label: a.event.title }) }
        : { label: t('cockpit.now.open'), run: () => navigate('/planner') };
      break;
    case 'habit': {
      const h = d.habits.find((x) => x.id === a.habit.id);
      call = a.habit.name;
      sub = a.core ? t('cockpit.now.coreSub') : t('cockpit.now.habitSub');
      cta = { label: h?.type === 'counter' ? '+1' : h?.type === 'duration' ? t('cockpit.now.startTimer') : t('cockpit.now.done'), run: () => doHabit(a) };
      break;
    }
    case 'review':
      call = t('cockpit.now.reviewCall');
      sub = t('cockpit.now.reviewSub', { s: d.view.stats.streak });
      cta = { label: t('cockpit.now.review'), run: onReview };
      break;
    case 'tomorrow':
      call = t('cockpit.now.tomorrow', { t: a.event.starts_at?.slice(0, 5) ?? '', x: a.event.title });
      sub = t('cockpit.now.closedSub', { s: d.view.stats.streak });
      break;
    default:
      call = t('cockpit.now.closed');
      sub = t('cockpit.now.closedSub', { s: d.view.stats.streak });
  }
  return (
    <div className={c.now} aria-live="polite" data-tour="today-now">
      <div key={key} className={c.nowInner}>
        <span className={c.period}>{t(`cockpit.period.${period}`)}</span>
        <div className={c.nowCall}>{call}</div>
        {sub && <div className={c.nowSub}>{sub}</div>}
        {cta && <button type="button" className={c.primary} onClick={cta.run}>{cta.label}</button>}
      </div>
    </div>
  );
}

/* ---------------- Core / Extra habits (RC-4) ---------------- */

function HabitSection({ t, d, core }: { t: T; d: TodayData; core: boolean }) {
  const list = d.habits.filter((h) => h.core === core);
  const allDone = list.length > 0 && list.every(isDone);
  const [open, setOpen] = useState(!(allDone && !core));
  useEffect(() => { if (!core) setOpen(!allDone); }, [allDone, core]);
  const navigate = useNavigate();
  if (!list.length && !core) return null;
  const doneN = list.filter(isDone).length;
  return (
    <section className={c.section} aria-label={core ? 'Core' : 'Extra'} data-tour={core ? 'today-core' : undefined}>
      <button type="button" className={c.secHead} onClick={() => !core && setOpen(!open)} aria-expanded={core ? undefined : open} disabled={core}>
        <span className={c.secTitle}>{core ? 'CORE' : 'EXTRA'}</span>
        <span className={c.secCount}>{t('cockpit.countOf', { a: doneN, b: list.length })}</span>
        <span className={c.secHint}>{core ? t('cockpit.coreHint') : allDone ? t('cockpit.extraDone') : t('cockpit.extraHint')}</span>
        {!core && <span className={c.secChevron} data-open={open}><Icon name="chevronDown" size={14} sw={2} /></span>}
      </button>
      {core && !list.length && (
        <div className={c.empty}>
          <span>{t('cockpit.noCore')}</span>
          <button type="button" className={c.linkBtn} onClick={() => navigate('/disciplines')}>{t('cockpit.chooseCore')}</button>
        </div>
      )}
      {open && <div className={c.rows}>{list.map((h) => <HabitItem key={h.id} h={h} />)}</div>}
    </section>
  );
}

/** One habit on Today; a duration habit keeps its own ticking timer so only this row re-renders. */
function HabitItem({ h }: { h: TodayHabit & { core: boolean } }) {
  const [flash, setFlash] = useState(false);
  const [timer, setTimer] = useState<{ endsAt: number | null; left: number; started: boolean }>({ endsAt: null, left: h.type === 'duration' ? h.left : 0, started: false });
  const tm = useRef<ReturnType<typeof setTimeout>>();
  const pulse = () => { setFlash(true); clearTimeout(tm.current); tm.current = setTimeout(() => setFlash(false), 400); };
  useEffect(() => () => clearTimeout(tm.current), []);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!timer.endsAt) return;
    const id = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [timer.endsAt]);
  const left = timer.endsAt ? Math.max(0, Math.round((timer.endsAt - Date.now()) / 1000)) : timer.left;
  useEffect(() => {
    if (h.type === 'duration' && timer.endsAt && left === 0) {
      setTimer({ endsAt: null, left: 0, started: false });
      pulse(); navigator.vibrate?.(15);
      logHabit(h.id, h.minutes, true);
    }
  }, [left, timer.endsAt, h]);
  const view: TodayHabit = h.type === 'duration' ? { ...h, left: isDone(h) ? 0 : left, running: !!timer.endsAt, started: timer.started } : h;
  return (
    <HabitRow h={view} flash={flash} mobile
      onToggle={() => { if (h.type !== 'binary') return; if (!h.checked) { navigator.vibrate?.(15); pulse(); } logHabit(h.id, h.checked ? 0 : 1, !h.checked); }}
      onInc={() => { if (h.type !== 'counter' || h.count >= h.goal) return; const n = h.count + 1; if (n >= h.goal) { pulse(); navigator.vibrate?.(15); } logHabit(h.id, n, n >= h.goal); }}
      onDec={() => { if (h.type !== 'counter') return; const n = Math.max(0, h.count - 1); logHabit(h.id, n, n >= h.goal); }}
      onPlay={() => { if (isDone(view)) return; setTimer((x) => (x.endsAt ? { endsAt: null, left, started: true } : { endsAt: Date.now() + left * 1000, left, started: true })); }}
      onStop={() => { setTimer({ endsAt: null, left: h.type === 'duration' ? h.minutes * 60 : 0, started: false }); logHabit(h.id, 0, false); }} />
  );
}

/* ---------------- focus + mood ---------------- */

function PomodoroEntry({ t, d }: { t: T; d: TodayData }) {
  const st = usePomodoro();
  const running = !!st.endsAt;
  return (
    <div className={c.card}>
      <div className={c.cardHead}><span className={c.cardTitle}>{t('pomo.title')}</span><span className={c.cardMeta}>{t('pomo.todaySummary', { n: d.focusToday.sessions, t: t.hm(d.focusToday.minutes) })}</span></div>
      <button type="button" className={c.focusRow} onClick={() => pomo.openSheet()}>
        <span className={c.focusClock}>{running ? fmtClock(remaining(st)) : t('pomo.entry', { m: st.lengths[0] })}</span>
        <span className={c.focusFor}>{st.link.label ?? t('pomo.noLink')}</span>
      </button>
      <button type="button" className={c.primary} onClick={() => (running ? pomo.openSheet() : pomo.start())}>{running ? t('pomo.expand') : t('pomo.start')}</button>
    </div>
  );
}

function MoodEntry({ t, d }: { t: T; d: TodayData }) {
  const words = t.list('today.moodWords');
  const sel = d.todayMood == null ? null : d.todayMood - 1;
  return (
    <div className={c.card}>
      <div className={c.cardHead}><span className={c.cardTitle}>{t('today.mood')}</span><span className={c.cardMeta}>{sel == null ? t('cockpit.moodAsk') : words[sel]}</span></div>
      <div className={c.moods}>
        {[0, 1, 2, 3, 4].map((i) => (
          <button key={i} type="button" className={c.moodBtn} aria-pressed={sel === i} aria-label={words[i]} onClick={() => { navigator.vibrate?.(10); logMood(sel === i ? null : i); }}>
            <MoodFace level={i} color={sel === i ? '#A8CBEF' : 'rgba(232,237,243,.45)'} />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- planner strip (±6 h) ---------------- */

function PlannerStrip({ t, d }: { t: T; d: TodayData }) {
  const nowHm = new Date().toTimeString().slice(0, 5);
  return (
    <section className={c.section} aria-label={t('today.planner')}>
      <div className={c.secHead} data-static>
        <span className={c.secTitle}>{t('cockpit.plannerTitle')}</span>
        <Link to="/planner" className={c.secLink}>{t('today.openPlanner')}</Link>
      </div>
      {d.strip.length === 0 ? <div className={c.empty}><span>{t('cockpit.plannerEmpty')}</span></div> : (
        <div className={c.strip}>
          {d.strip.map((p) => {
            const cur = !!p.starts_at && p.starts_at.slice(0, 5) <= nowHm && (p.ends_at ?? p.starts_at).slice(0, 5) > nowHm;
            return (
              <Link key={p.id} to="/planner" className={c.stripItem} data-now={cur} data-done={p.done}>
                <span className={c.stripTime}>{p.starts_at ? p.starts_at.slice(0, 5) : '—'}</span>
                <span className={c.stripTitle}>{p.focus && <Icon name="bolt" size={12} />}{p.title}</span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ---------------- side panel: secondary stats (P1 plane) ---------------- */

function SidePanel({ t, d }: { t: T; d: TodayData }) {
  const s = d.view.stats;
  const body = (
    <div className={c.sideBody}>
      <div className={c.stat}>
        <span className={c.statLab}>{t('today.streak')}</span>
        <span className={c.statBig}>{s.streak}</span>
        <span className={c.statSub}>{t('cockpit.record', { n: s.streakRecord })}</span>
      </div>
      <div className={c.stat}>
        <span className={c.statLab}>{t('today.focusHours')}</span>
        <span className={c.statBig}>{t.hm(s.focusTodayMin)}</span>
        <div className={c.bars} aria-hidden="true">{s.focusBars.map((v, i) => <i key={i} style={{ height: v + '%' }} data-last={i === 6} />)}</div>
      </div>
      <div className={c.stat}>
        <span className={c.statLab}>{t('today.personalBest')}</span>
        <span className={c.statSub}>{s.bestFocusDayMin ? t('cockpit.bestFocus', { t: t.hm(s.bestFocusDayMin), n: s.bestFocusDaysAgo }) : t('cockpit.noBest')}</span>
      </div>
      <Link to="/analytics" className={c.secLink}>{t('cockpit.toAnalytics')}</Link>
    </div>
  );
  return (
    <aside className={c.side} aria-label={t('cockpit.stats')}>
      <details className={c.sideDetails}>
        <summary className={c.sideSummary}>{t('cockpit.stats')}<Icon name="chevronDown" size={14} sw={2} /></summary>
        {body}
      </details>
      <div className={c.sideDesktop}>{body}</div>
    </aside>
  );
}
