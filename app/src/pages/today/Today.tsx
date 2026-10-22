import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { roman, AvatarMenu } from '../../app/AppHeader';
import { useAdd, useAddAction } from '../../app/nav';
import { track, trackEver } from '../../lib/analytics';
import { useHeader } from '../../data/header';
import { useT, type T } from '../../i18n';
import { useAuth } from '../../lib/auth';
import { pendingRecap } from '../../lib/maintenance';
import type { TodayHabit } from '../../mock/today';
import { logHabit, logMood, saveEvent, saveFreeze } from '../../state/actions';
import { addDays } from '../../data/model';
import { INDEX_WEIGHTS, periodOf, type NowAction } from '../../state/compute';
import { pomo, usePomodoro, fmtClock, remaining } from '../../state/pomodoro';
import { Icon, type IconName } from '../../ui/Icon';
import { PageState } from '../../ui/PageState';
import { InfoDialog, MoodFace } from '../../ui/primitives';
import { toast } from '../../ui/toast';
import { OathSheet } from '../../ui/OathSheet';
import { ArcTrail } from '../../ui/ArcTrail';
import { useAutoTour } from '../../ui/Tour';
import { Comeback } from './Comeback';
import { PushHint } from './PushHint';
import { reviewDue, weekFocus, WeeklyReview } from './WeeklyReview';
import { getSystem, useSystem } from '../../state/system';
import { Milestone, MILESTONES, milestoneSeen } from './Milestone';
import { haptic } from '../../lib/haptics';
import { EveningReview } from './EveningReview';
import { isDone } from './HabitRow';
import c from './cockpit.module.css';
import h from './home.module.css';
import { dismissLighten, dismissRecovery, useToday, type TodayData } from './useToday';

/*
 * Today as a smart-home dashboard (style reference: Nothing home UI).
 * A dense two-column grid of tiles. Dark tiles are «off»; a tile switches to light when
 * its thing is «on» — the score, what to do now, a habit done today, focus running.
 * Icons sit in round buttons, text is thin and quiet, status lines use «·».
 */
type HabitT = TodayHabit & { core: boolean; hue?: string };
type Filter = 'all' | 'core' | 'extra';

export function Today() {
  const t = useT();
  const st = useToday();
  // the evening summary push opens the day review (/?review=1)
  const [review, setReview] = useState(() => new URLSearchParams(location.search).get('review') === '1');
  // the weekly review: offered on its own on Sunday evening / Monday morning, or asked for («итоги недели»)
  const [week, setWeek] = useState(false);
  useEffect(() => { const on = () => setWeek(true); window.addEventListener('veyrarc:week', on); return () => window.removeEventListener('veyrarc:week', on); }, []);
  useEffect(() => { if (st.data && reviewDue(getSystem())) { const id = setTimeout(() => setWeek(true), 1200); return () => clearTimeout(id); } }, [!!st.data]); // eslint-disable-line react-hooks/exhaustive-deps
  // «итоги дня» said to the assistant
  useEffect(() => { const on = () => setReview(true); window.addEventListener('veyrarc:review', on); return () => window.removeEventListener('veyrarc:review', on); }, []);
  const [oath, setOath] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const setHandler = useAddAction((x) => x.setHandler);
  useEffect(() => { setHandler(null); return () => setHandler(null); }, [setHandler]);
  const navigate = useNavigate();
  // home-screen shortcut «Фокус» (/?focus=1)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('focus') !== '1') return;
    pomo.openSheet();
    navigate('/', { replace: true });
  }, [navigate]);
  // an arc has just ended: its Recap comes first (Master Changeset F14)
  useEffect(() => {
    const go = () => { const id = pendingRecap(); if (id) navigate(`/arc/recap/${id}?end=1`); };
    go();
    window.addEventListener('veyrarc:recap', go);
    return () => window.removeEventListener('veyrarc:recap', go);
  }, [navigate]);
  useAutoTour('today', !!st.data);
  // analytics: the first check-in (the moment of value) and a lost streak, once
  const anyDone = useSystem((r) => r.logs.some((l) => l.done)).data;
  const born = useAuth((a) => a.session?.user.created_at);
  useEffect(() => {
    if (!anyDone) return;
    const min = born ? Math.round((Date.now() - new Date(born).getTime()) / 60000) : null;
    if (min != null && min < 7 * 1440) trackEver('first_check', 'first_check', { minutes_since_signup: min });
  }, [anyDone, born]);
  const lostDay = st.data?.recovery ? st.data.day : null;
  useEffect(() => { if (lostDay) trackEver('lost-' + lostDay, 'streak_lost'); }, [lostDay]);
  // all Core done just now: a wave over the tiles, a stronger buzz; a streak milestone opens its moment
  const kept = st.data ? st.data.view.stats.streak > st.data.view.streakBase : null;
  const wasKept = useRef<boolean | null>(null);
  const [wave, setWave] = useState(false);
  const [milestone, setMilestone] = useState<number | null>(null);
  useEffect(() => {
    if (kept == null || !st.data) return;
    if (wasKept.current === false && kept) {
      const n = st.data.view.stats.streak;
      haptic('dayKept');
      track('day_kept', { streak: st.data.view.stats.streak });
      setWave(true);
      setTimeout(() => setWave(false), 1500);
      const arcId = st.data.arc?.id;
      if (arcId && MILESTONES.includes(n) && !milestoneSeen(arcId, n)) setTimeout(() => setMilestone(n), 1100);
      else toast.success(t('celebrate.dayKept', { n }));
    }
    wasKept.current = kept;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kept]);

  if (!st.ready || !st.data) return <PageState variant="today" error={st.loadError} onRetry={st.retry} />;
  const d = st.data;
  const habits = d.habits as HabitT[];
  const core = habits.filter((x) => x.core), extra = habits.filter((x) => !x.core);
  const shown = filter === 'core' ? core : filter === 'extra' ? extra : [...core, ...extra];
  let i = 0;
  const n = () => ({ '--i': i++ } as React.CSSProperties);

  return (
    <div className={c.scroll} data-scroll>
      <div className={h.page}>
        <Greeting t={t} d={d} />
        <div className={h.tabs} role="tablist" aria-label={t('home.filter')}>
          {([['all', t('home.all'), habits.length], ['core', t('home.core'), core.length], ['extra', t('home.vExtra'), extra.length]] as [Filter, string, number][]).map(([id, label, cnt]) => (
            <button key={id} type="button" role="tab" aria-selected={filter === id} className={h.tab} onClick={() => setFilter(id)}>{label}<sup>{cnt}</sup></button>
          ))}
          <Link to="/planner" className={h.tab}>{t('home.plan')}<sup>{d.strip.length}</sup></Link>
        </div>

        <div className={h.grid} data-wave={wave}>
          <PushHint style={n()} />
          {d.recovery && <RecoveryTile t={t} rec={d.recovery} style={n()} />}
          {d.lighten && d.lighten.why !== 'mood' && <LightenTile t={t} day={d.day} lt={d.lighten} style={n()} />}
          {/* one hero first — what to do now, with the «why» under it — then the state of the day */}
          <NowTile t={t} d={d} style={n()} onReview={() => setReview(true)} onOath={() => setOath(true)} />
          <ScoreTile t={t} d={d} style={n()} />
          <ArcTile t={t} d={d} style={n()} />
          {shown.map((x) => <HabitTile key={x.id} t={t} hb={x} style={n()} />)}
          {filter !== 'extra' && core.length === 0 && (
            <button type="button" className={`${h.tile} ${h.sq} ${h.addTile}`} style={n()} onClick={() => navigate('/disciplines')}>
              <span className={h.circle}><Icon name="plus" size={18} sw={1.8} /></span>
              <span className={h.tileText}><span className={h.tileName}>{t('cockpit.chooseCore')}</span><span className={h.tileSub}>{t('empty.coreSub')}</span></span>
            </button>
          )}
          {/* phone grid: one square sits under the score, the rest go in pairs — an odd one would leave a hole */}
          <FocusTile t={t} d={d} style={n()} fill={(shown.length + (filter !== 'extra' && core.length === 0 ? 1 : 0)) % 2 === 1} />
          <MoodTile t={t} d={d} style={n()} />
          {/* a low mood was just picked here: the offer appears right under it */}
          {d.lighten?.why === 'mood' && <LightenTile t={t} day={d.day} lt={d.lighten} style={n()} />}
          <PlanTile t={t} d={d} style={n()} />
          <StatsTile t={t} d={d} style={n()} />
        </div>
      </div>
      <EveningReview open={review} onClose={() => setReview(false)} />
      <Comeback />
      <WeeklyReview open={week} onClose={() => setWeek(false)} />
      {milestone != null && d.arc && <Milestone n={milestone} arcId={d.arc.id} oath={d.arc.oath ?? null} length={d.view.stats.arcLength} onClose={() => setMilestone(null)} />}
      <OathSheet open={oath} onClose={() => setOath(false)} arcId={d.arc?.id ?? null} current={d.arc?.oath ?? ''} />
    </div>
  );
}

/* ---------------- greeting: «Доброе утро, Анна», date and arc on the right ---------------- */

function Greeting({ t, d }: { t: T; d: TodayData }) {
  const hd = useHeader();
  const first = useAuth((x) => x.profile?.first_name) ?? '';
  const now = new Date();
  const loc = t.lang === 'en' ? 'en-US' : 'ru-RU';
  const date = now.toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <header className={h.head}>
      <div className={h.helloWrap}>
        <h1 className={h.hello}>{greeting(t, d)}{first ? ',' : ''}{first && <><br />{first}</>}</h1>
        {weekFocus() && <span className={h.weekFocus}>{t('weekly.focusLine', { f: weekFocus()! })}</span>}
      </div>
      <div className={h.headSide}>
        <div className={h.headBtns}>
          <AvatarMenu initials={hd.initials} />
        </div>
        <span className={h.headMeta}>{date} · {now.toTimeString().slice(0, 5)}</span>
        <span className={h.headMeta}>Arc {roman(d.arc?.number ?? 1)} · {d.view.stats.arcDay}/{d.view.stats.arcLength}</span>
      </div>
    </header>
  );
}

/** one greeting per day: a moment of the arc or the streak first, otherwise a variant for the time of day */
function greeting(t: T, d: TodayData) {
  const s = d.view.stats, streak = d.view.streakBase;
  const pick = (k: string) => { const l = t.list(`home.greet.${k}` as never); return l.length ? l[[...d.day].reduce((a, ch) => a + ch.charCodeAt(0), 0) % l.length] : ''; };
  if (s.arcDay === 1) return pick('first');
  if (s.arcDay === Math.round(s.arcLength / 2)) return pick('mid');
  if (s.arcLength - s.arcDay <= 3) return pick('last');
  if (streak === 30) return pick('month');
  if (streak === 7) return pick('week');
  const yesterday = d.week[d.week.findIndex((x) => x.day === d.day) - 1];
  if (yesterday?.status === 'broken') return pick('restart');
  return pick(periodOf()) || t(`home.hello.${periodOf()}`);
}

/* ---------------- tiles ---------------- */

type TileProps = { t: T; d: TodayData; style: React.CSSProperties };

function ScoreTile({ t, d, style }: TileProps) {
  const [info, setInfo] = useState(false);
  const { score, delta, parts, index } = d.score;
  return (
    <>
      <button type="button" className={`${h.tile} ${h.sq} ${h.tilePale}`} style={style} data-tour="today-score" onClick={() => setInfo(true)} aria-label={t('cockpit.scoreInfo')}>
        <span className={h.tileTop}>
          <span className={`${h.circle} ${h.circleWhite}`}><Icon name="spark" size={18} sw={1.8} /></span>
          <Ring pct={score / 100} />
        </span>
        <span className={h.tileText}>
          {/* one number across the app: the discipline index; the ring is how much of today is done */}
          <span className={h.bigNum}>{index}</span>
          <span className={h.tileName}>{t('home.indexTitle')}</span>
          <span className={h.tileSub}>{delta > 0 ? t('home.indexToday', { d: delta }) : t('home.indexZero')}</span>
        </span>
      </button>
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
    </>
  );
}

function Ring({ pct }: { pct: number }) {
  const r = 17, len = 2 * Math.PI * r;
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" className={h.ring} aria-hidden="true">
      <circle cx="20" cy="20" r={r} fill="none" stroke="currentColor" strokeOpacity=".12" strokeWidth="3" />
      <circle cx="20" cy="20" r={r} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - Math.min(1, pct))} />
    </svg>
  );
}

function NowTile({ t, d, style, onReview, onOath }: TileProps & { onReview: () => void; onOath: () => void }) {
  const navigate = useNavigate();
  const a = d.action;
  const period = periodOf();
  const key = a.kind + ('habit' in a ? a.habit.id : 'event' in a ? a.event.id : '');
  const doHabit = (a: Extract<NowAction, { kind: 'habit' }>) => {
    const x = d.habits.find((y) => y.id === a.habit.id);
    if (!x) return;
    navigator.vibrate?.(15);
    if (x.type === 'binary') logHabit(x.id, 1, true);
    else if (x.type === 'counter') logHabit(x.id, x.count + 1, x.count + 1 >= x.goal);
    else pomo.openSheet({ habitId: x.id, label: t.pick(x.title) });
  };
  let call: string, sub: string, run: (() => void) | null = null;
  switch (a.kind) {
    case 'oath':
      call = a.oath ? `«${a.oath}»` : t('cockpit.now.oathEmpty');
      sub = t('cockpit.now.oathSub', { n: roman(d.arc?.number ?? 1) });
      run = onOath;
      break;
    case 'event':
      call = a.event.title;
      sub = t('cockpit.now.eventIn', { m: a.inMin, t: a.event.starts_at?.slice(0, 5) ?? '' });
      run = a.event.focus ? () => pomo.openSheet({ eventId: a.event.id, label: a.event.title }) : () => navigate('/planner');
      break;
    case 'habit':
      call = a.habit.name;
      sub = a.core ? t('cockpit.now.coreSub') : t('cockpit.now.habitSub');
      run = () => doHabit(a);
      break;
    case 'review':
      call = t('cockpit.now.reviewCall');
      sub = t('cockpit.now.reviewSub', { s: d.view.stats.streak });
      run = onReview;
      break;
    case 'setup':
      call = t('cockpit.now.setupCall');
      sub = t('cockpit.now.setupSub');
      run = () => navigate('/disciplines');
      break;
    case 'tomorrow':
      call = t('cockpit.now.tomorrow', { t: a.event.starts_at?.slice(0, 5) ?? '', x: a.event.title });
      sub = t('cockpit.now.closedSub', { s: d.view.stats.streak });
      break;
    default:
      call = t('cockpit.now.closed');
      sub = t('cockpit.now.closedSub', { s: d.view.stats.streak });
  }
  const night = period === 'evening' || period === 'night';
  return (
    <div className={`${h.tile} ${h.wide} ${h.hero} ${h.tileLight}`} style={style} aria-live="polite" data-tour="today-now">
      <span className={h.tileTop}>
        <span className={h.circle} style={{ background: '#FFFFFF', color: 'var(--c-on)' }}><Icon name={night ? 'moon' : 'sun'} size={18} sw={1.8} /></span>
        {run && <button type="button" className={`${h.circle} ${h.circleInk}`} onClick={run} aria-label={sub}><Icon name="arrowRight" size={17} sw={1.8} /></button>}
      </span>
      <span key={key} className={`${h.tileText} ${h.swap}`}>
        <span className={h.tileName2}>{call}</span>
        <span className={h.tileSub}>{t(`cockpit.period.${period}`)} · {sub}</span>
        {/* the «why» stays in sight: the arc's promise under what to do now */}
        {a.kind !== 'oath' && d.arc?.oath && <button type="button" className={h.oathLine} onClick={onOath}>«{d.arc.oath}»</button>}
      </span>
    </div>
  );
}

function ArcTile({ t, d, style }: TileProps) {
  const [info, setInfo] = useState<'streak' | 'freeze' | null>(null);
  const dows = t.list('weekdays.short');
  const s = d.view.stats;
  const kept = s.streak > d.view.streakBase;
  const shownStreak = kept ? d.view.streakBase + 1 : d.view.streakBase;
  return (
    <div className={`${h.tile} ${h.wide} ${h.arcTile}`} style={style}>
      {/* the streak first: what it is, and how many days in a row — big, top right */}
      <span className={h.arcHead}>
        <button type="button" className={h.streakWhat} onClick={() => setInfo('streak')}>
          <span className={h.streakLabel}><Icon name="flame" size={16} sw={1.8} />{t('home.streakTitle')}</span>
          <span className={h.tileSub}>{t('home.streakHint')}</span>
        </button>
        {/* the number is the days already kept; today joins it only once the day is closed (an inflated number that
            resets looks like a lie) — until then a quiet «будет N» says what closing the day does */}
        <span className={h.streakBig} data-on={kept ? d.view.streakBase + 1 > 1 : d.view.streakBase > 1}>
          <b key={shownStreak}>{shownStreak}</b>
          <small>{kept ? t('home.streakDay') : t('home.streakWill', { n: d.view.streakBase + 1 })}</small>
        </span>
      </span>
      <span className={h.week}>
        {d.week.map((w, k) => (
          <span key={w.day} className={h.wd} data-s={w.status} data-today={w.day === d.day} title={t(`cockpit.status.${w.status}`)}>
            <i>{dows[k].slice(0, 2)}</i>
            {w.day === d.day && <em>{t('home.todayMark')}</em>}
          </span>
        ))}
      </span>
      <span className={h.tileText}>
        <span className={h.arcName}>Arc {roman(d.arc?.number ?? 1)} · {t('home.dayOf', { d: s.arcDay, l: s.arcLength })}</span>
        <span className={h.tileSub}>
          <button type="button" className={h.inlineBtn} onClick={() => setInfo('freeze')} aria-label={t('explain.freezeTitle')}><Icon name="snowSm" size={12} /> {t('home.freeze', { a: d.freezes.used, b: d.freezes.allowed })}</button> · {t('home.best', { n: s.streakRecord })}
        </span>
        {/* the arc itself: the walked part, today's dot, the 30/45/60 marks */}
        <span className={h.trail}><ArcTrail day={s.arcDay} length={s.arcLength} label={t('home.dayOf', { d: s.arcDay, l: s.arcLength })} /></span>
      </span>
      <InfoDialog open={info === 'streak'} title={t('cockpit.streakTitle')} body={t('cockpit.streakBody')} okLabel={t('common.ok')} onClose={() => setInfo(null)} />
      <InfoDialog open={info === 'freeze'} title={t('explain.freezeTitle')} body={t('cockpit.freezeBody', { n: d.freezes.allowed })} okLabel={t('common.ok')} onClose={() => setInfo(null)} />
    </div>
  );
}

function RecoveryTile({ t, rec, style }: { t: T; rec: { day: string; left: number }; style: React.CSSProperties }) {
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
    <div className={`${h.tile} ${h.wide} ${h.tileMint}`} style={style} role="status">
      <span className={h.tileTop}>
        <span className={`${h.circle} ${h.circleWhite}`}><Icon name="snowSm" size={18} /></span>
        <button type="button" className={`${h.circle} ${h.circleWhite}`} onClick={close} aria-label={t('common.close')}><Icon name="close" size={14} sw={2} /></button>
      </span>
      <span className={h.tileText}>
        <span className={h.tileName}>{rec.left > 0 ? t('cockpit.recoveryAsk') : t('cockpit.recoveryNone')}</span>
        {rec.left > 0 && <button type="button" className={h.pillInk} disabled={busy} onClick={() => { void freeze(); }}>{t('cockpit.recoveryUse', { n: rec.left })}</button>}
      </span>
    </div>
  );
}

/** «Режим восстановления»: move today's open planner tasks to tomorrow — only on «Применить», with undo. */
function LightenTile({ t, day, lt, style }: { t: T; day: string; lt: NonNullable<TodayData['lighten']>; style: React.CSSProperties }) {
  const [gone, setGone] = useState(false);
  if (gone) return null;
  const close = () => { dismissLighten(day); setGone(true); };
  const apply = () => {
    const items = lt.items;
    const tomorrow = addDays(day, 1);
    for (const p of items) saveEvent({ ...p, day: tomorrow }, false);
    close();
    toast.action(t('lighten.done', { n: items.length }), t('lighten.undo'), () => { for (const p of items) saveEvent(p, false); });
  };
  const names = lt.items.slice(0, 3).map((p) => p.title).join(' · ') + (lt.items.length > 3 ? ` · +${lt.items.length - 3}` : '');
  return (
    <div className={`${h.tile} ${h.wide} ${h.lighten}`} style={style} role="status" aria-label={t('lighten.title')}>
      <span className={h.tileTop}>
        <span className={h.circle}><Icon name="move" size={18} sw={1.8} /></span>
        <button type="button" className={h.circle} onClick={close} aria-label={t('lighten.later')}><Icon name="close" size={14} sw={2} /></button>
      </span>
      <span className={h.tileText}>
        <span className={h.tileSub}>{t('lighten.title')}</span>
        <span className={h.tileName}>{t(`lighten.${lt.why}`, { n: lt.items.length })}</span>
        <span className={h.tileSub}>{names}</span>
        <span className={h.lightenRow}>
          <button type="button" className={h.pillInk} onClick={apply}>{t('lighten.apply')}</button>
          <button type="button" className={h.pillGhost} onClick={close}>{t('lighten.later')}</button>
        </span>
      </span>
    </div>
  );
}

/** A habit as a device: dark when open, light when done today. Counter → − / +, duration → play. */
function HabitTile({ t, hb, style }: { t: T; hb: HabitT; style: React.CSSProperties }) {
  const done = isDone(hb);
  const todayIdx = (new Date().getDay() + 6) % 7;
  const [justOn, setJustOn] = useState(false);
  const was = useRef(done);
  useEffect(() => {
    if (done && !was.current) { was.current = done; setJustOn(true); const id = setTimeout(() => setJustOn(false), 600); return () => clearTimeout(id); }
    was.current = done;
  }, [done]);
  // duration timer lives in the tile so only it re-renders every second
  const [timer, setTimer] = useState<{ endsAt: number | null; left: number }>({ endsAt: null, left: hb.type === 'duration' ? hb.left : 0 });
  const [, tick] = useState(0);
  useEffect(() => { if (!timer.endsAt) return; const id = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(id); }, [timer.endsAt]);
  const left = timer.endsAt ? Math.max(0, Math.round((timer.endsAt - Date.now()) / 1000)) : timer.left;
  useEffect(() => {
    if (hb.type === 'duration' && timer.endsAt && left === 0) { setTimer({ endsAt: null, left: 0 }); navigator.vibrate?.(15); logHabit(hb.id, hb.minutes, true); }
  }, [left, timer.endsAt, hb]);

  const hue = hb.hue ?? 'var(--accent)';
  const toggle = () => { if (hb.type !== 'binary') return; if (!hb.checked) navigator.vibrate?.(15); logHabit(hb.id, hb.checked ? 0 : 1, !hb.checked); };
  const inc = () => { if (hb.type !== 'counter' || hb.count >= hb.goal) return; const v = hb.count + 1; if (v >= hb.goal) navigator.vibrate?.(15); logHabit(hb.id, v, v >= hb.goal); };
  const dec = () => { if (hb.type !== 'counter') return; const v = Math.max(0, hb.count - 1); logHabit(hb.id, v, v >= hb.goal); };
  const play = () => { if (done || hb.type !== 'duration') return; setTimer((x) => (x.endsAt ? { endsAt: null, left } : { endsAt: Date.now() + left * 1000, left })); };
  const finishNow = () => { setTimer({ endsAt: null, left: 0 }); navigator.vibrate?.(15); logHabit(hb.id, hb.type === 'duration' ? hb.minutes : 1, true); };
  const undoDuration = () => { setTimer({ endsAt: null, left: hb.type === 'duration' ? hb.minutes * 60 : 0 }); logHabit(hb.id, 0, false); };
  const running = !!timer.endsAt;
  const on = done || running;
  const pad = (v: number) => String(v).padStart(2, '0');
  const status = hb.type === 'counter' ? `${hb.count}/${hb.goal}`
    : hb.type === 'duration' ? (done ? t('home.on') : running || left < hb.minutes * 60 ? `${pad(Math.floor(left / 60))}:${pad(left % 60)}` : t('units.min', { m: hb.minutes }))
      : done ? t('home.on') : t('home.off');
  const top = (
    <span className={h.tileTop}>
      <span className={h.circle} style={on ? { background: '#FFFFFF', color: 'var(--c-on)' } : { color: hue }}>
        {done ? <Icon name="check" size={18} sw={2.2} /> : <Icon name={hb.icon} size={18} sw={1.8} />}
      </span>
      {hb.type === 'counter' && (
        <span className={h.stepCol}>
          <button type="button" className={h.circle} onClick={inc} disabled={done} aria-label="+"><Icon name="plus" size={16} sw={1.8} /></button>
          <button type="button" className={h.circle} onClick={dec} aria-label="−"><Icon name="minus" size={16} sw={1.8} /></button>
        </span>
      )}
      {hb.type === 'duration' && !done && (
        <span className={h.stepCol}>
          <button type="button" className={`${h.circle} ${running ? h.circleInk : ''}`} onClick={play} aria-label={running ? t('pomo.pause') : t('pomo.start')}>
            <Icon name={running ? 'pause' : 'play'} size={16} sw={1.8} />
          </button>
          {/* done without waiting for the timer (read already, worked out elsewhere…) */}
          <button type="button" className={h.circle} onClick={finishNow} aria-label={t('home.markDone')}>
            <Icon name="check" size={16} sw={2.2} />
          </button>
        </span>
      )}
      {hb.type === 'duration' && done && (
        <button type="button" className={h.circle} onClick={undoDuration} aria-label={t('home.markUndo')}>
          <Icon name="reset" size={15} sw={1.8} />
        </button>
      )}
      {hb.type === 'binary' && hb.core && <span className={h.coreDot} title="Core" />}
    </span>
  );
  const text = (
    <span className={h.tileText}>
      <span className={h.tileName}>{t.pick(hb.title)}</span>
      <span className={h.tileSub}>{status}{hb.streak > 0 ? ` · ${t('home.streak', { n: hb.streak })}` : ''}</span>
      {/* this week at a glance: the rhythm is what you don't want to break */}
      <span className={h.weekDots} aria-hidden="true">
        {hb.dots.map((v, i) => <i key={i} data-on={v === 1 || (i === todayIdx && done)} data-today={i === todayIdx} />)}
      </span>
    </span>
  );
  const cls = `${h.tile} ${h.sq} ${on ? h.tileLight : ''}`;
  return hb.type === 'binary' ? (
    <button type="button" className={cls} style={style} data-just-on={justOn} onClick={toggle} role="checkbox" aria-checked={done} aria-label={t.pick(hb.title)} aria-description={`${status}${hb.streak > 0 ? ` · ${t('home.streak', { n: hb.streak })}` : ''}${hb.core ? ' · Core' : ''}`}>{top}{text}</button>
  ) : (
    <div className={cls} style={style} data-just-on={justOn}>{top}{text}</div>
  );
}

function FocusTile({ t, d, style, fill }: TileProps & { fill?: boolean }) {
  const st = usePomodoro();
  const running = !!st.endsAt;
  return (
    <div className={`${h.tile} ${h.sq} ${fill ? h.wideM : ''} ${running ? h.tileLight : ''}`} style={style}>
      <span className={h.tileTop}>
        <span className={h.circle} style={running ? { background: '#FFFFFF', color: 'var(--c-on)' } : undefined}><Icon name="bolt" size={18} sw={1.8} /></span>
        <button type="button" className={`${h.circle} ${running ? h.circleInk : h.circleAccent}`} onClick={() => (running ? pomo.openSheet() : pomo.start())} aria-label={running ? t('pomo.expand') : t('pomo.start')}>
          <Icon name={running ? 'arrowRight' : 'play'} size={16} sw={1.8} />
        </button>
      </span>
      <button type="button" className={h.tileText} onClick={() => pomo.openSheet()}>
        <span className={h.clock}>{running ? fmtClock(remaining(st)) : fmtClock(st.lengths[0] * 60)}</span>
        <span className={h.tileName}>{t('pomo.title')}</span>
        <span className={h.tileSub}>{st.link.label ?? t('home.focusSummary', { n: d.focusToday.sessions, t: t.hm(d.focusToday.minutes) })}</span>
      </button>
    </div>
  );
}

function MoodTile({ t, d, style }: TileProps) {
  const words = t.list('today.moodWords');
  const sel = d.todayMood == null ? null : d.todayMood - 1;
  return (
    <div className={`${h.tile} ${h.wide} ${h.low} ${h.moodTile}`} style={style}>
      <span className={h.moods} data-picked={sel != null}>
        {[0, 1, 2, 3, 4].map((k) => (
          <button key={k} type="button" className={h.mood} aria-pressed={sel === k} aria-label={words[k]} onClick={() => { navigator.vibrate?.(10); logMood(sel === k ? null : k); }}>
            <MoodFace level={k} color={sel === k ? '#004BE0' : 'rgba(var(--fg-rgb),.75)'} />
          </button>
        ))}
      </span>
      <span className={h.tileText}>
        <span className={h.tileName}>{t('today.mood')}</span>
        <span className={h.tileSub}>{sel == null ? t('cockpit.moodAsk') : words[sel]}</span>
      </span>
    </div>
  );
}

function PlanTile({ t, d, style }: TileProps) {
  const nowHm = new Date().toTimeString().slice(0, 5);
  return (
    <div className={`${h.tile} ${d.strip.length > 1 ? h.tall : `${h.wide} ${h.low} ${h.planLow}`}`} style={style}>
      <span className={h.tileTop}>
        <Link to="/planner" className={h.circle} aria-label={t('home.plan')}><Icon name="cal" size={18} sw={1.8} /></Link>
        <button type="button" className={h.circle} onClick={() => useAdd.getState().openAdd('event')} aria-label={t('empty.addEvent')}><Icon name="plus" size={16} sw={1.8} /></button>
      </span>
      {d.strip.length > 1 && (
        <span className={h.events}>
          {d.strip.slice(0, 5).map((p) => {
            const cur = !!p.starts_at && p.starts_at.slice(0, 5) <= nowHm && (p.ends_at ?? p.starts_at).slice(0, 5) > nowHm;
            return (
              <Link key={p.id} to="/planner" className={h.event} data-now={cur} data-done={p.done}>
                <span className={h.evTime}>{cur && <i />}{p.starts_at ? p.starts_at.slice(0, 5) : '—'}</span>
                <span className={h.evTitle}>{p.title}</span>
              </Link>
            );
          })}
        </span>
      )}
      <span className={h.tileText}>
        <span className={h.tileName}>{t('home.plan')}</span>
        {/* one item: it is the line itself (no cramped list in the low tile) */}
        <span className={h.tileSub}>{d.strip.length === 1 ? `${d.strip[0].starts_at ? d.strip[0].starts_at.slice(0, 5) : t('calendar.untimed').toLowerCase()} · ${d.strip[0].title}` : d.strip.length ? t('home.planNext', { n: d.strip.length }) : t('home.planFree')}</span>
      </span>
    </div>
  );
}

function StatsTile({ t, d, style }: TileProps) {
  const s = d.view.stats;
  const items: [IconName, string, string][] = [
    ['flame', String(s.streak), t('home.statStreak')],
    ['bolt', t.hm(s.focusTodayMin), t('home.statFocus')],
    ['trophy', s.bestFocusDayMin ? t.hm(s.bestFocusDayMin) : '—', t('home.statBest')],
  ];
  return (
    <Link to="/analytics" className={`${h.tile} ${d.strip.length > 1 ? h.tall : h.wide} ${h.statsTile}`} style={style}>
      {items.map(([icon, v, l]) => (
        <span key={l} className={h.statCell}>
          <span className={h.circle}><Icon name={icon} size={17} sw={1.8} /></span>
          <span className={h.statNum}>{v}</span>
          <span className={h.tileSub}>{l}</span>
        </span>
      ))}
    </Link>
  );
}
