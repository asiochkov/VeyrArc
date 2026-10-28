import { addDays, weekStart } from '../../data/model';
import { saveDayNote, saveEvent } from '../../state/actions';
import { saveWeekFocus, weekFocusSlot } from '../../pages/today/WeeklyReview';
import { pomo, usePomodoro } from '../../state/pomodoro';
import { rankEntities } from '../nlp/parse/engine';
import { endFlow, defineFlow, type Answer, type FlowOut } from './engine';
import { newEvent } from '../exec/planner';
import { activeHabits, currentStreak, hm, markHabit, openHabits, plural, q, sortedByTime, taskLine, tasksOf, toMin } from '../exec/common';
import type { ExecCtx } from '../exec';
import type { UndoOp } from '../exec/types';
import { practiceOf, runScript, startNoise, stopNoise, stopScript, type NoiseKind } from '../practice';
import { usePrefs } from '../prefs';

/* WP5.8 — the rest of the guided flows (catalog 62–69, 114, 115, 121–127, 129, 185, 187, 188, 193, 197, 202, 225). */
const LEAD_MS = 3000; // the first beat waits for the spoken introduction

/* ───── timed practices: breathing, grounding, a pause, stretching, eyes, rest ───── */
function startPractice(flow: string, pid: string, c: ExecCtx, o: { minutes?: number; seconds?: number } = {}): FlowOut {
  const p = practiceOf(pid, c.ru, o);
  if (!p) return { say: c.ru ? 'Эта практика пока не готова' : 'That practice is not ready yet', end: true };
  runScript(flow, p.beats.map((b) => ({ ...b, at: b.at + LEAD_MS })), p.totalMs + LEAD_MS, p.end, () => endFlow(flow));
  return { say: p.intro, step: 'run', data: { pid, ...o }, listen: 'none' };
}
const timed = (id: string, pidOf: (arg?: Record<string, unknown>) => string) => defineFlow({
  id,
  start: (c, arg) => startPractice(id, pidOf(arg), c, { minutes: typeof arg?.minutes === 'number' ? arg.minutes : undefined, seconds: typeof arg?.seconds === 'number' ? arg.seconds : undefined }),
  repeat: (c, f) => ({ say: c.ru ? 'Идём дальше, скажите «стоп», когда хватит' : 'Carry on; say “stop” when you are done', step: f.step, listen: 'none' }),
  answer: (c, f) => ({ say: c.ru ? 'Идёт практика. Скажите «стоп», чтобы закончить' : 'A practice is on. Say “stop” to end it', step: f.step, listen: 'none' }),
  stop: (c) => { stopScript(); return { say: c.ru ? 'Остановил. Вы молодец, что нашли минуту' : 'Stopped. Good that you found a minute' }; },
});
timed('breathe', (a) => (a?.pattern === 'box' ? 'box' : 'breathe478'));
timed('box', () => 'box');
timed('ground', () => 'ground');
timed('pause', () => 'pause');
timed('stretch', () => 'stretch');
timed('eyes', () => 'eyes');
timed('rest', () => 'rest');

/* ───── quiet noise ───── */
defineFlow({
  id: 'noise',
  start(c, arg) {
    if (arg?.off) return { say: stopNoise() ? (c.ru ? 'Выключил шум' : 'Noise is off') : (c.ru ? 'Шум и так выключен' : 'The noise was already off'), end: true };
    const kind = (['white', 'rain', 'brown'].includes(String(arg?.kind)) ? arg?.kind : 'white') as NoiseKind;
    const ok = startNoise(kind);
    const nm = c.ru ? { white: 'белый шум', rain: 'шум дождя', brown: 'мягкий шум' }[kind] : { white: 'white noise', rain: 'rain', brown: 'soft noise' }[kind];
    return { say: ok ? (c.ru ? `Включил: ${nm}. Скажите «выключи шум», когда хватит` : `On: ${nm}. Say “turn off the noise” to stop`) : (c.ru ? 'Звук недоступен на этом устройстве' : 'Sound is not available on this device'), end: true };
  },
  answer: () => ({ say: '', end: true }),
});

/* ───── workout: «Подход?» — «Пятнадцать» — rest — «Следующий» ───── */
defineFlow({
  id: 'workout',
  start(c, arg) {
    const rest = typeof arg?.seconds === 'number' ? arg.seconds : 60;
    return { say: c.ru ? 'Режим тренировки. Подход?' : 'Workout mode. First set?', step: 'set', data: { sets: 0, reps: 0, rest }, listen: 'number', windowMs: 90000 };
  },
  repeat: (c) => ({ say: c.ru ? 'Подход?' : 'Next set?', listen: 'number', windowMs: 90000 }),
  answer(c, f, a) {
    let { sets, reps } = f.data as { sets: number; reps: number };
    const rest = f.data.rest as number;
    if (a.control === 'next' || a.control === 'back') { stopScript(); return { say: c.ru ? 'Подход?' : 'Next set?', step: 'set', listen: 'number', windowMs: 90000 }; }
    if (a.num !== null) {
      stopScript();
      sets += 1; reps += Math.round(a.num);
      const p = practiceOf('rest', c.ru, { seconds: rest })!;
      runScript('workout', p.beats, p.totalMs, p.end);
      return { say: c.ru ? `Подход ${sets}: ${Math.round(a.num)}. Отдых ${rest} секунд` : `Set ${sets}: ${Math.round(a.num)}. Rest ${rest} seconds`, step: 'rest', data: { sets, reps }, listen: 'number', windowMs: rest * 1000 + 30000 };
    }
    return { say: c.ru ? 'Скажите число повторов или «следующий»' : 'Say the reps or “next”', listen: 'number', windowMs: 90000 };
  },
  stop(c, f) {
    stopScript();
    const { sets, reps } = f.data as { sets: number; reps: number };
    return { say: sets ? (c.ru ? `Тренировка окончена. Подходов: ${sets}, повторов: ${reps}` : `Workout done. ${sets} sets, ${reps} reps`) : (c.ru ? 'Тренировка окончена' : 'Workout done') };
  },
});

/* ───── notes: gratitude, the hard part, what I learned, the week, free dictation ───── */
const NOTE_MAX = 500;
function addNote(c: ExecCtx, label: string, text: string, ops: UndoOp[], day = c.day) {
  const prev = c.sys?.days.find((d) => d.day === day)?.note ?? null;
  const add = `${label}: ${text}`;
  saveDayNote(day, (prev ? `${prev} · ${add}` : add).slice(0, NOTE_MAX));
  ops.push({ t: 'note', day, prev });
}
const skipped = (a: Answer) => a.control === 'next' || !a.text;
type Ask = { say: string; label: string };
function askFlow(id: string, asks: (c: ExecCtx) => Ask[], o: { day?: (c: ExecCtx) => string; after?: (c: ExecCtx, texts: string[], ops: UndoOp[]) => void; done: (c: ExecCtx, n: number) => string }) {
  defineFlow({
    id,
    start: (c) => ({ say: asks(c)[0].say, step: '0', data: { texts: [] }, listen: 'free', windowMs: 60000 }),
    repeat: (c, f) => ({ say: asks(c)[Number(f.step)].say, listen: 'free', windowMs: 60000 }),
    answer(c, f, a) {
      const list = asks(c), i = Number(f.step), texts = [...(f.data.texts as string[])];
      const ops: UndoOp[] = [];
      if (!skipped(a)) texts.push(a.text);
      if (i + 1 < list.length) return { say: list[i + 1].say, step: String(i + 1), data: { texts }, listen: 'free', windowMs: 60000 };
      if (!texts.length) return { say: c.ru ? 'Хорошо, без записи' : 'Okay, nothing saved', end: true };
      addNote(c, list[0].label, texts.join('; '), ops, o.day?.(c));
      o.after?.(c, texts, ops);
      return { say: o.done(c, texts.length), end: true, ops };
    },
    stop: () => undefined,
  });
}
askFlow('gratitude', (c) => [
  { say: c.ru ? 'Назовите три вещи, за которые благодарны сегодня. Первая?' : 'Name three things you are grateful for today. The first?', label: c.ru ? 'Благодарность' : 'Grateful' },
  { say: c.ru ? 'Вторая?' : 'The second?', label: '' }, { say: c.ru ? 'Третья?' : 'The third?', label: '' },
], { done: (c) => (c.ru ? 'Записал в заметку дня. Хороший вечер' : 'Saved in today’s note') });
askFlow('hard', (c) => [
  { say: c.ru ? 'Что было сложным сегодня?' : 'What was hard today?', label: c.ru ? 'Сложное' : 'Hard' },
  { say: c.ru ? 'Что помогло или что сделаете иначе?' : 'What helped, or what would you do differently?', label: '' },
], { done: (c) => (c.ru ? 'Записал в заметку дня. Это тоже опыт' : 'Saved in today’s note') });
askFlow('learned', (c) => [{ say: c.ru ? 'Что вы узнали сегодня?' : 'What did you learn today?', label: c.ru ? 'Узнал' : 'Learned' }], { done: (c) => (c.ru ? 'Записал в заметку дня' : 'Saved in today’s note') });
askFlow('weekreflect', (c) => [
  { say: c.ru ? 'Что получилось на этой неделе?' : 'What went well this week?', label: c.ru ? 'Неделя' : 'Week' },
  { say: c.ru ? 'Что было трудным?' : 'What was hard?', label: '' },
  { say: c.ru ? 'Что берёте в следующую неделю?' : 'What will you carry into next week?', label: '' },
], {
  day: (c) => addDays(weekStart(c.day), 6),
  after(c, texts, ops) {
    if (texts.length < 3) return;
    const slot = weekFocusSlot(c.now);
    if (saveWeekFocus(texts[2], c.now)) ops.push({ t: 'local', key: slot.key, prev: slot.prev });
  },
  done: (c) => (c.ru ? 'Записал в заметку воскресенья' : 'Saved in Sunday’s note'),
});

/** free dictation: every phrase is appended, «хватит / готово» saves it as one note */
defineFlow({
  id: 'dictation',
  start: (c) => ({ say: c.ru ? 'Слушаю. Говорите, а в конце скажите «готово»' : 'I am listening. Say “done” when you finish', step: 'dict', data: { chunks: [] }, listen: 'free', windowMs: 120000 }),
  repeat: (c) => ({ say: c.ru ? 'Продолжайте или скажите «готово»' : 'Go on, or say “done”', listen: 'free', windowMs: 120000 }),
  answer(_c, f, a) {
    const chunks = [...(f.data.chunks as string[])];
    if (a.text && a.control === null) chunks.push(a.text);
    return { say: '', speech: null, step: 'dict', data: { chunks }, listen: 'free', windowMs: 120000 };
  },
  stop(c, f) {
    const chunks = f.data.chunks as string[];
    if (!chunks.length) return { say: c.ru ? 'Ничего не записал' : 'Nothing saved' };
    const ops: UndoOp[] = [];
    addNote(c, c.ru ? 'Мысль' : 'Thought', chunks.join(' '), ops);
    return { say: c.ru ? 'Записал в заметку дня' : 'Saved in today’s note', ops };
  },
});

/* ───── plan the week: priorities, workouts, a summary in the planner ───── */
const DAY_NAMES_RU = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
const DAY_NAMES_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
defineFlow({
  id: 'planweek',
  start: (c) => ({ say: c.ru ? 'Спланируем неделю. Какой главный фокус недели?' : 'Let’s plan the week. What is the focus?', step: 'focus', data: { }, listen: 'free', windowMs: 60000 }),
  repeat(c, f) {
    return { say: f.step === 'focus' ? (c.ru ? 'Какой главный фокус недели?' : 'What is the focus?') : f.step === 'top' ? (c.ru ? 'Назовите три главных дела через запятую' : 'Name three top tasks, separated by commas') : (c.ru ? 'Сколько тренировок на неделе?' : 'How many workouts this week?'), listen: f.step === 'train' ? 'number' : 'free', windowMs: 60000 };
  },
  answer(c, f, a) {
    const ops: UndoOp[] = [];
    if (f.step === 'focus') {
      if (!skipped(a)) { const slot = weekFocusSlot(c.now); if (saveWeekFocus(a.text, c.now)) ops.push({ t: 'local', key: slot.key, prev: slot.prev }); }
      return { say: c.ru ? 'Три главных дела недели? Через запятую' : 'Three top tasks for the week? Separated by commas', step: 'top', listen: 'free', ops, windowMs: 60000 };
    }
    if (f.step === 'top') {
      const items = skipped(a) ? [] : a.text.split(/,| и |;/).map((x) => x.trim()).filter(Boolean).slice(0, 3);
      const monday = weekStart(c.day);
      const first = c.day > monday ? c.day : monday;
      for (const t of items) { const row = newEvent(t, first, null, null, { focus: true }); saveEvent(row, true); ops.push({ t: 'event.delete', id: row.id }); }
      return { say: c.ru ? `Записал дел: ${items.length}. Сколько тренировок на неделе?` : `Added ${items.length}. How many workouts this week?`, step: 'train', listen: 'number', ops, windowMs: 60000 };
    }
    // workouts go to the remaining days of the week, evenly
    const n = Math.max(0, Math.min(6, Math.round(a.num ?? 0)));
    const monday = weekStart(c.day);
    const days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(monday, i)).filter((d) => d >= c.day);
    const picked: string[] = [];
    for (let i = 0; i < Math.min(n, days.length); i++) picked.push(days[Math.floor((i * days.length) / Math.min(n, days.length))]);
    for (const d of picked) { const row = newEvent(c.ru ? 'Тренировка' : 'Workout', d, '18:00', '19:00'); saveEvent(row, true); ops.push({ t: 'event.delete', id: row.id }); }
    const names = picked.map((d) => (c.ru ? DAY_NAMES_RU : DAY_NAMES_EN)[(new Date(d + 'T12:00:00').getDay() + 6) % 7]);
    return { say: picked.length ? (c.ru ? `Готово. Тренировки: ${names.join(', ')}. Всё в планере` : `Done. Workouts: ${names.join(', ')}. All in the planner`) : (c.ru ? 'Готово, тренировок не ставлю' : 'Done, no workouts added'), end: true, ops };
  },
});

/* ───── tomorrow's preparation and where to start: short read-outs ───── */
defineFlow({
  id: 'prep',
  start(c) {
    const day = addDays(c.day, 1);
    const ts = sortedByTime(tasksOf(c, day).filter((t) => !t.done));
    const withTime = ts.filter((t) => t.starts_at);
    const early = withTime[0];
    const main = ts.filter((t) => t.focus);
    const parts: string[] = [];
    parts.push(ts.length ? (c.ru ? `Завтра дел: ${ts.length}` : `Tomorrow: ${ts.length} tasks`) : (c.ru ? 'Завтра в планере пусто' : 'Tomorrow is empty'));
    if (early) parts.push(c.ru ? `Раньше всего — ${early.title} в ${hm(early.starts_at)}${toMin(hm(early.starts_at)) < 9 * 60 ? ', это рано — подготовьтесь вечером' : ''}` : `Earliest: ${early.title} at ${hm(early.starts_at)}${toMin(hm(early.starts_at)) < 9 * 60 ? ', that is early — prepare tonight' : ''}`);
    if (main.length) parts.push(c.ru ? `Главное: ${main.map((t) => t.title).slice(0, 2).join(', ')}` : `Top: ${main.map((t) => t.title).slice(0, 2).join(', ')}`);
    const need = ts.filter((t) => /встреч|созвон|врач|собеседован|презентац|meeting|call|doctor|interview/i.test(t.title)).slice(0, 2);
    if (need.length) parts.push(c.ru ? `Подготовить: ${need.map((t) => t.title).join(', ')}` : `Prepare for: ${need.map((t) => t.title).join(', ')}`);
    return { say: `${parts.join('. ')}.`, list: ts.slice(0, 6).map(taskLine), end: true };
  },
  answer: () => ({ say: '', end: true }),
});
defineFlow({
  id: 'start',
  start(c) {
    const open = openHabits(c);
    const core = open.find((h) => h.core);
    const nowMin = c.now.getHours() * 60 + c.now.getMinutes();
    const next = sortedByTime(tasksOf(c).filter((t) => !t.done && t.starts_at && toMin(hm(t.starts_at)) >= nowMin))[0];
    const goal = (c.sys?.goals ?? []).filter((g) => g.status === 'active' && g.deadline).sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)))[0];
    const rank = usePrefs.getState().goalPriority;
    const high = (c.sys?.goals ?? []).find((g) => g.status === 'active' && rank[g.id] === 'high');
    if (core) return { say: c.ru ? `Начните с главной привычки — ${q(core.name)}: она держит серию` : `Start with your core habit “${core.name}”: it keeps the streak`, end: true, chips: [{ label: core.name, say: c.ru ? `отметь ${core.name}` : `mark ${core.name}` }] };
    if (next && toMin(hm(next.starts_at)) - nowMin <= 120) return { say: c.ru ? `Ближайшее — ${next.title} в ${hm(next.starts_at)}. Подготовьтесь к нему` : `Next up: ${next.title} at ${hm(next.starts_at)}. Get ready for it`, end: true };
    const g = high ?? goal;
    if (g) return { say: c.ru ? `Двигайте цель ${q(g.title)}${g.deadline ? ` — срок ${g.deadline}` : ''}: один маленький шаг` : `Move the goal “${g.title}” forward${g.deadline ? ` — due ${g.deadline}` : ''}: one small step`, end: true };
    if (open[0]) return { say: c.ru ? `Начните с ${q(open[0].name)}` : `Start with “${open[0].name}”`, end: true };
    const st = currentStreak(c);
    return { say: c.ru ? `Всё главное сделано${st.current ? `, серия ${st.current} ${plural(st.current, 'день', 'дня', 'дней')}` : ''}. Можно отдохнуть` : 'The main things are done. A rest is fine', end: true };
  },
  answer: () => ({ say: '', end: true }),
});

/* ───── the demo: five best commands, one by one ───── */
const DEMO_RU = [['сделал зарядку', 'отметит привычку'], ['завтра в десять стоматолог', 'запишет в планер'], ['фокус 25', 'запустит таймер'], ['что у меня сегодня', 'прочитает план дня'], ['отмени', 'вернёт последнее действие']];
const DEMO_EN = [['done workout', 'marks a habit'], ['tomorrow at 10 dentist', 'adds to the planner'], ['focus 25', 'starts the timer'], ['what do i have today', 'reads today’s plan'], ['undo', 'brings the last change back']];
defineFlow({
  id: 'demo',
  start(c) { const d = (c.ru ? DEMO_RU : DEMO_EN)[0]; return { say: c.ru ? `Покажу пять команд. Первая: «${d[0]}» — ${d[1]}. Скажите «дальше»` : `Five commands. First: “${d[0]}” — ${d[1]}. Say “next”`, step: '0', listen: 'yesno', chips: [{ label: d[0], say: d[0] }] }; },
  repeat(c, f) { const d = (c.ru ? DEMO_RU : DEMO_EN)[Number(f.step)]; return { say: `«${d[0]}» — ${d[1]}`, listen: 'yesno' }; },
  answer(c, f, a) {
    const list = c.ru ? DEMO_RU : DEMO_EN;
    const i = Number(f.step) + (a.control === 'back' ? -1 : 1);
    if (i >= list.length) return { say: c.ru ? 'Это всё. Скажите «что ты умеешь», чтобы узнать больше' : 'That is all. Say “what can you do” for more', end: true };
    const d = list[Math.max(0, i)];
    return { say: c.ru ? `«${d[0]}» — ${d[1]}` : `“${d[0]}” — ${d[1]}`, step: String(Math.max(0, i)), listen: 'yesno', chips: [{ label: d[0], say: d[0] }] };
  },
});

/* ───── rituals: an ordered set of habits, walked through step by step ───── */
export type Ritual = { name: string; steps: string[] };
export const findRitual = (name: string, list: Ritual[]) => {
  const t = name.trim().toLowerCase();
  if (!t) return list.length === 1 ? list[0] : undefined;
  return rankEntities(t, list, (r) => r.name, (r) => r.name, 0.6)[0]?.item ?? list.find((r) => r.name.toLowerCase().includes(t) || t.includes(r.name.toLowerCase().split(' ')[0]));
};
const stepHabit = (c: ExecCtx, name: string) => rankEntities(name, activeHabits(c), (h) => h.id, (h) => h.name, 0.6)[0]?.item;
const ritualAsk = (c: ExecCtx, r: Ritual, i: number): FlowOut => {
  const h = stepHabit(c, r.steps[i]);
  const head = c.ru ? `Шаг ${i + 1} из ${r.steps.length}: ` : `Step ${i + 1} of ${r.steps.length}: `;
  if (h?.type === 'duration') return { say: `${head}${h.name}, ${h.minutes ?? 10} ${c.ru ? 'минут. Запустить таймер?' : 'min. Start the timer?'}`, step: String(i), listen: 'yesno', windowMs: 60000 };
  return { say: `${head}${h?.name ?? r.steps[i]}?`, step: String(i), listen: 'yesno', windowMs: 60000 };
};
defineFlow({
  id: 'ritual',
  start(c, arg) {
    const list = usePrefs.getState().rituals;
    const r = findRitual(String(arg?.name ?? ''), list);
    if (!r || !r.steps.length) return { say: c.ru ? 'Не нашёл такой ритуал. Скажите «покажи мои ритуалы»' : 'No such ritual. Say “show my rituals”', end: true };
    const out = ritualAsk(c, r, 0);
    return { ...out, say: `${c.ru ? `Ритуал «${r.name}».` : `Ritual “${r.name}”.`} ${out.say}`, data: { name: r.name, marked: 0 } };
  },
  repeat(c, f) { const r = usePrefs.getState().rituals.find((x) => x.name === f.data.name); return r ? ritualAsk(c, r, Number(f.step)) : { say: '', end: true }; },
  answer(c, f, a) {
    const r = usePrefs.getState().rituals.find((x) => x.name === f.data.name);
    if (!r) return { say: '', end: true };
    let i = Number(f.step), marked = f.data.marked as number;
    const ops: UndoOp[] = [];
    const h = stepHabit(c, r.steps[i]);
    if (a.control === 'back') i = Math.max(0, i - 1);
    else {
      if (h && a.yn === 'yes') {
        if (h.type === 'duration' && !usePomodoro.getState().endsAt) {
          const m = h.minutes ?? 10;
          pomo.setTab(0); pomo.setLength(0, m); pomo.start({ habitId: h.id, label: h.name });
          return { say: c.ru ? `Таймер на ${m} минут. По окончании сам отмечу. Скажите «дальше», когда готовы к следующему шагу` : `Timer for ${m} min; I will mark it at the end. Say “next” when ready`, step: String(i), data: { timer: true }, listen: 'yesno', windowMs: 30 * 60000 };
        }
        const m = markHabit(c, h, { full: true });
        if (m.changed) { marked += 1; ops.push(...m.ops); }
      }
      i += 1;
    }
    if (i >= r.steps.length) return { say: c.ru ? `Ритуал «${r.name}» пройден. Отмечено: ${marked}` : `Ritual “${r.name}” done. Marked: ${marked}`, end: true, ops };
    return { ...ritualAsk(c, r, i), data: { marked, timer: false }, ops };
  },
});
