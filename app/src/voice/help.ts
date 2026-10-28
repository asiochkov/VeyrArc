import { store } from './store';

/*
 * What the assistant can do, grouped for the person (help, «как это сказать», «что я не пробовал», the first-run screen).
 * One place: the examples are real phrases the golden set understands (tools/unit/voice-help.test.ts runs every one of them).
 */
export type HelpGroup = { id: string; ru: string; en: string; kinds: RegExp; examples: { ru: string[]; en: string[] } };
export const HELP: HelpGroup[] = [
  { id: 'habits', ru: 'Привычки', en: 'Habits', kinds: /^(?:habit|counter|water)\./, examples: { ru: ['сделал зарядку', 'выпил два стакана воды', 'какая у меня серия'], en: ['done workout', 'drank two glasses of water', 'what is my streak'] } },
  { id: 'mood', ru: 'Настроение и сон', en: 'Mood and sleep', kinds: /^(?:mood|sleep)\./, examples: { ru: ['настроение четыре', 'спал семь часов', 'как у меня с настроением'], en: ['mood four', 'slept seven hours', 'how is my mood'] } },
  { id: 'tasks', ru: 'Задачи и планер', en: 'Tasks and planner', kinds: /^(?:task|plan|date|holiday|list)\./, examples: { ru: ['завтра в десять стоматолог', 'перенеси звонок на пятницу', 'что у меня сегодня'], en: ['tomorrow at 10 dentist', 'move the call to friday', 'what do i have today'] } },
  { id: 'focus', ru: 'Фокус и таймеры', en: 'Focus and timers', kinds: /^(?:focus|timer)\./, examples: { ru: ['фокус двадцать пять', 'таймер на пять минут', 'сколько я работал на этой неделе'], en: ['focus 25', 'set a timer for 5 minutes', 'how long did i work this week'] } },
  { id: 'goals', ru: 'Цели', en: 'Goals', kinds: /^goal\./, examples: { ru: ['создай цель выучить английский', 'добавь шаг в цель марафон', 'какой следующий шаг по цели марафон'], en: ['create a goal learn english', 'add a step to my goal marathon', 'what is the next step for marathon'] } },
  { id: 'quits', ru: 'Отказы от вредного', en: 'Quits', kinds: /^quit\./, examples: { ru: ['хочу бросить курить', 'сколько дней я не курю', 'я сорвался'], en: ['i want to quit smoking', 'how many days since i smoked', 'i relapsed'] } },
  { id: 'flows', ru: 'Дыхание, ритуалы, итоги дня', en: 'Breathing, rituals, reviews', kinds: /^(?:flow|ritual)\./, examples: { ru: ['дыхание квадратом', 'подведи вечер', 'создай утренний ритуал зарядка вода медитация'], en: ['box breathing', 'wrap up my evening', 'start my morning ritual'] } },
  { id: 'stats', ru: 'Итоги и аналитика', en: 'Stats and insights', kinds: /^(?:stats|arc|share|report)\./, examples: { ru: ['как мои дела за неделю', 'сравни эту неделю с прошлой', 'какое у меня обещание'], en: ['how was my month', 'compare this week to last', 'what is my promise'] } },
  { id: 'settings', ru: 'Настройки', en: 'Settings', kinds: /^(?:settings|referral|export|profile|info)\./, examples: { ru: ['включи тёмную тему', 'напоминай в девять вечера', 'называй меня Сеня'], en: ['switch to the dark theme', 'remind me at 9 pm', 'call me sam'] } },
  { id: 'voice', ru: 'Голос ассистента', en: 'The assistant itself', kinds: /^(?:prefs|repeat|journal|undo|whatsnew|howto|unexplored)/, examples: { ru: ['говори медленнее', 'что ты сейчас сделал', 'отмени'], en: ['speak slower', 'what did you just do', 'undo'] } },
];

/* commands the person has used: the kinds only, never the words said (kept on the device) */
const KEY = 'used.v1';
export const usedKinds = (): Record<string, number> => store.get<Record<string, number>>(KEY, {});
export const markUsed = (kind: string) => { if (/^(?:undo|help|repeat)$/.test(kind)) return; store.update<Record<string, number>>(KEY, {}, (u) => ({ ...u, [kind]: (u[kind] ?? 0) + 1 })); };
export const unexplored = (): HelpGroup[] => { const u = Object.keys(usedKinds()); return HELP.filter((g) => !u.some((k) => g.kinds.test(k))); };
