import type { Parsed } from '../types';
import type { Lang } from '../../stt/types';

/* short questions and previews for the decision (ТЗ 6.7.4); the reply layer dresses them up */
const SLOT_RU: Record<string, string> = { time: 'На какое время?', day: 'На какой день?', query: 'Что именно?', title: 'Как назвать?', amount: 'Сколько?', level: 'Какое настроение, от 1 до 5?', minutes: 'Сколько минут?', seconds: 'На сколько?', page: 'Куда перейти?', value: 'Какое значение?' };
const SLOT_EN: Record<string, string> = { time: 'What time?', day: 'Which day?', query: 'Which one?', title: 'What should I call it?', amount: 'How many?', level: 'What mood, 1 to 5?', minutes: 'How many minutes?', seconds: 'For how long?', page: 'Where to?', value: 'Which value?' };

export const askText = (lang: Lang) => (_p: Parsed, slot: string) => (lang === 'ru' ? SLOT_RU : SLOT_EN)[slot] ?? (lang === 'ru' ? 'Уточните, пожалуйста' : 'Could you be more specific?');
export const previewText = (lang: Lang) => (p: Parsed) => {
  const what = [p.slots.title, p.slots.query, p.slots.text, p.slots.to].find((x) => typeof x === 'string' && x) as string | undefined;
  return lang === 'ru' ? `Выполнить: ${p.kind}${what ? ` «${what}»` : ''}?` : `Do: ${p.kind}${what ? ` “${what}”` : ''}?`;
};
export const clarifyText = (lang: Lang) => (o: Parsed[]) => (lang === 'ru' ? `Что именно сделать: ${o.map((x) => x.kind).join(' или ')}?` : `Which one: ${o.map((x) => x.kind).join(' or ')}?`);
export const examples = (lang: Lang) => () => (lang === 'ru' ? ['сделал зарядку', 'что у меня сегодня'] : ['done workout', 'what do i have today']);
