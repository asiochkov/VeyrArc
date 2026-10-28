import { rankEntities } from '../nlp/parse/engine';
import { R } from '../reply';
import type { ExecCtx } from './index';
import type { Parsed } from '../nlp/types';
import type { Reply } from './types';

/*
 * Which of the person's own things a phrase means (ТЗ 6.8, 6.10): the best match by name; two close ones → ask which; a weak
 * one → confirm; none → say so and offer the nearest commands. Used by every executor that takes «the habit X», «the task Y».
 */
export type Kind = { ru: string; en: string; ruAcc: string; enAcc?: string };
export const WHAT: Record<'habit' | 'task' | 'goal' | 'quit' | 'step' | 'ritual' | 'template', Kind> = {
  habit: { ru: 'привычка', en: 'habit', ruAcc: 'привычку' }, task: { ru: 'задача', en: 'task', ruAcc: 'задачу' }, goal: { ru: 'цель', en: 'goal', ruAcc: 'цель' },
  quit: { ru: 'отказ', en: 'quit', ruAcc: 'отказ' }, step: { ru: 'шаг', en: 'step', ruAcc: 'шаг' }, ritual: { ru: 'ритуал', en: 'ritual', ruAcc: 'ритуал' }, template: { ru: 'шаблон', en: 'template', ruAcc: 'шаблон' },
};
const SURE = 0.88, MAYBE = 0.62, CLOSE = 0.07;

export function withTarget<T extends { id: string }>(c: ExecCtx, p: Parsed, list: T[], name: (t: T) => string, what: keyof typeof WHAT, run: (t: T) => Reply): Reply {
  const w = WHAT[what];
  const byId = typeof p.slots.id === 'string' ? list.find((t) => t.id === p.slots.id) : undefined;
  const query = typeof p.slots.query === 'string' ? p.slots.query : '';
  const ranked = byId ? [{ item: byId, id: byId.id, sim: 1 }] : rankEntities(query, list, (t) => t.id, name, MAYBE - 0.1);
  const [a, b] = ranked;
  if (!a || a.sim < MAYBE) {
    return R.error(c.ru ? `Не нашёл ${w.ruAcc} «${query}»` : `Couldn’t find the ${w.en} “${query}”`, list.length ? { chips: list.slice(0, 4).map((t) => ({ label: name(t), say: name(t) })) } : undefined);
  }
  if (b && b.sim >= MAYBE && a.sim - b.sim < CLOSE && a.sim < 0.97) {
    return R.ask(c.ru ? 'Какую именно?' : 'Which one?', { choices: ranked.slice(0, 3).map((x) => ({ label: name(x.item), run: () => run(x.item) })), expect: { windowMs: 8000 } });
  }
  if (a.sim < SURE) {
    return R.confirm(c.ru ? `Вы про ${w.ruAcc} «${name(a.item)}»?` : `Do you mean the ${w.en} “${name(a.item)}”?`, { choices: [
      { label: c.ru ? 'Да' : 'Yes', yes: true, run: () => run(a.item) }, { label: c.ru ? 'Нет' : 'No', yes: false, run: () => R.info(c.ru ? 'Хорошо, ничего не меняю' : 'Okay, nothing changed') }] });
  }
  return run(a.item);
}
