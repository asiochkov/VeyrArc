import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AppHeader, roman } from '../../app/AppHeader';
import { config } from '../../config';
import { addDays, daysBetween, parseDay } from '../../data/model';
import { useT, type T } from '../../i18n';
import { isProPlan, useAuth } from '../../lib/auth';
import { isoDay } from '../../lib/day';
import { hasBackend } from '../../lib/supabase';
import { useIsDesktop } from '../../lib/useIsDesktop';
import { GOAL_HUES } from '../../mock/goals';
import {
  addGoalStep, createGoal, deleteGoal, deleteGoalStep, logGoalTask, logMood, renameGoalStep, restoreGoalStep, saveDiary, updateGoal,
} from '../../state/actions';
import { activeArc, useSystem, type GoalDb, type SystemRaw } from '../../state/system';
import { Icon } from '../../ui/Icon';
import { PageState } from '../../ui/PageState';
import { ConfirmDialog, MoodFace, Segmented } from '../../ui/primitives';
import { Sheet } from '../../ui/Sheet';
import { toast } from '../../ui/toast';
import g from './goals2.module.css';

/*
 * Goals (Master Changeset section 7): intentions → daily steps → journal.
 * /goals/:goalId?view=day|month keeps the choice in the URL (PROBLEM #23). The day's mood is the
 * one shared with Today (PROBLEM #08); one-off things are Planner events linked to the goal (#20).
 */
type Status = 'future' | 'neutral' | 'missed' | 'done' | 'partial';

const tasksOf = (sys: SystemRaw, id: string) => sys.tasks.filter((x) => x.goal_id === id).sort((a, b) => a.sort - b.sort);
const entryOf = (sys: SystemRaw, id: string, day: string) => sys.entries.find((e) => e.goal_id === id && e.day === day);
function statusOf(sys: SystemRaw, goal: GoalDb, day: string, today: string): Status {
  if (day > today) return 'future';
  if (day < goal.started_on) return 'neutral';
  const ts = tasksOf(sys, goal.id);
  const done = new Set(entryOf(sys, goal.id, day)?.done_task_ids ?? []);
  const n = ts.filter((x) => done.has(x.id)).length;
  if (!ts.length || n === 0) return 'missed';
  return n >= ts.length ? 'done' : 'partial';
}
function streakOf(sys: SystemRaw, goal: GoalDb, today: string) {
  let n = 0;
  let d = today;
  if (statusOf(sys, goal, d, today) !== 'done') d = addDays(d, -1);
  while (d >= goal.started_on && statusOf(sys, goal, d, today) === 'done') { n++; d = addDays(d, -1); }
  return n;
}

export function Goals() {
  const t = useT();
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const { goalId } = useParams();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'month' ? 'month' : 'day';
  const today = isoDay();
  const q = useSystem((r) => r);
  const plan = useAuth((x) => x.plan);
  const limit = hasBackend && !isProPlan(plan) ? config.limits.free.goals : Infinity;
  const [adding, setAdding] = useState(params.get('new') === '1');
  const [recap, setRecap] = useState<string | null>(null);
  useEffect(() => {
    if (params.get('new') !== '1') return;
    setAdding(true);
    setParams((p) => { const n = new URLSearchParams(p); n.delete('new'); return n; }, { replace: true });
  }, [params, setParams]);
  const m = useMemo(() => {
    const sys = q.data;
    if (!sys) return null;
    const active = sys.goals.filter((x) => x.status === 'active');
    const completed = sys.goals.filter((x) => x.status === 'completed');
    const selected = active.find((x) => x.id === goalId) ?? active[0] ?? null;
    return { sys, active, completed, selected };
  }, [q.data, goalId]);
  if (!m) return <PageState variant="list" error={q.isError && !q.data} onRetry={() => { void q.refetch(); }} />;
  const { sys, active, completed, selected } = m;
  const setView = (v: 'day' | 'month') => setParams((p) => { const n = new URLSearchParams(p); if (v === 'day') n.delete('view'); else n.set('view', v); return n; }, { replace: true });
  const pick = (id: string) => navigate(`/goals/${id}${view === 'month' ? '?view=month' : ''}`);
  const atLimit = active.length >= limit;
  const arc = activeArc(sys);

  return (
    <div className={g.scroll} data-scroll>
      <div className={g.page}>
        <AppHeader title={selected ? selected.title : t('nav.goals')}
          right={<button type="button" className={g.newBtn} onClick={() => setAdding(true)} aria-label={t('goals.newGoal')}><Icon name="plus" size={15} sw={2.2} />{desktop && t('goals.newGoal')}</button>} />
        {desktop && selected && <div className={g.crumbs}><Link to="/goals">{t('nav.goals')}</Link> / Arc {roman(arc?.number ?? 1)} / <span>{selected.title}</span></div>}
        {(!desktop || !selected) && (active.length > 0 || completed.length > 0) && (
          <div className={g.chips} role="tablist">
            {active.map((x) => <GoalChip key={x.id} t={t} goal={x} selected={selected?.id === x.id} onPick={() => pick(x.id)} onComplete={() => setRecap(x.id)} />)}
            {completed.map((x) => <button key={x.id} type="button" className={g.doneChip} onClick={() => setRecap(x.id)}>✓ {x.title}</button>)}
          </div>
        )}
        {adding && (atLimit ? (
          <div className={g.limit}>
            <b>{t('goals.limitTitle')}</b>
            <span>{t('goals.limitDesc', { n: limit })}</span>
            <div className={g.row}><button type="button" className={g.ghost} onClick={() => setAdding(false)}>{t('goals.gotIt')}</button><Link to="/pro" className={g.primaryLink}>{t('auth.openPro')}</Link></div>
          </div>
        ) : <GoalForm t={t} sys={sys} onDone={(id) => { setAdding(false); if (id) pick(id); }} />)}
        {!selected ? (
          !adding && <Empty t={t} sys={sys} onDone={(id) => pick(id)} onCustom={() => setAdding(true)} />
        ) : (
          <>
            <GoalHeader t={t} sys={sys} goal={selected} today={today} arcStart={arc?.started_on ?? null} onComplete={() => setRecap(selected.id)} />
            <Segmented variant="goals" value={view} onChange={setView} options={[{ id: 'day', label: t('goals.views.day') }, { id: 'month', label: t('goals.views.month') }]} />
            {view === 'day' ? <DayView key={selected.id} t={t} sys={sys} goal={selected} today={today} /> : <MonthView key={selected.id} t={t} sys={sys} goal={selected} today={today} />}
          </>
        )}
      </div>
      {recap && <Recap t={t} sys={sys} id={recap} onClose={() => setRecap(null)} today={today} />}
    </div>
  );
}

/* ---------------- chips with a visible «…» menu (PROBLEM #14) ---------------- */

function GoalChip({ t, goal, selected, onPick, onComplete }: { t: T; goal: GoalDb; selected: boolean; onPick: () => void; onComplete: () => void }) {
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(goal.title);
  const [del, setDel] = useState(false);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const off = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('mousedown', off); document.addEventListener('touchstart', off);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('touchstart', off); };
  }, [menu]);
  if (renaming) {
    return (
      <form className={g.renameForm} onSubmit={(e) => { e.preventDefault(); const v = name.trim(); if (v) updateGoal(goal.id, { title: v.slice(0, 80) }); setRenaming(false); }}>
        <input className={g.input} value={name} autoFocus maxLength={80} onChange={(e) => setName(e.target.value)} onBlur={() => setRenaming(false)} aria-label={t('goals.rename')} />
      </form>
    );
  }
  return (
    <div className={g.chipWrap} ref={ref}>
      <button type="button" role="tab" aria-selected={selected} className={g.chip} onClick={onPick} onContextMenu={(e) => { e.preventDefault(); setMenu(true); }}
        style={selected ? { background: goal.hue, color: '#06121f', borderColor: goal.hue } : undefined}>
        <span className={g.chipDot} style={{ background: selected ? '#06121f' : goal.hue }} />{goal.title}
      </button>
      {selected && <button type="button" className={g.more} onClick={() => setMenu(!menu)} aria-label={t('goals.menu')} aria-expanded={menu}><Icon name="menu" size={14} sw={2} /></button>}
      {menu && (
        <div className={g.menu} role="menu">
          <button type="button" role="menuitem" onClick={() => { setMenu(false); setRenaming(true); setName(goal.title); }}>{t('goals.rename')}</button>
          <button type="button" role="menuitem" onClick={() => { setMenu(false); onComplete(); }}>{t('goals.complete')}</button>
          <button type="button" role="menuitem" data-danger onClick={() => { setMenu(false); setDel(true); }}>{t('goals.delete')}</button>
        </div>
      )}
      <ConfirmDialog open={del} danger title={t('goals.deleteTitle', { n: goal.title })} body={t('goals.deleteBody')} confirmLabel={t('common.delete')} cancelLabel={t('common.cancel')}
        onConfirm={() => { setDel(false); deleteGoal(goal.id); navigate('/goals'); toast.success(t('goals.deleted')); }} onCancel={() => setDel(false)} />
    </div>
  );
}

/* ---------------- goal header: deadline, progress over the arc, chips ---------------- */

function GoalHeader({ t, sys, goal, today, arcStart, onComplete }: { t: T; sys: SystemRaw; goal: GoalDb; today: string; arcStart: string | null; onComplete: () => void }) {
  const from = arcStart && arcStart > goal.started_on ? arcStart : goal.started_on;
  const days = Math.max(1, daysBetween(from, today) + 1);
  let counted = 0;
  for (let d = from; d <= today; d = addDays(d, 1)) if (statusOf(sys, goal, d, today) === 'done') counted++;
  const streak = streakOf(sys, goal, today);
  const best = Math.max(goal.best_streak, streak);
  const notes = sys.entries.filter((e) => e.goal_id === goal.id && e.diary).length;
  const core = goal.linked_core_habit_id ? sys.habits.find((h) => h.id === goal.linked_core_habit_id) : null;
  const deadline = goal.deadline ? parseDay(goal.deadline).toLocaleDateString(t.lang === 'en' ? 'en-US' : 'ru-RU', { day: 'numeric', month: 'long' }) : null;
  return (
    <section className={g.head}>
      <div className={g.headTop}>
        <span className={g.headSub}>{deadline ? t('goals.until', { d: deadline }) : t('goals.noDeadline')}{core ? ` · ${t('goals.linkedCore', { x: core.name })}` : ''}</span>
        <button type="button" className={g.linkBtn} onClick={onComplete}>{t('goals.complete')}</button>
      </div>
      <div className={g.progress} role="progressbar" aria-valuenow={counted} aria-valuemin={0} aria-valuemax={days} aria-label={t('goals.progressLabel')}>
        <span style={{ width: (counted / days) * 100 + '%', background: goal.hue }} />
      </div>
      <div className={g.headMeta}>{t('goals.counted', { a: counted, b: days })}</div>
      <div className={g.stats}>
        <span className={g.stat}><Icon name="flame" size={13} />{t('goals.streakChip', { n: streak })}</span>
        <span className={g.stat}>{t('goals.bestChip', { n: best })}</span>
        <span className={g.stat}>{t('goals.notesChip', { n: notes })}</span>
      </div>
    </section>
  );
}

/* ---------------- day view ---------------- */

function DayView({ t, sys, goal, today }: { t: T; sys: SystemRaw; goal: GoalDb; today: string }) {
  const [date, setDate] = useState(today);
  const [editing, setEditing] = useState(false);
  const [newStep, setNewStep] = useState('');
  const tasks = tasksOf(sys, goal.id);
  const entry = entryOf(sys, goal.id, date);
  const done = new Set(entry?.done_task_ids ?? []);
  const future = date > today;
  const counted = tasks.length > 0 && tasks.every((x) => done.has(x.id));
  const events = sys.plan.filter((p) => p.linked_goal_id === goal.id && p.day === date);
  const mood = sys.days.find((x) => x.day === date)?.mood ?? null;
  const words = t.list('today.moodWords');
  // steps untouched for 3+ days get a quiet mark (section 7)
  const stale = (id: string) => {
    if (daysBetween(goal.started_on, today) < 3) return false;
    for (let i = 0; i < 3; i++) if (entryOf(sys, goal.id, addDays(today, -i))?.done_task_ids.includes(id)) return false;
    return true;
  };
  const dt = parseDay(date);
  const label = t('goals.dayLabel', { d: dt.getDate(), m: t.list('monthsGen')[dt.getMonth()], w: t.list('weekdaysLower')[dt.getDay()] });
  return (
    <div className={g.dayGrid}>
      <div className={g.dayNav}>
        <button type="button" className={g.navBtn} onClick={() => setDate(addDays(date, -1))} aria-label={t('calendar.prev')}><Icon name="chevronLeft" size={15} sw={2} /></button>
        <span className={g.dayLabel}>{label}</span>
        <button type="button" className={g.navBtn} onClick={() => setDate(addDays(date, 1))} aria-label={t('calendar.next')}><Icon name="chevron" size={15} sw={2} /></button>
        {date !== today && <button type="button" className={g.linkBtn} onClick={() => setDate(today)}>{t('goals.today')}</button>}
      </div>

      <section className={g.card}>
        <div className={g.cardHead}>
          <span className={g.caps}>{t('goals.tasks')}{tasks.length > 0 && <b style={{ color: goal.hue }}> {tasks.filter((x) => done.has(x.id)).length}/{tasks.length}</b>}</span>
          {tasks.length > 0 && <button type="button" className={g.linkBtn} onClick={() => setEditing(!editing)}>{editing ? t('goals.doneEditing') : t('goals.editSteps')}</button>}
        </div>
        <div className={g.hint}>{tasks.length ? t('goals.stepsHint') : t('goals.stepsEmpty')}</div>
        <div className={g.steps}>
          {tasks.map((x) => editing ? (
            <div key={x.id} className={g.step}>
              <input className={g.input} defaultValue={x.text} maxLength={160} aria-label={t('goals.editSteps')} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== x.text) renameGoalStep(x.id, v); }} />
              <button type="button" className={g.iconBtn} aria-label={t('goals.delete')} onClick={() => { const r = deleteGoalStep(x.id); if (r) toast.action(t('goals.stepDeleted'), t('explain.undo'), () => restoreGoalStep(r)); }}><Icon name="trash" size={14} /></button>
            </div>
          ) : (
            <label key={x.id} className={g.step} data-done={done.has(x.id)} data-disabled={future}>
              <input type="checkbox" className={g.check} checked={done.has(x.id)} disabled={future} onChange={() => { if (!done.has(x.id)) navigator.vibrate?.(15); logGoalTask(goal.id, x.id, !done.has(x.id), date); }} />
              <span className={g.stepText}>{x.text}</span>
              {!done.has(x.id) && date === today && stale(x.id) && <span className={g.stale} title={t('goals.staleHint')}>{t('goals.stale')}</span>}
            </label>
          ))}
          {!editing && (
            <form className={g.step} onSubmit={(e) => { e.preventDefault(); const v = newStep.trim().slice(0, 160); if (!v) return; addGoalStep(goal.id, v); setNewStep(''); }}>
              <Icon name="plus" size={15} sw={2} />
              <input className={g.bare} value={newStep} onChange={(e) => setNewStep(e.target.value)} placeholder={t('goals.addStep')} maxLength={160} aria-label={t('goals.addStep')} />
            </form>
          )}
        </div>
        {events.length > 0 && (
          <div className={g.linked}>
            <div className={g.caps}>{t('goals.forToday')}</div>
            {events.map((p) => (
              <Link key={p.id} to={`/planner?day=${p.day}`} className={g.linkedRow} data-done={p.done}>
                <span className={g.time}>{p.starts_at ? p.starts_at.slice(0, 5) : '—'}</span><span>{p.title}</span>
              </Link>
            ))}
          </div>
        )}
        {counted && <div className={g.counted} style={{ color: goal.hue, background: goal.hue + '1f' }}><Icon name="check" size={13} sw={3} />{t('goals.dayCounted')}</div>}
      </section>

      <section className={g.card}>
        <div className={g.cardHead}><span className={g.caps}>{t('goals.moodShared')}</span><span className={g.hint}>{mood ? words[mood - 1] : ''}</span></div>
        <div className={g.moods}>
          {[0, 1, 2, 3, 4].map((i) => (
            <button key={i} type="button" className={g.moodBtn} aria-pressed={mood === i + 1} aria-label={words[i]} disabled={future}
              onClick={() => logMood(mood === i + 1 ? null : i, date)}>
              <MoodFace level={i} size={18} color={mood === i + 1 ? '#A8CBEF' : 'rgba(232,237,243,.45)'} />
            </button>
          ))}
        </div>
        <Diary key={goal.id + date} t={t} goalId={goal.id} date={date} initial={entry?.diary ?? ''} disabled={future} placeholder={future ? t('goals.phFuture') : counted ? t('goals.phDone') : t('goals.phMissed')} />
      </section>
    </div>
  );
}

function Diary({ t, goalId, date, initial, disabled, placeholder }: { t: T; goalId: string; date: string; initial: string; disabled: boolean; placeholder: string }) {
  const [text, setText] = useState(initial);
  const [st, setSt] = useState<'saving' | 'saved' | 'error' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const change = (v: string) => {
    setText(v);
    setSt('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => saveDiary(goalId, date, v, () => setSt('saved'), () => setSt('error')), 700);
  };
  return (
    <div className={g.diaryWrap}>
      <div className={g.cardHead}>
        <span className={g.caps}>{t('goals.diary')}</span>
        {st && <span className={g.saveState} data-state={st} aria-live="polite">{st === 'saved' && <Icon name="check" size={12} sw={3} />}{t(st === 'saving' ? 'goals.saving' : st === 'saved' ? 'goals.saved' : 'goals.saveError')}</span>}
      </div>
      <textarea className={g.diary} value={text} disabled={disabled} maxLength={4000} placeholder={placeholder} onChange={(e) => change(e.target.value)} aria-label={t('goals.diary')} />
    </div>
  );
}

/* ---------------- month view: heatmap, streak line, linked events ---------------- */

function MonthView({ t, sys, goal, today }: { t: T; sys: SystemRaw; goal: GoalDb; today: string }) {
  const [ym, setYm] = useState(() => { const d = parseDay(today); return { y: d.getFullYear(), m: d.getMonth() }; });
  const daysIn = new Date(ym.y, ym.m + 1, 0).getDate();
  const lead = (new Date(ym.y, ym.m, 1).getDay() + 6) % 7;
  const prefix = `${ym.y}-${String(ym.m + 1).padStart(2, '0')}`;
  const iso = (n: number) => `${prefix}-${String(n).padStart(2, '0')}`;
  const line: number[] = [];
  let run = 0;
  for (let n = 1; n <= daysIn; n++) { const d = iso(n); if (d > today) break; run = statusOf(sys, goal, d, today) === 'done' ? run + 1 : 0; line.push(run); }
  const max = Math.max(1, ...line);
  const events = sys.plan.filter((p) => p.linked_goal_id === goal.id && p.day.startsWith(prefix));
  const notes = sys.entries.filter((e) => e.goal_id === goal.id && e.diary && e.day.startsWith(prefix)).sort((a, b) => b.day.localeCompare(a.day));
  const shift = (n: number) => setYm((v) => { const d = new Date(v.y, v.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  return (
    <div className={g.dayGrid}>
      <div className={g.dayNav}>
        <button type="button" className={g.navBtn} onClick={() => shift(-1)} aria-label={t('calendar.prev')}><Icon name="chevronLeft" size={15} sw={2} /></button>
        <span className={g.dayLabel}>{t('goals.monthLabel', { m: t.list('months')[ym.m], y: ym.y })}</span>
        <button type="button" className={g.navBtn} onClick={() => shift(1)} aria-label={t('calendar.next')}><Icon name="chevron" size={15} sw={2} /></button>
      </div>
      <section className={g.card}>
        <div className={g.month}>
          {t.list('weekdays.short').map((w) => <span key={w} className={g.wd}>{w}</span>)}
          {Array.from({ length: lead }, (_, i) => <span key={'l' + i} />)}
          {Array.from({ length: daysIn }, (_, i) => {
            const d = iso(i + 1);
            const st = statusOf(sys, goal, d, today);
            return (
              <span key={d} className={g.cell} data-s={st} data-today={d === today} aria-label={`${i + 1}: ${t(`goals.status.${st}`)}`}
                style={st === 'done' ? { background: goal.hue, color: '#06121f' } : st === 'partial' ? { boxShadow: `inset 0 0 0 2px ${goal.hue}` } : undefined}>{i + 1}</span>
            );
          })}
        </div>
        {line.length > 1 && (
          <svg className={g.spark} viewBox={`0 0 ${line.length - 1} 10`} preserveAspectRatio="none" role="img" aria-label={t('goals.streakLine')}>
            <polyline points={line.map((v, i) => `${i},${10 - (v / max) * 9}`).join(' ')} fill="none" stroke={goal.hue} strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </svg>
        )}
        <div className={g.legend}><i style={{ background: goal.hue }} />{t('goals.legendDone')}<i style={{ boxShadow: `inset 0 0 0 2px ${goal.hue}` }} />{t('goals.legendPartial')}<i data-miss />{t('goals.legendMissed')}</div>
      </section>
      {events.length > 0 && (
        <section className={g.card}>
          <div className={g.caps}>{t('goals.monthEvents')}</div>
          {events.map((p) => <Link key={p.id} to={`/planner?day=${p.day}`} className={g.linkedRow} data-done={p.done}><span className={g.time}>{p.day.slice(8)}.{p.day.slice(5, 7)}</span><span>{p.title}</span></Link>)}
        </section>
      )}
      {notes.length > 0 && (
        <section className={g.card}>
          <div className={g.caps}>{t('goals.entries')}</div>
          {notes.map((e) => <div key={e.day} className={g.note}><span className={g.time}>{e.day.slice(8)}.{e.day.slice(5, 7)}</span><span>{e.diary}</span></div>)}
        </section>
      )}
    </div>
  );
}

/* ---------------- create a goal (and templates) ---------------- */

const TEMPLATES = ['career', 'body', 'project', 'relations', 'learning'] as const;

function GoalForm({ t, sys, onDone, preset }: { t: T; sys: SystemRaw; onDone: (id: string | null) => void; preset?: { title: string; steps: string[] } }) {
  const [title, setTitle] = useState(preset?.title ?? '');
  const [step, setStep] = useState(preset?.steps[0] ?? '');
  const [deadline, setDeadline] = useState('');
  const [core, setCore] = useState('');
  const cores = sys.habits.filter((h) => h.core && !h.archived_at);
  const submit = () => {
    const x = title.trim().slice(0, 80);
    if (!x) return;
    const id = crypto.randomUUID();
    const steps = preset ? [step.trim(), ...preset.steps.slice(1)].filter(Boolean) : step.trim() ? [step.trim().slice(0, 160)] : [];
    createGoal({ id, title: x, hue: GOAL_HUES[sys.goals.length % GOAL_HUES.length], deadline: deadline || null, linkedCoreHabitId: core || null, steps });
    toast.success(t('goals.created'));
    onDone(id);
  };
  return (
    <form className={g.form} onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <input className={g.input} value={title} autoFocus maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder={t('goals.namePlaceholder')} aria-label={t('goals.namePlaceholder')} />
      <div className={g.caps}>{t('goals.stepLabel')}</div>
      <input className={g.input} value={step} maxLength={160} onChange={(e) => setStep(e.target.value)} placeholder={t('goals.stepPlaceholder')} aria-label={t('goals.stepLabel')} />
      <div className={g.hint}>{t('goals.stepFormHint')}</div>
      <label className={g.inline}><span className={g.hint}>{t('goals.deadlineOpt')}</span><input type="date" className={g.input} value={deadline} min={isoDay()} onChange={(e) => setDeadline(e.target.value)} /></label>
      {cores.length > 0 && (
        <label className={g.inline}><span className={g.hint}>{t('goals.linkCore')}</span>
          <select className={g.input} value={core} onChange={(e) => setCore(e.target.value)}>
            <option value="">{t('calendar.linkNone')}</option>
            {cores.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </label>
      )}
      <div className={g.row}>
        <button type="button" className={g.ghost} onClick={() => onDone(null)}>{t('goals.cancel')}</button>
        <button type="submit" className={g.primary} disabled={!title.trim()}>{t('goals.create')}</button>
      </div>
    </form>
  );
}

function Empty({ t, sys, onDone, onCustom }: { t: T; sys: SystemRaw; onDone: (id: string) => void; onCustom: () => void }) {
  const [tpl, setTpl] = useState<(typeof TEMPLATES)[number] | null>(null);
  return (
    <div className={g.empty}>
      <b>{t('goals.emptyTitle2')}</b>
      <span>{t('goals.emptyDesc2')}</span>
      <div className={g.templates}>
        {TEMPLATES.map((k) => (
          <button key={k} type="button" className={g.tpl} aria-pressed={tpl === k} onClick={() => setTpl(k)}>
            <span className={g.tplName}>{t(`goals.tpl.${k}.name`)}</span>
            <span className={g.tplSteps}>{t.list(`goals.tpl.${k}.steps`).join(' · ')}</span>
          </button>
        ))}
      </div>
      {tpl ? (
        <GoalForm key={tpl} t={t} sys={sys} preset={{ title: t(`goals.tpl.${tpl}.title`), steps: [...t.list(`goals.tpl.${tpl}.steps`)] }} onDone={(id) => { setTpl(null); if (id) onDone(id); }} />
      ) : (
        <button type="button" className={g.primary} onClick={onCustom}>{t('goals.emptyCta')}</button>
      )}
    </div>
  );
}

/* ---------------- recap when a goal is completed ---------------- */

function Recap({ t, sys, id, onClose, today }: { t: T; sys: SystemRaw; id: string; onClose: () => void; today: string }) {
  const navigate = useNavigate();
  const goal = sys.goals.find((x) => x.id === id);
  if (!goal) return null;
  const days = Math.max(1, daysBetween(goal.started_on, today) + 1);
  let done = 0;
  for (let d = goal.started_on; d <= today; d = addDays(d, 1)) if (statusOf(sys, goal, d, today) === 'done') done++;
  const best = Math.max(goal.best_streak, streakOf(sys, goal, today));
  const notes = sys.entries.filter((e) => e.goal_id === id && e.diary).length;
  const events = sys.plan.filter((p) => p.linked_goal_id === id).length;
  const finish = () => { updateGoal(id, { status: 'completed', best_streak: best }); toast.success(t('goals.completedToast')); navigate('/goals'); onClose(); };
  return (
    <Sheet open onClose={onClose} title={goal.status === 'active' ? t('goals.completeTitle') : t('goals.recapTitleShort')}>
      <div className={g.recapName}>{goal.title}</div>
      <div className={g.tiles}>
        {([[Math.round((done / days) * 100) + '%', t('goals.recapDays')], [best, t('goals.recapBest')], [notes, t('goals.recapNotes')], [events, t('goals.recapEvents')]] as const).map(([v, l], i) => (
          <div key={i} className={g.tile}><b>{v}</b><span>{l}</span></div>
        ))}
      </div>
      <div className={g.row} style={{ marginTop: 16 }}>
        <button type="button" className={g.ghost} onClick={onClose}>{t('common.close')}</button>
        {goal.status === 'active' && <button type="button" className={g.primary} onClick={finish}>{t('goals.completeCta')}</button>}
      </div>
    </Sheet>
  );
}
