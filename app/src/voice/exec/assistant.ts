import { dialog } from '../dialog/context';
import { HELP, unexplored } from '../help';
import { journal } from '../journal';
import { usePrefs, type Prefs } from '../prefs';
import { R } from '../reply';
import { register } from './index';
import type { UndoOp } from './types';

/* WP5.11 — the assistant itself: personal words, short commands, speech settings, style, repeat, the journal, what is new, how to say it
   (catalog 92–99, 226, 233–238). Everything is kept on this device and every change can be taken back. */
const prefsOp = (key: keyof Prefs): UndoOp => ({ t: 'prefs', key, prev: usePrefs.getState()[key] });
const clamp = (v: number, lo: number, hi: number) => Math.round(Math.max(lo, Math.min(hi, v)) * 100) / 100;

register('prefs.alias.add', (p, c) => {
  const alias = String(p.slots.alias ?? '').trim().toLowerCase(), target = String(p.slots.target ?? '').trim().toLowerCase();
  if (!alias || !target) return R.error(c.ru ? 'Что с чем связать? Например: «запомни качалка это тренировка»' : 'What should I link? For example: “remember gym means workout”');
  if (alias === target) return R.info(c.ru ? 'Это одно и то же слово' : 'That is the same word');
  const list = usePrefs.getState().aliases;
  const undo = [prefsOp('aliases')];
  usePrefs.getState().set({ aliases: [...list.filter((a) => a.alias !== alias), { alias, target }].slice(-100) });
  return R.done(c.ru ? `Запомнил: «${alias}» — это «${target}»` : `Remembered: “${alias}” means “${target}”`, { undo });
});

register('prefs.macro.add', (p, c) => {
  const trigger = String(p.slots.trigger ?? '').trim().toLowerCase();
  const phrases = (Array.isArray(p.slots.phrases) ? p.slots.phrases : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 8);
  if (!trigger || !phrases.length) return R.error(c.ru ? 'Скажите так: «когда я скажу утро, отметь зарядку и воду»' : 'Say it like: “when I say morning, mark workout and water”');
  const undo = [prefsOp('macros')];
  usePrefs.getState().set({ macros: [...usePrefs.getState().macros.filter((m) => m.trigger !== trigger), { trigger, phrases }].slice(-30) });
  return R.done(c.ru ? `Теперь на «${trigger}» я сделаю: ${phrases.join('; ')}` : `Now “${trigger}” will do: ${phrases.join('; ')}`, { undo });
});

/* ── speech: pace, volume, silence, the narrator mode, the language of the answer ── */
register('prefs.speech', (p, c) => {
  const op = String(p.slots.op ?? '');
  const s = usePrefs.getState();
  const say = (ru: string, en: string, key: keyof Prefs, patch: Partial<Prefs>) => { const undo = [prefsOp(key)]; s.set(patch); return R.done(c.ru ? ru : en, { undo }); };
  switch (op) {
    case 'slower': { const v = clamp(s.rate - 0.1, 0.8, 1.4); return v === s.rate ? R.info(c.ru ? 'Медленнее уже некуда' : 'That is the slowest') : say('Говорю медленнее', 'Speaking slower', 'rate', { rate: v }); }
    case 'faster': { const v = clamp(s.rate + 0.1, 0.8, 1.4); return v === s.rate ? R.info(c.ru ? 'Быстрее уже некуда' : 'That is the fastest') : say('Говорю быстрее', 'Speaking faster', 'rate', { rate: v }); }
    case 'quieter': { const v = clamp(s.volume - 0.2, 0.2, 1); return v === s.volume ? R.info(c.ru ? 'Тише уже некуда' : 'That is the quietest') : say('Говорю тише', 'Speaking quieter', 'volume', { volume: v }); }
    case 'louder': { const v = clamp(s.volume + 0.2, 0.2, 1); return v === s.volume ? R.info(c.ru ? 'Громче уже некуда' : 'That is the loudest') : say('Говорю громче', 'Speaking louder', 'volume', { volume: v }); }
    case 'stop': { try { window.speechSynthesis?.cancel(); } catch { /* no speech */ } return { ...R.info(c.ru ? 'Молчу' : 'Quiet'), speech: null }; }
    case 'textOnly': return s.muted ? R.info(c.ru ? 'Голос уже выключен — отвечаю текстом' : 'The voice is already off') : say('Хорошо, отвечаю только текстом', 'Okay, text only', 'muted', { muted: true });
    case 'voiceOn': return !s.muted ? R.info(c.ru ? 'Голос уже включён' : 'The voice is already on') : say('Голос включён', 'The voice is on', 'muted', { muted: false });
    case 'narratorOn': return say('Режим диктора включён: буду проговаривать результат каждого действия', 'Narrator mode is on: I will say the result of every action', 'dictator', { dictator: true });
    case 'narratorOff': return say('Режим диктора выключен', 'Narrator mode is off', 'dictator', { dictator: false });
    case 'autoLangOn': return say('Буду отвечать на том языке, на котором вы говорите', 'I will answer in the language you speak', 'autoLang', { autoLang: true });
    case 'autoLangOff': return say('Язык ответа остаётся как в приложении', 'Answers stay in the app language', 'autoLang', { autoLang: false });
  }
  return R.error(c.ru ? 'Что сделать с голосом?' : 'What should I change about the voice?');
});

register('prefs.style', (p, c) => {
  const s = usePrefs.getState();
  const sl = p.slots;
  if (sl.style === 'brief' || sl.style === 'normal' || sl.style === 'detailed') { const undo = [prefsOp('style')]; s.set({ style: sl.style }); return R.done(sl.style === 'brief' ? (c.ru ? 'Буду отвечать коротко' : 'Short answers from now on') : sl.style === 'detailed' ? (c.ru ? 'Буду отвечать подробнее' : 'More detail from now on') : (c.ru ? 'Отвечаю как обычно' : 'Back to normal'), { undo }); }
  if (sl.tone === 'soft' || sl.tone === 'neutral' || sl.tone === 'strict') { const undo = [prefsOp('tone')]; s.set({ tone: sl.tone }); return R.done(sl.tone === 'strict' ? (c.ru ? 'Буду строже' : 'Stricter from now on') : sl.tone === 'soft' ? (c.ru ? 'Буду мягче' : 'Softer from now on') : (c.ru ? 'Тон обычный' : 'Neutral tone'), { undo }); }
  if (typeof sl.name === 'string' && sl.name.trim()) { const name = sl.name.trim().slice(0, 20); const undo = [prefsOp('name')]; s.set({ name }); return R.done(c.ru ? `Теперь меня зовут ${name}` : `Call me ${name} from now on`, { undo }); }
  if (typeof sl.praise === 'boolean') { const undo = [prefsOp('praise')]; s.set({ praise: sl.praise }); return R.done(sl.praise ? (c.ru ? 'Хорошо, буду хвалить' : 'Okay, praise is back') : (c.ru ? 'Хорошо, без похвалы' : 'Okay, no praise'), { undo }); }
  if (typeof sl.speakLists === 'boolean') { const undo = [prefsOp('speakLists')]; s.set({ speakLists: sl.speakLists }); return R.done(sl.speakLists ? (c.ru ? 'Буду зачитывать списки' : 'I will read lists out') : (c.ru ? 'Списки только на экране' : 'Lists stay on the screen'), { undo }); }
  return R.error(c.ru ? 'Что изменить в моих ответах?' : 'What should I change about my answers?');
});

/* ── repeat, the journal ── */
register('repeat', (p, c) => {
  const ex = dialog.get().exchange;
  if (!ex) return R.info(c.ru ? 'Пока нечего повторять' : 'Nothing to repeat yet');
  return { ...R.answer(ex.screen), rate: p.slots.slow ? 0.8 : undefined };
});
register('journal.show', (_p, c) => {
  const list = journal.list().filter((e) => !e.undone).slice(-5).reverse();
  if (!list.length) return R.info(c.ru ? 'Пока я ничего не менял' : 'I have not changed anything yet');
  return R.answer(c.ru ? `Последнее: ${list[0].label}` : `Last: ${list[0].label}`, { list: list.map((e) => e.label), chips: [{ label: c.ru ? 'Отменить последнее' : 'Undo the last', say: c.ru ? 'отмени' : 'undo' }] });
});

/* ── what is new, how to say it, what has not been tried ── */
const NEWS_RU = ['Голос: говорите свободно — «сделал зарядку и выпил воды»', 'Можно отменить любое действие словом «отмени»', 'Дыхание, растяжка и ритуалы: «дыхание квадратом», «создай утренний ритуал»', 'Итоги и вопросы: «сравни эту неделю с прошлой», «куда уходит моё время»', 'Свои слова и короткие команды: «запомни качалка это тренировка»'];
const NEWS_EN = ['Speak freely: “done workout and drank water”', 'Anything can be taken back with “undo”', 'Breathing, stretching and rituals: “box breathing”, “create a morning ritual”', 'Summaries and questions: “compare this week to last”, “where does my time go”', 'Your own words and shortcuts: “remember gym means workout”'];
register('whatsnew', (_p, c) => R.answer(c.ru ? 'Вот чему я научился' : 'Here is what I have learned', { list: c.ru ? NEWS_RU : NEWS_EN }));

const CONCEPTS: Record<string, [string, string]> = {
  помодоро: ['Помодоро — работа блоками по 25 минут с короткими перерывами. После четырёх блоков перерыв длиннее. Скажите «фокус 25»', 'Pomodoro is work in 25-minute blocks with short breaks, and a longer one after four. Say “focus 25”'],
  pomodoro: ['Помодоро — работа блоками по 25 минут с короткими перерывами. Скажите «фокус 25»', 'Pomodoro is work in 25-minute blocks with short breaks. Say “focus 25”'],
  индекс: ['Индекс дисциплины — число от 0 до 1000: главные привычки, доля выполненного, фокус, шаги целей и ровность по дням. Скажите «как считается индекс»', 'The discipline index is a number from 0 to 1000 built from core habits, share done, focus, goal steps and evenness. Say “how is the index calculated”'],
  index: ['Индекс дисциплины — число от 0 до 1000', 'The discipline index is a number from 0 to 1000 built from core habits, share done, focus, goal steps and evenness'],
  серия: ['Серия — дни подряд, когда выполнены все главные привычки. Дополнительные на неё не влияют', 'A streak is days in a row with every core habit done. Extra habits do not count'],
  streak: ['Серия — дни подряд с выполненными главными привычками', 'A streak is days in a row with every core habit done. Extra habits do not count'],
  сезон: ['Сезон — отрезок времени с вашим обещанием и итогами в конце. Новый начинается командой «начни новый сезон»', 'A season is a stretch of time with your promise and a recap at the end. Start a new one with “start a new season”'],
  season: ['Сезон — отрезок времени с вашим обещанием и итогами в конце', 'A season is a stretch of time with your promise and a recap at the end'],
  ядро: ['Главные привычки (ядро) держат серию, дополнительные — нет', 'Core habits hold the streak; extra ones do not'],
  core: ['Главные привычки держат серию, дополнительные — нет', 'Core habits hold the streak; extra ones do not'],
  extra: ['Дополнительные привычки на серию не влияют, но учитываются в индексе', 'Extra habits do not affect the streak but count in the index'],
  фокус: ['Фокус — таймер работы без отвлечений. Можно привязать к цели: «фокус 25 над целью английский»', 'Focus is a distraction-free work timer. Link it to a goal: “focus 25 on goal english”'],
  focus: ['Фокус — таймер работы без отвлечений', 'Focus is a distraction-free work timer. Link it to a goal'],
  эффективность: ['Эффективность — доля выполненных запланированных привычек за период', 'Efficiency is the share of planned habits you completed in a period'],
  efficiency: ['Эффективность — доля выполненных привычек за период', 'Efficiency is the share of planned habits you completed in a period'],
};
register('howto', (p, c) => {
  const q = String(p.slots.query ?? '').trim().toLowerCase();
  if (p.slots.mode === 'say') {
    const g = HELP.find((x) => q && (x.ru.toLowerCase().includes(q) || x.en.toLowerCase().includes(q) || q.split(' ').some((w) => w.length > 3 && (x.ru.toLowerCase().includes(w.slice(0, 5)) || x.en.toLowerCase().includes(w)))));
    const ex = (g ?? HELP[0]).examples[c.ru ? 'ru' : 'en'];
    return R.answer(c.ru ? `Так можно сказать (${(g ?? HELP[0]).ru.toLowerCase()})` : `You can say (${(g ?? HELP[0]).en.toLowerCase()})`, { list: ex.map((x) => `«${x}»`), chips: ex.slice(0, 3).map((x) => ({ label: x, say: x })) });
  }
  const a = CONCEPTS[q];
  return a ? R.answer(c.ru ? a[0] : a[1]) : R.info(c.ru ? 'Про это я не расскажу, но могу показать, что умею: скажите «что ты умеешь»' : 'I can’t explain that, but I can show what I can do: say “what can you do”');
});
register('unexplored', (_p, c) => {
  const left = unexplored();
  if (!left.length) return R.answer(c.ru ? 'Вы попробовали почти всё. Скажите «что нового», чтобы узнать о новом' : 'You have tried nearly everything. Say “what is new” for more');
  const g = left[0];
  const ex = g.examples[c.ru ? 'ru' : 'en'];
  return R.answer(c.ru ? `Вы ещё не пробовали: ${g.ru.toLowerCase()}. Например, «${ex[0]}»` : `You have not tried ${g.en.toLowerCase()} yet. For example, “${ex[0]}”`, { list: left.slice(0, 5).map((x) => (c.ru ? x.ru : x.en)), chips: ex.slice(0, 2).map((x) => ({ label: x, say: x })) });
});
