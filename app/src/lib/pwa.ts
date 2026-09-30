import { registerSW } from 'virtual:pwa-register';

/*
 * Keeps the installed app on the latest release: an iOS home-screen app is usually resumed, not
 * relaunched, so the service worker is asked for an update every time the app comes to the
 * foreground (and hourly). A new version activates at once and the page reloads into it.
 */
export function startPwa() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => { if (navigator.onLine) void reg.update().catch(() => {}); };
      document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
      setInterval(check, 60 * 60 * 1000);
    },
  });
}
