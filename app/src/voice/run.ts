import { addDays, DAYS_ALL, scheduled, type PlanRow } from '../data/model';
import { buildToday } from '../data/today';
import { useLangStore } from '../i18n';
import { isoDay } from '../lib/day';
import { GOAL_HUES } from '../mock/goals';
import { HABIT_PALETTE } from '../mock/tracker';
import {
  addGoalStep, createGoal, createHabit, deleteEvent, deleteGoal, deleteGoalStep, deleteHabit, logGoalTask, logHabit, logMood,
  logRelapse, saveEvent, saveFreeze, setEventDone,
} from '../state/actions';
import { dayStatus, nowAction, todayScore } from '../state/compute';
import { pomo, usePomodoro } from '../state/pomodoro';
import { activeArc, getSystem, todayRawOf, type SystemRaw } from '../state/system';
import { matchOf, type AskWhat, type Intent, type NavTo } from './nlu';
import { useVoice } from './voice'; // used only inside callbacks (voice imports this module)

/*
 * Intent → the app's own actions (ТЗ модуль 2: «AI никогда не вызывает базу напрямую»).
 * Everything goes through the same functions as the buttons, so offline, rollback and sync work
 * the same. Every change can be taken back («отмени»), and when the assistant is not sure what was
 * meant it asks instead of guessing (choices the person answers by voice or by tapping).
 */
export type Choice = { label: string; yes?: boolean; run: () => Reply };
export type Reply = {
  ok: boolean;
  say: string;
  /** lines shown under the answer (the plan, what is left…) */
  list?: string[];
  /** phrases the person can tap to say */
  suggest?: string[];
  /** a question: the next answer picks one of these */
  choices?: Choice[];
  /** a page to open (the panel closes) */
  to?: string;
  close?: boolean;
  undo?: () => void;
};

type Ctx = { ru: boolean; sys: SystemRaw | undefined; day: string; now: Date };
const history: { label: string; undo: () => void; at: number }[] = [];
const remember = (label: string, undo?: () => void) => { if (undo) { history.push({ label, undo, at: Date.now() }); if (history.length > 20) history.shift(); } };
/** the executors that have not moved to exec/* yet keep closures here; the journal holds the rest — «отмени» takes the newer */
export const legacyHistory = { peek: () => history[history.length - 1] ?? null, pop: () => history.pop() ?? null };

/* ---------------- words ---------------- */
const MOOD_RU = ['ужасное', 'плохое', 'нормальное', 'хорошее', 'отличное'];
const MOOD_EN = ['awful', 'bad', 'okay', 'good', 'great'];
const WD_RU = ['воскресенье', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу'];
const MON_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const plural = (n: number, one: string, few: string, many: string) => {
  const a = Math.abs(n) % 100, b = a % 10;
  return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
};
const dateOf = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
function whenRu(day: string, today: string) {
  if (day === today) return 'на сегодня';
  if (day === addDays(today, 1)) return 'на завтра';
  const d = dateOf(day);
  return `на ${WD_RU[d.getDay()]}, ${d.getDate()} ${MON_RU[d.getMonth()]}`;
}
function whenEn(day: string, today: string) {
  if (day === today) return 'for today';
  if (day === addDays(today, 1)) return 'for tomorrow';
  return `for ${dateOf(day).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`;
}
const hm = (t: string | null) => (t ? t.slice(0, 5) : '');
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMin = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const q = (s: string) => `«${s}»`;

/* ---------------- matching ---------------- */
type Hit<T> = { item: T; score: number; name: string };
function rank<T>(query: string, items: T[], name: (x: T) => string, bonus?: (x: T) => number): Hit<T>[] {
  return items.map((item) => ({ item, name: name(item), score: Math.min(1, matchOf(query, name(item)) + (bonus?.(item) ?? 0)) }))
    .filter((h) => h.score > 0.3).sort((a, b) => b.score - a.score);
}
const SURE = 0.62, MAYBE = 0.45;

const habitsOf = (c: Ctx) => (c.sys?.habits ?? []).filter((h) => !h.archived_at);
const logOf = (c: Ctx, id: string) => c.sys?.logs.find((l) => l.habit_id === id && l.day === c.day);
const openTasks = (c: Ctx, from = c.day, to = c.day) => (c.sys?.plan ?? []).filter((p) => p.day >= from && p.day <= to);
const steps = (c: Ctx) => {
  const active = new Map((c.sys?.goals ?? []).filter((g) => g.status === 'active').map((g) => [g.id, g]));
  return (c.sys?.tasks ?? []).filter((t) => active.has(t.goal_id)).map((t) => ({ ...t, goal: active.get(t.goal_id)! }));
};
const stepDone = (c: Ctx, goalId: string, id: string) => !!c.sys?.entries.find((e) => e.goal_id === goalId && e.day === c.day)?.done_task_ids.includes(id);

/* ---------------- actions with undo ---------------- */
function markHabit(c: Ctx, h: ReturnType<typeof habitsOf>[number], amount: number | null, minutes: number | null): Reply {
  const prev = logOf(c, h.id);
  const undo = () => logHabit(h.id, prev?.value ?? 0, prev?.done ?? false);
  const { ru } = c;
  if (h.type === 'counter') {
    const goal = h.target ?? 1;
    const v = Math.min(goal, (prev?.value ?? 0) + (amount ?? 1));
    if (prev?.done && v === prev.value) return { ok: true, say: ru ? `${h.name} уже выполнена: ${goal} из ${goal}` : `${h.name} is already done` };
    logHabit(h.id, v, v >= goal);
    remember(h.name, undo);
    return { ok: true, say: ru ? `${h.name}: ${v} из ${goal}${v >= goal ? '. Готово!' : ''}` : `${h.name}: ${v} of ${goal}${v >= goal ? '. Done!' : ''}`, undo };
  }
  if (h.type === 'duration') {
    const need = h.minutes ?? 1;
    const total = minutes ? Math.min(need * 4, (prev?.value ?? 0) + minutes) : need;
    if (prev?.done && !minutes) return { ok: true, say: ru ? `${h.name} уже отмечена` : `${h.name} is already done` };
    logHabit(h.id, total, total >= need);
    remember(h.name, undo);
    return {
      ok: true, undo,
      say: total >= need ? (ru ? `Отметил: ${h.name}${minutes ? `, ${total} мин` : ''}` : `Done: ${h.name}`)
        : (ru ? `${h.name}: ${total} из ${need} минут` : `${h.name}: ${total} of ${need} min`),
    };
  }
  if (prev?.done) return { ok: true, say: ru ? `${h.name} уже отмечена сегодня` : `${h.name} is already done today` };
  logHabit(h.id, 1, true);
  remember(h.name, undo);
  return { ok: true, say: ru ? `Отметил: ${h.name}` : `Done: ${h.name}`, undo };
}
function markTask(c: Ctx, p: PlanRow, done: boolean): Reply {
  if (p.done === done) return { ok: true, say: c.ru ? `${q(p.title)} уже ${done ? 'выполнена' : 'не отмечена'}` : `“${p.title}” is already ${done ? 'done' : 'open'}` };
  setEventDone(p.id, done);
  const undo = () => setEventDone(p.id, !done);
  remember(p.title, undo);
  return { ok: true, say: c.ru ? `${done ? 'Выполнено' : 'Вернул в работу'}: ${p.title}` : `${done ? 'Done' : 'Reopened'}: ${p.title}`, undo };
}
function markStep(c: Ctx, s: ReturnType<typeof steps>[number], done: boolean): Reply {
  logGoalTask(s.goal_id, s.id, done);
  const undo = () => logGoalTask(s.goal_id, s.id, !done);
  remember(s.text, undo);
  return { ok: true, say: c.ru ? `${done ? 'Шаг выполнен' : 'Снял отметку'}: ${s.text} (${s.goal.title})` : `${done ? 'Step done' : 'Unmarked'}: ${s.text}`, undo };
}

type Target =
  | { t: 'habit'; h: ReturnType<typeof habitsOf>[number] }
  | { t: 'task'; p: PlanRow }
  | { t: 'step'; s: ReturnType<typeof steps>[number] }
  | { t: 'quit'; id: string; name: string };
/** everything a «сделал …» could be about, best first */
function targets(c: Ctx, query: string, withQuits: boolean): Hit<Target>[] {
  const hs = rank(query, habitsOf(c), (h) => h.name, (h) => (scheduled(h, c.day) ? 0.04 : 0)).map((x) => ({ ...x, item: { t: 'habit', h: x.item } as Target }));
  const ts = rank(query, openTasks(c, addDays(c.day, -1)), (p) => p.title, (p) => (p.day === c.day ? 0.03 : 0)).map((x) => ({ ...x, item: { t: 'task', p: x.item } as Target }));
  const ss = rank(query, steps(c), (s) => `${s.text} ${s.goal.title}`).map((x) => ({ ...x, score: x.score * 0.95, name: x.item.text, item: { t: 'step', s: x.item } as Target }));
  const qs = withQuits ? rank(query, c.sys?.quits ?? [], (x) => x.name).map((x) => ({ ...x, item: { t: 'quit', id: x.item.id, name: x.item.name } as Target })) : [];
  return [...hs, ...ts, ...ss, ...qs].sort((a, b) => b.score - a.score);
}
const kindRu = (t: Target) => (t.t === 'habit' ? 'привычку' : t.t === 'task' ? 'задачу' : t.t === 'step' ? 'шаг цели' : 'отказ');

function relapse(c: Ctx, quitId: string, name: string): Reply {
  const undo = logRelapse(quitId, '');
  remember(name, undo);
  return {
    ok: true, undo,
    say: c.ru ? `Записал срыв: ${name}. Отсчёт начат заново, лучший результат сохранён. Это часть пути — продолжаем.` : `Slip logged for ${name}. The timer restarts, your best is kept.`,
  };
}

/** a vague phrase got several plausible targets: ask, the answer runs the choice */
function ask(c: Ctx, hits: Hit<Target>[], run: (t: Target) => Reply, verb: string): Reply {
  const opts = hits.slice(0, 3);
  if (opts.length === 1) {
    const one = opts[0];
    return {
      ok: true, say: c.ru ? `${verb} ${kindRu(one.item)} ${q(one.name)}?` : `${verb} “${one.name}”?`,
      choices: [{ label: c.ru ? 'Да' : 'Yes', yes: true, run: () => run(one.item) }, { label: c.ru ? 'Нет' : 'No', run: () => ({ ok: true, say: c.ru ? 'Хорошо, не трогаю' : 'Okay, leaving it' }) }],
    };
  }
  return {
    ok: true, say: c.ru ? `Что именно: ${opts.map((o) => q(o.name)).join(' или ')}?` : `Which one: ${opts.map((o) => `“${o.name}”`).join(' or ')}?`,
    choices: opts.map((o) => ({ label: o.name, run: () => run(o.item) })),
  };
}

function doTarget(c: Ctx, t: Target, amount: number | null, minutes: number | null): Reply {
  if (t.t === 'habit') return markHabit(c, t.h, amount, minutes);
  if (t.t === 'task') return markTask(c, t.p, true);
  if (t.t === 'step') return stepDone(c, t.s.goal_id, t.s.id) ? { ok: true, say: c.ru ? `Шаг ${q(t.s.text)} уже выполнен` : 'Already done' } : markStep(c, t.s, true);
  return relapse(c, t.id, t.name);
}

/* ---------------- answers ---------------- */
function planLines(c: Ctx, day: string) {
  return openTasks(c, day, day).slice().sort((a, b) => (a.starts_at ?? '99').localeCompare(b.starts_at ?? '99'))
    .map((p) => `${p.starts_at ? hm(p.starts_at) : (c.ru ? 'весь день' : 'any time')} · ${p.title}${p.done ? ' ✓' : ''}`);
}
function answer(c: Ctx, what: AskWhat): Reply {
  const { ru, sys, day, now } = c;
  if (what === 'time') return { ok: true, say: ru ? `Сейчас ${now.toTimeString().slice(0, 5)}` : `It’s ${now.toTimeString().slice(0, 5)}` };
  if (what === 'date') {
    const d = now;
    return { ok: true, say: ru ? `Сегодня ${WD_RU[d.getDay()].replace('среду', 'среда').replace('пятницу', 'пятница').replace('субботу', 'суббота')}, ${d.getDate()} ${MON_RU[d.getMonth()]}` : d.toDateString() };
  }
  if (!sys) return { ok: false, say: ru ? 'Данные ещё загружаются, попробуйте через секунду' : 'Still loading, try again in a second' };
  const habits = habitsOf(c).filter((h) => scheduled(h, day));
  const doneH = habits.filter((h) => logOf(c, h.id)?.done);
  const focusMin = sys.focus.filter((f) => f.completed && (f.session_type ?? 'focus') === 'focus' && isoDay(new Date(f.started_at)) === day).reduce((a, f) => a + f.minutes, 0);
  switch (what) {
    case 'plan': case 'planTomorrow': {
      const d = what === 'plan' ? day : addDays(day, 1);
      const lines = planLines(c, d);
      const open = openTasks(c, d, d).filter((p) => !p.done);
      if (!lines.length) return { ok: true, say: ru ? `${what === 'plan' ? 'На сегодня' : 'На завтра'} в планере пусто` : `Nothing planned ${what === 'plan' ? 'today' : 'tomorrow'}`, suggest: ru ? ['задача позвонить маме завтра в 15'] : [] };
      const first = open.find((p) => p.starts_at) ?? open[0];
      return {
        ok: true, list: lines,
        say: ru ? `${what === 'plan' ? 'Сегодня' : 'Завтра'} ${lines.length} ${plural(lines.length, 'дело', 'дела', 'дел')}${open.length && open.length !== lines.length ? `, осталось ${open.length}` : ''}.${first ? ` Ближайшее — ${first.title}${first.starts_at ? ` в ${hm(first.starts_at)}` : ''}` : ''}`
          : `${lines.length} things ${what === 'plan' ? 'today' : 'tomorrow'}.${first ? ` Next: ${first.title}${first.starts_at ? ` at ${hm(first.starts_at)}` : ''}` : ''}`,
      };
    }
    case 'left': {
      const leftH = habits.filter((h) => !logOf(c, h.id)?.done);
      const leftT = openTasks(c).filter((p) => !p.done);
      if (!leftH.length && !leftT.length) return { ok: true, say: ru ? 'Всё сделано на сегодня. Отличный день!' : 'All done for today. Great day!' };
      return {
        ok: true, list: [...leftH.map((h) => `○ ${h.name}`), ...leftT.map((p) => `${p.starts_at ? hm(p.starts_at) : '—'} · ${p.title}`)],
        say: ru ? `${leftH.length === 1 || (leftH.length % 10 === 1 && leftH.length % 100 !== 11) ? 'Осталась' : 'Осталось'} ${leftH.length} ${plural(leftH.length, 'привычка', 'привычки', 'привычек')}${leftT.length ? ` и ${leftT.length} ${plural(leftT.length, 'задача', 'задачи', 'задач')}` : ''}${leftH[0] ? `. Начните с ${q(leftH[0].name)}` : ''}`
          : `${leftH.length} habits and ${leftT.length} tasks left`,
      };
    }
    case 'next': {
      const arc = activeArc(sys);
      const a = nowAction({ habits: habitsOf(c), logs: sys.logs, plan: sys.plan, arcStart: arc?.started_on ?? null, oath: arc?.oath ?? null }, now);
      const say = a.kind === 'event' ? (ru ? `Через ${a.inMin} мин — ${a.event.title}` : `${a.event.title} in ${a.inMin} min`)
        : a.kind === 'habit' ? (ru ? `Сейчас лучше всего: ${a.habit.name}${a.core ? ' — это Core-привычка' : ''}` : `Best now: ${a.habit.name}`)
          : a.kind === 'review' ? (ru ? 'Главное сделано. Можно подвести итоги дня' : 'The main things are done. Time to review the day')
            : a.kind === 'tomorrow' ? (ru ? `На сегодня всё. Завтра первым — ${a.event.title} в ${hm(a.event.starts_at)}` : `All set. Tomorrow starts with ${a.event.title}`)
              : a.kind === 'setup' ? (ru ? 'Начните с выбора привычек — скажите «добавь привычку зарядка»' : 'Start by adding a habit')
                : a.kind === 'oath' ? (ru ? 'Первый день арки: начните с обещания себе на экране «Сегодня»' : 'Day one: start with your promise')
                  : (ru ? 'День закрыт. Отдыхайте' : 'Day closed. Rest well');
      return { ok: true, say, suggest: a.kind === 'review' ? [ru ? 'итоги дня' : 'review the day'] : undefined };
    }
    case 'streak': {
      const v = buildToday({ ...todayRawOf(sys), day }, { initials: '', freezesAllowed: 2 });
      const cur = v.stats.streak, best = v.stats.streakRecord;
      return { ok: true, say: ru ? `Серия: ${cur} ${plural(cur, 'день', 'дня', 'дней')}${best > cur ? `. Рекорд — ${best}` : cur > 0 ? '. Это ваш рекорд!' : ''}` : `Streak: ${cur} days${best > cur ? `, best ${best}` : ''}` };
    }
    case 'progress': {
      const arc = activeArc(sys);
      const sc = todayScore({ habits: habitsOf(c), logs: sys.logs, days: sys.days, focus: sys.focus, goals: sys.goals, tasks: sys.tasks, entries: sys.entries }, day, arc?.started_on ?? null);
      return {
        ok: true,
        say: ru ? `Индекс ${sc.index}${sc.delta > 0 ? `, +${sc.delta} за сегодня` : ''}. Привычки: ${doneH.length} из ${habits.length}${focusMin ? `, фокус ${focusMin} мин` : ''}.${sc.score >= 80 ? ' Отличный темп!' : habits.length - doneH.length > 0 ? ` Осталось ${habits.length - doneH.length} — успеете` : ''}`
          : `Index ${sc.index}${sc.delta > 0 ? `, +${sc.delta} today` : ''}. Habits ${doneH.length} of ${habits.length}${focusMin ? `, focus ${focusMin} min` : ''}`,
      };
    }
    case 'focusToday': {
      const n = sys.focus.filter((f) => f.completed && (f.session_type ?? 'focus') === 'focus' && isoDay(new Date(f.started_at)) === day).length;
      return { ok: true, say: ru ? (focusMin ? `Сегодня ${n} ${plural(n, 'сессия', 'сессии', 'сессий')} фокуса, ${focusMin} мин` : 'Сегодня фокуса ещё не было. Скажите «фокус 25»') : `${n} focus sessions, ${focusMin} min today` };
    }
    case 'mood': {
      const week = sys.days.filter((x) => x.mood != null && x.day > addDays(day, -7) && x.day <= day);
      const today = week.find((x) => x.day === day)?.mood;
      const avg = week.length ? week.reduce((a, x) => a + (x.mood ?? 0), 0) / week.length : null;
      return { ok: true, say: ru ? `${today ? `Сегодня настроение ${MOOD_RU[today - 1]}` : 'Сегодня настроение не отмечено'}${avg ? `. В среднем за неделю — ${MOOD_RU[Math.round(avg) - 1]}` : ''}` : `${today ? `Today: ${MOOD_EN[today - 1]}` : 'No mood today'}` };
    }
    case 'goals': {
      const gs = sys.goals.filter((g) => g.status === 'active');
      if (!gs.length) return { ok: true, say: ru ? 'Активных целей нет. Скажите «создай цель …»' : 'No active goals', suggest: ru ? ['создай цель пробежать 10 км'] : [] };
      const all = steps(c);
      return {
        ok: true,
        list: gs.map((g) => { const st = all.filter((s) => s.goal_id === g.id); return `${g.title} · ${st.filter((s) => stepDone(c, g.id, s.id)).length}/${st.length}`; }),
        say: ru ? `${gs.length} ${plural(gs.length, 'цель', 'цели', 'целей')}: ${gs.map((g) => g.title).join(', ')}` : `${gs.length} goals: ${gs.map((g) => g.title).join(', ')}`,
      };
    }
    case 'week': {
      const from = addDays(day, -6);
      const kept = Array.from({ length: 7 }, (_, i) => addDays(from, i)).filter((d) => {
        const hs = habitsOf(c).filter((h) => h.core && scheduled(h, d));
        return hs.length > 0 && hs.every((h) => sys.logs.some((l) => l.habit_id === h.id && l.day === d && l.done));
      }).length;
      const fm = sys.focus.filter((f) => f.completed && isoDay(new Date(f.started_at)) >= from).reduce((a, f) => a + f.minutes, 0);
      return { ok: true, say: ru ? `За 7 дней: ${kept} ${plural(kept, 'день', 'дня', 'дней')} с выполненными Core-привычками, фокус ${Math.round(fm / 60 * 10) / 10} ч` : `Last 7 days: ${kept} days kept, focus ${Math.round(fm / 6) / 10} h` };
    }
  }
  return { ok: false, say: '' };
}

/* ---------------- one intent ---------------- */
let navigate: ((to: string) => void) | null = null;
/** the panel passes the router's navigate in (avoids importing the router here) */
export const bindNavigate = (fn: ((to: string) => void) | null) => { navigate = fn; };
const go = (to: string) => { navigate?.(to); };
/** for the executors in exec/*: open a page through the router the panel passed in */
export const navigateTo = go;
const PAGE_RU: Record<NavTo, string> = { '/': 'Сегодня', '/disciplines': 'Дисциплины', '/planner': 'Планер', '/goals': 'Цели', '/analytics': 'Аналитика', '/settings': 'Настройки', '/settings/account': 'Аккаунт' };

/** phrases to offer when the panel opens: what fits this screen, this hour and what is left today */
export function hints(path: string, lang: 'ru' | 'en'): string[] {
  const ru = lang === 'ru';
  if (!ru) return examples(false);
  const now = new Date();
  const c: Ctx = { ru, sys: getSystem(), day: isoDay(now), now };
  if (!c.sys) return examples(true);
  const out: string[] = [];
  const hour = now.getHours();
  const open = habitsOf(c).filter((h) => scheduled(h, c.day) && !logOf(c, h.id)?.done);
  const y = addDays(c.day, -1);
  if (dayStatus({ habits: habitsOf(c), logs: c.sys.logs, days: c.sys.days }, y, c.day) === 'broken' && hour < 14) out.push('заморозь вчера');
  if (path.startsWith('/planner')) out.push('что у меня завтра', 'задача созвон завтра в 15');
  else if (path.startsWith('/goals')) out.push('какие у меня цели');
  else if (path.startsWith('/disciplines')) out.push('добавь привычку чтение 20 минут');
  if (open[0]) {
    const h = open.find((x) => x.core) ?? open[0];
    out.push(h.type === 'duration' ? `${h.name.toLowerCase().replace(/\s*\d+\s*мин.*$/, '')} ${h.minutes ?? 20} минут` : `отметь ${h.name.toLowerCase()}`);
  }
  if (now.getDay() === 0 && hour >= 17) out.push('итоги недели');
  else if (hour >= 19) out.push('итоги дня');
  else if (hour < 11) out.push('что у меня сегодня');
  else out.push('что дальше');
  if (!c.sys.days.find((d) => d.day === c.day)?.mood && hour >= 12) out.push('настроение 4');
  if (!usePomodoro.getState().endsAt && hour >= 8 && hour < 19) out.push('фокус 25');
  return [...new Set(out)].slice(0, 4);
}

export function examples(ru: boolean, c?: Ctx): string[] {
  if (!ru) return ['mood 4', 'done workout', 'what’s next', 'focus 25'];
  const h = c ? habitsOf(c).find((x) => scheduled(x, c.day) && !logOf(c, x.id)?.done) : undefined;
  const hour = new Date().getHours();
  return [
    h ? `отметь ${h.name.toLowerCase()}` : 'сделал зарядку',
    hour < 12 ? 'что у меня сегодня' : hour >= 18 ? 'итоги дня' : 'что дальше',
    'задача позвонить маме завтра в 15',
    hour >= 18 ? 'настроение 4' : 'фокус 25',
  ];
}

function runOne(it: Intent, c: Ctx): Reply {
  const { ru, day } = c;
  switch (it.kind) {
    case 'mood': {
      const prev = c.sys?.days.find((d) => d.day === day)?.mood ?? null;
      logMood(it.level);
      const undo = () => logMood(prev == null ? null : prev - 1);
      remember('mood', undo);
      const care = it.level <= 1 ? (ru ? '. Берегите себя — можно разгрузить день: скажите «перенеси всё на завтра»' : '. Take care of yourself') : '';
      return { ok: true, say: ru ? `Записал: настроение ${MOOD_RU[it.level]}${care}` : `Mood saved: ${MOOD_EN[it.level]}${care}`, undo, suggest: it.level <= 1 && ru ? ['перенеси всё на завтра'] : undefined };
    }

    case 'done': {
      if (/^(?:все|всё|everything|all)$/.test(it.query.trim())) {
        const open = habitsOf(c).filter((h) => scheduled(h, day) && !logOf(c, h.id)?.done);
        if (!open.length) return { ok: true, say: ru ? 'Все привычки на сегодня уже отмечены' : 'All habits are already done' };
        const prev = open.map((h) => ({ h, l: logOf(c, h.id) }));
        for (const h of open) logHabit(h.id, h.type === 'counter' ? h.target ?? 1 : h.type === 'duration' ? h.minutes ?? 1 : 1, true);
        const undo = () => prev.forEach(({ h, l }) => logHabit(h.id, l?.value ?? 0, l?.done ?? false));
        remember('all', undo);
        return { ok: true, say: ru ? `Отметил ${open.length} ${plural(open.length, 'привычку', 'привычки', 'привычек')}: ${open.map((h) => h.name).join(', ')}` : `Marked ${open.length} habits`, undo };
      }
      const hits = targets(c, it.query, true);
      const [a, b] = hits;
      if (!a || a.score < MAYBE) {
        return { ok: false, say: ru ? `Не нашёл ${q(it.query)} среди привычек и задач` : `Couldn’t find “${it.query}”`, suggest: ru ? [`добавь привычку ${it.query}`, `задача ${it.query}`] : undefined };
      }
      const close = b && b.score >= MAYBE && a.score - b.score < 0.08 && a.score < 0.9;
      if (a.item.t === 'quit') {
        // a slip is never logged on a guess
        const quit = a.item;
        return {
          ok: true, say: ru ? `Записать срыв по ${q(quit.name)}?` : `Log a slip for “${quit.name}”?`,
          choices: [{ label: ru ? 'Да, записать' : 'Yes', yes: true, run: () => relapse(c, quit.id, quit.name) }, { label: ru ? 'Нет' : 'No', run: () => ({ ok: true, say: ru ? 'Хорошо, ничего не записываю' : 'Okay' }) }],
        };
      }
      if (close) return ask(c, hits.filter((h) => h.item.t !== 'quit'), (t) => doTarget(c, t, it.amount, it.minutes), ru ? 'Отметить' : 'Mark');
      if (a.score < SURE) return ask(c, [a], (t) => doTarget(c, t, it.amount, it.minutes), ru ? 'Отметить' : 'Mark');
      return doTarget(c, a.item, it.amount, it.minutes);
    }

    case 'undone': {
      const hits = targets(c, it.query, false);
      const a = hits[0];
      if (!a || a.score < MAYBE) {
        // «убери X»: not a mark — maybe a task to delete
        const del = rank(it.query, openTasks(c, day, addDays(day, 14)), (p) => p.title)[0];
        if (del && del.score >= SURE) return runOne({ kind: 'taskDelete', query: it.query }, c);
        return { ok: false, say: ru ? `Не нашёл ${q(it.query)}` : `Couldn’t find “${it.query}”` };
      }
      const undo = (t: Target): Reply => {
        if (t.t === 'habit') {
          const prev = logOf(c, t.h.id);
          if (!prev?.value) return { ok: true, say: ru ? `${t.h.name} и так не отмечена` : 'Not marked anyway' };
          logHabit(t.h.id, 0, false);
          const u = () => logHabit(t.h.id, prev.value, prev.done);
          remember(t.h.name, u);
          return { ok: true, say: ru ? `Снял отметку: ${t.h.name}` : `Unmarked: ${t.h.name}`, undo: u };
        }
        if (t.t === 'task') return markTask(c, t.p, false);
        if (t.t === 'step') return markStep(c, t.s, false);
        return { ok: false, say: '' };
      };
      return a.score < SURE ? ask(c, [a], undo, ru ? 'Снять отметку с' : 'Unmark') : undo(a.item);
    }

    case 'taskAdd': {
      const end = it.end ?? (it.time ? fromMin(Math.min(23 * 60 + 59, toMin(it.time) + 60)) : null);
      const ev: PlanRow = { id: crypto.randomUUID(), title: it.title, day: it.day, starts_at: it.time, ends_at: end, note: null, done: false, category_id: null };
      const clash = it.time ? openTasks(c, it.day, it.day).find((p) => !p.done && p.starts_at && toMin(hm(p.starts_at)) < toMin(end!) && toMin(hm(p.ends_at ?? p.starts_at)) > toMin(it.time!)) : undefined;
      const past = it.day === day && it.time && toMin(it.time) < c.now.getHours() * 60 + c.now.getMinutes() - 5;
      saveEvent(ev, true);
      const undo = () => deleteEvent(ev.id);
      remember(it.title, undo);
      const when = ru ? whenRu(it.day, day) : whenEn(it.day, day);
      return {
        ok: true, undo,
        say: (ru ? `Добавил ${q(it.title)} ${when}${it.time ? ` в ${it.time}${it.end ? `–${it.end}` : ''}` : ''}` : `Added “${it.title}” ${when}${it.time ? ` at ${it.time}` : ''}`)
          + (clash ? (ru ? `. В это время уже ${q(clash.title)}` : `. Overlaps “${clash.title}”`) : '')
          + (past ? (ru ? '. Это время уже прошло — если нужно на завтра, скажите «перенеси на завтра»' : '') : ''),
      };
    }

    case 'taskMove': {
      const target = it.day ?? day;
      if (it.all) {
        const open = openTasks(c).filter((p) => !p.done);
        if (!open.length) return { ok: true, say: ru ? 'На сегодня незакрытых задач нет' : 'No open tasks today' };
        for (const p of open) saveEvent({ ...p, day: target }, false);
        const undo = () => open.forEach((p) => saveEvent(p, false));
        remember('move all', undo);
        return { ok: true, undo, say: ru ? `Перенёс ${open.length} ${plural(open.length, 'задачу', 'задачи', 'задач')} ${whenRu(target, day)}. Сегодня — только главное` : `Moved ${open.length} tasks ${whenEn(target, day)}` };
      }
      const hits = rank(it.query, openTasks(c, addDays(day, -1), addDays(day, 30)).filter((p) => !p.done), (p) => p.title, (p) => (p.day === day ? 0.04 : 0));
      const move = (p: PlanRow): Reply => {
        const len = p.starts_at && p.ends_at ? toMin(hm(p.ends_at)) - toMin(hm(p.starts_at)) : 60;
        const starts = it.time ?? p.starts_at;
        const next: PlanRow = { ...p, day: it.day ?? p.day, starts_at: starts, ends_at: it.time ? fromMin(Math.min(23 * 60 + 59, toMin(it.time) + Math.max(15, len))) : p.ends_at };
        saveEvent(next, false);
        const undo = () => saveEvent(p, false);
        remember(p.title, undo);
        return { ok: true, undo, say: ru ? `Перенёс ${q(p.title)} ${whenRu(next.day, day)}${next.starts_at ? ` в ${hm(next.starts_at)}` : ''}` : `Moved “${p.title}” ${whenEn(next.day, day)}` };
      };
      if (!hits.length || hits[0].score < MAYBE) return { ok: false, say: ru ? `Не нашёл задачу ${q(it.query)}` : `No task like “${it.query}”` };
      if (hits[1] && hits[0].score - hits[1].score < 0.08 && hits[0].score < 0.9) {
        return { ok: true, say: ru ? `Какую перенести: ${hits.slice(0, 3).map((h) => q(h.name)).join(' или ')}?` : 'Which one?', choices: hits.slice(0, 3).map((h) => ({ label: `${h.name} · ${h.item.day.slice(8)}.${h.item.day.slice(5, 7)}`, run: () => move(h.item) })) };
      }
      return move(hits[0].item);
    }

    case 'taskDelete': {
      const hits = rank(it.query, openTasks(c, addDays(day, -1), addDays(day, 60)), (p) => p.title, (p) => (p.day === day ? 0.04 : 0));
      if (!hits.length || hits[0].score < MAYBE) return { ok: false, say: ru ? `Не нашёл задачу ${q(it.query)}` : `No task like “${it.query}”` };
      const del = (p: PlanRow): Reply => {
        deleteEvent(p.id);
        const undo = () => saveEvent(p, true);
        remember(p.title, undo);
        return { ok: true, undo, say: ru ? `Удалил ${q(p.title)}. Если зря — скажите «отмени»` : `Deleted “${p.title}”. Say “undo” to bring it back` };
      };
      if (hits[0].score < SURE || (hits[1] && hits[0].score - hits[1].score < 0.08)) {
        return { ok: true, say: ru ? `Удалить ${hits.slice(0, 2).map((h) => q(h.name)).join(' или ')}?` : 'Delete which?', choices: hits.slice(0, 2).map((h, i) => ({ label: h.name, yes: i === 0, run: () => del(h.item) })).concat([{ label: ru ? 'Нет' : 'No', yes: false, run: () => ({ ok: true, say: ru ? 'Оставил как есть' : 'Kept it' }) }]) };
      }
      return del(hits[0].item);
    }

    case 'focus': {
      const st = usePomodoro.getState();
      if (it.op === 'pause') { if (!st.endsAt) return { ok: true, say: ru ? 'Таймер и так не идёт' : 'Timer isn’t running' }; pomo.pause(); return { ok: true, say: ru ? 'Пауза. Скажите «продолжи», когда вернётесь' : 'Paused' }; }
      if (it.op === 'resume') { pomo.start(); return { ok: true, say: ru ? 'Продолжаем' : 'Resumed' }; }
      if (it.op === 'stop') { pomo.reset(); return { ok: true, say: ru ? 'Таймер остановлен' : 'Timer stopped' }; }
      if (it.op === 'open') { pomo.openSheet(); return { ok: true, say: ru ? 'Открыл фокус' : 'Focus opened', close: true }; }
      if (it.op === 'break') {
        pomo.setTab(1);
        if (it.minutes) pomo.setLength(1, Math.min(60, it.minutes));
        pomo.start();
        return { ok: true, say: ru ? `Перерыв ${it.minutes ?? usePomodoro.getState().lengths[1]} мин. Отдохните` : `Break for ${it.minutes ?? usePomodoro.getState().lengths[1]} min` };
      }
      pomo.setTab(0);
      if (it.minutes) pomo.setLength(0, it.minutes);
      pomo.start();
      const m = it.minutes ?? usePomodoro.getState().lengths[0];
      return { ok: true, say: ru ? `Фокус на ${m} ${plural(m, 'минуту', 'минуты', 'минут')}. Поехали` : `Focus for ${m} minutes. Go` };
    }

    case 'nav': {
      go(it.to);
      return { ok: true, say: ru ? `Открываю: ${PAGE_RU[it.to]}` : 'Opening', to: it.to, close: true };
    }
    case 'review': {
      go('/');
      setTimeout(() => window.dispatchEvent(new Event('veyrarc:review')), 1100);
      return { ok: true, say: ru ? 'Открываю итоги дня' : 'Opening the day review', close: true };
    }
    case 'weekReview': {
      go('/');
      setTimeout(() => window.dispatchEvent(new Event('veyrarc:week')), 1100);
      return { ok: true, say: ru ? 'Открываю итоги недели' : 'Opening the week review', close: true };
    }
    case 'freeze': {
      const y = addDays(day, -1);
      const st = c.sys ? dayStatus({ habits: habitsOf(c), logs: c.sys.logs, days: c.sys.days }, y, day) : 'none';
      if (st !== 'broken') return { ok: true, say: ru ? (st === 'frozen' ? 'Вчера уже заморожено' : 'Вчера серия не прерывалась — заморозка не нужна') : 'Yesterday doesn’t need a freeze' };
      void saveFreeze(y).then((okF) => {
        // the answer arrives after the server: the panel's reply line is updated in place
        useVoice.setState({ reply: okF ? (ru ? 'Заморозка включена — серия сохранена' : 'Freeze used — streak saved') : (ru ? 'Заморозки на этой неделе закончились' : 'No freezes left this week'), ok: okF });
      });
      return { ok: true, say: ru ? 'Замораживаю вчерашний день…' : 'Freezing yesterday…' };
    }
    case 'lang': {
      useLangStore.getState().setLang(it.to);
      return { ok: true, say: it.to === 'en' ? 'Switched to English' : 'Переключил на русский' };
    }

    case 'ask': return answer(c, it.what);

    case 'habitAdd': {
      if (!it.name) return { ok: false, say: ru ? 'Как назвать привычку?' : 'What should the habit be called?' };
      const exist = rank(it.name, habitsOf(c), (h) => h.name)[0];
      if (exist && exist.score >= 0.85) return { ok: true, say: ru ? `Привычка ${q(exist.name)} уже есть` : `“${exist.name}” already exists` };
      const n = habitsOf(c).length, core = habitsOf(c).filter((h) => h.core).length;
      const h = createHabit({
        id: crypto.randomUUID(), name: it.name.slice(0, 60), icon: 'doc', hue: HABIT_PALETTE[n % HABIT_PALETTE.length], type: it.type,
        target: it.target, unit: it.unit, minutes: it.minutes, days: DAYS_ALL, category: 'body', core: core < 3,
      });
      const undo = () => deleteHabit(h.id);
      remember(h.name, undo);
      const what = it.type === 'counter' ? ` — ${it.target}${it.unit ? ` ${it.unit}` : ''} в день` : it.type === 'duration' ? ` — ${it.minutes} мин в день` : '';
      return { ok: true, undo, say: ru ? `Добавил привычку ${q(h.name)}${what}${h.core ? ', это Core' : ''}. Каждый день` : `Habit “${h.name}” added` };
    }
    case 'goalAdd': {
      const id = crypto.randomUUID();
      createGoal({ id, title: it.title.slice(0, 80), hue: GOAL_HUES[(c.sys?.goals.length ?? 0) % GOAL_HUES.length], deadline: null, linkedCoreHabitId: null, steps: [] });
      const undo = () => deleteGoal(id);
      remember(it.title, undo);
      return { ok: true, undo, say: ru ? `Создал цель ${q(it.title)}. Добавьте шаги: «в цель ${it.title.split(' ').slice(-1)[0].toLowerCase()} добавь …»` : `Goal “${it.title}” created`, suggest: ru ? ['открой цели'] : undefined };
    }
    case 'stepAdd': {
      const gs = (c.sys?.goals ?? []).filter((g) => g.status === 'active');
      const g = rank(it.goal, gs, (x) => x.title)[0];
      if (!g || g.score < MAYBE) return { ok: false, say: ru ? `Не нашёл цель ${q(it.goal)}` : `No goal like “${it.goal}”`, suggest: ru ? [`создай цель ${it.goal}`] : undefined };
      const id = addGoalStep(g.item.id, it.text.slice(0, 120));
      const undo = () => deleteGoalStep(id);
      remember(it.text, undo);
      return { ok: true, undo, say: ru ? `Добавил шаг ${q(it.text)} в цель ${q(g.item.title)}` : `Step added to “${g.item.title}”` };
    }
    case 'relapse': {
      const quits = c.sys?.quits ?? [];
      if (!quits.length) return { ok: false, say: ru ? 'У вас нет отказов. Их можно добавить в разделе «Дисциплины»' : 'No quits set up' };
      const hits = it.query ? rank(it.query, quits, (x) => x.name) : [];
      if (hits[0]?.score >= SURE) return relapse(c, hits[0].item.id, hits[0].item.name);
      if (quits.length === 1) return relapse(c, quits[0].id, quits[0].name);
      return { ok: true, say: ru ? 'С чем был срыв?' : 'Which one?', choices: quits.slice(0, 4).map((x) => ({ label: x.name, run: () => relapse(c, x.id, x.name) })) };
    }

    case 'undo': {
      const last = history.pop();
      if (!last) return { ok: true, say: ru ? 'Отменять нечего' : 'Nothing to undo' };
      last.undo();
      return { ok: true, say: ru ? 'Отменил последнее действие' : 'Undone' };
    }
    case 'help':
      return {
        ok: true, say: ru ? 'Я веду ваш день: отмечаю привычки и настроение, добавляю и переношу задачи, запускаю фокус, отвечаю, что осталось, и открываю разделы. Говорите своими словами.' : 'I run your day: habits, mood, tasks, focus, answers and navigation. Just say it your way.',
        suggest: ru ? ['сделал зарядку и медитацию', 'выпил 2 стакана воды', 'завтра в 10 стоматолог', 'перенеси звонок маме на пятницу', 'что у меня сегодня', 'что дальше', 'фокус 50', 'пауза', 'мне грустно', 'добавь привычку чтение 20 минут', 'в цель марафон добавь растяжка', 'итоги дня', 'открой цели', 'отмени'] : undefined,
      };
    case 'chat': {
      const name = '';
      if (it.say === 'hello') return { ok: true, say: ru ? `Привет${name}! Что сделаем?` : 'Hi! What shall we do?', suggest: examples(ru, c) };
      if (it.say === 'thanks') return { ok: true, say: ru ? 'Всегда пожалуйста' : 'Any time' };
      if (it.say === 'praise') return { ok: true, say: ru ? 'Спасибо! Продолжаем' : 'Thanks! Let’s keep going' };
      return { ok: true, say: ru ? 'До связи' : 'Bye', close: true };
    }

    case 'guess': {
      // no command word: a page, a habit, a task or a goal named on its own
      const t = targets(c, it.query, false)[0];
      if (t && t.score >= SURE) {
        if (t.item.t === 'habit' && logOf(c, t.item.h.id)?.done) return { ok: true, say: ru ? `${t.item.h.name} уже отмечена сегодня` : `${t.item.h.name} is done today` };
        return ask(c, [t], (x) => doTarget(c, x, null, null), ru ? 'Отметить' : 'Mark');
      }
      const g = rank(it.query, (c.sys?.goals ?? []).filter((x) => x.status === 'active'), (x) => x.title)[0];
      if (g && g.score >= SURE) { go(`/goals/${g.item.id}`); return { ok: true, say: ru ? `Открываю цель ${q(g.item.title)}` : 'Opening the goal', close: true }; }
      return unknown(c, it.query);
    }
    case 'unknown': return unknown(c, it.text);
  }
}

function unknown(c: Ctx, text: string): Reply {
  if (text === 'offtopic') return { ok: false, say: c.ru ? 'С этим не помогу — я отвечаю за ваш день в VeyrArc: привычки, задачи, фокус и цели' : 'I can’t help with that — I run your day in VeyrArc', suggest: examples(c.ru, c) };
  return {
    ok: false,
    say: c.ru ? `Не совсем понял${text ? ` ${q(text)}` : ''}. Скажите по-другому или выберите:` : 'Didn’t quite get that. Try one of these:',
    suggest: examples(c.ru, c),
  };
}

/** several intents from one phrase: done one by one, answered together, undone together */
export function runAll(intents: Intent[], lang: 'ru' | 'en' = useLangStore.getState().lang as 'ru' | 'en'): Reply {
  const now = new Date();
  const c: Ctx = { ru: lang === 'ru', sys: getSystem(), day: isoDay(now), now };
  if (intents.length === 1) return runOne(intents[0], c);
  const replies: Reply[] = [];
  for (const it of intents) {
    replies.push(runOne(it, c));
    c.sys = getSystem(); // the next intent sees the change
  }
  const undos = replies.map((r) => r.undo).filter(Boolean) as (() => void)[];
  // one «отмени» takes back the whole phrase
  for (let i = 0; i < undos.length; i++) history.pop();
  const undo = undos.length ? () => undos.reverse().forEach((u) => u()) : undefined;
  if (undo) remember('batch', undo);
  const question = replies.find((r) => r.choices);
  return {
    ok: replies.some((r) => r.ok),
    say: replies.map((r) => r.say).filter(Boolean).join('. '),
    list: replies.flatMap((r) => r.list ?? []),
    choices: question?.choices, undo,
    close: replies.every((r) => r.close),
  };
}

/** for the old callers and tests: one intent, the old reply shape */
export function runIntent(it: Intent, lang: 'ru' | 'en') { return runAll([it], lang); }
