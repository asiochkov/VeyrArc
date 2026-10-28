import { add, rx } from '../engine';
import { num, tidy } from './util';

/* WP5.11 phrases: the assistant itself — own words, short commands, speech, style, repeat, journal, news (catalog 92–99, 226, 233–238). */
const VERBS = /^(?:отметь|добавь|включи|запусти|открой|покажи|поставь|запиши|выключи|перенеси|удали|создай|начни|скажи|напомни)$/;
/** «отметь зарядку и воду» → ['отметь зарядку', 'отметь воду']: a part without its own verb takes the verb before it */
export function splitPhrases(rest: string): string[] {
  const parts = rest.split(/\s*(?:,|;|\s+и\s+|\s+and\s+|\s+then\s+|\s+потом\s+)\s*/).map((x) => x.trim()).filter(Boolean);
  let verb = '';
  return parts.map((p) => {
    const first = p.split(' ')[0];
    if (VERBS.test(first) || /^(?:mark|add|start|open|show|set|log|play|turn|switch)$/.test(first)) { verb = first; return p; }
    return verb ? `${verb} ${p}` : p;
  });
}
const strip = (s: string) => tidy(s).replace(/^[«"“]|[»"”]$/g, '');

add(
  { kind: 'prefs.alias.add', src: 'n', re: rx('^запомни[: ]+(.+?) (?:это|значит|как|=) (.+)$'), slots: (m) => ({ alias: strip(m[1]), target: strip(m[2]) }) },
  { kind: 'prefs.macro.add', over: ['task.add', 'habit.done'], src: 'raw', re: rx('^когда я (?:скажу|говорю) [«"“]?([^»"”,]+?)[»"”]?[, ]+\\s*(?:то )?(.+)$'), slots: (m) => ({ trigger: strip(m[1]).toLowerCase(), phrases: splitPhrases(tidy(m[2]).toLowerCase()) }) },
  { kind: 'prefs.speech', re: rx('^(?:говори|читай) (?:помедленнее|медленнее)$|^помедленнее$'), slots: () => ({ op: 'slower' }) },
  { kind: 'prefs.speech', re: rx('^(?:говори|читай) (?:побыстрее|быстрее)$|^побыстрее$'), slots: () => ({ op: 'faster' }) },
  { kind: 'prefs.speech', re: rx('^(?:говори|читай) (?:потише|тише)$|^потише$'), slots: () => ({ op: 'quieter' }) },
  { kind: 'prefs.speech', re: rx('^(?:говори|читай) (?:погромче|громче)$|^погромче$'), slots: () => ({ op: 'louder' }) },
  { kind: 'prefs.speech', re: rx('^(?:замолчи|помолчи|молчи|хватит говорить)$'), slots: () => ({ op: 'stop' }) },
  { kind: 'prefs.speech', re: rx('^(?:говори|отвечай) только (?:текстом|письменно)$|^выключи голос$|^без голоса$'), slots: () => ({ op: 'textOnly' }) },
  { kind: 'prefs.speech', re: rx('^включи голос$|^говори голосом$|^верни голос$'), slots: () => ({ op: 'voiceOn' }) },
  { kind: 'prefs.speech', re: rx('^(?:включи )?режим диктора$|^включи диктора$'), slots: () => ({ op: 'narratorOn' }) },
  { kind: 'prefs.speech', re: rx('^(?:выключи|отключи) (?:режим )?диктора$|^без диктора$'), slots: () => ({ op: 'narratorOff' }) },
  { kind: 'prefs.speech', re: rx('^говори по английски когда я говорю по английски$|^отвечай на моем языке$'), slots: () => ({ op: 'autoLangOn' }) },
  { kind: 'prefs.speech', re: rx('^не меняй язык ответа$|^отвечай всегда на языке приложения$'), slots: () => ({ op: 'autoLangOff' }) },
  { kind: 'prefs.style', re: rx('^(?:говори|отвечай) (?:коротко|покороче)$|^покороче$'), slots: () => ({ style: 'brief' }) },
  { kind: 'prefs.style', re: rx('^(?:говори|отвечай) (?:подробнее|подробно)$|^подробнее$'), slots: () => ({ style: 'detailed' }) },
  { kind: 'prefs.style', re: rx('^(?:говори|отвечай) как обычно$'), slots: () => ({ style: 'normal' }) },
  { kind: 'prefs.style', re: rx('^будь строже$|^строже$'), slots: () => ({ tone: 'strict' }) },
  { kind: 'prefs.style', re: rx('^будь мягче$|^мягче$'), slots: () => ({ tone: 'soft' }) },
  { kind: 'prefs.style', re: rx('^называйся (.+)$|^тебя зовут (.+)$'), slots: (m) => ({ name: tidy(m[1] ?? m[2]) }) },
  { kind: 'prefs.style', re: rx('^не хвали меня$|^без похвалы$'), slots: () => ({ praise: false }) },
  { kind: 'prefs.style', re: rx('^хвали меня$'), slots: () => ({ praise: true }) },
  { kind: 'prefs.style', re: rx('^не озвучивай списки$|^списки только на экране$'), slots: () => ({ speakLists: false }) },
  { kind: 'prefs.style', re: rx('^озвучивай списки$|^читай списки вслух$'), slots: () => ({ speakLists: true }) },
  { kind: 'repeat', re: rx('^(?:повтори|повторите|еще раз|скажи еще раз|что ты сказал)$') },
  { kind: 'repeat', re: rx('^еще раз помедленнее$|^повтори помедленнее$'), slots: () => ({ slow: true }) },
  { kind: 'journal.show', re: rx('^что ты (?:сейчас )?(?:сделал|менял|изменил)$|^покажи журнал$|^журнал действий$') },
  { kind: 'undo', re: rx('^отмени (?:последние )?(\\d+) (?:действия|действий|команды|команд|изменения|изменений)$'), slots: (m) => ({ n: num(m[1]) }) },
  { kind: 'whatsnew', re: rx('^(?:что нового|чему ты научился|что ты нового умеешь|что нового в ассистенте)$') },
  { kind: 'howto', re: rx('^как (?:это )?(?:сказать|говорить|попросить)(?: про)? (.+)$'), slots: (m) => ({ mode: 'say', query: tidy(m[1]) }) },
  { kind: 'unexplored', re: rx('^что я (?:еще )?не пробовал(?:а)?$|^что еще (?:ты )?умеешь$|^чем я еще не пользовался$') },
);
const en = (...rules: Parameters<typeof add>) => add(...rules.map((r) => ({ ...r, lang: 'en' as const })));
en(
  { kind: 'prefs.alias.add', src: 'n', re: rx('^remember[: ]+(.+?) (?:means|is|as|=) (.+)$'), slots: (m) => ({ alias: strip(m[1]), target: strip(m[2]) }) },
  { kind: 'prefs.macro.add', over: ['task.add', 'habit.done'], src: 'raw', re: rx('^when i say [«"“]?([^»"”,]+?)[»"”]?[, ]+\\s*(.+)$'), slots: (m) => ({ trigger: strip(m[1]).toLowerCase(), phrases: splitPhrases(tidy(m[2]).toLowerCase()) }) },
  { kind: 'prefs.speech', re: rx('^(?:speak|talk) slower$|^slower$'), slots: () => ({ op: 'slower' }) },
  { kind: 'prefs.speech', re: rx('^(?:speak|talk) faster$|^faster$'), slots: () => ({ op: 'faster' }) },
  { kind: 'prefs.speech', re: rx('^(?:speak|talk) (?:quieter|softer)$|^quieter$'), slots: () => ({ op: 'quieter' }) },
  { kind: 'prefs.speech', re: rx('^(?:speak|talk) louder$|^louder$'), slots: () => ({ op: 'louder' }) },
  { kind: 'prefs.speech', re: rx('^(?:be quiet|shut up|stop talking|quiet)$'), slots: () => ({ op: 'stop' }) },
  { kind: 'prefs.speech', re: rx('^(?:speak|answer|reply) (?:in )?text only$|^turn off (?:the )?voice$|^no voice$'), slots: () => ({ op: 'textOnly' }) },
  { kind: 'prefs.speech', re: rx('^turn on (?:the )?voice$|^speak out loud$'), slots: () => ({ op: 'voiceOn' }) },
  { kind: 'prefs.speech', re: rx('^(?:turn on )?narrator mode$'), slots: () => ({ op: 'narratorOn' }) },
  { kind: 'prefs.speech', re: rx('^(?:turn off|disable) narrator mode$'), slots: () => ({ op: 'narratorOff' }) },
  { kind: 'prefs.speech', re: rx('^answer in the language i speak$|^reply in my language$'), slots: () => ({ op: 'autoLangOn' }) },
  { kind: 'prefs.style', re: rx('^(?:keep it short|be brief|short answers)$'), slots: () => ({ style: 'brief' }) },
  { kind: 'prefs.style', re: rx('^(?:more detail|be detailed|detailed answers)$'), slots: () => ({ style: 'detailed' }) },
  { kind: 'prefs.style', re: rx('^be (?:stricter|stronger|firmer)$'), slots: () => ({ tone: 'strict' }) },
  { kind: 'prefs.style', re: rx('^be (?:softer|gentler|kinder)$'), slots: () => ({ tone: 'soft' }) },
  { kind: 'prefs.style', re: rx('^(?:your name is|call yourself) (.+)$'), slots: (m) => ({ name: tidy(m[1]) }) },
  { kind: 'prefs.style', re: rx('^(?:do not|dont) praise me$|^no praise$'), slots: () => ({ praise: false }) },
  { kind: 'prefs.style', re: rx('^(?:do not|dont) read (?:out )?lists$|^lists on screen only$'), slots: () => ({ speakLists: false }) },
  { kind: 'repeat', re: rx('^(?:repeat|say that again|again|repeat that)$') },
  { kind: 'repeat', re: rx('^(?:repeat|say it) (?:that )?slower$|^again slower$'), slots: () => ({ slow: true }) },
  { kind: 'journal.show', re: rx('^what did you (?:just )?(?:do|change)$|^show (?:the )?(?:journal|log)$') },
  { kind: 'undo', re: rx('^undo (?:the )?(?:last )?(\\d+) (?:actions|things|changes|commands)$'), slots: (m) => ({ n: num(m[1]) }) },
  { kind: 'whatsnew', re: rx('^(?:what is new|whats new|what have you learned)$') },
  { kind: 'howto', re: rx('^how (?:do i|to|can i) say (.+)$|^how do i ask for (.+)$'), slots: (m) => ({ mode: 'say', query: tidy(m[1] ?? m[2]) }) },
  { kind: 'unexplored', re: rx('^what (?:have i not|haven t i|did i not) tried?$|^what haven t i tried$|^what else can you do$') },
);
