import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAddAction } from '../../app/nav';
import { useT, type T } from '../../i18n';
import { useIsDesktop } from '../../lib/useIsDesktop';
import { HABIT_PALETTE, refusals as seedRefusals, trackerHabits, type Refusal, type TrackerHabit } from '../../mock/tracker';
import { todayStats } from '../../mock/today';
import { Icon } from '../../ui/Icon';
import { Avatar, ConfirmDialog, Segmented } from '../../ui/primitives';
import { HabitCard, RefusalCard } from './cards';
import { defaultHabitDraft, defaultQuitDraft, HabitOptions, QuitOptions, type HabitDraft, type QuitDraft } from './ComposerOptions';
import s from './tracker.module.css';

type View = 'habits' | 'refusals';
const CADENCE_LABELS = {
  daily: { ru: 'каждый день', en: 'every day' },
  weekdays: { ru: 'по будням', en: 'weekdays' },
  weekends: { ru: 'по выходным', en: 'weekends' },
};

/* State and handlers from VeyrArc Tracker.dc.html */
function useTracker() {
  const location = useLocation() as { state?: { compose?: boolean } };
  const [view, setView] = useState<View>('habits');
  const [now, setNow] = useState(Date.now());
  const [expandedId, setExpandedId] = useState<string | null>('water');
  const [composing, setComposing] = useState(!!location.state?.compose);
  const [draft, setDraft] = useState('');
  const [draftRequired, setDraftRequired] = useState(true);
  const [goalOverrides, setGoalOverrides] = useState<Record<string, number>>({});
  const [goalMenuId, setGoalMenuId] = useState<string | null>(null);
  const [habits, setHabits] = useState<TrackerHabit[]>(trackerHabits);
  const [refusals, setRefusals] = useState<Refusal[]>(seedRefusals);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [habitDraft, setHabitDraft] = useState<HabitDraft>(defaultHabitDraft(HABIT_PALETTE[trackerHabits.length % HABIT_PALETTE.length]));
  const [quitDraft, setQuitDraft] = useState<QuitDraft>(defaultQuitDraft());
  const [slipId, setSlipId] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const startAdd = () => {
    setComposing(true);
    setDraft('');
    setHabitDraft(defaultHabitDraft(HABIT_PALETTE[habits.length % HABIT_PALETTE.length]));
    setQuitDraft(defaultQuitDraft());
    setDraftRequired(habits.filter((h) => h.required).length < 3);
    setTimeout(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, 60);
  };

  // the rail "+" opens this screen's composer
  const setHandler = useAddAction((st) => st.setHandler);
  useEffect(() => {
    setHandler(startAdd);
    return () => setHandler(null);
  });

  const switchView = (v: View) => { setView(v); setComposing(false); setDraft(''); };
  const cancelAdd = () => { setComposing(false); setDraft(''); };

  const confirmAdd = () => {
    const name = draft.trim();
    if (!name) { cancelAdd(); return; }
    const text = { ru: name, en: name };
    if (view === 'habits') {
      const d = habitDraft;
      const item: TrackerHabit = {
        id: 'h' + Date.now(), required: draftRequired, name: text, icon: d.icon, hue: d.hue,
        cadence: CADENCE_LABELS[d.cadence], streak: 0, best: 0, total: 0,
        week: ['empty', 'empty', 'empty', 'today', 'future', 'future', 'future'],
        type: d.type, target: d.target, unit: d.unit.trim() || undefined, minutes: d.minutes, category: d.category,
      };
      setHabits((l) => [...l, item]);
      setExpandedId(item.id);
    } else {
      const unit = quitDraft.unit.trim();
      const item: Refusal = {
        id: 'r' + Date.now(), name: text, icon: 'ban', hue: HABIT_PALETTE[refusals.length % HABIT_PALETTE.length],
        quit: new Date().toISOString(), savedLabel: unit ? undefined : 'slips', unit: unit || undefined, savedUnit: quitDraft.norm,
        relapses: 0, best: 0,
      };
      setRefusals((l) => [...l, item]);
    }
    setComposing(false);
    setDraft('');
  };

  const toggleToday = (id: string) => setHabits((list) => list.map((h) => {
    if (h.id !== id) return h;
    const week = h.week.slice();
    const ti = week.findIndex((x) => x === 'today' || x === 'today-done');
    if (ti < 0) return h;
    const nowDone = week[ti] === 'today-done';
    week[ti] = nowDone ? 'today' : 'today-done';
    return { ...h, week, streak: h.streak + (nowDone ? -1 : 1), total: h.total + (nowDone ? -1 : 1) };
  }));

  // A6: a slip restarts the timer; the best clean run and slip count are kept
  const confirmSlip = () => {
    const id = slipId;
    setRefusals((list) => list.map((r) => {
      if (r.id !== id) return r;
      const days = Math.floor((Date.now() - new Date(r.quit).getTime()) / 86400000);
      return { ...r, quit: new Date().toISOString(), relapses: r.relapses + 1, best: Math.max(r.best, days) };
    }));
    setSlipId(null);
  };

  return {
    habitDraft, setHabitDraft, quitDraft, setQuitDraft, slipId, setSlipId, confirmSlip,
    view, switchView, now, expandedId, setExpandedId, composing, draft, setDraft, draftRequired, setDraftRequired,
    goalOverrides, setGoalOverrides, goalMenuId, setGoalMenuId, habits, setHabits, refusals, setRefusals,
    startAdd, cancelAdd, confirmAdd, toggleToday, scrollRef,
  };
}
type St = ReturnType<typeof useTracker>;

export function Tracker() {
  const t = useT();
  const isDesktop = useIsDesktop();
  const st = useTracker();
  const mobile = !isDesktop;

  const seg = (
    <Segmented
      variant="tracker"
      value={st.view}
      onChange={st.switchView}
      options={[{ id: 'habits', label: t('tracker.segHabits') }, { id: 'refusals', label: t('tracker.segQuits') }]}
      style={mobile ? { marginTop: 18 } : { marginTop: 22, maxWidth: 340 }}
    />
  );

  const body = st.view === 'habits' ? <HabitsView t={t} st={st} mobile={mobile} /> : <RefusalsView t={t} st={st} mobile={mobile} />;

  if (isDesktop) {
    return (
      <div className={s.desktop}>
        <div className={s.header} style={{ alignItems: 'flex-start' }}>
          <div>
            <div className={s.caps} style={{ letterSpacing: '.26em' }}>{t('tracker.arcDayCaps', { n: todayStats.arcDay })}</div>
            <div className={s.title} style={{ font: '800 34px/1 var(--font-ui)', letterSpacing: '-.01em', marginTop: 10 }}>{t('tracker.title')}</div>
          </div>
          <Avatar initials={todayStats.initials} />
        </div>
        {seg}
        {body}
      </div>
    );
  }

  return (
    <>
      <div className={s.mobileScroll} ref={st.scrollRef} data-scroll>
        <div className={s.header} style={{ alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link to="/" className={s.back} aria-label={t('nav.today')}><Icon name="back" size={18} sw={2} /></Link>
            <div>
              <div className={s.caps} style={{ letterSpacing: '.24em' }}>{t('tracker.arcDayCaps', { n: todayStats.arcDay })}</div>
              <div className={s.title} style={{ font: '800 22px/1.1 var(--font-ui)', marginTop: 5 }}>{t('tracker.title')}</div>
            </div>
          </div>
          <Avatar initials={todayStats.initials} />
        </div>
        {seg}
        {body}
      </div>
      <button type="button" className={s.fab} onClick={st.startAdd} aria-label={t('common.add')}>
        <Icon name="plus" size={22} sw={2} />
      </button>
    </>
  );
}

function Composer({ t, st, placeholder, withRequired }: { t: T; st: St; placeholder: string; withRequired: boolean }) {
  return (
    <>
      <div className={s.composer}>
        <input
          autoFocus value={st.draft} onChange={(e) => st.setDraft(e.target.value)} placeholder={placeholder} className={s.composerInput}
          onKeyDown={(e) => { if (e.key === 'Enter') st.confirmAdd(); if (e.key === 'Escape') st.cancelAdd(); }}
        />
        <button type="button" className={s.addBtn} onClick={st.confirmAdd}>{t('tracker.add')}</button>
        <button type="button" className={s.closeBtn} onClick={st.cancelAdd} aria-label={t('common.close')}>×</button>
      </div>
      {withRequired ? (
        <HabitOptions t={t} d={st.habitDraft} set={(p) => st.setHabitDraft((x) => ({ ...x, ...p }))} />
      ) : (
        <QuitOptions t={t} d={st.quitDraft} set={(p) => st.setQuitDraft((x) => ({ ...x, ...p }))} />
      )}
      {withRequired && (
        <button type="button" className={s.reqRow} onClick={() => st.setDraftRequired(!st.draftRequired)} role="switch" aria-checked={st.draftRequired}>
          <span className={s.track} data-on={st.draftRequired}><span className={s.knob} /></span>
          <span>{t('tracker.requiredToggle')}</span>
        </button>
      )}
    </>
  );
}

function HabitsView({ t, st, mobile }: { t: T; st: St; mobile: boolean }) {
  const allDone = st.habits.length > 0 && st.habits.every((h) => h.week.includes('today-done'));
  const mt = mobile ? 16 : 18;
  const cards = st.habits.map((h) => (
    <HabitCard
      key={h.id} t={t} h={h} mobile={mobile} expanded={st.expandedId === h.id}
      onToggleExpand={() => st.setExpandedId(st.expandedId === h.id ? null : h.id)}
      onDelete={() => st.setHabits((l) => l.filter((x) => x.id !== h.id))}
      onToggleToday={() => st.toggleToday(h.id)}
    />
  ));
  const composer = st.composing && <Composer t={t} st={st} placeholder={t('tracker.habitPlaceholder')} withRequired />;
  return (
    <>
      {st.habits.length === 0 && (
        <div className={s.empty} style={{ marginTop: mt }}>
          <div className={s.emptyTitle}>{t('tracker.emptyTitle')}</div>
          <div className={s.emptySub}>{t('tracker.emptySub')}</div>
        </div>
      )}
      {allDone && (
        <div className={s.allDone} style={{ marginTop: mt }}>
          <span className={s.allDoneIcon}><Icon name="check" size={13} sw={3.2} /></span>
          <div><div className={s.allDoneTitle}>{t('tracker.allDoneTitle')}</div><div className={s.allDoneSub}>{t('tracker.allDoneSub')}</div></div>
        </div>
      )}
      {mobile ? (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {cards}
          {composer}
        </div>
      ) : (
        <>
          <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 14, alignItems: 'start' }}>{cards}</div>
          <div style={{ marginTop: 14, maxWidth: 520 }}>{composer}</div>
        </>
      )}
    </>
  );
}

function RefusalsView({ t, st, mobile }: { t: T; st: St; mobile: boolean }) {
  const cards = st.refusals.map((r) => (
    <RefusalCard
      key={r.id} t={t} r={r} now={st.now} mobile={mobile}
      goalOverride={st.goalOverrides[r.id]} menuOpen={st.goalMenuId === r.id}
      onToggleMenu={() => st.setGoalMenuId(st.goalMenuId === r.id ? null : r.id)}
      onPickGoal={(g) => { st.setGoalOverrides((o) => ({ ...o, [r.id]: g })); st.setGoalMenuId(null); }}
      onDelete={() => st.setRefusals((l) => l.filter((x) => x.id !== r.id))}
      onSlip={() => st.setSlipId(r.id)}
    />
  ));
  const composer = st.composing && <Composer t={t} st={st} placeholder={t('tracker.quitPlaceholder')} withRequired={false} />;
  const slipDialog = (
    <ConfirmDialog open={!!st.slipId} title={t('tracker.relapseTitle')} body={t('tracker.relapseBody')} danger
      confirmLabel={t('tracker.relapseOk')} cancelLabel={t('common.cancel')} onConfirm={st.confirmSlip} onCancel={() => st.setSlipId(null)} />
  );
  if (mobile) {
    return (
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className={s.intro} style={{ fontSize: 12, lineHeight: 1.5, padding: '0 2px' }}>{t('tracker.quitsIntro')}</div>
        {cards}
        {composer}
        {slipDialog}
      </div>
    );
  }
  return (
    <div style={{ marginTop: 18 }}>
      {slipDialog}
      <div className={s.intro} style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>{t('tracker.quitsIntro')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)', gap: 14, alignItems: 'start' }}>{cards}</div>
      <div style={{ marginTop: 14, maxWidth: 520 }}>{composer}</div>
    </div>
  );
}
