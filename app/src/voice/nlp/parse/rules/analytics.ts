import { add, rx } from '../engine';
import { num } from './util';

/* WP5.9 phrases: statistics, focus analytics, the season and its promise, reports (catalog 70–83, 152–155, 159–164, 166). */
const WD = ['понедельник', 'вторник', 'сред', 'четверг', 'пятниц', 'суббот', 'воскресень'];
const WDE = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const wdIndex = (s: string, list: string[]) => list.findIndex((w) => s.startsWith(w));
add(
  { kind: 'stats.week', over: ['plan.week', 'stats.week'], re: rx('^(?:расскажи|скажи|что) (?:мне )?(?:про|о|насчет)? ?прошл\\p{L}* недел\\p{L}*$|^как прошла прошлая неделя$|^итоги прошлой недели$|^расскажи про прошлую неделю$'), slots: () => ({ last: true }) },
  { kind: 'stats.month', re: rx('^(?:как прошел месяц|итоги месяца|как я за месяц|как мои дела за месяц)$') },
  { kind: 'stats.bestDay', re: rx('‹(?:какой )?(?:был )?(?:мой )?лучший день(?: за месяц| в этом месяце)?›') },
  { kind: 'stats.longestStreak', over: ['habit.streak'], re: rx('‹(?:моя )?самая длинная серия›|‹рекорд серии›|‹мой рекорд по серии›') },
  { kind: 'stats.totalChecks', re: rx('‹сколько (?:всего )?отметок(?: за сезон| в сезоне| за все время)?›') },
  { kind: 'stats.whyDropped', over: ['habit.streak'], re: rx('‹почему (?:упала|прервалась|оборвалась|сбилась) (?:моя |у меня )?серия›') },
  { kind: 'stats.strongest', over: ['plan.day'], re: rx('‹что у меня (?:лучше всего )?получается(?: лучше всего)?›|‹какие (?:мои )?привычки (?:самые )?стабильн\\p{L}*›|‹в чем я силен›') },
  { kind: 'stats.weekdayPattern', full: true, over: ['habit.count', 'habit.schedule'], re: rx('‹как я справляюсь по (понедельник\\p{L}*|вторник\\p{L}*|сред\\p{L}*|четверг\\p{L}*|пятниц\\p{L}*|суббот\\p{L}*|воскресень\\p{L}*)›'), slots: (m) => ({ weekday: wdIndex(m[1], WD) }) },
  { kind: 'stats.compareWeeks', re: rx('‹сравни (?:эту )?недел\\p{L}* с прошлой›|‹эта неделя против прошлой›') },
  { kind: 'stats.insights', re: rx('^(?:дай|покажи|озвучь) (?:мне )?(?:инсайты|наблюдения|выводы)$|^что ты (?:заметил|заметила)$') },
  { kind: 'stats.achievements', over: ['stats.week', 'list.remaining'], re: rx('‹какие (?:у меня )?достижения›|‹что осталось до следующего(?: достижения)?›|^мои достижения$') },
  { kind: 'stats.indexExplain', over: ['stats.index'], re: rx('^что (?:значит |такое )?индекс(?: дисциплины)?$|‹как считается индекс›') },
  { kind: 'stats.forecastStreak', over: ['habit.streak', 'date.diff'], re: rx('‹когда (?:у меня )?будет серия (\\d+)(?: дн\\p{L}*)?›'), slots: (m) => ({ n: num(m[1]) }) },
  { kind: 'stats.percent30', full: true, over: ['habit.count', 'stats.month'], re: rx('^сколько процентов привычек (?:я )?выполняю(?: за (?:30|тридцать) дней)?$'), slots: () => ({}) },
  { kind: 'stats.weekMap', re: rx('‹(?:покажи )?карт\\p{L}* недели›') },
  { kind: 'focus.byGoal', re: rx('‹сколько (?:часов )?фокуса по (?:каждой )?цел\\p{L}*›|‹фокус по целям›') },
  { kind: 'focus.byCategory', re: rx('‹куда уходит (?:мое )?время›|‹фокус по категориям›') },
  { kind: 'focus.bestHour', re: rx('‹в какое время (?:суток )?я (?:лучше всего )?работаю›|‹когда я лучше всего работаю›') },
  { kind: 'focus.avg', re: rx('‹(?:какая )?(?:у меня )?средняя (?:фокус )?сессия›|‹какая у меня средняя фокус сессия›') },
  { kind: 'arc.oath.get', re: rx('^(?:какое )?(?:у меня )?обещание$|^какое у меня обещание$|^прочитай (?:мое )?обещание$') },
  { kind: 'arc.day', over: ['date.diff'], re: rx('‹сколько (?:дней )?(?:мне )?осталось в сезоне›|‹какой сегодня день сезона›') },
  { kind: 'arc.new', re: rx('^(?:начни|начать|запусти) новый сезон$') },
  { kind: 'arc.recap', over: ['nav.open'], re: rx('^(?:покажи|открой) (?:итоги сезона|отчет|итоги)$') },
  { kind: 'share.week', re: rx('^(?:поделись|поделиться) (?:итогами недели|недел\\p{L}*|итогами)$') },
  { kind: 'report.month', re: rx('^(?:пришли|сделай|покажи) (?:мне )?отчет за месяц$') },
);
const en = (...rules: Parameters<typeof add>) => add(...rules.map((r) => ({ ...r, lang: 'en' as const })));
en(
  { kind: 'stats.week', over: ['plan.week', 'stats.week'], re: rx('^(?:tell me about|how was|sum up|recap) last week$'), slots: () => ({ last: true }) },
  { kind: 'stats.month', re: rx('^(?:how was my month|monthly summary|sum up my month)$') },
  { kind: 'stats.bestDay', re: rx('‹(?:what was )?my best day(?: this month)?›') },
  { kind: 'stats.totalChecks', re: rx('‹how many (?:checks|check ins)(?: in total| this season| overall)?›') },
  { kind: 'stats.strongest', re: rx('‹what am i (?:best|good) at›|‹which habits are (?:the )?most stable›') },
  { kind: 'stats.weekdayPattern', over: ['habit.count'], re: rx('‹how do i do on (mondays|tuesdays|wednesdays|thursdays|fridays|saturdays|sundays)›'), slots: (m) => ({ weekday: wdIndex(m[1].replace(/s$/, ''), WDE) }) },
  { kind: 'stats.compareWeeks', re: rx('‹compare this week (?:with|to) last(?: week)?›') },
  { kind: 'stats.insights', re: rx('^(?:give me )?(?:the )?insights$|^what have you noticed$') },
  { kind: 'stats.achievements', re: rx('‹(?:what are )?my achievements›|‹what is left until the next(?: one| achievement)?›') },
  { kind: 'stats.indexExplain', re: rx('‹what does (?:the )?(?:discipline )?index mean›|‹how is the index (?:calculated|counted)›') },
  { kind: 'stats.forecastStreak', over: ['habit.streak'], re: rx('‹when will i (?:have|reach) a (\\d+) day streak›'), slots: (m) => ({ n: num(m[1]) }) },
  { kind: 'stats.percent30', full: true, re: rx('^what percent of habits do i complete(?: in (?:30|thirty) days)?$'), slots: () => ({}) },
  { kind: 'stats.weekMap', re: rx('‹show (?:me )?the week map›') },
  { kind: 'focus.byGoal', re: rx('‹how many hours of focus (?:per|for each) goal›') },
  { kind: 'focus.byCategory', re: rx('‹where does my time go›') },
  { kind: 'focus.bestHour', re: rx('‹what time of day do i work best›') },
  { kind: 'focus.avg', re: rx('‹what is my average focus session›') },
  { kind: 'arc.oath.get', re: rx('^what is my promise$|^read my promise$') },
  { kind: 'arc.new', re: rx('^start a new season$') },
  { kind: 'arc.recap', re: rx('^(?:show|open) (?:the )?(?:season recap|season summary|recap)$') },
  { kind: 'share.week', re: rx('^share my week(?:ly)?(?: summary)?$') },
  { kind: 'report.month', re: rx('^(?:send|make|give) me (?:a |the )?(?:monthly report|report for the month)$') },
);
