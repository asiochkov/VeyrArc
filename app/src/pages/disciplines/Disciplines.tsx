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
import { useIsDesktop } from '../../lib/useIsDesktop';
import { HABIT_PALETTE, type TrackerHabit } from '../../mock/tracker';
import { addQuit, archiveHabit, archiveQuit, createHabit, deleteHabit, logRelapse, reorderHabits, restoreHabit, restoreQuit, updateHabit, updateQuit } from '../../state/actions';
import { trackerRawOf, useSystem, type SystemRaw } from '../../state/system';
import { Icon } from '../../ui/Icon';
import { useAutoTour } from '../../ui/Tour';
import { PageState } from '../../ui/PageState';
import { ConfirmDialog, Segmented } from '../../ui/primitives';
import { toast } from '../../ui/toast';
import { RefusalCard } from '../tracker/cards';
import { defaultQuitDraft, QuitOptions, sinceIso, type QuitDraft } from '../tracker/ComposerOptions';
import d from './disciplines.module.css';
import { HabitSetup } from './HabitSetup';

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
  if (!data) return <PageState error={q.isError && !q.data} onRetry={() => { void q.refetch(); }} />;
  const coreN = data.raw.habits.filter((h) => h.core && !h.archived_at).length;
  return (
    <div className={d.scroll} data-scroll>
      <div className={d.page}>
        <AppHeader title={t('nav.disciplines')} right={<span className={d.coreChip}>CORE {coreN}/{coreLimit === Infinity ? '∞' : coreLimit}</span>} />
        <Segmented variant="tracker" value={tab} onChange={setTab}
          options={[{ id: 'active', label: t('disc.tabs.active') }, { id: 'quits', label: t('disc.tabs.quits') }, { id: 'archive', label: t('disc.tabs.archive') }]} />
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
  const desktop = useIsDesktop();
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
  const detail = habits.find((h) => h.id === open) ?? null;
  const setupHabit = rowsDb.find((h) => h.id === setupId) ?? null;

  const list = (items: TrackerHabit[]) => items.map((h) => (
    <HabitLine key={h.id} t={t} h={h} db={rowsDb.find((x) => x.id === h.id)!} open={open === h.id}
      onOpen={() => setParam('open', open === h.id ? null : h.id)}
      expanded={!desktop && open === h.id ? <HabitDetail t={t} h={h} core={isCore(h.id)} onSetup={() => setParam('setup', h.id)} onCore={() => toggleCore(h.id)} onArchive={() => archive(h.id)} onMove={(dir) => move(h.id, dir)} onToday={() => navigate('/')} /> : null} />
  ));

  return (
    <div className={d.split} data-detail={desktop && !!detail}>
      <div className={d.col}>
        <section className={d.zone} data-tour="disc-core">
          <div className={d.zoneHead}><span className={d.zoneTitle}>CORE</span><span className={d.zoneMeta}>{t('disc.coreMeta', { n: core.length, m: Math.min(5, coreLimit) })}</span></div>
          <div className={d.zoneHint}>{t('disc.coreHint')}</div>
          <div className={d.rows}>
            {list(core)}
            {Array.from({ length: Math.min(slots, core.length >= 3 ? 1 : 3 - core.length) }, (_, i) => (
              <button key={'slot' + i} type="button" className={d.slot} onClick={() => setPicking(true)}><Icon name="plus" size={14} sw={2} />{t('disc.pickCore')}</button>
            ))}
          </div>
        </section>
        <section className={d.zone} data-tour="disc-extra">
          <div className={d.zoneHead}><span className={d.zoneTitle}>EXTRA</span><span className={d.zoneMeta}>{extra.length}</span></div>
          <div className={d.zoneHint}>{t('disc.extraHint')}</div>
          {extra.length > 0 && <div className={d.rows}>{list(extra)}</div>}
        </section>
        <Composer t={t} coreN={core.length} count={sys.habits.length} />
      </div>
      {desktop && detail && (
        <aside className={d.side} aria-label={t.pick(detail.name)}>
          <div className={d.sideHead}>
            <span className={d.sideTitle}>{t.pick(detail.name)}</span>
            <button type="button" className={d.iconBtn} onClick={() => setParam('open', null)} aria-label={t('common.close')}><Icon name="close" size={14} sw={2} /></button>
          </div>
          <HabitDetail t={t} h={detail} core={isCore(detail.id)} onSetup={() => setParam('setup', detail.id)} onCore={() => toggleCore(detail.id)} onArchive={() => archive(detail.id)} onMove={(dir) => move(detail.id, dir)} onToday={() => navigate('/')} />
        </aside>
      )}
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
    </div>
  );
}

function HabitLine({ t, h, db, open, onOpen, expanded }: { t: T; h: TrackerHabit; db: SystemRaw['habits'][number]; open: boolean; onOpen: () => void; expanded: React.ReactNode }) {
  const domain = HABIT_DOMAINS[db.category as keyof typeof HABIT_DOMAINS];
  return (
    <div className={d.line} data-open={open}>
      <button type="button" className={d.lineMain} onClick={onOpen} aria-expanded={open}>
        <span className={d.lineIcon} style={{ color: domain?.hue ?? h.hue, background: (domain?.hue ?? h.hue) + '1f' }}><Icon name={h.icon} size={16} /></span>
        <span className={d.lineText}>
          <span className={d.lineName}>{t.pick(h.name)}</span>
          <span className={d.lineSub}>{domain ? t(domain.label) : ''} · {daysLabel(t, db.days)}{h.type !== 'binary' ? ' · ' + t.pick(h.cadence) : ''}</span>
        </span>
        <span className={d.mini} aria-hidden="true">
          {h.week.map((w, i) => <i key={i} data-s={w} />)}
        </span>
        <span className={d.streak} title={t('disc.streak')}>{h.streak}</span>
        <span className={d.chev} data-open={open}><Icon name="chevron" size={14} sw={2} /></span>
      </button>
      {expanded}
    </div>
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
        <div><span className={d.statNum}>{h.rate ?? 0}%</span><span className={d.statLab}>{t('disc.rate')}</span></div>
        <div><span className={d.statNum}>{h.best}</span><span className={d.statLab}>{t('disc.best')}</span></div>
        <div><span className={d.statNum}>{h.total}</span><span className={d.statLab}>{t('disc.total')}</span></div>
      </div>
      <div className={d.grid} role="img" aria-label={t('disc.gridLabel')}>
        {(h.grid ?? []).map((c, i) => <i key={i} data-s={c} style={c === 'done' ? { background: h.hue } : undefined} />)}
      </div>
      <div className={d.actions}>
        <button type="button" className={d.btn} onClick={onSetup}><Icon name="tune" size={14} />{t('add.setup')}</button>
        <button type="button" className={d.btn} data-on={core} onClick={onCore}>{core ? t('disc.toExtra') : t('disc.toCore')}</button>
        <button type="button" className={d.btn} onClick={onToday}>{t('disc.openToday')}</button>
        <button type="button" className={d.btn} onClick={() => onMove(-1)} aria-label={t('disc.up')}><Icon name="chevron" size={14} sw={2} style={{ transform: 'rotate(-90deg)' }} /></button>
        <button type="button" className={d.btn} onClick={() => onMove(1)} aria-label={t('disc.down')}><Icon name="chevron" size={14} sw={2} style={{ transform: 'rotate(90deg)' }} /></button>
        <button type="button" className={d.btn} data-danger onClick={onArchive}><Icon name="archive" size={14} />{t('disc.archive')}</button>
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
    <form className={d.composer} onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <Icon name="plus" size={16} sw={2} />
      <input id="disc-composer" className={d.composerInput} value={name} maxLength={80} placeholder={t('add.habitPh')} onChange={(e) => setName(e.target.value)} enterKeyHint="done" aria-label={t('add.habitPh')} />
      <button type="submit" className={d.addBtn} disabled={!name.trim()}>{t('common.add')}</button>
    </form>
  );
}

/* ---------------- quits ---------------- */

function QuitsTab({ t, data }: { t: T; data: ReturnType<typeof buildTracker> & { raw: SystemRaw } }) {
  const mobile = !useIsDesktop();
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
    <div className={d.col}>
      <div className={d.zoneHint}>{t('tracker.quitsIntro')}</div>
      <div className={d.quits}>
        {data.refusals.map((r) => (
          <RefusalCard key={r.id} t={t} r={r} mobile={mobile}
            goalOverride={r.goalDays} menuOpen={menu === r.id}
            onToggleMenu={() => setMenu(menu === r.id ? null : r.id)}
            onPickGoal={(g) => { updateQuit(r.id, { goal_days: g }); setMenu(null); }}
            onDelete={() => setDel(r.id)} onSlip={() => setSlip(r.id)}
            onSetSince={(day) => updateQuit(r.id, { clean_since: sinceIso(day) })} />
        ))}
      </div>
      {adding ? (
        <div className={d.quitForm}>
          <input className={d.composerInput} value={name} autoFocus maxLength={80} placeholder={t('tracker.quitPlaceholder')} onChange={(e) => setName(e.target.value)} aria-label={t('tracker.quitPlaceholder')} />
          <QuitOptions t={t} d={draft} set={(p) => setDraft((x) => ({ ...x, ...p }))} />
          <div className={d.formActions}>
            <button type="button" className={d.btn} onClick={() => setAdding(false)}>{t('common.cancel')}</button>
            <button type="button" className={d.addBtn} disabled={!name.trim()} onClick={add}>{t('common.add')}</button>
          </div>
        </div>
      ) : (
        <button type="button" className={d.slot} onClick={() => setAdding(true)}><Icon name="plus" size={14} sw={2} />{t('disc.addQuit')}</button>
      )}
      <ConfirmDialog open={!!slipQuit} title={t('tracker.relapseTitle')} confirmLabel={t('tracker.relapseOk')} cancelLabel={t('common.cancel')}
        body={<>{t('tracker.relapseBody', { d: slipDays, b: Math.max(slipQuit?.best ?? 0, slipDays) })}<textarea className={d.note} value={note} maxLength={500} placeholder={t('tracker.relapseNote')} onChange={(e) => setNote(e.target.value)} /></>}
        onConfirm={() => { if (!slip) return; const undo = logRelapse(slip, note.trim()); setSlip(null); setNote(''); toast.action(t('tracker.relapseLogged'), t('tracker.relapseUndo'), undo, 5 * 60 * 1000); }}
        onCancel={() => { setSlip(null); setNote(''); }} />
      <ConfirmDialog open={!!delQuit} danger title={t('tracker.quitDeleteTitle', { n: delQuit ? t.pick(delQuit.name) : '' })} body={t('tracker.quitDeleteBody')}
        confirmLabel={t('common.delete')} cancelLabel={t('common.cancel')}
        onConfirm={() => { if (!del) return; const q = archiveQuit(del, true); setDel(null); if (q) toast.action(t('disc.archived', { x: q.name }), t('explain.undo'), () => restoreQuit(q), 5000); }}
        onCancel={() => setDel(null)} />
    </div>
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
  if (!list.length) return <div className={d.emptyBox}><b>{t('disc.archiveEmpty')}</b><span>{t('disc.archiveEmptySub')}</span></div>;
  return (
    <div className={d.col}>
      <div className={d.rows}>
        {list.map((h) => (
          <div key={h.id} className={d.archRow}>
            <span className={d.lineIcon} style={{ color: h.hue, background: h.hue + '1f' }}><Icon name={h.icon as never} size={16} /></span>
            <span className={d.lineText}>
              <span className={d.lineName}>{h.name}</span>
              <span className={d.lineSub}>{t('disc.archivedOn', { d: fmt(h.archived_at!) })} · {t('disc.bestN', { n: habitBest(h, ix, isoDay()) })}</span>
            </span>
            <button type="button" className={d.btn} onClick={() => { restoreHabit(h.id); toast.action(t('disc.restored', { x: h.name }), t('explain.undo'), () => archiveHabit(h.id), 5000); }}>{t('disc.restore')}</button>
            <button type="button" className={d.iconBtn} onClick={() => setDel(h.id)} aria-label={t('disc.deleteForever')}><Icon name="trash" size={14} /></button>
          </div>
        ))}
      </div>
      <ConfirmDialog open={!!target} danger title={t('disc.deleteTitle', { x: target?.name ?? '' })} body={t('disc.deleteBody')} confirmLabel={t('disc.deleteForever')} cancelLabel={t('common.cancel')}
        onConfirm={() => { if (del) deleteHabit(del); setDel(null); }} onCancel={() => setDel(null)} />
    </div>
  );
}
