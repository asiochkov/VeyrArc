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

/*
 * Home-screen app on iOS: the viewport can come out shorter than the screen by the status-bar
 * height (translucent status bar), leaving a strip under the bottom bar. In standalone mode the
 * app is always full-screen, so the shell takes the real screen height instead.
 */
export function fitStandaloneHeight() {
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  // iOS only: on Android screen.height includes the system bars
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!standalone || !ios) return;
  const apply = () => {
    const portrait = window.innerHeight >= window.innerWidth;
    // iOS reports screen size in portrait regardless of rotation
    const full = portrait ? Math.max(screen.height, screen.width) : Math.min(screen.height, screen.width);
    document.documentElement.style.setProperty('--app-h', Math.max(full, window.innerHeight) + 'px');
    document.documentElement.setAttribute('data-fit-screen', '');
  };
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', () => setTimeout(apply, 300));
}
