import { add, rx } from '../engine';
import { tidy } from './util';

/* WP5.10 phrases: look and feel, language, notifications, invitation, plan information, support (catalog 84–91, 217–224). */
add(
  { kind: 'settings.theme', over: ['nav.page'], re: rx('^(?:тема|включи тему|поставь тему|включи) (?:как в системе|системн\\p{L}*)(?: тему)?$|^тема как в системе$'), slots: () => ({ value: 'system' }) },
  { kind: 'settings.density', over: ['task.add'], re: rx('^(?:сделай |поставь |включи )?интерфейс (компактн\\p{L}*|просторн\\p{L}*|свободн\\p{L}*)$|^(?:сделай |включи )(компактн\\p{L}*|просторн\\p{L}*) (?:вид|режим|интерфейс)$'), slots: (m) => ({ value: /^компакт/.test(m[1] ?? m[2]) ? 'compact' : 'comfortable' }) },
  { kind: 'settings.lang', re: rx('^(?:переключи|включи|поменяй|смени)(?: язык)? (?:на )?(русский|английский|russian|english)(?: язык)?$'), slots: (m) => ({ value: /^(?:рус|rus)/.test(m[1]) ? 'ru' : 'en' }) },
  { kind: 'settings.notifyOff', over: ['settings.reminder'], re: rx('^(?:выключи|отключи|убери|не присылай) (?:мне )?(?:все )?уведомлени\\p{L}*$') },
  { kind: 'referral.share', re: rx('^(?:скинь|дай|покажи|отправь|поделись) (?:мне )?(?:мою )?(?:ссылк\\p{L}* ?(?:приглашени\\p{L}*)?|приглашени\\p{L}*)$|^моя ссылка приглашение$|^пригласить друга$') },
  { kind: 'profile.name', over: ['task.add'], re: rx('^(?:называй|зови) меня (.+)$'), slots: (m) => ({ name: tidy(m[1]) }) },
  { kind: 'info.plan', over: ['stats.week'], re: rx('‹какой у меня (?:сейчас )?тариф›|‹сколько осталось пробного(?: периода)?›|^мой тариф$'), slots: () => ({ what: 'plan' }) },
  { kind: 'info.plan', re: rx('^что (?:дает|даст) (?:pro|про|подписка)$|^что в pro$'), slots: () => ({ what: 'pro' }) },
  { kind: 'info.plan', re: rx('‹сколько (?:привычек|целей) (?:можно|мне можно|доступно)(?: бесплатно)?›|^какие лимиты$'), slots: () => ({ what: 'limits' }) },
  { kind: 'support.report', re: rx('^(?:сообщить об ошибке|сообщи об ошибке|написать в поддержку|напиши в поддержку|связаться с поддержкой)$') },
  { kind: 'support.idea', re: rx('^(?:предложить идею|предложи идею|у меня есть идея|хочу предложить идею)$') },
  { kind: 'feedback.wrong', re: rx('^(?:это ошибка|ты (?:не так|неправильно|неверно) понял\\p{L}*|ты ошибся|ты ошиблась|не то|это не то)$') },
);
const en = (...rules: Parameters<typeof add>) => add(...rules.map((r) => ({ ...r, lang: 'en' as const })));
en(
  { kind: 'settings.theme', re: rx('^(?:use |switch to |set )?(?:the )?system theme$|^theme (?:like|as) (?:the )?system$'), slots: () => ({ value: 'system' }) },
  { kind: 'settings.density', over: ['task.add'], re: rx('^(?:make )?(?:the )?interface (compact|comfortable|roomier|more compact)$|^(?:use )?(compact|comfortable) (?:view|mode|layout)$'), slots: (m) => ({ value: /compact/.test(m[1] ?? m[2]) ? 'compact' : 'comfortable' }) },
  { kind: 'settings.lang', re: rx('^(?:switch|change|set)(?: the)?(?: language)?(?: to)? (russian|english)$|^(?:use|speak) (russian|english)$'), slots: (m) => ({ value: /^rus/.test(m[1] ?? m[2]) ? 'ru' : 'en' }) },
  { kind: 'settings.notifyOff', over: ['settings.reminder'], re: rx('^(?:turn off|disable|stop) (?:all )?notifications$') },
  { kind: 'referral.share', re: rx('^(?:send|give|show|share) (?:me )?(?:my )?(?:invite|invitation|referral) link$|^invite a friend$') },
  { kind: 'profile.name', over: ['task.add'], re: rx('^(?:call me|my name is) (.+)$'), slots: (m) => ({ name: tidy(m[1]) }) },
  { kind: 'info.plan', re: rx('‹what(?:s| is) my (?:current )?plan›|‹how much (?:of )?(?:my )?trial is left›|^my plan$'), slots: () => ({ what: 'plan' }) },
  { kind: 'info.plan', re: rx('^what does pro (?:give|include|offer)$|^what(?:s| is) in pro$'), slots: () => ({ what: 'pro' }) },
  { kind: 'info.plan', re: rx('‹how many (?:habits|goals) can i (?:have|add)(?: for free)?›|^what are the limits$'), slots: () => ({ what: 'limits' }) },
  { kind: 'support.report', re: rx('^(?:report (?:a |an )?(?:bug|problem|error)|contact support|write to support)$') },
  { kind: 'support.idea', re: rx('^(?:suggest an idea|i have an idea|share an idea)$') },
  { kind: 'feedback.wrong', re: rx('^(?:that is wrong|thats wrong|that was wrong|you misunderstood|you got that wrong|you understood me wrong)$') },
);
