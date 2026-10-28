import { DAYS_ALL, DAYS_WEEKDAYS, DAYS_WEEKENDS, type HabitRowDb } from '../../data/model';
import { HABIT_LIBRARY, libraryDays } from '../../data/habitLibrary';
import { config } from '../../config';
import { isProPlan, useAuth } from '../../lib/auth';
import { archiveHabit, createHabit, logHabit, reorderHabits, restoreHabit, updateHabit } from '../../state/actions';
import { habitBest, habitStreak, indexLogs } from '../../data/model';
import { rankEntities } from '../nlp/parse/engine';
import { R } from '../reply';
import { activeHabits, habitsToday, hm, logOf, markHabit, plural } from './common';
import { drops, periodIn, rangeOf, rate, ranking, total, byWeekday, type Period } from './habitStats';
import { store } from '../store';
import { register, type ExecCtx } from './index';
import { withTarget } from './resolve';
import type { Parsed } from '../nlp/types';
import type { UndoOp } from './types';

/* WP5.1 — habits: managing them by voice and asking about them (catalog 1–15, 117, 156, 157, 167–176). */
const WD_RU = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
const WD_RU_ON = ['понедельникам', 'вторникам', 'средам', 'четвергам', 'пятницам', 'субботам', 'воскресеньям'];
const WD_EN = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];
export const daysWords = (mask: number, ru: boolean) => {
  if (mask === DAYS_ALL) return ru ? 'каждый день' : 'every day';
  if (mask === DAYS_WEEKDAYS) return ru ? 'по будням' : 'on weekdays';
  if (mask === DAYS_WEEKENDS) return ru ? 'по выходным' : 'on weekends';
  const names = (ru ? WD_RU_ON : WD_EN).filter((_, i) => mask & (1 << i));
  return ru ? `по ${names.join(' и ')}` : names.join(' and ');
};
const patchOp = (h: HabitRowDb, keys: (keyof HabitRowDb)[]): UndoOp => ({ t: 'habit.patch', id: h.id, prev: Object.fromEntries(keys.map((k) => [k, h[k] ?? null])) });
const activeList = (c: ExecCtx) => activeHabits(c);
const target = (c: ExecCtx, p: Parsed, run: (h: HabitRowDb) => ReturnType<typeof R.done>, archived = false) =>
  withTarget(c, p, archived ? (c.sys?.habits ?? []).filter((h) => h.archived_at) : activeList(c), (h) => h.name, 'habit', run);
const coreLimit = () => (isProPlan(useAuth.getState().plan) ? Infinity : config.limits.free.core);

register('habit.rename', (p, c) => target(c, p, (h) => {
  const to = String(p.slots.to ?? '').trim().slice(0, 40);
  if (!to) return R.error(c.ru ? 'Как назвать?' : 'What should it be called?');
  const op = patchOp(h, ['name']);
  updateHabit(h.id, { name: to });
  return R.done(c.ru ? `Переименовал «${h.name}» в «${to}»` : `Renamed “${h.name}” to “${to}”`, { undo: [op] });
}));

register('habit.schedule', (p, c) => target(c, p, (h) => {
  const mask = Number(p.slots.days);
  if (!mask) return R.error(c.ru ? 'На какие дни?' : 'On which days?');
  const op = patchOp(h, ['days']);
  updateHabit(h.id, { days: mask });
  return R.done(c.ru ? `«${h.name}» теперь ${daysWords(mask, true)}` : `“${h.name}” is now ${daysWords(mask, false)}`, { undo: [op] });
}));

register('habit.target', (p, c) => target(c, p, (h) => {
  const n = Number(p.slots.target ?? p.slots.minutes ?? p.slots.amount);
  if (!n || n < 1) return R.error(c.ru ? 'Какую норму поставить?' : 'What target?');
  if (h.type === 'binary') return R.info(c.ru ? `«${h.name}» — привычка «сделал или нет», у неё нет нормы` : `“${h.name}” is a yes/no habit; it has no target`);
  const key = h.type === 'duration' ? 'minutes' : 'target';
  const op = patchOp(h, [key]);
  updateHabit(h.id, { [key]: Math.min(h.type === 'duration' ? 600 : 100000, Math.round(n)) } as never);
  const unit = h.type === 'duration' ? (c.ru ? 'мин' : 'min') : h.unit ?? '';
  return R.done(c.ru ? `Норма «${h.name}»: ${n} ${unit}`.trim() : `Target for “${h.name}”: ${n} ${unit}`.trim(), { undo: [op] });
}));

register('habit.core', (p, c) => target(c, p, (h) => {
  const core = p.slots.core !== false;
  if (h.core === core) return R.info(c.ru ? `«${h.name}» уже ${core ? 'в главных' : 'не в главных'}` : `“${h.name}” is already ${core ? 'core' : 'extra'}`);
  const coreN = activeHabits(c).filter((x) => x.core).length;
  if (core && coreN >= coreLimit()) return R.error(c.ru ? `Главных привычек может быть ${coreLimit()}. Уберите одну из главных — и повторите.` : `You can have ${coreLimit()} core habits. Move one to extra first.`);
  const op = patchOp(h, ['core']);
  updateHabit(h.id, { core });
  return R.done(c.ru ? `«${h.name}» ${core ? 'теперь главная: она влияет на серию' : 'теперь дополнительная: на серию не влияет'}` : `“${h.name}” is now ${core ? 'core: it counts for the streak' : 'extra: it doesn’t count for the streak'}`, { undo: [op] });
}));

register('habit.pause', (p, c) => target(c, p, (h) => {
  const op = patchOp(h, ['archived_at']);
  archiveHabit(h.id);
  return R.done(c.ru ? `Поставил «${h.name}» на паузу. Вернуть: «верни привычку ${h.name}»` : `Paused “${h.name}”. To bring it back: “restore habit ${h.name}”`, { undo: [op] });
}));
register('habit.restore', (p, c) => target(c, p, (h) => {
  const op = patchOp(h, ['archived_at']);
  restoreHabit(h.id);
  return R.done(c.ru ? `Вернул «${h.name}»` : `Restored “${h.name}”`, { undo: [op] });
}, true));
register('habit.remove', (p, c) => target(c, p, (h) => {
  // removing is archiving: the marks stay, and it comes back with one phrase (decision #8)
  const op = patchOp(h, ['archived_at']);
  archiveHabit(h.id);
  return R.done(c.ru ? `Убрал «${h.name}» в архив. Вернуть: «верни привычку ${h.name}»` : `Moved “${h.name}” to the archive. To bring it back: “restore habit ${h.name}”`, { undo: [op] });
}));

register('habit.addFromLibrary', (p, c) => {
  const query = String(p.slots.query ?? '');
  const hit = rankEntities(query, HABIT_LIBRARY, (t) => t.key, (t) => `${t.name.ru} ${t.name.en}`, 0.6)[0];
  if (!hit) return R.error(c.ru ? `В библиотеке нет «${query}»` : `Nothing like “${query}” in the library`, { chips: HABIT_LIBRARY.slice(0, 4).map((t) => ({ label: t.name[c.lang], say: `добавь привычку из библиотеки ${t.name.ru}` })) });
  const t = hit.item;
  if (activeHabits(c).some((h) => h.name.toLowerCase() === t.name[c.lang].toLowerCase())) return R.info(c.ru ? `«${t.name.ru}» у вас уже есть` : `You already have “${t.name.en}”`);
  const row = createHabit({ id: crypto.randomUUID(), name: t.name[c.lang], icon: t.icon, hue: HUE[t.cat], type: t.type, target: t.target ?? null, unit: t.unit ?? null, minutes: t.minutes ?? null, days: libraryDays(t), category: t.cat, core: false });
  return R.done(c.ru ? `Добавил «${row.name}» — ${t.why.ru.toLowerCase()}` : `Added “${row.name}” — ${t.why.en.toLowerCase()}`, { undo: [{ t: 'habit.create', id: row.id }] });
});
const HUE: Record<string, string> = { body: '#3B82F6', mind: '#8B5CF6', disc: '#10B981', prod: '#F59E0B' };

register('habit.reorder', (p, c) => target(c, p, (h) => {
  const list = [...activeHabits(c)].sort((a, b) => a.sort - b.sort);
  const ids = list.map((x) => x.id);
  const down = p.slots.to === 'bottom';
  const next = down ? [...ids.filter((i) => i !== h.id), h.id] : [h.id, ...ids.filter((i) => i !== h.id)];
  // undo restores every sort value exactly as it was
  const ops: UndoOp[] = list.map((x) => ({ t: 'habit.patch', id: x.id, prev: { sort: x.sort } }));
  reorderHabits(next);
  return R.done(c.ru ? `«${h.name}» теперь ${down ? 'в конце списка' : 'первая'}` : `“${h.name}” is now ${down ? 'last' : 'first'}`, { undo: ops });
}));

/* ── marking in groups and in the past ── */
const CAT: Record<string, HabitRowDb['category']> = { тело: 'body', body: 'body', ум: 'mind', mind: 'mind', дисциплина: 'disc', discipline: 'disc', продуктивность: 'prod', productivity: 'prod' };
register('habit.markGroup', (p, c) => {
  const g = String(p.slots.group ?? '').toLowerCase();
  const cat = CAT[g];
  const timeOfDay = /утренн|вечерн|дневн|morning|evening|daytime/.test(g);
  if (!cat && !timeOfDay && !/основн|главн|core|main/.test(g)) return R.error(c.ru ? 'Не понял, какую группу. Скажите: «отметь все привычки из раздела тело»' : 'Which group? Try: “mark all habits in body”');
  if (timeOfDay) return R.info(c.ru ? 'У привычек нет времени суток, поэтому я отмечаю по разделам. Скажите: «отметь все привычки из раздела тело» (тело, ум, дисциплина, продуктивность).' : 'Habits have no time of day, so I mark by section. Say: “mark all habits in body”.');
  const list = habitsToday(c).filter((h) => (cat ? h.category === cat : h.core) && !logOf(c, h.id)?.done);
  if (!list.length) return R.info(c.ru ? 'В этой группе всё уже отмечено' : 'Everything in that group is already done');
  const ops: UndoOp[] = [];
  for (const h of list) ops.push(...markHabit(c, h, { full: true }).ops);
  return R.done(c.ru ? `Отметил ${list.length} ${plural(list.length, 'привычку', 'привычки', 'привычек')}: ${list.map((h) => h.name).join(', ')}` : `Marked ${list.length} habits: ${list.map((h) => h.name).join(', ')}`, { undo: ops });
});

register('habit.markPast', (p, c) => target(c, p, (h) => {
  const day = String(p.slots.day ?? '');
  const ago = (new Date(c.day).getTime() - new Date(day).getTime()) / 86400000;
  if (!day || ago < 1 || ago > 2) return R.error(c.ru ? 'Задним числом можно отметить только вчера и позавчера' : 'I can only mark yesterday and the day before');
  const word = ago === 1 ? (c.ru ? 'вчера' : 'yesterday') : (c.ru ? 'позавчера' : 'the day before yesterday');
  const doIt = () => { const m = markHabit(c, h, { full: true, day }); return m.changed ? R.done(c.ru ? `${m.text} (${word})` : `${m.text} (${word})`, { undo: m.ops }) : R.info(m.text); };
  return R.confirm(c.ru ? `Отметить «${h.name}» ${word}?` : `Mark “${h.name}” ${word}?`, { choices: [{ label: c.ru ? 'Да' : 'Yes', yes: true, run: doIt }, { label: c.ru ? 'Нет' : 'No', yes: false, run: () => R.info(c.ru ? 'Хорошо, ничего не меняю' : 'Okay') }] });
}));

/* ── questions about habits ── */
register('habit.streak', (p, c) => {
  if (!p.slots.query) {
    const best = [...activeHabits(c)].map((h) => ({ h, n: habitStreak(h, indexLogs(c.sys?.logs ?? []), c.day) })).sort((a, b) => b.n - a.n)[0];
    return best ? R.answer(c.ru ? `Самая длинная серия сейчас — «${best.h.name}»: ${best.n} ${plural(best.n, 'день', 'дня', 'дней')}` : `Longest streak now: “${best.h.name}”, ${best.n} days`) : R.info(c.ru ? 'Пока нет привычек' : 'No habits yet');
  }
  return target(c, p, (h) => {
    const ix = indexLogs(c.sys?.logs ?? []);
    const n = habitStreak(h, ix, c.day), best = habitBest(h, ix, c.day);
    return R.answer(p.slots.best
      ? (c.ru ? `Лучшая серия по «${h.name}» — ${best} ${plural(best, 'день', 'дня', 'дней')}` : `Best streak for “${h.name}”: ${best} days`)
      : (c.ru ? `Серия по «${h.name}»: ${n} ${plural(n, 'день', 'дня', 'дней')}. Лучшая — ${best}` : `“${h.name}” streak: ${n} days. Best: ${best}`));
  });
});

register('habit.count', (p, c) => target(c, p, (h) => {
  const per = (p.slots.period as Period | undefined) ?? 'week';
  const r = rangeOf(per, c);
  if (p.slots.sum || h.type === 'counter') {
    const n = total(c, h, r.from, r.to);
    return R.answer(c.ru ? `«${h.name}» ${r.ru}: ${n}${h.unit ? ' ' + h.unit : ''}` : `“${h.name}” ${r.en}: ${n}${h.unit ? ' ' + h.unit : ''}`);
  }
  const x = rate(c, h, r.from, r.to);
  return R.answer(c.ru ? `«${h.name}» ${r.ru}: ${x.done} ${plural(x.done, 'раз', 'раза', 'раз')} из ${x.due} запланированных` : `“${h.name}” ${r.en}: ${x.done} of ${x.due} planned days`);
}));

const NEED = (c: ExecCtx) => (c.ru ? 'Пока мало данных: нужна хотя бы неделя' : 'Not enough data yet: I need at least a week');
register('habit.weakest', (_p, c) => {
  const r = ranking(c);
  if (!r.length) return R.info(NEED(c));
  const w = r[r.length - 1];
  return R.answer(c.ru ? `Слабее всего «${w.h.name}»: ${w.pct}% за последние 4 недели` : `Weakest is “${w.h.name}”: ${w.pct}% over the last 4 weeks`);
});
register('habit.top', (p, c) => {
  const r = ranking(c);
  if (!r.length) return R.info(NEED(c));
  const n = Math.min(Number(p.slots.n) || 3, r.length);
  const list = p.slots.worst ? [...r].reverse().slice(0, n) : r.slice(0, n);
  return R.answer(c.ru ? `${p.slots.worst ? 'Слабее всего' : 'Лучшие'} за 4 недели:` : `${p.slots.worst ? 'Weakest' : 'Best'} over 4 weeks:`, { list: list.map((x, i) => `${i + 1}. ${x.h.name} — ${x.pct}%`), speech: (c.ru ? `${p.slots.worst ? 'Слабее всего' : 'Лучшие'}: ` : '') + list.map((x) => `${x.h.name} ${x.pct}%`).join(', ') });
});
register('habit.trend', (_p, c) => {
  const d = drops(c);
  if (!d.length) return R.answer(c.ru ? 'Заметных просадок нет: ни одна привычка не упала больше чем на 15 пунктов' : 'No visible dips: no habit fell by more than 15 points');
  return R.answer(c.ru ? 'Просели за последние две недели:' : 'Dipped over the last two weeks:', { list: d.slice(0, 5).map((x) => `${x.h.name}: ${x.was}% → ${x.now}%`), speech: d.slice(0, 3).map((x) => `${x.h.name}: было ${x.was}, стало ${x.now} процентов`).join('. ') });
});
register('habit.compare', (p, c) => {
  const a = rankEntities(String(p.slots.a ?? ''), activeHabits(c), (h) => h.id, (h) => h.name, 0.6)[0]?.item, b = rankEntities(String(p.slots.b ?? ''), activeHabits(c), (h) => h.id, (h) => h.name, 0.6)[0]?.item;
  if (!a || !b) return R.error(c.ru ? 'Не нашёл одну из привычек' : 'I couldn’t find one of the habits');
  const ix = indexLogs(c.sys?.logs ?? []);
  const line = (h: HabitRowDb) => { const r = rate(c, h, c.day.slice(0, 8) + '01', c.day); return `${h.name}: ${r.pct}% за месяц, серия ${habitStreak(h, ix, c.day)}`; };
  return R.answer(c.ru ? 'Сравнение за месяц:' : 'This month:', { list: [line(a), line(b)], speech: `${line(a)}. ${line(b)}.` });
});

/* ── coach: rules, not generation ── */
register('habit.suggest', (_p, c) => {
  const have = new Set(activeHabits(c).map((h) => h.category));
  const cats = (['body', 'mind', 'disc'] as const).filter((k) => !have.has(k));
  const pool = HABIT_LIBRARY.filter((t) => (cats.length ? cats.includes(t.cat as never) : true) && !activeHabits(c).some((h) => h.name.toLowerCase() === t.name.ru.toLowerCase())).slice(0, 3);
  if (!pool.length) return R.info(c.ru ? 'Набор уже хороший. Лучше отточить то, что есть.' : 'Your set is already good. Polish what you have.');
  return R.ask(c.ru ? `Могу предложить: ${pool.map((t) => t.name.ru).join(', ')}. Что добавить?` : `I can suggest: ${pool.map((t) => t.name.en).join(', ')}. Which one?`, { choices: pool.map((t) => ({ label: t.name[c.lang], run: () => { const row = createHabit({ id: crypto.randomUUID(), name: t.name[c.lang], icon: t.icon, hue: HUE[t.cat], type: t.type, target: t.target ?? null, unit: t.unit ?? null, minutes: t.minutes ?? null, days: libraryDays(t), category: t.cat, core: false }); return R.done(c.ru ? `Добавил «${row.name}»` : `Added “${row.name}”`, { undo: [{ t: 'habit.create', id: row.id }] }); } })), expect: { windowMs: 8000 } });
});
const scale = (h: HabitRowDb, f: number): Partial<HabitRowDb> | null => {
  if (h.type === 'duration' && h.minutes) return { minutes: Math.max(5, Math.round((h.minutes * f) / 5) * 5) };
  if (h.type === 'counter' && h.target) return { target: Math.max(1, Math.round(h.target * f)) };
  return null;
};
register('habit.simplify', (p, c) => target(c, p, (h) => {
  const patch = scale(h, 2 / 3);
  if (!patch || Object.entries(patch).every(([k, v]) => (h as never)[k] === v)) return R.info(c.ru ? `«${h.name}» уже простая: упрощать нечего` : `“${h.name}” is already simple`);
  const k = Object.keys(patch)[0] as keyof HabitRowDb;
  return R.confirm(c.ru ? `Уменьшить норму «${h.name}» с ${h[k]} до ${(patch as never)[k]}?` : `Lower the target of “${h.name}” from ${h[k]} to ${(patch as never)[k]}?`, { choices: [{ label: c.ru ? 'Да' : 'Yes', yes: true, run: () => { const op = patchOp(h, [k]); updateHabit(h.id, patch); return R.done(c.ru ? `Теперь норма «${h.name}» — ${(patch as never)[k]}` : `Target of “${h.name}” is now ${(patch as never)[k]}`, { undo: [op] }); } }, { label: c.ru ? 'Нет' : 'No', yes: false, run: () => R.info(c.ru ? 'Оставляю как есть' : 'Leaving it as it is') }] });
}));
register('habit.harden', (p, c) => {
  const ranked = ranking(c, 14, 7).filter((x) => x.pct >= 90 && scale(x.h, 1.25));
  const pick = p.slots.query ? ranked.find((x) => x.h.name.toLowerCase().includes(String(p.slots.query).toLowerCase().slice(0, 4))) : ranked[0];
  if (!pick) return R.info(c.ru ? 'Пока рано усложнять: нужна стабильность — хотя бы 90% за две недели' : 'It’s early to raise the bar: I want 90% over two weeks first');
  const h = pick.h, patch = scale(h, 1.25)!, k = Object.keys(patch)[0] as keyof HabitRowDb;
  return R.confirm(c.ru ? `«${h.name}» идёт стабильно (${pick.pct}%). Поднять норму с ${h[k]} до ${(patch as never)[k]}?` : `“${h.name}” is steady (${pick.pct}%). Raise the target from ${h[k]} to ${(patch as never)[k]}?`, { choices: [{ label: c.ru ? 'Да' : 'Yes', yes: true, run: () => { const op = patchOp(h, [k]); updateHabit(h.id, patch); return R.done(c.ru ? `Норма «${h.name}» — ${(patch as never)[k]}` : `Target of “${h.name}”: ${(patch as never)[k]}`, { undo: [op] }); } }, { label: c.ru ? 'Нет' : 'No', yes: false, run: () => R.info(c.ru ? 'Оставляю' : 'Leaving it') }] });
});
register('habit.why', (p, c) => target(c, p, (h) => {
  const w = byWeekday(c, h);
  const worst = w.map((x, i) => ({ i, pct: x.due >= 3 ? Math.round((x.done / x.due) * 100) : 101 })).sort((a, b) => a.pct - b.pct)[0];
  if (!worst || worst.pct > 100) return R.info(NEED(c));
  const names = c.ru ? WD_RU : WD_EN;
  return R.answer(c.ru ? `Чаще всего «${h.name}» пропускается в ${names[worst.i].replace('среда', 'среду').replace('пятница', 'пятницу').replace('суббота', 'субботу')} (${worst.pct}% выполнения). Можно убрать этот день: «${h.name} только по будням»` : `You skip “${h.name}” most on ${names[worst.i]} (${worst.pct}% done). You could drop that day.`);
}));
register('habit.howMany', (_p, c) => R.answer(c.ru ? 'Для начала хватит 3–5 главных привычек: они влияют на серию. Остальные — дополнительные, без давления. Лучше мало, но каждый день.' : 'Three to five core habits are enough to start: they drive the streak. The rest are extras, no pressure. Few, but daily.'));
register('habit.overload', (_p, c) => {
  const list = activeHabits(c);
  const minutes = list.reduce((a, h) => a + (h.type === 'duration' ? h.minutes ?? 0 : 5), 0);
  const core = list.filter((h) => h.core).length;
  const heavy = core > 5 || list.length > 9 || minutes > 150;
  return R.answer(c.ru ? `Привычек: ${list.length}, главных: ${core}, примерно ${minutes} минут в день. ${heavy ? 'Это много — стоит что-то приостановить.' : 'Нагрузка в норме.'}` : `${list.length} habits, ${core} core, about ${minutes} minutes a day. ${heavy ? 'That’s a lot — consider pausing some.' : 'The load is fine.'}`);
});
register('habit.trim', (_p, c) => {
  const r = ranking(c);
  const low = [...r].reverse().filter((x) => x.pct < 50).slice(0, 3);
  if (!low.length) return R.answer(c.ru ? 'Убирать нечего: все привычки выполняются больше чем наполовину' : 'Nothing to cut: every habit is above 50%');
  return R.ask(c.ru ? `Тяжелее всего даются: ${low.map((x) => `«${x.h.name}» (${x.pct}%)`).join(', ')}. Поставить на паузу «${low[0].h.name}»?` : `Hardest: ${low.map((x) => `“${x.h.name}” (${x.pct}%)`).join(', ')}. Pause “${low[0].h.name}”?`, { choices: [
    { label: c.ru ? 'Да, на паузу' : 'Yes, pause it', yes: true, run: () => { const h = low[0].h; const op = patchOp(h, ['archived_at']); archiveHabit(h.id); return R.done(c.ru ? `«${h.name}» на паузе` : `“${h.name}” paused`, { undo: [op] }); } },
    { label: c.ru ? 'Нет' : 'No', yes: false, run: () => R.info(c.ru ? 'Хорошо, оставляем' : 'Okay, keeping them') }] });
});
register('habit.time', (p, c) => target(c, p, (h) => {
  const free = (c.sys?.plan ?? []).filter((x) => x.day === c.day && x.starts_at);
  const busy = new Set(free.map((x) => Number(hm(x.starts_at).slice(0, 2))));
  const hour = [7, 8, 9, 12, 13, 18, 19, 20, 21].find((x) => !busy.has(x)) ?? 8;
  return R.answer(c.ru ? `Для «${h.name}» подойдёт ${String(hour).padStart(2, '0')}:00 — в это время у вас свободно. Хотите, поставлю в планер?` : `“${h.name}” fits at ${String(hour).padStart(2, '0')}:00 — you’re free then.`, { chips: [{ label: c.ru ? 'Поставить в планер' : 'Put in planner', say: c.ru ? `${h.name} завтра в ${hour}` : `${h.name} tomorrow at ${hour}` }] });
}));
register('habit.promise', (_p, c) => { store.set('promise', { v: 1, day: c.day }); return promised(c); });
const promised = (c: ExecCtx) => R.done(c.ru ? 'Договорились: сегодня вечером напомню один раз. Два дня подряд не пропускаем.' : 'Deal: I’ll remind you once this evening. Never two misses in a row.');

export { logHabit, periodIn };
