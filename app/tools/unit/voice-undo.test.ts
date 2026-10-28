import { QueryClient } from '@tanstack/react-query';
import {
  addGoalStep, addQuit, archiveHabit, archiveQuit, createGoal, createHabit, deleteEvent, deleteGoalStep, logGoalTask, logHabit, logMood, logRelapse, logWater, renameGoalStep,
  saveDayNote, saveDiary, saveEvent, saveOath, setEventDone, takeRelapseOp, updateGoal, updateHabit, updateQuit,
} from '../../src/state/actions';
import { bindSystem, getSystem } from '../../src/state/system';
import { applyUndo } from '../../src/voice/exec/undo';
import { journal } from '../../src/voice/journal';
import { usePrefs } from '../../src/voice/prefs';
import type { UndoOp } from '../../src/voice/exec/types';

// run: npx tsx tools/unit/voice-undo.test.ts — Q6: do → undo → the state equals the original (every kind of UndoOp)
(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const qc = new QueryClient();
bindSystem(qc);
// semantically empty rows (a day with nothing in it, a goal entry with no ticks and no diary) and null / '' / missing are the same state
const norm = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(norm).map((e) => JSON.stringify(e)).sort();
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== null && x !== '' && x !== undefined).sort(([x], [y]) => x.localeCompare(y)).map(([k, x]) => [k, norm(x)]));
  return v;
};
const canon = (x: unknown): string => JSON.stringify(norm(x));
const snap = () => {
  const s = JSON.parse(JSON.stringify(getSystem()));
  s.days = s.days.filter((d: any) => d.mood != null || d.water || d.frozen || d.note);
  s.entries = s.entries.filter((e: any) => e.done_task_ids?.length || e.diary);
  return canon(s);
};
let fail = 0, n = 0;
const sys = () => getSystem()!;
const day = sys().day;
function check(name: string, forward: () => UndoOp[]) {
  const before = snap();
  const ops = forward();
  const during = snap();
  n++;
  if (during === before) { fail++; console.log(`✗ ${name}: the action changed nothing`); return; }
  applyUndo({ t: 'batch', ops });
  const after = snap();
  if (after !== before) {
    fail++; console.log(`✗ ${name}: state differs after undo`);
    if (process.env.DEBUG) { const a = JSON.parse(before), b = JSON.parse(after); for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) console.log('   ', k, '\n     before', JSON.stringify(a[k]).slice(0, 400), '\n     after ', JSON.stringify(b[k]).slice(0, 400)); }
  }
}

const h = sys().habits.find((x) => !sys().logs.some((l) => l.habit_id === x.id && l.day === day))!, water = sys().habits.find((x) => x.type === 'counter')!;
const prevLog = (id: string, d = day) => { const l = sys().logs.find((x) => x.habit_id === id && x.day === d); return l ? { value: l.value, done: l.done } : null; };
check('habit.log (new)', () => { const p = prevLog(h.id); logHabit(h.id, 1, true); return [{ t: 'habit.log', habitId: h.id, day, prev: p }]; });
check('habit.log (change)', () => { const p = prevLog(water.id); logHabit(water.id, (p?.value ?? 0) + 3, false); return [{ t: 'habit.log', habitId: water.id, day, prev: p }]; });
check('mood (new)', () => { const p = sys().days.find((d) => d.day === day)?.mood ?? null; logMood(3); return [{ t: 'mood', day, prev: p }]; });
check('mood (change)', () => { const p = sys().days.find((d) => d.day === day)?.mood ?? null; logMood(p === 2 ? 3 : 1); return [{ t: 'mood', day, prev: p }]; });
check('water', () => { const p = sys().days.find((d) => d.day === day)?.water ?? 0; logWater(p + 3); return [{ t: 'water', day, prev: p }]; });
check('note', () => { const p = sys().days.find((d) => d.day === day)?.note ?? null; saveDayNote(day, 'тест заметки'); return [{ t: 'note', day, prev: p }]; });
const ev = sys().plan[0];
check('event.save (edit)', () => { saveEvent({ ...ev, title: 'Другое название' }, false); return [{ t: 'event.save', row: ev, wasNew: false }]; });
check('event.save (restore a deleted one)', () => { deleteEvent(ev.id); return [{ t: 'event.save', row: ev, wasNew: true }]; });
check('event.delete (undo a creation)', () => { saveEvent({ ...ev, id: 'new-ev', title: 'Новая', done: false }, true); return [{ t: 'event.delete', id: 'new-ev' }]; });
check('event.done', () => { setEventDone(ev.id, true); return [{ t: 'event.done', id: ev.id, prev: ev.done }]; });
check('habit.create', () => { const r = createHabit({ id: 'hx', name: 'Новая', icon: 'doc', hue: '#fff', type: 'binary', target: null, unit: null, minutes: null, days: 127, category: 'body', core: false }); return [{ t: 'habit.create', id: r.id }]; });
check('habit.patch (archive)', () => { archiveHabit(h.id); return [{ t: 'habit.patch', id: h.id, prev: { archived_at: null } }]; });
check('habit.patch (rename)', () => { updateHabit(h.id, { name: 'Иначе' }); return [{ t: 'habit.patch', id: h.id, prev: { name: h.name } }]; });
check('goal.create', () => { createGoal({ id: 'gx', title: 'Новая цель', hue: '#fff', deadline: null, linkedCoreHabitId: null, steps: ['a', 'b'] }); return [{ t: 'goal.create', id: 'gx' }]; });
const g = sys().goals[0], t0 = sys().tasks[0];
check('goal.patch', () => { updateGoal(g.id, { deadline: '2027-01-01' }); return [{ t: 'goal.patch', id: g.id, prev: { deadline: g.deadline } }]; });
check('goal.patch (complete)', () => { updateGoal(g.id, { status: 'completed' }); return [{ t: 'goal.patch', id: g.id, prev: { status: g.status, completed_at: g.completed_at ?? null } }]; });
check('step.add', () => { const id = addGoalStep(g.id, 'Новый шаг'); return [{ t: 'step.add', id }]; });
check('step.restore', () => { deleteGoalStep(t0.id); return [{ t: 'step.restore', row: { id: t0.id, goal_id: t0.goal_id, text: t0.text, sort: t0.sort } }]; });
check('step.rename', () => { renameGoalStep(t0.id, 'Переименован'); return [{ t: 'step.rename', id: t0.id, prev: t0.text }]; });
check('goal.task', () => { const prev = !!sys().entries.find((e) => e.goal_id === g.id && e.day === day)?.done_task_ids.includes(t0.id); logGoalTask(g.id, t0.id, !prev, day); return [{ t: 'goal.task', goalId: g.id, taskId: t0.id, day, prev }]; });
check('quit.add', () => { addQuit({ id: 'qx', name: 'Сладкое', hue: '#fff', icon: 'ban', unit: null, per_day: 1, clean_since: new Date().toISOString() }); return [{ t: 'quit.add', id: 'qx' }]; });
addQuit({ id: 'q0', name: 'Кофе', hue: '#fff', icon: 'ban', unit: null, per_day: 1, clean_since: new Date(Date.now() - 5 * 86400000).toISOString() });
const q = sys().quits.find((x) => x.id === 'q0')!;
check('quit.patch', () => { updateQuit(q.id, { goal_days: 99 }); return [{ t: 'quit.patch', id: q.id, prev: { goal_days: q.goal_days } }]; });
check('quit.archive', () => { archiveQuit(q.id, true); return [{ t: 'quit.archive', id: q.id, prev: false, row: q }]; });
check('relapse.undo', () => { logRelapse(q.id, 'тест'); const o = takeRelapseOp()!; return [{ t: 'relapse.undo', ...o }]; });
check('diary', () => { const p = sys().entries.find((e) => e.goal_id === g.id && e.day === day)?.diary ?? null; saveDiary(g.id, day, 'запись', () => {}, () => {}); return [{ t: 'diary', goalId: g.id, day, prev: p }]; });
check('oath', () => { const a = sys().arcs.find((x) => !x.ended_on)!; const p = a.oath ?? null; saveOath(a.id, 'новая клятва'); return [{ t: 'oath', arcId: a.id, prev: p }]; });
check('batch of several', () => { const p = prevLog(h.id); logHabit(h.id, 1, true); const m = sys().days.find((d) => d.day === day)?.mood ?? null; logMood(1); return [{ t: 'habit.log', habitId: h.id, day, prev: p }, { t: 'mood', day, prev: m }]; });

// prefs op
n++;
const before = usePrefs.getState().muted;
usePrefs.getState().set({ muted: !before });
applyUndo({ t: 'prefs', key: 'muted', prev: before });
if (usePrefs.getState().muted !== before) { fail++; console.log('✗ prefs'); }

// the journal: record two actions, undo both with one call, entries are marked
n++;
journal.clear();
logWater(5); journal.add({ kind: 'water.add', label: 'Вода', ops: [{ t: 'water', day, prev: 0 }] });
logMood(2); journal.add({ kind: 'mood.set', label: 'Настроение', ops: [{ t: 'mood', day, prev: null }] });
const undone = journal.undo(2);
if (undone.length !== 2 || journal.undoable().length !== 0 || journal.list().some((e) => !e.undone)) { fail++; console.log('✗ journal undo of the last two'); }
console.log(fail ? `${fail} failed of ${n}` : `all ${n} do → undo checks passed`);
if (fail) process.exit(1);
