import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { config } from '../../config';
import { useAddAction } from '../../app/nav';
import { useT, type T } from '../../i18n';
import { useIsDesktop } from '../../lib/useIsDesktop';
import { useHeader } from '../../data/header';
import { addHabit, addQuit, archiveHabit, archiveQuit, buildTracker, restoreHabit, fetchTracker, relapse, setQuitGoal, setQuitSince, undoRelapse } from '../../data/tracker';
import { writeLog } from '../../data/today';
import { hasBackend } from '../../lib/supabase';
import { useAuth, isProPlan } from '../../lib/auth';
import { HABIT_PALETTE, refusals as seedRefusals, trackerHabits, type Refusal, type TrackerHabit } from '../../mock/tracker';
import { Icon } from '../../ui/Icon';
import { Avatar, ConfirmDialog, Segmented } from '../../ui/primitives';
import { HabitCard, RefusalCard } from './cards';
import { defaultHabitDraft, defaultQuitDraft, HabitOptions, QuitOptions, sinceIso, type HabitDraft, type QuitDraft } from './ComposerOptions';
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
  const [expandedId, setExpandedId] = useState<string | null>(hasBackend ? null : 'water');
  const [composing, setComposing] = useState(!!location.state?.compose);
  const [draft, setDraft] = useState('');
  const [draftRequired, setDraftRequired] = useState(true);
  const [goalOverrides, setGoalOverrides] = useState<Record<string, number>>({});
  const [goalMenuId, setGoalMenuId] = useState<string | null>(null);
  const [habits, setHabits] = useState<TrackerHabit[]>(hasBackend ? [] : trackerHabits);
  const [refusals, setRefusals] = useState<Refusal[]>(hasBackend ? [] : seedRefusals);
  // backend: server data seeds the local state; writes are optimistic, then refetched
  const session = useAuth((x) => x.session);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['tracker'], queryFn: fetchTracker, enabled: hasBackend && !!session, refetchOnWindowFocus: false });
  useEffect(() => {
    if (!q.data) return;
    const b = buildTracker(q.data);
    setHabits(b.habits); setRefusals(b.refusals);
    setGoalOverrides(Object.fromEntries(b.refusals.filter((r) => r.goalDays).map((r) => [r.id, r.goalDays!])));
  }, [q.data]);
  const sync = (p: Promise<unknown>) => {
    void p.finally(() => { void qc.invalidateQueries({ queryKey: ['tracker'] }); void qc.invalidateQueries({ queryKey: ['today'] }); });
  };
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [habitDraft, setHabitDraft] = useState<HabitDraft>(defaultHabitDraft(HABIT_PALETTE[trackerHabits.length % HABIT_PALETTE.length]));
  const [quitDraft, setQuitDraft] = useState<QuitDraft>(defaultQuitDraft());
  const [slipId, setSlipId] = useState<string | null>(null);
  const [limitOpen, setLimitOpen] = useState(false);
  const [deleted, setDeleted] = useState<{ h: TrackerHabit; idx: number } | null>(null);
  useEffect(() => { if (!deleted) return; const tm = setTimeout(() => setDeleted(null), 5000); return () => clearTimeout(tm); }, [deleted]);
  const plan = useAuth((x) => x.plan);
  const habitLimit = hasBackend && !isProPlan(plan) ? config.limits.free.habits : Infinity;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const startAdd = () => {
    // Free plan: up to 5 habits (the database enforces it too)
    if (view === 'habits' && habits.length >= habitLimit) { setLimitOpen(true); return; }
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
      if (hasBackend) sync(addHabit(name, d, draftRequired, habits.length).catch((e) => { if (String(e?.message).includes('limit:habits')) setLimitOpen(true); }));
    } else {
      const unit = quitDraft.unit.trim();
      const item: Refusal = {
        id: 'r' + Date.now(), name: text, icon: 'ban', hue: HABIT_PALETTE[refusals.length % HABIT_PALETTE.length],
        quit: sinceIso(quitDraft.since), savedLabel: unit ? undefined : 'slips', unit: unit || undefined, savedUnit: quitDraft.norm,
        relapses: 0, best: 0,
      };
      setRefusals((l) => [...l, item]);
      if (hasBackend) sync(addQuit(name, quitDraft, item.hue));
    }
    setComposing(false);
    setDraft('');
  };

  const toggleToday = (id: string) => {
    const h0 = habits.find((h) => h.id === id);
    if (hasBackend && h0) {
      const wasDone = h0.week.includes('today-done');
      if (!wasDone) navigator.vibrate?.(15);
      const full = h0.type === 'counter' ? h0.target ?? 1 : h0.type === 'duration' ? h0.minutes ?? 1 : 1;
      sync(writeLog(id, wasDone ? 0 : full, !wasDone));
    }
    setHabits((list) => list.map((h) => {
    if (h.id !== id) return h;
    const week = h.week.slice();
    const ti = week.findIndex((x) => x === 'today' || x === 'today-done');
    if (ti < 0) return h;
    const nowDone = week[ti] === 'today-done';
    week[ti] = nowDone ? 'today' : 'today-done';
    return { ...h, week, streak: h.streak + (nowDone ? -1 : 1), total: h.total + (nowDone ? -1 : 1) };
  }));
  };

  // A6: a slip restarts the timer; the best clean run and slip count are kept
  // audit 3.4: optional note, and a 5-minute undo after a slip
  const [slipNote, setSlipNote] = useState('');
  const [undo, setUndo] = useState<{ quitId: string; prev: Refusal; relapseId: Promise<string | null> } | null>(null);
  useEffect(() => { if (!undo) return; const tm = setTimeout(() => setUndo(null), 5 * 60 * 1000); return () => clearTimeout(tm); }, [undo]);
  const undoSlip = () => {
    if (!undo) return;
    const u = undo;
    setUndo(null);
    setRefusals((list) => list.map((r) => (r.id === u.quitId ? u.prev : r)));
    if (hasBackend) sync(u.relapseId.then((rid) => (rid ? undoRelapse(rid) : undefined)));
  };
  const confirmSlip = () => {
    const id = slipId;
    const prev = refusals.find((r) => r.id === id);
    const rid = hasBackend && id ? relapse(id, slipNote).catch(() => null) : Promise.resolve(null);
    if (hasBackend) sync(rid);
    if (id && prev) setUndo({ quitId: id, prev, relapseId: rid });
    setSlipNote('');
    setRefusals((list) => list.map((r) => {
      if (r.id !== id) return r;
      const days = Math.floor((Date.now() - new Date(r.quit).getTime()) / 86400000);
      return { ...r, quit: new Date().toISOString(), relapses: r.relapses + 1, best: Math.max(r.best, days) };
    }));
    setSlipId(null);
  };

  return {
    habitDraft, setHabitDraft, quitDraft, setQuitDraft, slipId, setSlipId, confirmSlip, slipNote, setSlipNote, undo, undoSlip,
    view, switchView, now, expandedId, setExpandedId, composing, draft, setDraft, draftRequired, setDraftRequired,
    goalOverrides, setGoalOverrides, goalMenuId, setGoalMenuId, habits, setHabits, refusals, setRefusals,
    startAdd, cancelAdd, confirmAdd, toggleToday, scrollRef,
    ready: !hasBackend || !!q.data, limitOpen, setLimitOpen, habitLimit,
    removeHabit: (id: string) => {
      // audit 4.7: 5 seconds to undo a deletion
      const idx = habits.findIndex((x) => x.id === id);
      if (idx >= 0) setDeleted({ h: habits[idx], idx });
      setHabits((l) => l.filter((x) => x.id !== id));
      if (hasBackend) sync(archiveHabit(id));
    },
    deleted,
    undoDelete: () => {
      if (!deleted) return;
      const d = deleted;
      setDeleted(null);
      setHabits((l) => { const n = l.slice(); n.splice(Math.min(d.idx, n.length), 0, d.h); return n; });
      if (hasBackend) sync(restoreHabit(d.h.id));
    },
    removeQuit: (id: string) => { setRefusals((l) => l.filter((x) => x.id !== id)); if (hasBackend) sync(archiveQuit(id)); },
    setSince: (id: string, day: string) => {
      const iso = sinceIso(day);
      setRefusals((l) => l.map((r) => (r.id === id ? { ...r, quit: iso } : r)));
      if (hasBackend) sync(setQuitSince(id, iso));
    },
    pickGoal: (id: string, g: number) => { setGoalOverrides((o) => ({ ...o, [id]: g })); if (hasBackend) sync(setQuitGoal(id, g)); },
  };
}
type St = ReturnType<typeof useTracker>;

export function Tracker() {
  const t = useT();
  const isDesktop = useIsDesktop();
  const st = useTracker();
  const hd = useHeader();
  const navigate = useNavigate();
  const mobile = !isDesktop;
  if (!st.ready) return <div style={{ flex: 1, background: 'var(--bg)' }} />;

  const seg = (
    <Segmented
      variant="tracker"
      value={st.view}
      onChange={st.switchView}
      options={[{ id: 'habits', label: t('tracker.segHabits') }, { id: 'refusals', label: t('tracker.segQuits') }]}
      style={mobile ? { marginTop: 18 } : { marginTop: 22, maxWidth: 340 }}
    />
  );

  const limitDialog = (
    <ConfirmDialog open={st.limitOpen} title={t('tracker.limitTitle')} body={t('tracker.limitDesc', { n: st.habitLimit })}
      confirmLabel={t('auth.openPro')} cancelLabel={t('goals.gotIt')} onConfirm={() => navigate('/pro')} onCancel={() => st.setLimitOpen(false)} />
  );
  const deletedBar = st.deleted && (
    <div className={s.undoBar} role="status">
      <span>{t('explain.habitDeleted')}</span>
      <button type="button" className={s.undoBtn} onClick={st.undoDelete}>{t('explain.undo')}</button>
    </div>
  );
  const body = st.view === 'habits' ? <HabitsView t={t} st={st} mobile={mobile} /> : <RefusalsView t={t} st={st} mobile={mobile} />;

  if (isDesktop) {
    return (
      <div className={s.desktop}>
        <div className={s.header} style={{ alignItems: 'flex-start' }}>
          <div>
            <div className={s.caps} style={{ letterSpacing: '.26em' }}>{t('tracker.arcDayCaps', { n: hd.arcDay })}</div>
            <div className={s.title} style={{ font: '800 34px/1 var(--font-ui)', letterSpacing: '-.01em', marginTop: 10 }}>{t('tracker.title')}</div>
          </div>
          <Avatar initials={hd.initials} />
        </div>
        {seg}
        {body}
        {limitDialog}
        {deletedBar}
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
              <div className={s.caps} style={{ letterSpacing: '.24em' }}>{t('tracker.arcDayCaps', { n: hd.arcDay })}</div>
              <div className={s.title} style={{ font: '800 22px/1.1 var(--font-ui)', marginTop: 5 }}>{t('tracker.title')}</div>
            </div>
          </div>
          <Avatar initials={hd.initials} />
        </div>
        {seg}
        {body}
        {limitDialog}
        {deletedBar}
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
      onDelete={() => st.removeHabit(h.id)}
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
      onPickGoal={(g) => { st.pickGoal(r.id, g); st.setGoalMenuId(null); }}
      onDelete={() => st.removeQuit(r.id)}
      onSlip={() => st.setSlipId(r.id)}
      onSetSince={(day) => st.setSince(r.id, day)}
    />
  ));
  const composer = st.composing && <Composer t={t} st={st} placeholder={t('tracker.quitPlaceholder')} withRequired={false} />;
  const slipQuit = st.refusals.find((r) => r.id === st.slipId);
  const slipDays = slipQuit ? Math.floor(Math.max(0, st.now - new Date(slipQuit.quit).getTime()) / 86400000) : 0;
  const slipDialog = (
    <ConfirmDialog open={!!st.slipId} title={t('tracker.relapseTitle')}
      body={(
        <>
          {t('tracker.relapseBody', { d: slipDays, b: Math.max(slipQuit?.best ?? 0, slipDays) })}
          <textarea className={s.slipNote} value={st.slipNote} onChange={(e) => st.setSlipNote(e.target.value)} placeholder={t('tracker.relapseNote')} maxLength={500} />
        </>
      )}
      confirmLabel={t('tracker.relapseOk')} cancelLabel={t('common.cancel')} onConfirm={st.confirmSlip} onCancel={() => { st.setSlipId(null); st.setSlipNote(''); }} />
  );
  const undoBar = st.undo && (
    <div className={s.undoBar} role="status">
      <span>{t('tracker.relapseLogged')}</span>
      <button type="button" className={s.undoBtn} onClick={st.undoSlip}>{t('tracker.relapseUndo')}</button>
    </div>
  );
  if (mobile) {
    return (
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className={s.intro} style={{ fontSize: 12, lineHeight: 1.5, padding: '0 2px' }}>{t('tracker.quitsIntro')}</div>
        {cards}
        {composer}
        {slipDialog}
        {undoBar}
      </div>
    );
  }
  return (
    <div style={{ marginTop: 18 }}>
      {slipDialog}
      {undoBar}
      <div className={s.intro} style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>{t('tracker.quitsIntro')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)', gap: 14, alignItems: 'start' }}>{cards}</div>
      <div style={{ marginTop: 14, maxWidth: 520 }}>{composer}</div>
    </div>
  );
}
