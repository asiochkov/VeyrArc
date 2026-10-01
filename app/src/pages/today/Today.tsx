import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { roman, AvatarMenu } from '../../app/AppHeader';
import { useAdd, useAddAction } from '../../app/nav';
import { useHeader } from '../../data/header';
import { useT, type T } from '../../i18n';
import { useAuth } from '../../lib/auth';
import { pendingRecap } from '../../lib/maintenance';
import type { TodayHabit } from '../../mock/today';
import { logHabit, logMood, saveFreeze } from '../../state/actions';
import { INDEX_WEIGHTS, periodOf, type NowAction } from '../../state/compute';
import { pomo, usePomodoro, fmtClock, remaining } from '../../state/pomodoro';
import { Icon, type IconName } from '../../ui/Icon';
import { PageState } from '../../ui/PageState';
import { InfoDialog, MoodFace } from '../../ui/primitives';
import { toast } from '../../ui/toast';
import { OathSheet } from '../../ui/OathSheet';
import { useAutoTour } from '../../ui/Tour';
import { EveningReview } from './EveningReview';
import { isDone } from './HabitRow';
import c from './cockpit.module.css';
import h from './home.module.css';
import { dismissRecovery, useToday, type TodayData } from './useToday';

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

        <div className={h.grid}>
          {d.recovery && <RecoveryTile t={t} rec={d.recovery} style={n()} />}
          <ScoreTile t={t} d={d} style={n()} />
          <NowTile t={t} d={d} style={n()} onReview={() => setReview(true)} onOath={() => setOath(true)} />
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
          <PlanTile t={t} d={d} style={n()} />
          <StatsTile t={t} d={d} style={n()} />
        </div>
      </div>
      <EveningReview open={review} onClose={() => setReview(false)} />
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
  const openPalette = useAdd((x) => x.openPalette);
  return (
    <header className={h.head}>
      <h1 className={h.hello}>{t(`home.hello.${periodOf()}`)}{first ? ',' : ''}{first && <><br />{first}</>}</h1>
      <div className={h.headSide}>
        <div className={h.headBtns}>
          <button type="button" className={h.roundBtn} onClick={openPalette} aria-label={t('nav.search')}><Icon name="search" size={17} sw={1.8} /></button>
          <AvatarMenu initials={hd.initials} />
        </div>
        <span className={h.headMeta}>{date} · {now.toTimeString().slice(0, 5)}</span>
        <span className={h.headMeta}>Arc {roman(d.arc?.number ?? 1)} · {d.view.stats.arcDay}/{d.view.stats.arcLength}</span>
      </div>
    </header>
  );
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
          <span className={h.bigNum}>{score}</span>
          <span className={h.tileName}>{t('home.scoreTitle')}</span>
          <span className={h.tileSub}>{(delta >= 0 ? '+' : '−') + Math.abs(delta)} {t('home.toIndex')} · {t('home.index', { n: index })}</span>
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
    <div className={`${h.tile} ${h.tall} ${h.tileLight}`} style={style} aria-live="polite" data-tour="today-now">
      <span className={h.tileTop}>
        <span className={h.circle} style={{ background: '#FFFFFF', color: 'var(--c-on)' }}><Icon name={night ? 'moon' : 'sun'} size={18} sw={1.8} /></span>
        {run && <button type="button" className={`${h.circle} ${h.circleInk}`} onClick={run} aria-label={sub}><Icon name="arrowRight" size={17} sw={1.8} /></button>}
      </span>
      <span key={key} className={`${h.tileText} ${h.swap}`}>
        <span className={h.tileName2}>{call}</span>
        <span className={h.tileSub}>{t(`cockpit.period.${period}`)} · {sub}</span>
      </span>
    </div>
  );
}

function ArcTile({ t, d, style }: TileProps) {
  const [info, setInfo] = useState<'streak' | 'freeze' | null>(null);
  const dows = t.list('weekdays.short');
  const s = d.view.stats;
  return (
    <div className={`${h.tile} ${h.wide} ${h.arcTile}`} style={style}>
      {/* the streak first: what it is, and how many days in a row — big, top right */}
      <span className={h.arcHead}>
        <button type="button" className={h.streakWhat} onClick={() => setInfo('streak')}>
          <span className={h.streakLabel}><Icon name="flame" size={16} sw={1.8} />{t('home.streakTitle')}</span>
          <span className={h.tileSub}>{t('home.streakHint')}</span>
        </button>
        <span className={h.streakBig} data-on={s.streak > 0}>
          <b key={s.streak}>{s.streak}</b>
          <small>{t('home.daysInRow', { n: s.streak })}</small>
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
        <span className={h.arcBar}><i style={{ width: (s.arcDay / s.arcLength) * 100 + '%' }} /></span>
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

/** A habit as a device: dark when open, light when done today. Counter → − / +, duration → play. */
function HabitTile({ t, hb, style }: { t: T; hb: HabitT; style: React.CSSProperties }) {
  const done = isDone(hb);
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
        <button type="button" className={`${h.circle} ${running ? h.circleInk : ''}`} onClick={play} aria-label={running ? t('pomo.pause') : t('pomo.start')}>
          <Icon name={running ? 'pause' : 'play'} size={16} sw={1.8} />
        </button>
      )}
      {hb.type === 'binary' && hb.core && <span className={h.coreDot} title="Core" />}
    </span>
  );
  const text = (
    <span className={h.tileText}>
      <span className={h.tileName}>{t.pick(hb.title)}</span>
      <span className={h.tileSub}>{status}{hb.streak > 0 ? ` · ${t('home.streak', { n: hb.streak })}` : ''}</span>
    </span>
  );
  const cls = `${h.tile} ${h.sq} ${on ? h.tileLight : ''}`;
  return hb.type === 'binary' ? (
    <button type="button" className={cls} style={style} data-just-on={justOn} onClick={toggle} role="checkbox" aria-checked={done} aria-label={t.pick(hb.title)}>{top}{text}</button>
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
            <MoodFace level={k} color={sel === k ? '#004BE0' : 'rgba(232,237,243,.75)'} />
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
      {d.strip.length > 0 && (
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
        <span className={h.tileSub}>{d.strip.length ? t('home.planNext', { n: d.strip.length }) : t('home.planFree')}</span>
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
