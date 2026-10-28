import { addDays, daysBetween, dayKept, indexLogs, isLogged, scheduled, type HabitRowDb } from '../../data/model';
import { computeAchievements } from '../../data/achievements';
import { startNewArc } from '../../data/settings';
import { computeInsights } from '../../state/insights';
import { INDEX_WEIGHTS } from '../../state/compute';
import { saveOath } from '../../state/actions';
import { SYSTEM_KEY, activeArc, systemClient } from '../../state/system';
import { translate, type TKey } from '../../i18n';
import { toast } from '../../ui/toast';
import { R } from '../reply';
import { activeHabits, currentStreak, plural, q } from './common';
import { dayWords } from './calendar';
import { ranking, rate } from './habitStats';
import { register, type ExecCtx } from './index';
import type { Chip, Reply } from './types';

/* WP5.9 — analytics, the season and its promise, reports (catalog 70–83, 152–155, 159–164, 166). Plain arithmetic over the person's own data. */
const WD_RU = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
const WD_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WD_RU_PL = ['понедельникам', 'вторникам', 'средам', 'четвергам', 'пятницам', 'субботам', 'воскресеньям'];
const wdOf = (d: string) => (new Date(d + 'T12:00:00').getDay() + 6) % 7;
const monOf = (c: ExecCtx) => addDays(c.day, -wdOf(c.day));
const frozenOf = (c: ExecCtx) => new Set((c.sys?.days ?? []).filter((d) => d.frozen).map((d) => d.day));
const kept = (c: ExecCtx, d: string) => dayKept(activeHabits(c), indexLogs(c.sys?.logs ?? []), d, frozenOf(c));
const firstDay = (c: ExecCtx) => activeHabits(c).map((h) => h.created_at.slice(0, 10)).sort()[0] ?? c.day;
const dayName = (d: string, c: ExecCtx) => dayWords(d, c);
const focusRows = (c: ExecCtx) => (c.sys?.focus ?? []).filter((f) => f.completed && (f.session_type ?? 'focus') === 'focus');
const dayOfRow = (f: { started_at: string }) => { const d = new Date(f.started_at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const hours = (m: number, ru: boolean) => (m < 60 ? `${m} ${ru ? 'мин' : 'min'}` : `${Math.round((m / 60) * 10) / 10} ${ru ? 'ч' : 'h'}`);
const noData = (c: ExecCtx) => R.info(c.ru ? 'Пока мало данных — вернёмся к этому через несколько дней' : 'Not enough data yet — ask again in a few days');
const days = (n: number, ru: boolean) => (ru ? `${n} ${plural(n, 'день', 'дня', 'дней')}` : `${n} ${n === 1 ? 'day' : 'days'}`);

/** a week from `from`: days kept, checks, focus minutes (days after today do not count) */
function weekFigures(c: ExecCtx, from: string) {
  const ds = Array.from({ length: 7 }, (_, i) => addDays(from, i)).filter((d) => d <= c.day);
  const logs = c.sys?.logs ?? [];
  return {
    kept: ds.filter((d) => kept(c, d)).length, of: ds.length,
    checks: logs.filter((l) => l.done && l.day >= from && l.day <= addDays(from, 6)).length,
    focus: focusRows(c).filter((f) => dayOfRow(f) >= from && dayOfRow(f) <= addDays(from, 6)).reduce((a, f) => a + f.minutes, 0),
  };
}

/* ── the week and the month ── */
register('stats.week', (p, c) => {
  if (p.slots.last) {
    const w = weekFigures(c, addDays(monOf(c), -7));
    const best = Array.from({ length: 7 }, (_, i) => addDays(monOf(c), -7 + i)).map((d) => ({ d, n: (c.sys?.logs ?? []).filter((l) => l.day === d && l.done).length })).sort((a, b) => b.n - a.n)[0];
    return R.answer(c.ru
      ? `Прошлая неделя: ${days(w.kept, true)} с выполненными главными привычками из ${w.of}, отметок ${w.checks}, фокус ${hours(w.focus, true)}${best?.n ? `. Лучший день — ${WD_RU[wdOf(best.d)]}` : ''}`
      : `Last week: ${w.kept} of ${w.of} days kept, ${w.checks} checks, focus ${hours(w.focus, false)}${best?.n ? `. Best day: ${WD_EN[wdOf(best.d)]}` : ''}`);
  }
  const w = weekFigures(c, addDays(c.day, -6));
  return R.answer(c.ru ? `За 7 дней: ${days(w.kept, true)} с выполненными Core-привычками, фокус ${hours(w.focus, true)}` : `Last 7 days: ${w.kept} days with all Core habits done, focus ${hours(w.focus, false)}`);
});
register('stats.month', (_p, c) => {
  const from = addDays(c.day, -29);
  const ds = Array.from({ length: 30 }, (_, i) => addDays(from, i));
  const k = ds.filter((d) => kept(c, d)).length;
  const f = focusRows(c).filter((x) => dayOfRow(x) >= from).reduce((a, x) => a + x.minutes, 0);
  return R.answer(c.ru ? `За 30 дней: ${days(k, true)} в ритме из 30, фокус ${hours(f, true)}` : `Last 30 days: ${k} of 30 days kept, focus ${hours(f, false)}`);
});

/* ── 70 why the streak broke, 71 strongest, 72 a weekday ── */
register('stats.whyDropped', (_p, c) => {
  const habits = activeHabits(c);
  if (!habits.length) return noData(c);
  const ix = indexLogs(c.sys?.logs ?? []);
  for (let i = 1; i <= 45; i++) {
    const d = addDays(c.day, -i);
    if (d < firstDay(c)) break;
    if (kept(c, d)) continue;
    const missed = habits.filter((h) => h.core && h.created_at.slice(0, 10) <= d && scheduled(h, d) && !isLogged(ix, h.id, d)).map((h) => h.name);
    const what = missed.length ? missed.slice(0, 2).join(', ') : '';
    return R.answer(c.ru
      ? `Серия прервалась ${dayName(d, c)}${what ? `: не была отмечена ${what}` : ''}. Такое бывает — можно начать заново сегодня`
      : `The streak broke ${dayName(d, c)}${what ? `: ${what} was not marked` : ''}. It happens — you can start again today`);
  }
  return R.answer(c.ru ? 'Серия не прерывалась за последние полтора месяца' : 'The streak has not broken in the last six weeks');
});
const weekdayRates = (c: ExecCtx, habits: HabitRowDb[], span = 56) => {
  const ix = indexLogs(c.sys?.logs ?? []);
  const acc = Array.from({ length: 7 }, () => ({ due: 0, done: 0 }));
  for (let i = 1; i <= span; i++) {
    const d = addDays(c.day, -i);
    for (const h of habits) if (h.created_at.slice(0, 10) <= d && scheduled(h, d)) { acc[wdOf(d)].due++; if (isLogged(ix, h.id, d)) acc[wdOf(d)].done++; }
  }
  return acc.map((a) => ({ ...a, pct: a.due ? Math.round((a.done / a.due) * 100) : -1 }));
};
register('stats.strongest', (_p, c) => {
  const top = ranking(c).slice(0, 3);
  const wk = weekdayRates(c, activeHabits(c));
  const best = wk.map((w, i) => ({ ...w, i })).filter((w) => w.pct >= 0 && w.due >= 4).sort((a, b) => b.pct - a.pct)[0];
  if (!top.length && !best) return noData(c);
  const parts = [top.length ? (c.ru ? `Стабильнее всего: ${top.map((t) => `${q(t.h.name)} ${t.pct}%`).join(', ')}` : `Most stable: ${top.map((t) => `“${t.h.name}” ${t.pct}%`).join(', ')}`) : '', best ? (c.ru ? `Лучший день недели — ${WD_RU[best.i]} (${best.pct}%)` : `Best weekday: ${WD_EN[best.i]} (${best.pct}%)`) : ''].filter(Boolean);
  return R.answer(parts.join('. '));
});
register('stats.weekdayPattern', (p, c) => {
  const wk = weekdayRates(c, activeHabits(c));
  const wd = typeof p.slots.weekday === 'number' ? p.slots.weekday : wdOf(c.day);
  const me = wk[wd];
  if (!me || me.due < 3) return noData(c);
  const all = wk.reduce((a, w) => ({ due: a.due + w.due, done: a.done + w.done }), { due: 0, done: 0 });
  const avg = all.due ? Math.round((all.done / all.due) * 100) : 0;
  const diff = me.pct - avg;
  return R.answer(c.ru
    ? `По ${WD_RU_PL[wd]} вы выполняете ${me.pct}% привычек (в среднем ${avg}%) — ${diff >= 5 ? 'лучше обычного' : diff <= -5 ? 'хуже обычного, сделайте этот день легче' : 'как обычно'}`
    : `On ${WD_EN[wd]}s you complete ${me.pct}% of habits (average ${avg}%) — ${diff >= 5 ? 'better than usual' : diff <= -5 ? 'below usual, make that day lighter' : 'about usual'}`);
});

/* ── 73 compare weeks, 74 insights, 75 achievements, 76 the index, 79 forecast ── */
register('stats.compareWeeks', (_p, c) => {
  const span = wdOf(c.day) + 1;
  const a = weekFigures(c, monOf(c)), b = weekFigures(c, addDays(monOf(c), -7));
  const prevChecks = (c.sys?.logs ?? []).filter((l) => l.done && l.day >= addDays(monOf(c), -7) && l.day <= addDays(monOf(c), -7 + span - 1)).length;
  const d = a.checks - prevChecks;
  return R.answer(c.ru
    ? `Эта неделя: отметок ${a.checks}, ${days(a.kept, true)} в ритме, фокус ${hours(a.focus, true)}. Прошлая (за те же дни): отметок ${prevChecks}. ${d > 0 ? `Это на ${d} больше` : d < 0 ? `Это на ${-d} меньше` : 'Одинаково'}`
    : `This week: ${a.checks} checks, ${a.kept} days kept, focus ${hours(a.focus, false)}. Last week (same days): ${prevChecks} checks. ${d > 0 ? `${d} more` : d < 0 ? `${-d} fewer` : 'The same'}`, { list: [c.ru ? `Прошлая неделя целиком: ${b.checks} отметок, фокус ${hours(b.focus, true)}` : `Whole last week: ${b.checks} checks, focus ${hours(b.focus, false)}`] });
});
register('stats.insights', (_p, c) => {
  if (!c.sys) return noData(c);
  const lang = c.ru ? 'ru' : 'en';
  const list = computeInsights(c.sys, c.day).map((i) => translate(lang, i.text.key as TKey, i.text.vars));
  if (!list.length) return R.info(c.ru ? 'Новых наблюдений пока нет — данные копятся' : 'No new observations yet — the data is still piling up');
  return R.answer(list[0], { list: list.slice(1, 5) });
});
register('stats.achievements', (_p, c) => {
  if (!c.sys) return noData(c);
  const list = computeAchievements(c.sys, c.day);
  const got = list.filter((a) => a.unlocked), next = list.filter((a) => !a.unlocked).sort((a, b) => b.cur / b.max - a.cur / a.max)[0];
  const nm = (a: { label: { ru: string; en: string } }) => (c.ru ? a.label.ru : a.label.en);
  return R.answer(c.ru
    ? `Открыто достижений: ${got.length} из ${list.length}.${next ? ` Ближайшее — ${q(nm(next))}: ${Math.floor(next.cur)} из ${next.max}` : ' Это все!'}`
    : `Achievements: ${got.length} of ${list.length}.${next ? ` Next: “${nm(next)}” — ${Math.floor(next.cur)} of ${next.max}` : ' That is all of them!'}`, { list: got.slice(-5).map(nm) });
});
register('stats.indexExplain', (_p, c) => {
  const w = INDEX_WEIGHTS;
  return R.answer(c.ru
    ? `Индекс дисциплины — число от 0 до 1000. ${w.discipline / 10}% — дни, когда выполнены все главные привычки; ${w.habits / 10}% — доля выполненных привычек; ${w.focus / 10}% — фокус-сессии; ${w.goals / 10}% — шаги целей; ${w.consistency / 10}% — ровность по дням недели. Чего нет в данных, того не учитываем`
    : `The discipline index runs from 0 to 1000: ${w.discipline / 10}% days with every Core habit done, ${w.habits / 10}% share of habits done, ${w.focus / 10}% focus sessions, ${w.goals / 10}% goal steps, ${w.consistency / 10}% evenness across weekdays. Parts with no data are left out`);
});
register('stats.forecastStreak', (p, c) => {
  const n = Math.round(Number(p.slots.n) || 30);
  const cur = currentStreak(c).current;
  if (cur >= n) return R.answer(c.ru ? `Вы уже на ${days(cur, true)} — цель в ${n} взята` : `You are already at ${cur} days — the ${n} is reached`);
  const left = n - cur;
  return R.answer(c.ru ? `Сейчас серия ${days(cur, true)}. Если не прерывать, ${n} дней будет через ${days(left, true)} — ${dayName(addDays(c.day, left), c)}` : `The streak is ${cur} days. Unbroken, day ${n} comes in ${left} days — ${dayName(addDays(c.day, left), c)}`);
});

/* ── 153 best day, 154 longest streak, 155 checks, 163 percent, 164 the week map ── */
register('stats.bestDay', (_p, c) => {
  const from = addDays(c.day, -29);
  const logs = (c.sys?.logs ?? []).filter((l) => l.done && l.day >= from);
  const by = new Map<string, number>();
  for (const l of logs) by.set(l.day, (by.get(l.day) ?? 0) + 1);
  const top = [...by.entries()].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0];
  if (!top) return noData(c);
  const foc = focusRows(c).filter((f) => dayOfRow(f) === top[0]).reduce((a, f) => a + f.minutes, 0);
  return R.answer(c.ru ? `Лучший день за месяц — ${dayName(top[0], c)}: отметок ${top[1]}${foc ? `, фокус ${hours(foc, true)}` : ''}` : `Best day this month: ${dayName(top[0], c)} — ${top[1]} checks${foc ? `, focus ${hours(foc, false)}` : ''}`);
});
register('stats.longestStreak', (_p, c) => {
  const st = currentStreak(c);
  if (!st.best) return R.info(c.ru ? 'Серии пока нет — она начнётся с первого дня, когда выполнены главные привычки' : 'No streak yet — it starts with the first day all Core habits are done');
  // when the longest run ended: scan the days
  let run = 0, bestRun = 0, endDay = '';
  for (let d = firstDay(c); d <= c.day; d = addDays(d, 1)) { if (kept(c, d)) { run++; if (run > bestRun) { bestRun = run; endDay = d; } } else run = 0; }
  return R.answer(c.ru ? `Самая длинная серия — ${days(st.best, true)}${endDay ? `, закончилась ${dayName(endDay, c)}` : ''}. Сейчас: ${days(st.current, true)}` : `Longest streak: ${st.best} days${endDay ? `, ended ${dayName(endDay, c)}` : ''}. Now: ${st.current}`);
});
register('stats.totalChecks', (_p, c) => {
  const arc = c.sys ? activeArc(c.sys) : null;
  const from = arc?.started_on ?? '0000-01-01';
  const n = (c.sys?.logs ?? []).filter((l) => l.done && l.day >= from).length;
  const all = (c.sys?.logs ?? []).filter((l) => l.done).length;
  return R.answer(c.ru ? `Отметок за сезон: ${n}${all !== n ? `, всего: ${all}` : ''}` : `Checks this season: ${n}${all !== n ? `, in total: ${all}` : ''}`);
});
register('stats.percent30', (_p, c) => {
  const hs = activeHabits(c);
  const calc = (from: string, to: string) => hs.reduce((a, h) => { const r = rate(c, h, from, to); return { due: a.due + r.due, done: a.done + r.done }; }, { due: 0, done: 0 });
  const now = calc(addDays(c.day, -29), c.day), prev = calc(addDays(c.day, -59), addDays(c.day, -30));
  if (!now.due) return noData(c);
  const a = Math.round((now.done / now.due) * 100), b = prev.due ? Math.round((prev.done / prev.due) * 100) : null;
  return R.answer(c.ru ? `За 30 дней выполнено ${a}% привычек${b == null ? '' : b === a ? ', как и в прошлые 30' : `, раньше было ${b}% — ${a > b ? 'рост' : 'спад'}`}` : `${a}% of habits done in 30 days${b == null ? '' : b === a ? ', same as before' : `, before it was ${b}% — ${a > b ? 'up' : 'down'}`}`);
});
register('stats.weekMap', (_p, c) => {
  const hs = activeHabits(c), ix = indexLogs(c.sys?.logs ?? []);
  const short = c.ru ? ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const lines = short.map((s, i) => {
    const d = addDays(monOf(c), i);
    if (d > c.day) return `${s} — ${c.ru ? 'впереди' : 'ahead'}`;
    const due = hs.filter((h) => h.created_at.slice(0, 10) <= d && scheduled(h, d));
    const done = due.filter((h) => isLogged(ix, h.id, d)).length;
    return `${s} — ${!due.length ? '—' : done === due.length ? (c.ru ? 'все' : 'all') : done ? (c.ru ? `часть (${done} из ${due.length})` : `some (${done} of ${due.length})`) : (c.ru ? 'нет' : 'none')}`;
  });
  return R.answer(lines.join(c.ru ? ', ' : ', '), { list: lines });
});

/* ── 159–162 focus analytics ── */
register('focus.byGoal', (_p, c) => {
  const by = new Map<string, number>();
  for (const f of focusRows(c)) if (f.linked_goal_id) by.set(f.linked_goal_id, (by.get(f.linked_goal_id) ?? 0) + f.minutes);
  if (!by.size) return R.info(c.ru ? 'Фокус пока не привязан к целям. Скажите «фокус 25 над целью …»' : 'No focus is linked to goals yet. Say “focus 25 on goal …”');
  const rows = [...by.entries()].map(([id, m]) => ({ t: c.sys?.goals.find((g) => g.id === id)?.title ?? '—', m })).sort((a, b) => b.m - a.m);
  return R.answer(c.ru ? `Больше всего фокуса на цель ${q(rows[0].t)}: ${hours(rows[0].m, true)}` : `Most focus went to “${rows[0].t}”: ${hours(rows[0].m, false)}`, { list: rows.slice(0, 5).map((r) => `${r.t} · ${hours(r.m, c.ru)}`) });
});
register('focus.byCategory', (_p, c) => {
  const by = new Map<string, number>();
  for (const f of focusRows(c)) by.set(f.category ?? 'prod', (by.get(f.category ?? 'prod') ?? 0) + f.minutes);
  if (!by.size) return noData(c);
  const name = (k: string) => translate(c.ru ? 'ru' : 'en', `categories.${k}` as TKey);
  const rows = [...by.entries()].sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((a, r) => a + r[1], 0);
  return R.answer(c.ru ? `Больше всего времени уходит на «${name(rows[0][0])}» — ${Math.round((rows[0][1] / total) * 100)}% фокуса` : `Most of your focus goes to “${name(rows[0][0])}” — ${Math.round((rows[0][1] / total) * 100)}%`, { list: rows.slice(0, 5).map(([k, m]) => `${name(k)} · ${hours(m, c.ru)}`) });
});
register('focus.bestHour', (_p, c) => {
  const rows = focusRows(c);
  if (rows.length < 3) return noData(c);
  const by = Array.from({ length: 24 }, () => 0);
  for (const f of rows) by[new Date(f.started_at).getHours()] += f.minutes;
  let bestH = 0, bestSum = 0;
  for (let h = 0; h < 23; h++) if (by[h] + by[h + 1] > bestSum) { bestSum = by[h] + by[h + 1]; bestH = h; }
  return R.answer(c.ru ? `Лучше всего вы работаете с ${bestH}:00 до ${bestH + 2}:00 — там больше всего фокуса` : `You focus best between ${bestH}:00 and ${bestH + 2}:00`);
});
register('focus.avg', (_p, c) => {
  const rows = focusRows(c);
  if (!rows.length) return noData(c);
  const avg = Math.round(rows.reduce((a, f) => a + f.minutes, 0) / rows.length), max = Math.max(...rows.map((f) => f.minutes));
  return R.answer(c.ru ? `Средняя сессия — ${avg} мин, самая длинная — ${max} мин. Всего сессий: ${rows.length}` : `Average session: ${avg} min, longest: ${max} min. Sessions in total: ${rows.length}`);
});

/* ── 80–83 the season and its promise ── */
const arcOf = (c: ExecCtx) => (c.sys ? activeArc(c.sys) : null);
register('arc.oath.set', (p, c) => {
  const arc = arcOf(c);
  const text = String(p.slots.text ?? '').trim().slice(0, 200);
  if (!arc) return R.error(c.ru ? 'Сейчас нет активного сезона' : 'There is no active season');
  if (!text) return R.error(c.ru ? 'Что записать в обещание?' : 'What should the promise say?');
  const prev = arc.oath ?? null;
  saveOath(arc.id, text);
  return R.done(c.ru ? `Записал обещание: ${q(text)}` : `Saved your promise: “${text}”`, { undo: [{ t: 'oath', arcId: arc.id, prev }] });
});
register('arc.oath.get', (_p, c) => {
  const arc = arcOf(c);
  if (!arc?.oath) return R.info(c.ru ? 'Обещания пока нет. Скажите «запиши обещание: …»' : 'No promise yet. Say “save my promise: …”');
  return R.answer(c.ru ? `Ваше обещание: ${q(arc.oath)}` : `Your promise: “${arc.oath}”`);
});
register('arc.day', (_p, c) => {
  const arc = arcOf(c);
  if (!arc) return R.info(c.ru ? 'Сейчас нет активного сезона' : 'There is no active season');
  const n = daysBetween(arc.started_on, c.day) + 1, left = Math.max(0, arc.length_days - n);
  return R.answer(c.ru ? `Сегодня ${n}-й день сезона из ${arc.length_days}. Осталось ${days(left, true)}` : `Day ${n} of ${arc.length_days}. ${left} days left`);
});
register('arc.new', (_p, c) => {
  // the server call takes a moment: the answer comes first, a failure is shown as a toast
  void startNewArc()
    .then(() => systemClient()?.invalidateQueries({ queryKey: SYSTEM_KEY }))
    .catch(() => toast.error(c.ru ? 'Не получилось начать новый сезон — проверьте связь и повторите' : 'Could not start a new season — check the connection and try again'));
  return R.done(c.ru ? 'Начинаю новый сезон. Прошлый сохранится в итогах. Отменить это нельзя' : 'Starting a new season. The last one stays in the recap. This cannot be undone');
});

/* ── 77 recap, 78 share the week, 166 the month report ── */
register('arc.recap', (_p, c) => {
  const arcs = c.sys?.arcs ?? [];
  const last = [...arcs].sort((a, b) => b.number - a.number).find((a) => a.ended_on) ?? arcs.find((a) => !a.ended_on);
  if (!last) return R.info(c.ru ? 'Итогов пока нет' : 'No recap yet');
  return { ...R.done(c.ru ? 'Открываю итоги сезона' : 'Opening the season recap'), nav: `/arc/recap/${last.id}`, close: true };
});

/** share text through the system sheet where it exists; a tap is the gesture it needs */
function shareChips(c: ExecCtx, text: string): Chip[] {
  const run = (): Reply => {
    try {
      if (typeof navigator !== 'undefined' && navigator.share) { void navigator.share({ text }).catch(() => {}); return R.done(c.ru ? 'Открыл «Поделиться»' : 'Share sheet is open'); }
      void navigator.clipboard?.writeText(text);
      return R.done(c.ru ? 'Скопировал текст в буфер обмена' : 'Copied the text');
    } catch { return R.error(c.ru ? 'Не получилось поделиться' : 'Could not share'); }
  };
  return [{ label: c.ru ? 'Поделиться' : 'Share', run }];
}
function reportText(c: ExecCtx, nDays: number): string {
  const from = addDays(c.day, 1 - nDays);
  const ds = Array.from({ length: nDays }, (_, i) => addDays(from, i));
  const k = ds.filter((d) => kept(c, d)).length;
  const checks = (c.sys?.logs ?? []).filter((l) => l.done && l.day >= from).length;
  const f = focusRows(c).filter((x) => dayOfRow(x) >= from).reduce((a, x) => a + x.minutes, 0);
  const top = ranking(c).slice(0, 3).map((t) => `${t.h.name} ${t.pct}%`).join(', ');
  return c.ru
    ? `VeyrArc — ${nDays === 7 ? 'неделя' : 'месяц'}: дней в ритме ${k} из ${nDays}, отметок ${checks}, фокус ${hours(f, true)}${top ? `. Лучшие привычки: ${top}` : ''}`
    : `VeyrArc — ${nDays === 7 ? 'week' : 'month'}: ${k} of ${nDays} days kept, ${checks} checks, focus ${hours(f, false)}${top ? `. Top habits: ${top}` : ''}`;
}
register('share.week', (_p, c) => { const text = reportText(c, 7); return R.answer(text, { chips: shareChips(c, text) }); });
register('report.month', (_p, c) => { const text = reportText(c, 30); return R.answer(text, { chips: shareChips(c, text) }); });
