import type { QueryClient } from '@tanstack/react-query';
import { buildToday } from '../data/today';
import { fetchSystem, SYSTEM_KEY, todayRawOf } from '../state/system';
import { translate, useLangStore } from '../i18n';
import { useAuth } from './auth';
import { isoDay } from './day';

/*
 * Local notifications (stage 6): shown while the app is open or installed as a PWA.
 *  - «Напоминания о привычках»: at the reminder time from onboarding, if habits are left;
 *  - «Pomodoro»: when a focus session ends.
 * Reminders with the app fully closed need web push from the server (later).
 */
export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;

export async function askPermission() {
  if (!notificationsSupported()) return false;
  const ok = Notification.permission === 'granted' || (await Notification.requestPermission()) === 'granted';
  if (ok) void import('./push').then((m) => m.subscribePush()).catch(() => {});
  return ok;
}

async function show(title: string, body: string, tag: string) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
  if (reg) await reg.showNotification(title, { body, tag, icon: '/icon-192.png', badge: '/icon-192.png' });
  else new Notification(title, { body, tag, icon: '/icon-192.png' });
}

export function notifyFocusDone() {
  if (useAuth.getState().profile?.notify_focus === false) return;
  const lang = useLangStore.getState().lang;
  void show(translate(lang, 'notif.focusTitle' as never), translate(lang, 'notif.focusBody' as never), 'focus');
}

const KEY = 'ww.reminded';
export function startReminders(qc: QueryClient) {
  const tick = async () => {
    const p = useAuth.getState().profile;
    if (!p?.notify_habits || !p.reminder_time) return;
    const now = new Date();
    const hm = now.toTimeString().slice(0, 5);
    const today = isoDay(now);
    let last: string | null = null;
    try { last = localStorage.getItem(KEY); } catch { /* storage off */ }
    if (hm < p.reminder_time.slice(0, 5) || last === today) return;
    const sys = await qc.fetchQuery({ queryKey: SYSTEM_KEY, queryFn: fetchSystem, staleTime: 60_000 });
    const left = buildToday(todayRawOf(sys), { initials: '', freezesAllowed: 1 }).habits.filter((h) =>
      h.type === 'counter' ? h.count < h.goal : h.type === 'duration' ? h.left > 0 : !h.checked).length;
    try { localStorage.setItem(KEY, today); } catch { /* storage off */ }
    if (!left) return;
    const lang = useLangStore.getState().lang;
    void show(translate(lang, 'notif.habitsTitle' as never), translate(lang, 'notif.habitsBody' as never, { n: left }), 'habits');
  };
  void tick();
  const id = setInterval(() => { void tick(); }, 60_000);
  return () => clearInterval(id);
}
