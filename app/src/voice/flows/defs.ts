import { addDays, weekStart } from '../../data/model';
import { logMood, saveDayNote, saveEvent } from '../../state/actions';
import { periodOf } from '../../state/compute';
import { saveWeekFocus, stats } from '../../pages/today/WeeklyReview';
import { currentStreak, hm, habitsToday, markHabit, openHabits, plural, q, sortedByTime, tasksOf, toMin } from '../exec/common';
import type { UndoOp } from '../exec/types';
import { register } from '../exec';
import { defineFlow, startFlow, type FlowOut } from './engine';

/* The guided flows of the first release of the dialog (ТЗ 6.9): walk, morning, evening, week, tough, fit. Wording is the spec's. */

const left = (n: number, ru: boolean) => (ru ? `${n === 1 ? 'Осталась' : 'Осталось'} ${n}` : `${n} left`);

/* ───── walk: through the habits not yet marked ───── */
const walkQuestion = (c: Parameters<typeof openHabits>[0], id: string): { say: string; listen: 'yesno' | 'number' } => {
  const h = c.sys?.habits.find((x) => x.id === id);
  if (!h) return { say: '', listen: 'yesno' };
  if (h.type === 'counter') return { say: c.ru ? `${h.name}: сколько сделано?` : `${h.name}: how many so far?`, listen: 'number' };
  if (h.type === 'duration') return { say: c.ru ? `${h.name}, ${h.minutes ?? 10} минут?` : `${h.name}, ${h.minutes ?? 10} minutes?`, listen: 'yesno' };
  return { say: `${h.name}?`, listen: 'yesno' };
};
const walkSummary = (c: Parameters<typeof openHabits>[0], marked: number, ops: UndoOp[]): FlowOut => {
  const rest = openHabits(c).length;
  const say = rest === 0 ? (c.ru ? 'Все привычки на сегодня отмечены. Отличный день.' : 'All habits for today are done. Great day.')
    : c.ru ? `Готово. Отмечено ${marked}, осталось ${rest}.` : `Done. Marked ${marked}, ${rest} left.`;
  return { say, end: true, ops };
};
defineFlow({
  id: 'walk',
  start(c) {
    const queue = openHabits(c).map((h) => h.id);
    if (!queue.length) return { say: c.ru ? 'Все привычки на сегодня отмечены. Отличный день.' : 'All habits for today are done. Great day.', end: true };
    const first = walkQuestion(c, queue[0]);
    return { say: `${c.ru ? `Пойдём по привычкам. ${left(queue.length, true)}.` : `Let’s go through your habits. ${left(queue.length, false)}.`} ${first.say}`, step: 'ask', data: { queue, i: 0, marked: 0 }, listen: first.listen };
  },
  repeat(c, f) { const id = (f.data.queue as string[])[f.data.i as number]; const w = walkQuestion(c, id); return { say: w.say, listen: w.listen }; },
  answer(c, f, a) {
    const queue = f.data.queue as string[];
    let i = f.data.i as number, marked = f.data.marked as number;
    const ops: UndoOp[] = [];
    const h = c.sys?.habits.find((x) => x.id === queue[i]);
    if (a.control === 'back') i = Math.max(0, i - 1);
    else if (a.control === 'next' || a.yn === 'no' || a.yn === 'skip' || a.yn === 'later') i += 1;
    else if (h && (a.yn === 'yes' || (h.type === 'counter' && a.num !== null))) {
      const r = markHabit(c, h, h.type === 'counter' && a.num !== null ? { amount: a.num } : { full: true });
      if (r.changed) { marked += 1; ops.push(...r.ops); }
      i += 1;
    } else i += 1;
    if (i >= queue.length) return walkSummary(c, marked, ops);
    const w = walkQuestion(c, queue[i]);
    return { say: w.say, step: 'ask', data: { i, marked }, listen: w.listen, ops };
  },
});

/* ───── morning: three facts, calmly ───── */
defineFlow({
  id: 'morning',
  start(c) {
    const p = periodOf(c.now);
    const hi = c.ru ? (p === 'dawn' || p === 'morning' ? 'Доброе утро' : p === 'midday' ? 'Добрый день' : 'Добрый вечер') : (p === 'dawn' || p === 'morning' ? 'Good morning' : p === 'midday' ? 'Good afternoon' : 'Good evening');
    const facts: string[] = [];
    const st = currentStreak(c);
    const yesterdayBroken = st.current === 0 && st.best > 0;
    if (st.current > 0) facts.push(c.ru ? `Серия ${st.current} ${plural(st.current, 'день', 'дня', 'дней')}` : `Streak: ${st.current} ${st.current === 1 ? 'day' : 'days'}`);
    else if (yesterdayBroken) facts.push(c.ru ? 'Вчера серия прервалась — можно заморозить' : 'Yesterday’s streak ended — you can freeze it');
    const today = sortedByTime(tasksOf(c).filter((t) => !t.done));
    const nowMin = c.now.getHours() * 60 + c.now.getMinutes();
    const first = today.find((t) => t.starts_at && toMin(hm(t.starts_at)) >= nowMin) ?? today[0];
    if (first) facts.push(c.ru ? `Первое дело — ${first.title}${first.starts_at ? ` в ${hm(first.starts_at)}` : ''}` : `First up: ${first.title}${first.starts_at ? ` at ${hm(first.starts_at)}` : ''}`);
    const open = openHabits(c)[0];
    if (open && facts.length < 3) facts.push(c.ru ? `Начните с ${q(open.name)}` : `Start with “${open.name}”`);
    if (!today.length && facts.length < 3) facts.push(c.ru ? 'В планере пусто' : 'Your planner is empty');
    const say = `${hi}. ${facts.slice(0, 3).join('. ')}.`;
    return {
      say, end: true,
      chips: [...(open ? [{ label: c.ru ? `Начать с ${open.name}` : `Start with ${open.name}`, say: c.ru ? `отметь ${open.name}` : `mark ${open.name}` }] : []), { label: c.ru ? 'Что дальше' : 'What’s next', say: c.ru ? 'что дальше' : 'what is next' }, { label: c.ru ? 'Фокус 25' : 'Focus 25', say: c.ru ? 'фокус 25' : 'focus 25' }],
    };
  },
  answer() { return { say: '', end: true }; },
});

/* ───── evening: mood, a win, tasks, habits ───── */
const winNote = (prev: string | null | undefined, text: string, ru: boolean) => {
  const add = `${ru ? 'Победа' : 'Win'}: ${text}`;
  return (prev ? `${prev} · ${add}` : add).slice(0, 500);
};
defineFlow({
  id: 'evening',
  start(c) {
    const mood = c.sys?.days.find((d) => d.day === c.day)?.mood;
    if (!mood) return { say: c.ru ? 'Как прошёл день, по пятибалльной шкале?' : 'How was your day, from 1 to 5?', step: 'mood', listen: 'mood' };
    return { say: c.ru ? 'Что получилось сегодня?' : 'What went well today?', step: 'win', listen: 'free' };
  },
  repeat(c, f) {
    const s = f.step;
    return { say: s === 'mood' ? (c.ru ? 'Как прошёл день, по пятибалльной шкале?' : 'How was your day, from 1 to 5?') : s === 'win' ? (c.ru ? 'Что получилось сегодня?' : 'What went well today?') : s === 'tasks' ? (c.ru ? 'Перенести оставшиеся дела на завтра?' : 'Move the open tasks to tomorrow?') : (c.ru ? 'Отметить оставшиеся привычки сейчас?' : 'Mark the rest of your habits now?'), listen: s === 'mood' ? 'mood' : s === 'win' ? 'free' : 'yesno' };
  },
  answer(c, f, a) {
    const ops: UndoOp[] = [];
    const next = (from: string): FlowOut => {
      if (from === 'mood' || from === 'win') {
        const open = tasksOf(c).filter((t) => !t.done);
        if (open.length) return { say: c.ru ? `Осталось ${open.length} ${plural(open.length, 'дело', 'дела', 'дел')}. Перенести на завтра?` : `${open.length} tasks left. Move them to tomorrow?`, step: 'tasks', listen: 'yesno', ops };
      }
      if (from !== 'habits') {
        const rest = openHabits(c);
        if (rest.length) return { say: c.ru ? `${left(rest.length, true)}. Отметить сейчас?` : `${rest.length} habits left. Mark them now?`, step: 'habits', listen: 'yesno', ops };
      }
      return { say: c.ru ? 'День закрыт. Хорошего вечера.' : 'The day is closed. Have a good evening.', end: true, ops };
    };
    if (f.step === 'mood') {
      if (a.mood !== null) {
        const prev = c.sys?.days.find((d) => d.day === c.day)?.mood ?? null;
        logMood(a.mood - 1, c.day);
        ops.push({ t: 'mood', day: c.day, prev });
      }
      return { say: c.ru ? 'Что получилось сегодня?' : 'What went well today?', step: 'win', listen: 'free', ops };
    }
    if (f.step === 'win') {
      if (a.control !== 'next' && a.text) {
        const prev = c.sys?.days.find((d) => d.day === c.day)?.note ?? null;
        saveDayNote(c.day, winNote(prev, a.text, c.ru));
        ops.push({ t: 'note', day: c.day, prev });
      }
      return next('win');
    }
    if (f.step === 'tasks') {
      if (a.yn === 'yes') {
        const open = tasksOf(c).filter((t) => !t.done);
        for (const t of open) { ops.push({ t: 'event.save', row: t, wasNew: false }); saveEvent({ ...t, day: addDays(c.day, 1) }, false); }
      }
      return next('tasks');
    }
    // habits
    if (a.yn === 'yes') return { say: '', switchTo: 'walk', end: false, ops };
    return next('habits');
  },
});

/* ───── week: the numbers, then one line to carry ───── */
defineFlow({
  id: 'week',
  start(c) {
    if (!c.sys) return { say: c.ru ? 'Данные ещё загружаются, попробуйте через секунду' : 'Still loading, try again in a second', end: true };
    const from = weekStart(c.day);
    const s = stats(c.sys, from);
    const wd = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(c.ru ? 'ru-RU' : 'en-US', { weekday: 'long' });
    const weakest = habitsToday(c).map((h) => ({ h, n: c.sys!.logs.filter((l) => l.habit_id === h.id && l.done && l.day >= from).length })).sort((a, b) => a.n - b.n)[0];
    const hours = Math.round((s.focusMin / 60) * 10) / 10;
    const nums = c.ru
      ? `Дней в ритме: ${s.kept} из ${s.of}. ${s.best.n ? `Лучший день — ${wd(s.best.d)}. ` : ''}${weakest ? `Слабее всего — ${q(weakest.h.name)}. ` : ''}Фокус: ${hours} ${plural(Math.floor(hours), 'час', 'часа', 'часов')}.`
      : `Days in rhythm: ${s.kept} of ${s.of}. ${s.best.n ? `Best day: ${wd(s.best.d)}. ` : ''}${weakest ? `Weakest: “${weakest.h.name}”. ` : ''}Focus: ${hours} h.`;
    return { say: `${nums} ${c.ru ? 'Что берёшь в следующую неделю?' : 'What will you carry into next week?'}`, step: 'focus', listen: 'free' };
  },
  repeat(c) { return { say: c.ru ? 'Что берёшь в следующую неделю?' : 'What will you carry into next week?', listen: 'free' }; },
  answer(c, _f, a) {
    if (a.control === 'next' || !a.text) return { say: c.ru ? 'Хорошо, без записи' : 'Okay, nothing saved', end: true };
    const v = saveWeekFocus(a.text, c.now);
    return { say: c.ru ? `Записал на неделю: ${q(v)}` : `Saved for the week: “${v}”`, end: true };
  },
});

/* ───── tough: lighten the day, never mark anything by itself ───── */
defineFlow({
  id: 'tough',
  start(c) {
    const open = tasksOf(c).filter((t) => !t.done);
    return {
      say: c.ru ? 'Понимаю. Давайте облегчим день.' : 'I hear you. Let’s make today lighter.', step: 'choose', listen: 'none',
      choices: [
        { label: c.ru ? 'Оставить только главное' : 'Keep only the essentials', run: () => lighten(c, open) },
        { label: c.ru ? 'Подышать минуту' : 'Breathe for a minute', run: () => startFlow('box', c) },
        { label: c.ru ? 'Выговориться' : 'Talk it out', run: () => startFlow('dictation', c, { target: 'note' }) },
      ],
    };
  },
  answer(c) { return { say: c.ru ? 'Выберите кнопку или скажите «стоп»' : 'Pick a button or say “stop”', listen: 'none' }; },
});
function lighten(c: Parameters<typeof openHabits>[0], open: ReturnType<typeof tasksOf>) {
  // nothing marked "main" is moved: the core of the day stays; the rest goes to tomorrow, with the count confirmed
  const movable = open.filter((t) => !t.focus);
  const ops: UndoOp[] = [];
  for (const t of movable) { ops.push({ t: 'event.save', row: t, wasNew: false }); saveEvent({ ...t, day: addDays(c.day, 1) }, false); }
  const say = c.ru ? `${movable.length ? `Перенёс на завтра: ${movable.length}. ` : 'Переносить нечего. '}Дополнительные привычки сегодня на серию не влияют.` : `${movable.length ? `Moved to tomorrow: ${movable.length}. ` : 'Nothing to move. '}Extra habits don’t affect your streak today.`;
  return { ok: true, kind: 'done' as const, screen: say, speech: say, undo: ops };
}

/* ───── fit: «I have N minutes» ───── */
defineFlow({
  id: 'fit',
  start(c, arg) {
    const N = typeof arg?.minutes === 'number' ? arg.minutes : 30;
    const cands: { title: string; est: number; say: string }[] = [];
    for (const h of openHabits(c)) {
      const est = h.type === 'duration' ? h.minutes ?? 10 : 5;
      if (est <= N) cands.push({ title: h.name, est, say: c.ru ? `отметь ${h.name}` : `mark ${h.name}` });
    }
    for (const t of tasksOf(c).filter((x) => !x.done && !x.starts_at)) {
      const est = t.ends_at && t.starts_at ? toMin(hm(t.ends_at)) - toMin(hm(t.starts_at)) : 15;
      if (est <= N) cands.push({ title: t.title, est, say: c.ru ? `вычеркни ${t.title}` : `cross off ${t.title}` });
    }
    if (N >= 25) cands.push({ title: c.ru ? 'Фокус 25 минут' : 'Focus 25 minutes', est: 25, say: c.ru ? 'фокус 25' : 'focus 25' });
    const top = cands.slice(0, 5);
    if (!top.length) return { say: c.ru ? `На ${N} минут ничего не подходит — можно просто отдохнуть.` : `Nothing fits ${N} minutes — a rest is fine too.`, end: true };
    const speak = top.slice(0, 2).map((x) => x.title).join(c.ru ? ' или ' : ' or ');
    return {
      say: c.ru ? `За ${N} минут можно: ${speak}.` : `In ${N} minutes you can: ${speak}.`, list: top.map((x) => `${x.title} · ${x.est} ${c.ru ? 'мин' : 'min'}`), end: true,
      chips: top.slice(0, 3).map((x) => ({ label: c.ru ? `Начать ${x.title}` : `Start ${x.title}`, say: x.say })),
    };
  },
  answer() { return { say: '', end: true }; },
});

register('flow.start', (p, c) => startFlow(String(p.slots.id ?? ''), c, p.slots));
