import { isoDay } from '../lib/day';
import { logHabit, logMood, saveEvent } from '../state/actions';
import { getSystem } from '../state/system';
import { pomo, usePomodoro } from '../state/pomodoro';
import { matchScore, type Intent } from './intents';

/*
 * Intent → the app's own actions (ТЗ модуль 2: «AI никогда не вызывает базу напрямую»).
 * Everything goes through the same functions as the buttons, so offline/rollback/undo work the same.
 */
export type RunResult = { ok: boolean; say: string; to?: string };

const MOOD_RU = ['ужасное', 'плохое', 'нормальное', 'хорошее', 'отличное'];
const MOOD_EN = ['awful', 'bad', 'okay', 'good', 'great'];
const hm = (t: string) => t;

export function runIntent(it: Intent, lang: 'ru' | 'en'): RunResult {
  const ru = lang === 'ru';
  switch (it.kind) {
    case 'mood':
      logMood(it.level);
      return { ok: true, say: ru ? `Записал: настроение ${MOOD_RU[it.level]}` : `Mood saved: ${MOOD_EN[it.level]}` };

    case 'habit': {
      const sys = getSystem();
      const habits = (sys?.habits ?? []).filter((h) => !h.archived_at);
      const best = habits.map((h) => ({ h, s: matchScore(it.query, h.name) })).sort((a, b) => b.s - a.s)[0];
      if (!best || best.s === 0) return { ok: false, say: ru ? `Не нашёл привычку «${it.query}»` : `No habit like “${it.query}”` };
      const h = best.h;
      const day = isoDay();
      const log = sys?.logs.find((l) => l.habit_id === h.id && l.day === day);
      if (it.undo) {
        logHabit(h.id, 0, false);
        return { ok: true, say: ru ? `Снял отметку: ${h.name}` : `Unmarked: ${h.name}` };
      }
      if (h.type === 'counter') {
        const goal = h.target ?? 1;
        const v = Math.min(goal, (log?.value ?? 0) + 1);
        logHabit(h.id, v, v >= goal);
        return { ok: true, say: ru ? `${h.name}: ${v} из ${goal}` : `${h.name}: ${v} of ${goal}` };
      }
      if (log?.done) return { ok: true, say: ru ? `${h.name} уже отмечена` : `${h.name} is already done` };
      logHabit(h.id, h.type === 'duration' ? h.minutes ?? 1 : 1, true);
      return { ok: true, say: ru ? `Отметил: ${h.name}` : `Done: ${h.name}` };
    }

    case 'task': {
      const end = it.time ? `${String(Math.min(23, Number(it.time.slice(0, 2)) + 1)).padStart(2, '0')}:${it.time.slice(3)}` : null;
      saveEvent({ id: crypto.randomUUID(), title: it.title.slice(0, 120), day: it.day, starts_at: it.time, ends_at: end, note: null, done: false, category_id: null }, true);
      const when = it.day === isoDay() ? (ru ? 'на сегодня' : 'for today') : (ru ? `на ${it.day.slice(8)}.${it.day.slice(5, 7)}` : `for ${it.day.slice(5)}`);
      return { ok: true, say: ru ? `Добавил задачу «${it.title}» ${when}${it.time ? ` в ${hm(it.time)}` : ''}` : `Task “${it.title}” added ${when}${it.time ? ` at ${it.time}` : ''}` };
    }

    case 'focus': {
      if (it.minutes) {
        pomo.setTab(0);
        pomo.setLength(0, it.minutes);
      }
      pomo.start();
      const m = it.minutes ?? usePomodoro.getState().lengths[0];
      return { ok: true, say: ru ? `Запустил фокус на ${m} минут` : `Focus started for ${m} minutes` };
    }

    default:
      return {
        ok: false,
        say: ru ? 'Не понял. Скажите, например: «настроение 4», «сделал зарядку», «задача позвонить маме завтра в 15»'
          : 'Didn’t get that. Try “mood 4”, “done workout” or “task call mom tomorrow at 3 pm”',
      };
  }
}
