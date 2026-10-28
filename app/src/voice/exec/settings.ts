import { setProfile, exportData } from '../../data/settings';
import { config } from '../../config';
import { useLangStore } from '../../i18n';
import { useAuth } from '../../lib/auth';
import { useDensity } from '../../lib/density';
import { pushStatus } from '../../lib/reminders';
import { referralLink } from '../../lib/referral';
import { useTheme, type Theme } from '../../lib/theme';
import { systemClient } from '../../state/system';
import { toast } from '../../ui/toast';
import { dialog } from '../dialog/context';
import { usePrefs } from '../prefs';
import { R } from '../reply';
import { store } from '../store';
import { register, type ExecCtx } from './index';
import type { Chip, Reply } from './types';

/* WP5.10 — settings, account, plan information, support (catalog 84–91, 217–224). Everything here is a setting the person could change by hand. */
const VERSION = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';

register('settings.theme', (p, c) => {
  const v = String(p.slots.value ?? '');
  const to: Theme | null = v === 'light' || v === 'dark' || v === 'system' ? v : null;
  if (!to) return R.error(c.ru ? 'Тёмную или светлую?' : 'Dark or light?');
  const prev = useTheme.getState().theme;
  if (prev === to) return R.info(c.ru ? 'Эта тема уже включена' : 'That theme is already on');
  useTheme.getState().setTheme(to);
  return R.done(c.ru ? `Включил ${to === 'light' ? 'светлую' : to === 'dark' ? 'тёмную' : 'системную'} тему` : `Switched to the ${to} theme`, { undo: [{ t: 'ui', key: 'theme', prev }] });
});
register('settings.density', (p, c) => {
  const to = p.slots.value === 'compact' ? 'compact' : p.slots.value === 'comfortable' ? 'comfortable' : null;
  if (!to) return R.error(c.ru ? 'Компактнее или просторнее?' : 'Compact or comfortable?');
  const prev = useDensity.getState().density;
  if (prev === to) return R.info(c.ru ? 'Так уже настроено' : 'Already set that way');
  useDensity.getState().set(to);
  return R.done(c.ru ? `Интерфейс стал ${to === 'compact' ? 'компактнее' : 'просторнее'}` : `The interface is now ${to}`, { undo: [{ t: 'ui', key: 'density', prev }] });
});
register('settings.lang', (p, c) => {
  const to = p.slots.value === 'ru' || p.slots.value === 'en' ? p.slots.value : null;
  if (!to) return R.error(c.ru ? 'Русский или английский?' : 'Russian or English?');
  const prev = useLangStore.getState().lang;
  if (prev === to) return R.info(c.ru ? 'Этот язык уже включён' : 'That language is already on');
  useLangStore.getState().setLang(to);
  return R.done(to === 'ru' ? 'Включил русский язык' : 'Switched to English', { undo: [{ t: 'ui', key: 'lang', prev }] });
});

register('settings.reminder', (p, c) => {
  const time = String(p.slots.time ?? '');
  if (!/^\d{2}:\d{2}$/.test(time)) return R.error(c.ru ? 'Во сколько напоминать?' : 'What time?');
  const pr = useAuth.getState().profile;
  const prev = { reminder_time: pr?.reminder_time ?? null, notify_habits: pr?.notify_habits ?? false };
  setProfile({ reminder_time: time, notify_habits: true });
  const st = pushStatus();
  const tail = st === 'granted' ? '' : st === 'home' ? (c.ru ? '. На iPhone напоминания работают из установленного приложения: «Поделиться → На экран “Домой”»' : '. On iPhone reminders need the installed app: Share → Add to Home Screen') : (c.ru ? '. Разрешите уведомления в настройках, иначе они не придут' : '. Allow notifications, or they will not arrive');
  return R.done(c.ru ? `Напомню о привычках в ${time}${tail}` : `I will remind you about habits at ${time}${tail}`, { undo: [{ t: 'profile', prev }] });
});
register('settings.quiet', (p, c) => {
  const from = String(p.slots.from ?? ''), to = String(p.slots.to ?? '');
  if (!/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to)) return R.error(c.ru ? 'С какого часа и до какого?' : 'From when until when?');
  const prev = usePrefs.getState().quiet;
  usePrefs.getState().set({ quiet: { from, to } });
  return R.done(c.ru ? `Не буду беспокоить с ${from} до ${to}. Это работает для напоминаний на этом устройстве` : `No reminders from ${from} to ${to} on this device`, { undo: [{ t: 'prefs', key: 'quiet', prev }] });
});
register('settings.notifyOff', (_p, c) => {
  const st = pushStatus();
  const how = c.ru
    ? 'Разрешение на уведомления снимается только в настройках телефона: Настройки → Уведомления → VeyrArc. Из приложения его не отключить'
    : 'Permission can only be taken back in your phone settings: Settings → Notifications → VeyrArc. The app cannot switch it off';
  const chips: Chip[] = [{ label: c.ru ? 'Открыть настройки' : 'Open settings', run: () => ({ ...R.done(c.ru ? 'Открываю настройки' : 'Opening settings'), nav: '/settings', close: true }) }];
  return R.info(`${st === 'granted' ? '' : c.ru ? 'Уведомления и так не включены. ' : 'Notifications are not on. '}${how}`, { chips });
});

register('referral.share', (_p, c) => {
  const qc = systemClient();
  const uid = useAuth.getState().session?.user.id;
  const ref = qc?.getQueryData<{ code: string }>(['referral', uid]);
  if (!ref?.code) return { ...R.info(c.ru ? 'Ссылка-приглашение лежит в Настройках — открываю' : 'Your invite link is in Settings — opening it'), nav: '/settings', close: true };
  const link = referralLink(ref.code);
  const run = (): Reply => {
    try {
      if (typeof navigator.share === 'function') void navigator.share({ title: 'VeyrArc', url: link }).catch(() => {});
      else void navigator.clipboard?.writeText(link);
      return R.done(typeof navigator.share === 'function' ? (c.ru ? 'Открыл «Поделиться»' : 'Share sheet is open') : (c.ru ? 'Скопировал ссылку' : 'Link copied'));
    } catch { return R.error(c.ru ? 'Не получилось поделиться' : 'Could not share'); }
  };
  return R.answer(c.ru ? 'Ваша ссылка-приглашение готова' : 'Your invite link is ready', { list: [link.replace(/^https?:\/\//, '')], chips: [{ label: c.ru ? 'Поделиться' : 'Share', run }] });
});
register('export.data', (_p, c) => {
  void exportData().then(() => toast.success(c.ru ? 'Файл с данными готов' : 'Your data file is ready')).catch(() => toast.error(c.ru ? 'Не получилось выгрузить данные' : 'Could not export your data'));
  return R.done(c.ru ? 'Готовлю файл со всеми вашими данными' : 'Preparing a file with all your data');
});

register('profile.name', (p, c) => {
  const name = String(p.slots.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 30);
  if (!name) return R.error(c.ru ? 'Как к вам обращаться?' : 'What should I call you?');
  const pr = useAuth.getState().profile;
  const nice = name.charAt(0).toUpperCase() + name.slice(1);
  if (!pr) return R.error(c.ru ? 'Сначала войдите в аккаунт' : 'Sign in first');
  setProfile({ nickname: nice });
  return R.done(c.ru ? `Хорошо, буду называть вас ${nice}` : `Okay, I will call you ${nice}`, { undo: [{ t: 'profile', prev: { nickname: pr.nickname } }] });
});

/* ── the plan, honestly: the product is free ── */
register('info.plan', (p, c) => {
  const what = String(p.slots.what ?? 'plan');
  const free = config.beta;
  if (what === 'limits') {
    return R.answer(free
      ? (c.ru ? 'Лимитов нет: привычек, главных привычек и целей можно заводить сколько нужно — сейчас VeyrArc полностью бесплатен' : 'There are no limits: habits, core habits and goals are unlimited — VeyrArc is fully free right now')
      : (c.ru ? `Бесплатно: главных привычек до ${config.limits.free.core}, целей до ${config.limits.free.goals}, остальных привычек сколько угодно` : `Free: up to ${config.limits.free.core} core habits and ${config.limits.free.goals} goals; any number of other habits`));
  }
  if (what === 'pro') {
    return R.answer(free
      ? (c.ru ? 'Сейчас всё, что есть в VeyrArc, доступно бесплатно — отдельного платного тарифа нет' : 'Everything in VeyrArc is free right now — there is no paid plan')
      : (c.ru ? 'Pro снимает лимиты на главные привычки и цели. Подробности — на экране тарифов' : 'Pro lifts the limits on core habits and goals. Details are on the plans screen'), free ? undefined : { chips: [{ label: c.ru ? 'Открыть тарифы' : 'Open plans', run: () => ({ ...R.done(c.ru ? 'Открываю' : 'Opening'), nav: '/pro', close: true }) }] });
  }
  const pl = useAuth.getState().plan;
  return R.answer(free
    ? (c.ru ? 'У вас всё открыто: VeyrArc сейчас полностью бесплатен' : 'Everything is open to you: VeyrArc is fully free right now')
    : pl?.plan === 'pro' ? (c.ru ? 'У вас Pro' : 'You are on Pro') : (c.ru ? 'У вас бесплатный тариф' : 'You are on the free plan'));
});

/* ── support: a letter written on tap (a mail app opens only from a tap), and a local list of misunderstandings ── */
type Wrong = { at: string; text: string; kind: string | null; answer: string };
const mailto = (subject: string, body: string) => `mailto:${config.site.support}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
const openMail = (url: string, c: ExecCtx): Reply => {
  try { window.location.href = url; return R.done(c.ru ? 'Открыл письмо в поддержку' : 'Opened a letter to support'); } catch { return R.error(c.ru ? `Не получилось открыть почту. Напишите на ${config.site.support}` : `Could not open mail. Write to ${config.site.support}`); }
};
register('support.report', (_p, c) => {
  const ex = dialog.get().exchange;
  const share = usePrefs.getState().shareText;
  const body = [
    c.ru ? 'Опишите, что пошло не так:\n\n' : 'Describe what went wrong:\n\n',
    ex ? (share ? `${c.ru ? 'Последняя команда' : 'Last command'}: ${ex.text}\n${c.ru ? 'Как поняли' : 'Understood as'}: ${ex.kind ?? '—'}\n${c.ru ? 'Ответ' : 'Answer'}: ${ex.screen}\n` : (c.ru ? 'Текст последней команды не приложен (вы не разрешили в настройках голоса)\n' : 'The last command text is not attached (not allowed in voice settings)\n')) : '',
    `${c.ru ? 'Версия' : 'Version'}: ${VERSION}\n`,
  ].join('');
  return R.answer(c.ru ? 'Подготовил письмо в поддержку. Нажмите, чтобы открыть почту' : 'A letter to support is ready. Tap to open your mail', { chips: [{ label: c.ru ? 'Открыть письмо' : 'Open the letter', run: () => openMail(mailto(c.ru ? 'Ошибка в VeyrArc' : 'A problem in VeyrArc', body), c) }] });
});
register('support.idea', (_p, c) => R.answer(c.ru ? 'Подготовил пустое письмо для идеи' : 'An empty letter for your idea is ready', { chips: [{ label: c.ru ? 'Открыть письмо' : 'Open the letter', run: () => openMail(mailto(c.ru ? 'Идея для VeyrArc' : 'An idea for VeyrArc', c.ru ? 'Моя идея:\n\n' : 'My idea:\n\n'), c) }] }));
register('feedback.wrong', (_p, c) => {
  const ex = dialog.get().exchange;
  if (!ex) return R.info(c.ru ? 'Пока нечего отмечать — скажите команду, а потом «это ошибка»' : 'Nothing to mark yet — say a command first, then “that is wrong”');
  store.update<Wrong[]>('wrong', [], (l) => store.trim([...l, { at: new Date().toISOString(), text: ex.text, kind: ex.kind ?? null, answer: ex.screen.slice(0, 200) }], 50));
  return R.done(c.ru ? 'Запомнил фразу и ответ на этом устройстве — спасибо. Список можно выгрузить в Настройках голоса' : 'Saved the phrase and the answer on this device — thank you. The list can be exported in the voice settings');
});
