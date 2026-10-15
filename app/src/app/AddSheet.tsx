import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT, type T } from '../i18n';
import { isoDay } from '../lib/day';
import { addDays, DAYS_ALL } from '../data/model';
import { HABIT_LIBRARY, libraryDays, type HabitTemplate } from '../data/habitLibrary';
import { HABIT_PALETTE } from '../mock/tracker';
import { addGoalStep, createHabit, saveEvent } from '../state/actions';
import { pomo, type PomoLink } from '../state/pomodoro';
import { useSystem } from '../state/system';
import { Icon, type IconName } from '../ui/Icon';
import { Sheet } from '../ui/Sheet';
import { toast } from '../ui/toast';
import s from './AddSheet.module.css';
import { useAdd, type AddTile } from './nav';

/*
 * The one «+» (Master Changeset PROBLEM #09, A3, task 11): four tiles → a short composer inside
 * the sheet → created at once. The screen only pre-selects the tile.
 * Habit is step 1 of the two-step composer (RC-14): a name is enough; «Настроить» opens step 2.
 */
const TILES: { id: AddTile; icon: IconName; key: string }[] = [
  { id: 'habit', icon: 'checklist', key: 'H' },
  { id: 'event', icon: 'cal', key: 'E' },
  { id: 'goalTask', icon: 'target', key: 'G' },
  { id: 'focus', icon: 'bolt', key: 'F' },
];

export function AddSheet() {
  const t = useT();
  const { open, tile, closeAdd } = useAdd();
  const [cur, setCur] = useState<AddTile | null>(tile);
  useEffect(() => { if (open) setCur(tile); }, [open, tile]);
  return (
    <Sheet open={open} onClose={closeAdd} title={cur ? t(`add.tiles.${cur}`) : t('add.title')}>
      {!cur ? (
        <div className={s.tiles}>
          {TILES.map((x) => (
            <button key={x.id} type="button" className={s.tile} onClick={() => setCur(x.id)}>
              <Icon name={x.icon} size={20} />
              <span className={s.tileName}>{t(`add.tiles.${x.id}`)}</span>
              <span className={s.tileSub}>{t(`add.sub.${x.id}`)}</span>
              <kbd className={s.kbd}>{x.key}</kbd>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className={s.switch} role="tablist" data-hscroll>
            {TILES.map((x) => (
              <button key={x.id} type="button" role="tab" aria-selected={cur === x.id} className={s.switchBtn} onClick={() => setCur(x.id)}>
                <Icon name={x.icon} size={18} />{t(`add.tiles.${x.id}`)}
              </button>
            ))}
          </div>
          {cur === 'habit' && <HabitForm t={t} onDone={closeAdd} />}
          {cur === 'event' && <EventForm t={t} onDone={closeAdd} />}
          {cur === 'goalTask' && <GoalTaskForm t={t} onDone={closeAdd} />}
          {cur === 'focus' && <FocusForm t={t} onDone={closeAdd} />}
        </>
      )}
    </Sheet>
  );
}

function HabitForm({ t, onDone }: { t: T; onDone: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const core = useSystem((r) => r.habits.filter((h) => h.core && !h.archived_at).length).data ?? 0;
  const count = useSystem((r) => r.habits.length).data ?? 0;
  const submit = () => {
    const n = name.trim().slice(0, 80);
    if (!n) return;
    // step 1: a daily yes/no habit; Core while fewer than 3 Core habits exist
    const h = createHabit({
      id: crypto.randomUUID(), name: n, icon: 'doc', hue: HABIT_PALETTE[count % HABIT_PALETTE.length], type: 'binary',
      target: null, unit: null, minutes: null, days: DAYS_ALL, category: 'body', core: core < 3,
    });
    navigator.vibrate?.(25);
    toast.action(t(h.core ? 'add.habitCreatedCore' : 'add.habitCreated'), t('add.setup'), () => navigate(`/disciplines?setup=${h.id}`), 5000);
    onDone();
  };
  // a ready habit from the library: the right kind, target and rhythm in one tap
  const existing = useSystem((r) => r.habits.filter((h) => !h.archived_at).map((h) => h.name.toLowerCase())).data ?? [];
  const [cat, setCat] = useState<HabitTemplate['cat']>('body');
  const fromTemplate = (tp: HabitTemplate) => {
    const h = createHabit({
      id: crypto.randomUUID(), name: t.pick(tp.name), icon: tp.icon, hue: HABIT_PALETTE[count % HABIT_PALETTE.length], type: tp.type,
      target: tp.target ?? null, unit: tp.unit && t.lang === 'ru' ? tp.unit : null, minutes: tp.minutes ?? null, days: libraryDays(tp), category: tp.cat, core: core < 3,
    });
    navigator.vibrate?.(25);
    toast.action(t(h.core ? 'add.habitCreatedCore' : 'add.habitCreated'), t('add.setup'), () => navigate(`/disciplines?setup=${h.id}`), 5000);
    onDone();
  };
  return (
    <form className={s.form} onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <input className={s.input} value={name} maxLength={80} placeholder={t('add.habitPh')} onChange={(e) => setName(e.target.value)} enterKeyHint="done" />
      {name.trim() ? (
        <>
          <div className={s.hint}>{t('add.habitHint')}</div>
          <button type="submit" className={s.primary}>{t('common.add')}</button>
        </>
      ) : (
        <div className={s.lib}>
          <div className={s.libHead}>{t('add.library')}</div>
          <div className={s.libCats} data-hscroll>
            {(['body', 'mind', 'disc', 'prod'] as const).map((c) => <button key={c} type="button" className={s.libCat} aria-pressed={cat === c} onClick={() => setCat(c)}>{t(`categories.${c}`)}</button>)}
          </div>
          <div className={s.libList}>
            {HABIT_LIBRARY.filter((x) => x.cat === cat).map((x) => {
              const has = existing.includes(t.pick(x.name).toLowerCase());
              const what = x.type === 'counter' ? `${x.target}${x.unit && t.lang === 'ru' ? ' ' + x.unit : ''}` : x.type === 'duration' ? t('units.min', { m: x.minutes ?? 0 }) : '';
              return (
                <button key={x.key} type="button" className={s.libItem} disabled={has} onClick={() => fromTemplate(x)}>
                  <span className={s.libIcon}><Icon name={x.icon as IconName} size={18} sw={1.8} /></span>
                  <span className={s.libText}><b>{t.pick(x.name)}{what && <em> · {what}</em>}</b><small>{has ? t('add.libraryHave') : t.pick(x.why)}</small></span>
                  <Icon name={has ? 'check' : 'plus'} size={16} sw={2} />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </form>
  );
}

function nextHour() { const d = new Date(); return `${String(Math.min(23, d.getHours() + 1)).padStart(2, '0')}:00`; }
function EventForm({ t, onDone }: { t: T; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [day, setDay] = useState(() => useAdd.getState().plannerDay ?? isoDay());
  const [time, setTime] = useState(nextHour());
  const [timed, setTimed] = useState(true);
  const submit = () => {
    const x = title.trim();
    if (!x) return;
    const [h, m] = time.split(':').map(Number);
    const end = `${String(Math.min(23, h + 1)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    saveEvent({ id: crypto.randomUUID(), title: x, day, starts_at: timed ? time : null, ends_at: timed ? end : null, note: null, done: false, category_id: null }, true);
    navigator.vibrate?.(25);
    toast.success(t('add.eventCreated'));
    onDone();
  };
  return (
    <form className={s.form} onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <input className={s.input} value={title} autoFocus maxLength={120} placeholder={t('calendar.taskName')} onChange={(e) => setTitle(e.target.value)} enterKeyHint="done" />
      <div className={s.row}>
        <div className={s.pills}>
          {[isoDay(), addDays(isoDay(), 1)].map((d, i) => (
            <button key={d} type="button" className={s.pill} aria-pressed={day === d} onClick={() => setDay(d)}>{i ? t('add.tomorrow') : t('common.today')}</button>
          ))}
          <input type="date" className={s.date} value={day} min={isoDay()} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label={t('calendar.date')} />
        </div>
      </div>
      <div className={s.row}>
        <button type="button" className={s.pill} aria-pressed={!timed} onClick={() => setTimed(!timed)}>{t('calendar.untimed')}</button>
        {timed && <input type="time" className={s.date} value={time} step={900} onChange={(e) => e.target.value && setTime(e.target.value)} aria-label={t('calendar.start')} />}
      </div>
      <button type="submit" className={s.primary} disabled={!title.trim()}>{t('calendar.createTask')}</button>
    </form>
  );
}

function GoalTaskForm({ t, onDone }: { t: T; onDone: () => void }) {
  const navigate = useNavigate();
  const goals = useSystem((r) => r.goals.filter((g) => g.status === 'active')).data ?? [];
  const [goal, setGoal] = useState<string | null>(null);
  const [text, setText] = useState('');
  useEffect(() => { if (!goal && goals[0]) setGoal(goals[0].id); }, [goals, goal]);
  if (!goals.length) {
    return (
      <div className={s.form}>
        <div className={s.hint}>{t('add.noGoals')}</div>
        <button type="button" className={s.primary} onClick={() => { onDone(); navigate('/goals?new=1'); }}>{t('goals.emptyCta')}</button>
      </div>
    );
  }
  const submit = () => {
    const x = text.trim().slice(0, 160);
    if (!x || !goal) return;
    addGoalStep(goal, x);
    toast.success(t('add.stepCreated'));
    onDone();
  };
  return (
    <form className={s.form} onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className={s.pills}>
        {goals.map((g) => <button key={g.id} type="button" className={s.pill} aria-pressed={goal === g.id} onClick={() => setGoal(g.id)}>{g.title}</button>)}
      </div>
      <input className={s.input} value={text} autoFocus maxLength={160} placeholder={t('goals.stepPlaceholder')} onChange={(e) => setText(e.target.value)} enterKeyHint="done" />
      <div className={s.hint}>{t('add.stepHint')}</div>
      <button type="submit" className={s.primary} disabled={!text.trim()}>{t('goals.addStep')}</button>
    </form>
  );
}

function FocusForm({ t, onDone }: { t: T; onDone: () => void }) {
  const q = useSystem((r) => ({
    goals: r.goals.filter((g) => g.status === 'active'),
    events: r.plan.filter((p) => p.day === r.day && !p.done),
  }));
  const [link, setLink] = useState<PomoLink>({});
  const opts: { key: string; link: PomoLink; label: string }[] = [
    { key: 'none', link: {}, label: t('pomo.noLink') },
    ...(q.data?.goals ?? []).map((g) => ({ key: 'g' + g.id, link: { goalId: g.id, label: g.title }, label: g.title })),
    ...(q.data?.events ?? []).map((p) => ({ key: 'e' + p.id, link: { eventId: p.id, label: p.title }, label: (p.starts_at ? p.starts_at.slice(0, 5) + ' ' : '') + p.title })),
  ];
  const cur = link.goalId ? 'g' + link.goalId : link.eventId ? 'e' + link.eventId : 'none';
  return (
    <div className={s.form}>
      <div className={s.hint}>{t('add.focusHint')}</div>
      <div className={s.pills}>{opts.map((o) => <button key={o.key} type="button" className={s.pill} aria-pressed={cur === o.key} onClick={() => setLink(o.link)}>{o.label}</button>)}</div>
      <button type="button" className={s.primary} onClick={() => { pomo.setTab(0); pomo.start(link); onDone(); }}>{t('pomo.start')}</button>
    </div>
  );
}
