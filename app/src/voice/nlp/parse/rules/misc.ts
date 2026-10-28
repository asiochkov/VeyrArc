import { add, rx } from '../engine';
import { num, tidy, withEntity } from './util';

/* focus and timers, goals, quits, settings, navigation, the assistant itself, small talk, guided flows, statistics */

const PAGES: [RegExp, string][] = [
  [rx('^(?:сегодня|главн\\p{L}*|домой)$'), 'today'], [rx('^привычк\\p{L}*$'), 'habits'], [rx('^(?:планер\\p{L}*|календар\\p{L}*|расписани\\p{L}*)$'), 'planner'],
  [rx('^цел\\p{L}*$'), 'goals'], [rx('^(?:аналитик\\p{L}*|статистик\\p{L}*)$'), 'analytics'], [rx('^настройк\\p{L}*$'), 'settings'], [rx('^(?:аккаунт\\p{L}*|профиль)$'), 'account'],
];

add(
  // focus and timers
  { kind: 'timer.simple', re: rx('^(?:включи|поставь|запусти|заведи|засеки) (?:мне )?таймер(?: на)?$'), slots: (_m, c) => ({ seconds: c.when.duration ? c.when.duration * 60 : undefined }) },
  { kind: 'focus.stop', re: rx('^(?:останови|остановить|стоп|заверши|выключи) (?:фокус|таймер|сессию)$') },
  { kind: 'focus.pause', over: ['habit.pause'], re: rx('^поставь (?:фокус|таймер) на паузу$|^пауза(?: фокус\\p{L}*)?$') },
  { kind: 'focus.resume', re: rx('^(?:продолжи|возобнови) (?:фокус|таймер)$') },
  { kind: 'focus.extend', re: rx('^(?:продли|продлить|добавь времени|еще) (?:фокус|таймер)(?: на)?(?: (\\d+)(?: минут\\p{L}*)?)?$'), slots: (m, c) => ({ minutes: c.when.duration ?? num(m[1]) }) },
  { kind: 'focus.remaining', re: rx('‹сколько осталось до конца (?:фокуса|таймера|сессии)›') },
  { kind: 'focus.sum', re: rx('‹сколько я (?:.* )?(?:работал\\p{L}*|фокусировал\\p{L}*|сосредоточ\\p{L}*)›') },
  { kind: 'focus.start', re: rx('^(?:начни|начать|запусти|включи|старт|стартуй)? ?(?:фокус|помодоро|фокус сессию)(?: (\\d+)(?: минут\\p{L}*)?)?(?: на)?$'), slots: (m, c) => ({ minutes: c.when.duration ?? num(m[1]) }) },
  { kind: 'focus.sum', re: rx('‹сколько (?:времени )?я (?:.* )?(?:в фокусе|на фокусе)›') },

  // goals
  { kind: 'goal.complete', re: rx('^(?:заверши|завершить|закрой|выполнена) цель (.+)$'), slots: (m, c) => withEntity(c, 'goal', m[1]) },
  { kind: 'goal.add', re: rx('^(?:создай|добавь|заведи|новая) цель (.+)$'), slots: (m) => ({ title: tidy(m[1]) }) },
  { kind: 'goal.deadline', re: rx('^(?:поставь|установи|назначь) (?:дедлайн|срок) (?:по |для |на )?(.+)$'), slots: (m, c) => {
    if (!c.when.date) return null;
    return { ...withEntity(c, 'goal', m[1].replace(/ на$/, '')), day: c.when.date };
  } },
  { kind: 'goal.next', re: rx('‹(?:какой )?следующий шаг(?: по (.+))?›'), slots: (m, c) => (m[1] ? withEntity(c, 'goal', m[1]) : {}) },
  { kind: 'goal.progress', re: rx('‹(?:как мои цели|прогресс по целям|как дела с целями)›') },

  // quits
  { kind: 'quit.add', re: [rx('^(?:добавь|создай|заведи) отказ от (.+)$'), rx('‹(?:хочу )?бросить (.+)›')], slots: (m) => ({ title: tidy(m[1]) }) },
  { kind: 'quit.relapse', src: 'n', re: rx('^(?:сорвался|сорвалась|закурил\\p{L}*|я сорвался|я сорвалась|выпил\\p{L}* зря)(?: но| и)? ?(.*)$'), slots: (m) => ({ note: tidy(m[1]) || undefined }) },
  { kind: 'quit.days', re: rx('‹сколько дней (?:я )?(?:не |без |как бросил)'), },

  // settings
  { kind: 'settings.theme', re: [rx('‹(?:смени|поменяй|переключи|включи|поставь) (?:тему на |на )?(светл\\p{L}*|т[её]мн\\p{L}*|темн\\p{L}*)(?: тему)?›')], slots: (m) => ({ value: /^св/.test(m[1]) ? 'light' : 'dark' }) },
  { kind: 'settings.reminder', re: rx('^(?:напоминай|напоминание|присылай напоминани\\p{L}*)$'), slots: (_m, c) => ({ time: c.when.time }) },
  { kind: 'settings.quiet', full: true, re: rx('‹(?:не беспокой|тишина|не тревожь|не напоминай)(?: меня)? с (\\d{1,2}) до (\\d{1,2})›'), slots: (m) => {
    const f = Number(m[1]), t = Number(m[2]);
    const hh = (h: number) => String(h).padStart(2, '0') + ':00';
    return { from: hh(f >= 6 && f <= 11 ? f + 12 : f), to: hh(t) };
  } },
  { kind: 'export.data', re: rx('^(?:выгрузи|экспортируй|скачай|выгрузить) (?:мои )?данные$') },
  { kind: 'account.delete', re: rx('‹(?:удали|удалить|сотри) (?:мой )?(?:аккаунт|профиль|учетную запись)›') },
  { kind: 'arc.oath.set', src: 'n', re: rx('‹(?:запиши|запомни|поставь|сохрани) обещание(?: до конца сезона)? (.+)$'), slots: (m) => ({ text: tidy(m[1]) }) },
  { kind: 'arc.day', re: rx('‹(?:какой )?(?:сегодня )?день сезона›') },

  // navigation
  { kind: 'nav.page', re: rx('^(?:открой|открыть|покажи|перейди (?:в|на|к)|перейти (?:в|на)|зайди в|пойдем в) (.+)$'), slots: (m) => {
    const w = tidy(m[1]).replace(/^(?:мои |мой |моё |раздел |страницу |экран )+/u, '');
    for (const [re, page] of PAGES) if (re.test(w)) return { page };
    return null;
  } },
  { kind: 'nav.back', re: rx('^(?:вернись|вернуться|назад|иди назад)(?: назад)?$') },

  // the assistant itself and small talk
  { kind: 'undo', re: rx('^(?:отмени|отмена|откати|отменить|верни как было)(?: последн\\p{L}* (?:действие|команду))?$') },
  { kind: 'help', re: rx('^(?:что ты умеешь|помощь|помоги|что можно сказать|справка|что ты можешь)$') },
  { kind: 'chat.hello', re: rx('^(?:привет|здравствуй\\p{L}*|добрый (?:день|вечер|утро)|хай|алло привет)$') },
  { kind: 'chat.thanks', re: rx('^(?:спасибо|благодарю|мерси)(?: .*)?$') },
  { kind: 'chat.who', re: rx('^(?:кто ты|ты кто|как тебя зовут)$') },
  { kind: 'howto', re: rx('^что такое (помодоро|индекс|серия|сезон|ядро|core|extra|фокус|эффективность)$'), slots: (m) => ({ query: m[1] }) },

  // guided flows
  { kind: 'flow.start', re: rx('^(?:проведи меня по привычкам|пройдемся по привычкам|пройдись по привычкам)$'), slots: () => ({ id: 'walk' }) },
  { kind: 'flow.start', re: rx('^(?:утренний )?бри\\p{L}{0,3}нг$|^давай начнем утро$'), slots: () => ({ id: 'morning' }) },
  { kind: 'flow.start', re: rx('^(?:подведи вечер|вечерний итог|подведем итог дня|подведи итоги дня)$'), slots: () => ({ id: 'evening' }) },
  { kind: 'flow.start', re: rx('^(?:подведи неделю|итоги недели|недельный обзор|обзор недели|подведем итоги недели)$'), slots: () => ({ id: 'week' }) },
  { kind: 'flow.start', re: rx('^(?:доброе утро|с добрым утром)$'), slots: () => ({ id: 'morning' }) },
  { kind: 'flow.start', re: rx('^(?:мне тяжело(?: сегодня)?|тяжелый день|мне трудно)$'), slots: () => ({ id: 'tough' }) },
  { kind: 'flow.start', re: rx('‹у меня (\\d+) минут\\p{L}*(?: что успеть)?›'), slots: (m) => ({ id: 'fit', minutes: num(m[1]) }) },

  // statistics
  { kind: 'stats.longestStreak', over: ['habit.streak'], re: rx('‹самая длинная серия›') },
  { kind: 'stats.whyDropped', over: ['habit.streak'], re: rx('‹почему (?:у меня )?(?:сбилась|пропала|сломалась) серия›') },
  { kind: 'stats.week', over: ['chat.hello'], re: [rx('‹как (?:у меня )?(?:дела|идут дела|проходит)(?: .*)? недел\\p{L}*›'), rx('‹как (?:мои )?дела›')] },
  { kind: 'stats.index', re: rx('‹(?:какой )?(?:у меня )?(?:сейчас )?индекс›') },
);

add({ kind: 'chat.howAreYou', over: ['stats.week'], re: rx('‹(?:как (?:у )?(?:тебя )?дела у тебя|как ты|как поживаешь)›') });
