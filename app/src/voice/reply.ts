import type { Lang } from './stt/types';
import type { Reply } from './exec/types';

/*
 * Words the assistant says (ТЗ 6.13.6): short, calm, no reproach, no «надо / должен». The screen text and the spoken
 * text are separate fields. This file holds the shared pieces; each executor adds its own answers.
 * No «арка» in user-facing text — «сезон».
 */
const HEALTH = /(болит|боль\b|больно|температур|лекарств|таблетк[аи]? от|диагноз|давлени|простуд|похуд|диет|врач посовет|симптом|headache|fever|medicine|diagnos|symptom|lose weight|diet|pain)/i;
export const isHealthy = (text: string) => HEALTH.test(text);

export function oosReply(lang: Lang, examples: [string, string], text = ''): Reply {
  const [a, b] = examples;
  const medical = isHealthy(text);
  const ru = lang === 'ru';
  const base = ru
    ? `Не уверен, что это команда для VeyrArc. Могу отметить привычку, записать задачу, запустить фокус или рассказать про ваш день. Например: «${a}», «${b}».`
    : `I’m not sure that’s something I can do in VeyrArc. I can mark habits, add tasks, start focus or tell you about your day. For example: “${a}”, “${b}”.`;
  const screen = medical ? `${ru ? 'Я не даю медицинских советов.' : 'I can’t give medical advice.'} ${base}` : base;
  return { ok: false, kind: 'info', screen, speech: screen.length > 220 ? (ru ? 'Не уверен, что это команда. Подробности на экране.' : 'Not sure that’s a command. Details on screen.') : screen, chips: [{ label: a, say: a }, { label: b, say: b }] };
}

export function forbiddenReply(kind: string, lang: Lang): Reply {
  const ru = lang === 'ru';
  const screen = kind === 'account.delete'
    ? (ru ? 'Аккаунт голосом не удаляется. Это делается в Настройки → Аккаунт.' : 'The account can’t be deleted by voice. Do it in Settings → Account.')
    : (ru ? 'Это голосом не делается.' : 'That can’t be done by voice.');
  return { ok: false, kind: 'info', screen, speech: screen, nav: kind === 'account.delete' ? '/settings/account' : undefined };
}

export function lowReply(lang: Lang, examples: string[]): Reply {
  const ru = lang === 'ru';
  const screen = ru ? 'Не понял. Можно так:' : 'I didn’t catch that. You can say:';
  return { ok: false, kind: 'ask', screen, speech: ru ? 'Не понял. Можно сказать иначе.' : 'I didn’t catch that. Try another way.', chips: examples.slice(0, 3).map((x) => ({ label: x, say: x })) };
}
