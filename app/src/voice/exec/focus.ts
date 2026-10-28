import { isoDay } from '../../lib/day';
import { logHabit } from '../../state/actions';
import { fmtClock, pomo, remaining, usePomodoro, type PomoLink } from '../../state/pomodoro';
import { rankEntities } from '../nlp/parse/engine';
import { usePrefs } from '../prefs';
import { R } from '../reply';
import { store } from '../store';
import { activeHabits, logOf, plural, q, tasksOf } from './common';
import { addDays } from '../../data/model';
import { periodIn, rangeOf, type Period } from './habitStats';
import { register, type ExecCtx } from './index';
import { withTarget } from './resolve';

/* WP5.7 — focus, timers, habit timers, cycles (catalog 54–61, 118–120). The timer is the app's own (state/pomodoro.ts). */
const running = () => !!usePomodoro.getState().endsAt;
const mins = (n: number, ru: boolean) => (ru ? `${n} ${plural(n, 'минуту', 'минуты', 'минут')}` : `${n} min`);

/** «над целью английский», «над встречей с отчётом», «над чтением»: what the focus serves */
function linkOf(c: ExecCtx, name: string): PomoLink | null {
  const g = rankEntities(name, (c.sys?.goals ?? []).filter((x) => x.status === 'active'), (x) => x.id, (x) => x.title, 0.7)[0];
  const e = rankEntities(name, tasksOf(c, c.day, addDays(c.day, 14)).filter((t) => !t.done), (x) => x.id, (x) => x.title, 0.7)[0];
  const h = rankEntities(name, activeHabits(c), (x) => x.id, (x) => x.name, 0.7)[0];
  const best = [g && { k: 'g', s: g.sim, v: g }, e && { k: 'e', s: e.sim, v: e }, h && { k: 'h', s: h.sim, v: h }].filter(Boolean).sort((a, b) => b!.s - a!.s)[0] as { k: string; v: { item: { id: string; title?: string; name?: string } } } | undefined;
  if (!best) return null;
  const label = best.v.item.title ?? best.v.item.name ?? '';
  return best.k === 'g' ? { goalId: best.v.item.id, label } : best.k === 'e' ? { eventId: best.v.item.id, label } : { habitId: best.v.item.id, label };
}

register('focus.start', (p, c) => {
  const link = typeof p.slots.link === 'string' && p.slots.link ? linkOf(c, p.slots.link) : null;
  if (p.slots.link && !link) return R.error(c.ru ? `Не нашёл «${p.slots.link}» среди целей, дел и привычек` : `Couldn’t find “${p.slots.link}”`);
  // «привяжи фокус к цели…» while it runs: only the link changes
  if (link && running() && !p.slots.minutes) { pomo.setLink(link); return R.done(c.ru ? `Привязал фокус к «${link.label}»` : `Linked the focus to “${link.label}”`); }
  if (!p.slots.minutes && !link) { pomo.openSheet(); return R.done(c.ru ? 'Открыл фокус' : 'Focus opened', { close: true }); }
  pomo.setTab(0);
  const m = Math.max(1, Math.min(180, Math.round(Number(p.slots.minutes) || usePomodoro.getState().lengths[0])));
  if (p.slots.minutes) pomo.setLength(0, m);
  pomo.start(link ?? {});
  return R.done(c.ru ? `Фокус на ${mins(m, true)}${link ? ` над «${link.label}»` : ''}. Поехали` : `Focus for ${m} minutes${link ? ` on “${link.label}”` : ''}. Go`);
});
register('focus.pause', (_p, c) => { if (!running()) return R.info(c.ru ? 'Таймер и так не идёт' : 'The timer isn’t running'); pomo.pause(); return R.done(c.ru ? 'Пауза. Скажите «продолжи», когда вернётесь' : 'Paused. Say “resume” when you’re back'); });
register('focus.resume', (_p, c) => { pomo.start(); return R.done(c.ru ? 'Продолжаем' : 'Resumed'); });
register('focus.stop', (_p, c) => { pomo.reset(); stopSimple(); store.remove('cycle'); return R.done(c.ru ? 'Таймер остановлен' : 'Timer stopped'); });
register('focus.break', (p, c) => {
  pomo.setTab(1);
  if (p.slots.minutes) pomo.setLength(1, Math.min(60, Number(p.slots.minutes)));
  pomo.start();
  const m = usePomodoro.getState().lengths[1];
  return R.done(c.ru ? `Перерыв ${mins(m, true)}. Отдохните` : `Break for ${m} min`);
});
register('focus.extend', (p, c) => {
  const m = Math.max(1, Math.min(60, Math.round(Number(p.slots.minutes) || 5)));
  const st = usePomodoro.getState();
  if (st.endsAt) usePomodoro.setState({ endsAt: st.endsAt + m * 60000 }); else usePomodoro.setState({ left: st.left + m * 60 });
  return R.done(c.ru ? `Добавил ${mins(m, true)}. Осталось ${fmtClock(remaining(usePomodoro.getState()))}` : `Added ${m} min. ${fmtClock(remaining(usePomodoro.getState()))} left`);
});
register('focus.remaining', (_p, c) => {
  const st = usePomodoro.getState();
  if (!st.endsAt) return R.info(c.ru ? 'Таймер сейчас не идёт' : 'No timer is running');
  const left = remaining(st);
  return R.answer(c.ru ? `Осталось ${Math.floor(left / 60)} мин ${left % 60} сек` : `${Math.floor(left / 60)} min ${left % 60} s left`);
});

/* ── totals and the daily norm ── */
export const focusMinutes = (c: ExecCtx, from: string, to: string) =>
  (c.sys?.focus ?? []).filter((f) => f.completed && (f.session_type ?? 'focus') === 'focus' && isoDay(new Date(f.started_at)) >= from && isoDay(new Date(f.started_at)) <= to).reduce((a, f) => a + f.minutes, 0);
const hoursText = (m: number, ru: boolean) => (m < 60 ? `${m} ${ru ? 'мин' : 'min'}` : `${Math.round((m / 60) * 10) / 10} ${ru ? 'ч' : 'h'}`);
register('focus.sum', (p, c) => {
  const per = (p.slots.period as Period | undefined) ?? 'day';
  const r = rangeOf(per, c);
  const m = focusMinutes(c, r.from, r.to);
  const norm = usePrefs.getState().focusNorm;
  const cmp = norm && per === 'day' ? (c.ru ? `. Норма ${hoursText(norm, true)}: ${m >= norm ? 'выполнена' : `осталось ${hoursText(norm - m, true)}`}` : `. Norm ${hoursText(norm, false)}: ${m >= norm ? 'done' : `${hoursText(norm - m, false)} left`}`) : '';
  return R.answer(c.ru ? `Фокус ${r.ru}: ${hoursText(m, true)}${cmp}` : `Focus ${r.en}: ${hoursText(m, false)}${cmp}`);
});
register('focus.norm', (p, c) => {
  const m = Math.round(Number(p.slots.minutes));
  if (!m || m < 10 || m > 720) return R.error(c.ru ? 'Сколько минут в день?' : 'How many minutes a day?');
  const prev = usePrefs.getState().focusNorm;
  usePrefs.getState().set({ focusNorm: m });
  return R.done(c.ru ? `Дневная норма фокуса: ${hoursText(m, true)}. Буду сравнивать в итогах` : `Daily focus norm: ${hoursText(m, false)}`, { undo: [{ t: 'prefs', key: 'focusNorm', prev }] });
});

/* ── a chain of cycles: «Помодоро: четыре по двадцать пять» ── */
type Cycle = { v: 1; n: number; minutes: number; done: number; on: boolean };
let watching = false;
function watch() {
  if (watching) return;
  watching = true;
  let finished = usePomodoro.getState().finished;
  usePomodoro.subscribe((s) => {
    if (s.finished === finished) return;
    finished = s.finished;
    const cy = store.get<Cycle | null>('cycle', null);
    if (!cy?.on) return;
    if (s.tab === 0) { pomo.start(); return; } // a break is over: the next focus
    const done = cy.done + 1;
    if (done >= cy.n) { store.set('cycle', { ...cy, done, on: false }); toastDone(); return; }
    store.set('cycle', { ...cy, done });
    pomo.start(); // a focus is over: the break (long after the fourth, which the timer picks itself)
  });
}
const toastDone = () => { try { window.dispatchEvent(new Event('veyrarc:cycle-done')); } catch { /* no window */ } };
register('focus.cycle', (p, c) => {
  const n = Math.max(1, Math.min(8, Math.round(Number(p.slots.n) || 4))), m = Math.max(5, Math.min(90, Math.round(Number(p.slots.minutes) || 25)));
  pomo.setTab(0); pomo.setLength(0, m);
  store.set<Cycle>('cycle', { v: 1, n, minutes: m, done: 0, on: true });
  watch();
  pomo.start();
  return R.done(c.ru ? `Помодоро: ${n} по ${m} минут с перерывами. Первый пошёл. Работает, пока приложение открыто` : `Pomodoro: ${n} × ${m} min with breaks. The first one is on`);
});

/* ── a simple timer ── */
type Simple = { v: 1; endsAt: number; label: string };
let simpleTimer: ReturnType<typeof setTimeout> | undefined;
function armSimple() {
  const t = store.get<Simple | null>('timer', null);
  clearTimeout(simpleTimer);
  if (!t) return;
  simpleTimer = setTimeout(() => {
    store.remove('timer');
    try { navigator.vibrate?.([200, 100, 200]); window.dispatchEvent(new CustomEvent('veyrarc:timer-done', { detail: { label: t.label } })); } catch { /* no window */ }
  }, Math.max(0, t.endsAt - Date.now()));
}
function stopSimple() { clearTimeout(simpleTimer); store.remove('timer'); }
if (typeof window !== 'undefined') armSimple();
register('timer.simple', (p, c) => {
  const s = Math.max(5, Math.min(6 * 3600, Math.round(Number(p.slots.seconds) || 0)));
  if (!p.slots.seconds) return R.error(c.ru ? 'На сколько поставить таймер?' : 'For how long?');
  store.set<Simple>('timer', { v: 1, endsAt: Date.now() + s * 1000, label: '' });
  armSimple();
  const txt = s >= 60 ? mins(Math.round(s / 60), c.ru) : c.ru ? `${s} секунд` : `${s} seconds`;
  return R.done(c.ru ? `Таймер на ${txt}. Сигнал сработает, пока приложение открыто` : `Timer for ${txt}. The signal works while the app is open`);
});

/* ── a timer for a duration habit ── */
register('habit.timer', (p, c) => withTarget(c, p, activeHabits(c).filter((h) => h.type === 'duration'), (h) => h.name, 'habit', (h) => {
  const m = Math.round(Number(p.slots.minutes)) || h.minutes || 10;
  pomo.setTab(0); pomo.setLength(0, m);
  pomo.start({ habitId: h.id, label: h.name });
  return R.done(c.ru ? `Запустил «${h.name}» на ${mins(m, true)}. По окончании сам отмечу` : `Started “${h.name}” for ${m} min; I’ll mark it when it ends`);
}));
register('habit.timerStop', (_p, c) => {
  const st = usePomodoro.getState();
  const h = st.link.habitId ? activeHabits(c).find((x) => x.id === st.link.habitId) : undefined;
  if (!h) { pomo.reset(); return R.info(c.ru ? 'Привычка-таймер не запущена. Таймер остановлен' : 'No habit timer is running. Timer stopped'); }
  const total = st.lengths[0] * 60, left = remaining(st);
  const done = Math.max(0, Math.round((total - left) / 60));
  pomo.reset();
  if (done < 1) return R.info(c.ru ? 'Прошло меньше минуты — ничего не засчитал' : 'Less than a minute — nothing counted');
  const prev = logOf(c, h.id);
  logHabit(h.id, (prev?.value ?? 0) + done, (prev?.value ?? 0) + done >= (h.minutes ?? 1));
  return R.done(c.ru ? `Засчитал ${mins(done, true)} к «${h.name}»` : `Counted ${done} min for “${h.name}”`, { undo: [{ t: 'habit.log', habitId: h.id, day: c.day, prev: prev ? { value: prev.value, done: prev.done } : null }] });
});
export { periodIn, q, store };
