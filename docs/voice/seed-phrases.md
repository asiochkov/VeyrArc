# Приложение E. Стартовые фразы для золотого набора

(Источник: приложение к мастер-промпту голосового ассистента 2.0. Текст извлечён из PDF автоматически, без правок.)

Приложение E. Стартовые фразы для золотого набора
Это фразы-семена из стресс-тестов аудита (написаны аудитором, не реальные
данные пользователей). Перенеси их в tools/voice/golden/ с ожиданиями по
таĸсономии 6.6; проблемные случаи (ĸомментарии в ĸоде) пометь тегом regress .
E.1 stress.ts
import { understand } from './nlu';
const now = new Date(2026, 9, 28, 15, 0); // Wed 28 Oct 2026 15:00
type W = Record<string, unknown>;
const C: [string, string, W | W[]][] = [
// mood
['mood','настроение пять',{kind:'mood',level:4}],
['mood','сегодня настроение просто супер',{kind:'mood',level:4}],
['mood','что-то мне сегодня тревожно',{kind:'mood',level:1}],
['mood','день был не очень',{kind:'mood',level:1}],
['mood','чувствую себя отлично',{kind:'mood',level:4}],
// done
['done','отметь тренировку',{kind:'done',query:'тренировку'}],
['done','я сегодня уже позанимался английским',{kind:'done'}],
['done','прочитал тридцать страниц',{kind:'done'}],
['done','выпил три стакана воды',{kind:'done',amount:3}],
['done','сделал зарядку, выпил воды и почитал',[{kind:'done'},{kind:'done'},{kind:'done'}]],
['done','тренировка выполнена',{kind:'done'}],
['done','закончил отчёт',{kind:'done'}],
['done','медитировал двадцать минут',{kind:'done',minutes:20}],
['done','пробежал пять километров за сорок минут',{kind:'done'}],
['done','отметь все привычки',{kind:'done',query:'все'}],
['done','я позвонил маме',{kind:'done'}],
// tasks
['task','напомни завтра купить молоко',{kind:'taskAdd',day:'2026-10-29'}],
['task','в четверг в семь вечера встреча с Димой',{kind:'taskAdd',day:'2026-10-29',time:'19:
['task','запланируй стоматолога на следующий вторник в десять утра',{kind:'taskAdd',day:'202
['task','добавь в планер оплатить интернет до конца недели',{kind:'taskAdd'}],
--- page 86
['task','через полчаса позвонить в банк',{kind:'taskAdd',time:'15:30'}],
['task','завтра утром сходить в магазин',{kind:'taskAdd',day:'2026-10-29',time:'09:00'}],
['task','записаться к врачу на пятое ноября',{kind:'taskAdd',day:'2026-11-05'}],
['task','каждый понедельник созвон в десять',{kind:'taskAdd'}],
['task','напомни мне в субботу в два часа дня про день рождения',{kind:'taskAdd',day:'2026-1
['task','купить хлеб',{kind:'taskAdd'}],
['task','двадцать девятого в 12:30 обед с партнёрами',{kind:'taskAdd',time:'12:30'}],
['task','в половине пятого встреча',{kind:'taskAdd',time:'16:30'}],
['task','без пятнадцати шесть созвон',{kind:'taskAdd',time:'17:45'}],
['task','завтра в восемь тридцать зал',{kind:'taskAdd',day:'2026-10-29',time:'08:30'}],
// move/delete
['move','перенеси созвон на завтра на 11',{kind:'taskMove',day:'2026-10-29',time:'11:00'}],
['move','отложи всё на послезавтра',{kind:'taskMove',all:true,day:'2026-10-30'}],
['move','перенеси эту задачу на вечер',{kind:'taskMove'}],
['del','удали встречу с Димой',{kind:'taskDelete'}],
['del','отмени завтрашнюю встречу',{kind:'taskDelete'}],
// ask
['ask','что у меня на завтра',{kind:'ask',what:'planTomorrow'}],
['ask','сколько у меня осталось дел',{kind:'ask',what:'left'}],
['ask','какая у меня серия по бегу',{kind:'ask'}],
['ask','сколько я сегодня работал',{kind:'ask',what:'focusToday'}],
['ask','как у меня дела на этой неделе',{kind:'ask',what:'week'}],
['ask','когда у меня следующая встреча',{kind:'ask'}],
['ask','сколько дней я не курю',{kind:'ask'}],
['ask','какой у меня сейчас индекс',{kind:'ask',what:'progress'}],
['ask','что я не успел вчера',{kind:'ask'}],
['ask','во сколько у меня тренировка',{kind:'ask'}],
// focus
['focus','включи таймер на двадцать пять минут',{kind:'focus',op:'start',minutes:25}],
['focus','начни фокус на час',{kind:'focus',op:'start',minutes:60}],
['focus','останови таймер',{kind:'focus',op:'stop'}],
['focus','сколько осталось до конца фокуса',{kind:'ask'}],
// habits/goals mgmt
['mgmt','добавь привычку пить воду восемь стаканов',{kind:'habitAdd',target:8}],
['mgmt','удали привычку чтение',{kind:'habitDelete'}],
['mgmt','переименуй привычку зарядка в разминка',{kind:'habitRename'}],
['mgmt','поставь напоминание на девять вечера для медитации',{kind:'reminder'}],
['mgmt','заверши цель марафон',{kind:'goalDone'}],
['mgmt','смени тему на светлую',{kind:'settings'}],
['mgmt','создай цель накопить на машину',{kind:'goalAdd'}],
['mgmt','добавь отказ от сладкого',{kind:'quitAdd'}],
// follow-up context
['ctx','а на завтра?',{kind:'ask',what:'planTomorrow'}],
['ctx','перенеси её на пятницу',{kind:'taskMove'}],
['ctx','нет, на четверг',{kind:'x'}],
// STT noise
['noise','сделал за рядку',{kind:'done'}],
--- page 87
E.2 stress2.ts
['noise','отметь медитацию пожалуйста спасибо',{kind:'done'}],
['noise','Вейр отметь тренировка',{kind:'done'}],
['noise','настроение 4. задача позвонить маме',[{kind:'mood'},{kind:'taskAdd'}]],
['noise','ну это самое сделал короче зарядку',{kind:'done'}],
['noise','так, ну давай посмотрим что у меня сегодня по плану',{kind:'ask',what:'plan'}],
['noise','привет как мои дела',{kind:'ask'}],
['noise','я устал и ничего не хочу',{kind:'mood',level:1}],
['noise','посоветуй что мне сегодня сделать',{kind:'ask'}],
];
const by: Record<string,[number,number]> = {}; const fails: string[] = [];
for (const [cat, text, want] of C) {
const got = understand(text, now);
const wants = Array.isArray(want) ? want : [want];
const ok = wants.length === got.length && wants.every((w,i)=>Object.entries(w).every(([k,v]
by[cat] ??= [0,0]; by[cat][1]++; if (ok) by[cat][0]++; else fails.push(`✗ [${cat}] «${text}
}
let a=0,b=0; for (const [k,[x,y]] of Object.entries(by)) { console.log(k.padEnd(6), `${x}/${y
console.log('TOTAL', a, '/', b, ((a/b)*100).toFixed(0)+'%\n'+fails.join('\n'));
import { understand } from './nlu';
const now = new Date(2026, 9, 28, 15, 0);
// [category, phrase, expected kind(s) or 'SAFE' = must NOT write (guess/unknown/ask/help/cha
const WRITES = new Set(['taskAdd','taskMove','taskDelete','done','undone','habitAdd','goalAdd
const C: [string,string,string][] = [
// EN
['en','mark workout as done','done'],['en','i did my workout','done'],['en','add task call d
['en','what do i have today','ask'],['en','start a 25 minute focus','focus'],['en','how is m
['en','i feel terrible','mood'],['en','open my goals','nav'],['en','create a habit reading 2
['en','remind me to drink water at 5','taskAdd'],['en','what\'s next','ask'],['en','i smoked
// informal / long / compound RU
['ru','слушай ну я сегодня утром сходил в зал потом выпил воды и ещё почитал немного','done'
['ru','добавь в планер завтра в девять утра зарядка а потом в десять созвон с командой','tas
['ru','отметь что я сегодня позанимался и поставь настроение хорошее','done'],
['ru','запиши мне на субботу поездку на дачу','taskAdd'],
['ru','напомни мне через два часа выпить таблетки','taskAdd'],
['ru','поставь будильник на семь','SAFE'],
['ru','включи музыку','SAFE'],
['ru','позвони маме','SAFE'],
['ru','сколько будет двадцать на пять','SAFE'],
['ru','расскажи как мотивировать себя','SAFE'],
['ru','что мне делать если я устал','SAFE'],
['ru','у меня болит голова','SAFE'],
['ru','я хочу пойти спать','SAFE'],
['ru','нужно ли мне сегодня тренироваться','SAFE'],
--- page 88
['ru','как лучше спланировать неделю','SAFE'],
['ru','почему у меня сбилась серия','SAFE'],
['ru','надо бы чаще гулять','SAFE'],
['ru','я не хочу сегодня ничего делать','SAFE'],
['ru','что такое помодоро','SAFE'],
['ru','кто ты','SAFE'],
['ru','спасибо тебе большое ты очень помог','SAFE'],
['ru','мне нужно подумать','SAFE'],
['ru','хочу чтобы ты напомнил про тренировку','taskAdd'],
['ru','отмени всё','SAFE'],
['ru','удали всё','SAFE'],
['ru','сотри все задачи','taskDelete'],
['ru','не надо','SAFE'],
['ru','нет не то','SAFE'],
['ru','ага','SAFE'],
['ru','стоп','SAFE'],
// STT-style errors (homophones, wrong splits, numerals)
['stt','сделал заряд ку','done'],['stt','отметь мидитацию','done'],['stt','настроение четыре
['stt','фокус двадцать пять минут','focus'],['stt','завтра в 9 утра стамотолог','taskAdd'],[
['stt','отметь тренеровку','done'],['stt','выпил 2 стакан воды','done'],['stt','перенеси вст
['stt','создай привычку читать по 30 минут','habitAdd'],['stt','сегодня я чувствую себя норм
// numbers & time edge
['time','завтра в 0:30 встреча','taskAdd'],['time','послезавтра в 6 вечера ужин','taskAdd'],
['time','через 10 минут позвонить','taskAdd'],['time','с 9 до 11 работа над проектом','taskA
['time','в конце месяца отчёт','taskAdd'],['time','через две недели визит к врачу','taskAdd'
];
const by: Record<string,[number,number]> = {}; const fails: string[] = []; let silentWrites =
for (const [cat,text,want] of C) {
const got = understand(text, now); const kinds = got.map(g=>g.kind);
let ok: boolean;
if (want==='SAFE') { ok = !kinds.some(k=>WRITES.has(k)); if(!ok) silentWrites++; } else ok
by[cat]??=[0,0]; by[cat][1]++; if(ok) by[cat][0]++; else fails.push(`✗ [${cat}] «${text}» w
}
let a=0,b=0; for (const [k,[x,y]] of Object.entries(by)){console.log(k.padEnd(5),`${x}/${y}`)
console.log('TOTAL',a,'/',b,((a/b)*100).toFixed(0)+'%','| silent wrong writes on out-of-scope
