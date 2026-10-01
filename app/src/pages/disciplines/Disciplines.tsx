import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppHeader } from '../../app/AppHeader';
import { config } from '../../config';
import { buildTracker } from '../../data/tracker';
import { HABIT_DOMAINS } from '../../data/domains';
import { habitBest, indexLogs } from '../../data/model';
import { useT, type T } from '../../i18n';
import { isProPlan, useAuth } from '../../lib/auth';
import { isoDay } from '../../lib/day';
import { hasBackend } from '../../lib/supabase';
import { HABIT_PALETTE, type TrackerHabit } from '../../mock/tracker';
import { addQuit, archiveHabit, archiveQuit, createHabit, deleteHabit, logRelapse, reorderHabits, restoreHabit, restoreQuit, updateHabit, updateQuit } from '../../state/actions';
import { trackerRawOf, useSystem, type SystemRaw } from '../../state/system';
import { Icon } from '../../ui/Icon';
import { useAutoTour } from '../../ui/Tour';
import { EmptyState } from '../../ui/EmptyState';
import { PageState } from '../../ui/PageState';
import { ConfirmDialog } from '../../ui/primitives';
import { toast } from '../../ui/toast';
import { QuitTile } from './QuitTile';
import { Sheet } from '../../ui/Sheet';
import { defaultQuitDraft, QuitOptions, sinceIso, type QuitDraft } from '../tracker/ComposerOptions';
import d from './disciplines.module.css';
import { HabitSetup } from './HabitSetup';
import { useHoldReorder } from '../../ui/useHoldReorder';

/*
 * Disciplines (Master Changeset section 5): configuration and history of habits and quits.
 * Daily ticking lives on Today. Core zone (3–5 slots, they carry the streak) and Extra zone,
 * one-line composer (step 1) + Setup (step 2), Active / Quits / Archive tabs.
 */
type Tab = 'active' | 'quits' | 'archive';

export function Disciplines() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'active';
  const setTab = (v: Tab) => setParams((p) => { const n = new URLSearchParams(p); if (v === 'active') n.delete('tab'); else n.set('tab', v); return n; }, { replace: true });
  const q = useSystem((r) => r);
  const plan = useAuth((x) => x.plan);
  const coreLimit = hasBackend && !isProPlan(plan) ? config.limits.free.core : Infinity;
  const sys = q.data;
  const data = useMemo(() => (sys ? { ...buildTracker(trackerRawOf(sys)), raw: sys } : null), [sys]);
  useAutoTour('disciplines', !!data && tab === 'active');
  if (!data) return <PageState variant="list" error={q.isError && !q.data} onRetry={() => { void q.refetch(); }} />;
  const coreN = data.raw.habits.filter((h) => h.core && !h.archived_at).length;
  const quitsN = data.refusals.length;
  const archN = data.raw.habits.filter((h) => h.archived_at).length;
  return (
    <div className={d.scroll} data-scroll>
      <div className="pg">
        <AppHeader title={t('nav.disciplines')} sub={<span className={d.headSub}>{coreLimit === Infinity ? `Core · ${coreN}` : t('disc.coreSlots', { n: coreN, m: coreLimit })}</span>} />
        <div className="tabs" role="tablist">
          {([['active', t('disc.tabs.active'), data.habits.length], ['quits', t('disc.tabs.quits'), quitsN], ['archive', t('disc.tabs.archive'), archN]] as [Tab, string, number][]).map(([id, label, n]) => (
            <button key={id} type="button" role="tab" className="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}<sup>{n}</sup></button>
          ))}
        </div>
        {tab === 'active' && <ActiveTab t={t} habits={data.habits} sys={data.raw} coreLimit={coreLimit} />}
        {tab === 'quits' && <QuitsTab t={t} data={data} />}
        {tab === 'archive' && <ArchiveTab t={t} sys={data.raw} />}
      </div>
    </div>
  );
}

/* ---------------- active habits: Core + Extra ---------------- */

function ActiveTab({ t, habits, sys, coreLimit }: { t: T; habits: TrackerHabit[]; sys: SystemRaw; coreLimit: number }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const open = params.get('open');
  const setupId = params.get('setup');
  const setParam = (k: string, v: string | null) => setParams((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });
  const [limit, setLimit] = useState(false);
  const [picking, setPicking] = useState(false);
  const rowsDb = sys.habits.filter((h) => !h.archived_at);
  const isCore = (id: string) => !!rowsDb.find((h) => h.id === id)?.core;
  const core = habits.filter((h) => isCore(h.id));
  const extra = habits.filter((h) => !isCore(h.id));
  const slots = Math.max(0, Math.min(5, coreLimit) - core.length);

  const toggleCore = (id: string) => {
    const h = rowsDb.find((x) => x.id === id);
    if (!h) return;
    if (!h.core && core.length >= coreLimit) { setLimit(true); return; }
    updateHabit(id, { core: !h.core });
    toast.action(t(h.core ? 'disc.movedExtra' : 'disc.movedCore', { x: h.name }), t('explain.undo'), () => updateHabit(id, { core: h.core }), 5000);
  };
  const archive = (id: string) => {
    const h = rowsDb.find((x) => x.id === id);
    archiveHabit(id);
    setParam('open', null);
    toast.action(t('disc.archived', { x: h?.name ?? '' }), t('explain.undo'), () => restoreHabit(id), 5000);
  };
  const move = (id: string, dir: -1 | 1) => {
    const ids = habits.map((h) => h.id);
    const i = ids.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorderHabits(ids);
  };
  // hold a tile to reorder it, or to carry it between Core and Extra
  const rd = useHoldReorder({
    zones: { core: core.map((h) => h.id), extra: extra.map((h) => h.id) },
    canEnter: (_id, zone) => zone !== 'core' || core.length < coreLimit,
    onDrop: (z, id, from, to) => {
      reorderHabits([...z.core, ...z.extra]);
      if (from !== to) {
        const h = rowsDb.find((x) => x.id === id);
        updateHabit(id, { core: to === 'core' });
        toast.action(t(to === 'core' ? 'disc.movedCore' : 'disc.movedExtra', { x: h?.name ?? '' }), t('explain.undo'), () => updateHabit(id, { core: from === 'core' }), 5000);
      }
    },
  });
  const byId = new Map(habits.map((h) => [h.id, h]));
  const coreView = rd.zones.core.map((id) => byId.get(id)!).filter(Boolean);
  const extraView = rd.zones.extra.map((id) => byId.get(id)!).filter(Boolean);
  const detail = habits.find((h) => h.id === open) ?? null;
  const setupHabit = rowsDb.find((h) => h.id === setupId) ?? null;

  let i = 0;
  const cards = (items: TrackerHabit[]) => items.map((h) => (
    <HabitCard key={h.id} t={t} h={h} db={rowsDb.find((x) => x.id === h.id)!} core={isCore(h.id)} style={{ '--i': i++ } as React.CSSProperties}
      hold={rd.bind(h.id)} onOpen={() => { if (!rd.justDropped()) setParam('open', h.id); }} />
  ));

  return (
    <>
      <div className="caption" data-tour="disc-core"><b>{t('home.core')}</b><span>{t('disc.coreMeta', { n: core.length, m: Math.min(5, coreLimit) })}</span></div>
      <div className="tl-grid" data-zone="core" data-empty={(rd.liftId && coreView.length === 0) || undefined}>
        {cards(coreView)}
        {!rd.liftId && Array.from({ length: Math.min(slots, core.length >= 3 ? 1 : 3 - core.length) }, (_, k) => (
          <button key={'slot' + k} type="button" className="tl tl-ghost" style={{ '--i': i++ } as React.CSSProperties} onClick={() => setPicking(true)}>
            <span className="tl-top"><span className="cb"><Icon name="plus" size={18} sw={1.8} /></span></span>
            <span className="tl-text"><span className="tl-name">{t('disc.pickCore')}</span><span className="tl-sub">{t('disc.coreHint')}</span></span>
          </button>
        ))}
      </div>
      <div className="caption" data-tour="disc-extra"><b>{t('home.extra')}</b><span>{extra.length ? t('disc.extraHintShort') : t('disc.extraHint')}</span></div>
      {(extra.length > 0 || rd.liftId) && <div className="tl-grid" data-zone="extra" data-empty={extraView.length === 0 || undefined}>{cards(extraView)}</div>}
      {habits.length > 1 && <div className={d.holdHint}><Icon name="move" size={13} sw={1.8} />{t('disc.holdHint')}</div>}
      <Composer t={t} coreN={core.length} count={sys.habits.length} />
      <Sheet open={!!detail} onClose={() => setParam('open', null)} title={detail ? t.pick(detail.name) : ''}>
        {detail && <HabitDetail t={t} h={detail} core={isCore(detail.id)} onSetup={() => setParam('setup', detail.id)} onCore={() => toggleCore(detail.id)} onArchive={() => archive(detail.id)} onMove={(dir) => move(detail.id, dir)} onToday={() => navigate('/')} />}
      </Sheet>
      <HabitSetup habit={setupHabit} onClose={() => setParam('setup', null)} coreLimit={coreLimit} coreN={core.length} onLimit={() => setLimit(true)} />
      <ConfirmDialog open={limit} title={t('disc.limitTitle', { n: coreLimit })} body={t('disc.limitBody', { n: coreLimit })} confirmLabel={t('auth.openPro')} cancelLabel={t('goals.gotIt')}
        onConfirm={() => navigate('/pro')} onCancel={() => setLimit(false)} />
      <ConfirmDialog open={picking} title={t('disc.pickTitle')} cancelLabel={t('common.close')} confirmLabel={t('disc.pickNew')}
        body={extra.length ? (
          <span className={d.pickList}>
            {extra.map((h) => <button key={h.id} type="button" className={d.pickRow} onClick={() => { setPicking(false); toggleCore(h.id); }}><Icon name={h.icon} size={15} />{t.pick(h.name)}</button>)}
          </span>
        ) : t('disc.pickEmpty')}
        onConfirm={() => { setPicking(false); document.getElementById('disc-composer')?.focus(); }} onCancel={() => setPicking(false)} />
    </>
  );
}

/** A habit as a device tile: icon in a round button, name, schedule, the week as dots, the streak. */
function HabitCard({ t, h, db, core, style, hold, onOpen }: { t: T; h: TrackerHabit; db: SystemRaw['habits'][number]; core: boolean; style: React.CSSProperties; hold: ReturnType<ReturnType<typeof useHoldReorder>['bind']>; onOpen: () => void }) {
  const domain = HABIT_DOMAINS[db.category as keyof typeof HABIT_DOMAINS];
  const hue = domain?.hue ?? h.hue;
  const doneToday = h.week.includes('today-done');
  return (
    <button type="button" className={`tl ${d.holdTile} ${doneToday ? 'tl-light' : ''}`} style={{ ...style, '--hue': hue } as React.CSSProperties} onClick={onOpen} {...hold}>
      <span className="tl-top">
        <span className="cb" style={doneToday ? { background: '#FFFFFF', color: 'var(--c-on)' } : { color: hue }}><Icon name={h.icon} size={18} sw={1.8} /></span>
        <span className={d.streakBadge} title={t('disc.streak')}>{h.streak}{core && <i />}</span>
      </span>
      <span className="tl-text">
        <span className="tl-name">{t.pick(h.name)}</span>
        <span className="tl-sub">{domain ? t(domain.label) : ''} · {daysLabel(t, db.days)}</span>
        <span className="dots7" style={{ marginTop: 8 }} aria-hidden="true">{h.week.map((w, k) => <i key={k} data-s={w} />)}</span>
      </span>
    </button>
  );
}

export function daysLabel(t: T, days: number) {
  if (days === 127) return t('tracker.cadences.daily');
  if (days === 31) return t('tracker.cadences.weekdays');
  if (days === 96) return t('tracker.cadences.weekends');
  const names = t.list('weekdays.short');
  return names.filter((_, i) => days & (1 << i)).join(', ');
}

function HabitDetail({ t, h, core, onSetup, onCore, onArchive, onMove, onToday }: {
  t: T; h: TrackerHabit; core: boolean; onSetup: () => void; onCore: () => void; onArchive: () => void; onMove: (dir: -1 | 1) => void; onToday: () => void;
}) {
  return (
    <div className={d.detail}>
      <div className={d.stats}>
        <div><b>{h.rate ?? 0}%</b><span>{t('disc.rate')}</span></div>
        <div><b>{h.best}</b><span>{t('disc.best')}</span></div>
        <div><b>{h.total}</b><span>{t('disc.total')}</span></div>
      </div>
      <div className={d.grid} role="img" aria-label={t('disc.gridLabel')}>
        {(h.grid ?? []).map((c, k) => <i key={k} data-s={c} style={c === 'done' ? { background: h.hue } : undefined} />)}
      </div>
      <div className={d.actions}>
        <button type="button" className="pill pill-white" onClick={onSetup}><Icon name="tune" size={16} />{t('add.setup')}</button>
        <button type="button" className="pill" onClick={onCore}>{core ? t('disc.toExtra') : t('disc.toCore')}</button>
        <button type="button" className="pill" onClick={onToday}>{t('disc.openToday')}</button>
        <button type="button" className="cb cb-sm" onClick={() => onMove(-1)} aria-label={t('disc.up')}><Icon name="chevron" size={16} sw={1.8} style={{ transform: 'rotate(-90deg)' }} /></button>
        <button type="button" className="cb cb-sm" onClick={() => onMove(1)} aria-label={t('disc.down')}><Icon name="chevron" size={16} sw={1.8} style={{ transform: 'rotate(90deg)' }} /></button>
        <button type="button" className="pill" style={{ color: 'var(--dot-coral)' }} onClick={onArchive}><Icon name="archive" size={16} />{t('disc.archive')}</button>
      </div>
    </div>
  );
}

function Composer({ t, coreN, count }: { t: T; coreN: number; count: number }) {
  const [name, setName] = useState('');
  const [, setParams] = useSearchParams();
  const submit = () => {
    const n = name.trim().slice(0, 80);
    if (!n) return;
    const h = createHabit({ id: crypto.randomUUID(), name: n, icon: 'doc', hue: HABIT_PALETTE[count % HABIT_PALETTE.length], type: 'binary', target: null, unit: null, minutes: null, days: 127, category: 'body', core: coreN < 3 });
    setName('');
    toast.action(t(h.core ? 'add.habitCreatedCore' : 'add.habitCreated'), t('add.setup'), () => setParams((p) => { const x = new URLSearchParams(p); x.set('setup', h.id); return x; }), 5000);
  };
  return (
    <form className="field-pill" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <input id="disc-composer" value={name} maxLength={80} placeholder={t('add.habitPh')} onChange={(e) => setName(e.target.value)} enterKeyHint="done" aria-label={t('add.habitPh')} />
      <button type="submit" className="cb cb-white" disabled={!name.trim()} aria-label={t('common.add')}><Icon name="plus" size={20} sw={1.8} /></button>
    </form>
  );
}

/* ---------------- quits ---------------- */

function QuitsTab({ t, data }: { t: T; data: ReturnType<typeof buildTracker> & { raw: SystemRaw } }) {
  const [menu, setMenu] = useState<string | null>(null);
  const [slip, setSlip] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [del, setDel] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [draft, setDraft] = useState<QuitDraft>(defaultQuitDraft());
  const slipQuit = data.refusals.find((r) => r.id === slip);
  const slipDays = slipQuit ? Math.floor(Math.max(0, Date.now() - new Date(slipQuit.quit).getTime()) / 86400000) : 0;
  const delQuit = data.refusals.find((r) => r.id === del);
  const add = () => {
    const n = name.trim().slice(0, 80);
    if (!n) return;
    addQuit({ id: crypto.randomUUID(), name: n, hue: '#D96A5B', icon: 'ban', unit: draft.unit.trim() || null, per_day: draft.norm, clean_since: sinceIso(draft.since) });
    setName(''); setDraft(defaultQuitDraft()); setAdding(false);
    toast.success(t('disc.quitAdded'));
  };
  return (
    <>
      <div className="caption"><b>{t('disc.tabs.quits')}</b><span>{t('tracker.quitsIntro')}</span></div>
      {data.refusals.length === 0 && !adding && <EmptyState title={t('empty.quitsTitle')} sub={t('empty.quitsSub')} cta={{ label: t('disc.addQuit'), run: () => setAdding(true) }} />}
      <div className="tl-grid-2">
        {data.refusals.map((r) => (
          <QuitTile key={r.id} t={t} r={r}
            goalOverride={r.goalDays} menuOpen={menu === r.id}
            onToggleMenu={() => setMenu(menu === r.id ? null : r.id)}
            onPickGoal={(g) => { updateQuit(r.id, { goal_days: g }); setMenu(null); }}
            onDelete={() => setDel(r.id)} onSlip={() => setSlip(r.id)}
            onSetSince={(day) => updateQuit(r.id, { clean_since: sinceIso(day) })} />
        ))}
      </div>
      {adding ? (
        <div className={`tl tl-auto tl-pad ${d.quitForm}`}>
          <input className="field" value={name} autoFocus maxLength={80} placeholder={t('tracker.quitPlaceholder')} onChange={(e) => setName(e.target.value)} aria-label={t('tracker.quitPlaceholder')} />
          <QuitOptions t={t} d={draft} set={(p) => setDraft((x) => ({ ...x, ...p }))} />
          <div className={d.formActions}>
            <button type="button" className="pill" onClick={() => setAdding(false)}>{t('common.cancel')}</button>
            <button type="button" className="pill pill-white" disabled={!name.trim()} onClick={add}>{t('common.add')}</button>
          </div>
        </div>
      ) : data.refusals.length > 0 && (
        <button type="button" className="field-pill" style={{ cursor: 'pointer', border: 'none', color: 'rgba(232,237,243,.5)', font: 'inherit', justifyContent: 'space-between' }} onClick={() => setAdding(true)}>{t('disc.addQuit')}<span className="cb cb-white"><Icon name="plus" size={20} sw={1.8} /></span></button>
      )}
      <ConfirmDialog open={!!slipQuit} title={t('tracker.relapseTitle')} confirmLabel={t('tracker.relapseOk')} cancelLabel={t('common.cancel')}
        body={<>{t('tracker.relapseBody', { d: slipDays, b: Math.max(slipQuit?.best ?? 0, slipDays) })}<textarea className={d.note} value={note} maxLength={500} placeholder={t('tracker.relapseNote')} onChange={(e) => setNote(e.target.value)} /></>}
        onConfirm={() => { if (!slip) return; const undo = logRelapse(slip, note.trim()); setSlip(null); setNote(''); toast.action(t('tracker.relapseLogged'), t('tracker.relapseUndo'), undo, 5 * 60 * 1000); }}
        onCancel={() => { setSlip(null); setNote(''); }} />
      <ConfirmDialog open={!!delQuit} danger title={t('tracker.quitDeleteTitle', { n: delQuit ? t.pick(delQuit.name) : '' })} body={t('tracker.quitDeleteBody')}
        confirmLabel={t('common.delete')} cancelLabel={t('common.cancel')}
        onConfirm={() => { if (!del) return; const q = archiveQuit(del, true); setDel(null); if (q) toast.action(t('disc.archived', { x: q.name }), t('explain.undo'), () => restoreQuit(q), 5000); }}
        onCancel={() => setDel(null)} />
    </>
  );
}

/* ---------------- archive ---------------- */

function ArchiveTab({ t, sys }: { t: T; sys: SystemRaw }) {
  const [del, setDel] = useState<string | null>(null);
  const ix = useMemo(() => indexLogs(sys.logs), [sys.logs]);
  const list = sys.habits.filter((h) => h.archived_at).sort((a, b) => (b.archived_at ?? '').localeCompare(a.archived_at ?? ''));
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(t.lang === 'en' ? 'en-US' : 'ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  const target = list.find((h) => h.id === del);
  useEffect(() => { if (del && !target) setDel(null); }, [del, target]);
  if (!list.length) return <EmptyState title={t('disc.archiveEmpty')} sub={t('disc.archiveEmptySub')} />;
  return (
    <>
      <div className="tl-grid-2">
        {list.map((h, k) => (
          <div key={h.id} className={`tl tl-auto ${d.archRow}`} style={{ '--i': k } as React.CSSProperties}>
            <span className="cb" style={{ color: h.hue }}><Icon name={h.icon as never} size={18} sw={1.8} /></span>
            <span className="tl-text" style={{ flex: 1 }}>
              <span className="tl-name">{h.name}</span>
              <span className="tl-sub">{t('disc.archivedOn', { d: fmt(h.archived_at!) })} · {t('disc.bestN', { n: habitBest(h, ix, isoDay()) })}</span>
            </span>
            <button type="button" className="pill pill-sm pill-white" onClick={() => { restoreHabit(h.id); toast.action(t('disc.restored', { x: h.name }), t('explain.undo'), () => archiveHabit(h.id), 5000); }}>{t('disc.restore')}</button>
            <button type="button" className="cb cb-sm" onClick={() => setDel(h.id)} aria-label={t('disc.deleteForever')}><Icon name="trash" size={15} /></button>
          </div>
        ))}
      </div>
      <ConfirmDialog open={!!target} danger title={t('disc.deleteTitle', { x: target?.name ?? '' })} body={t('disc.deleteBody')} confirmLabel={t('disc.deleteForever')} cancelLabel={t('common.cancel')}
        onConfirm={() => { if (del) deleteHabit(del); setDel(null); }} onCancel={() => setDel(null)} />
    </>
  );
}
