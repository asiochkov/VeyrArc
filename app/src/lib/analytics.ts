
/* Optional product analytics through VITE_METRIKA_ID. No database writes and no
 * dependency on an app_events table. Never blocks the app. */
const METRIKA = import.meta.env.VITE_METRIKA_ID as string | undefined;
type Props = Record<string, string | number | boolean | null>;
const once = new Set<string>();

export function track(name: string, props: Props = {}) {
  try {
    if (METRIKA && typeof window !== 'undefined') (window as unknown as { ym?: (...a: unknown[]) => void }).ym?.(Number(METRIKA), 'reachGoal', name, props);
  } catch { /* analytics must never break the app */ }
}

/** at most once per key (this tab) — for moments that re-render */
export function trackOnce(key: string, name: string, props: Props = {}) {
  if (once.has(key)) return;
  once.add(key);
  track(name, props);
}

/** per device and key, forever (first_check…); storage failure = fire again, harmless */
export function trackEver(key: string, name: string, props: Props = {}) {
  try { if (localStorage.getItem('veyrarc.ev.' + key)) return; localStorage.setItem('veyrarc.ev.' + key, '1'); } catch { /* no storage */ }
  track(name, props);
}

/** Yandex Metrika (optional): a standard loader, no session replay, no webvisor */
export function initMetrika() {
  if (!METRIKA || typeof document === 'undefined') return;
  const w = window as unknown as { ym?: ((...a: unknown[]) => void) & { a?: unknown[] }; };
  if (w.ym) return;
  const ym = function (...a: unknown[]) { (ym.a = ym.a || []).push(a); } as ((...a: unknown[]) => void) & { a?: unknown[]; l?: number };
  ym.l = Date.now(); w.ym = ym;
  const s = document.createElement('script'); s.async = true; s.src = 'https://mc.yandex.ru/metrika/tag.js'; document.head.appendChild(s);
  ym(Number(METRIKA), 'init', { clickmap: false, trackLinks: true, accurateTrackBounce: true, webvisor: false, defer: true });
}

/** landed from a push (?from=push&k=kind): count it and clean the address */
export function capturePushOpen() {
  try {
    const u = new URL(window.location.href);
    if (u.searchParams.get('from') !== 'push') return;
    const k = u.searchParams.get('k') ?? 'unknown';
    sessionStorage.setItem('veyrarc.pushOpen', k);
    u.searchParams.delete('from'); u.searchParams.delete('k');
    window.history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
  } catch { /* ignore */ }
}
/** after sign-in: report the push open that was remembered */
export function flushPushOpen() {
  try { const k = sessionStorage.getItem('veyrarc.pushOpen'); if (k) { sessionStorage.removeItem('veyrarc.pushOpen'); track('push_open', { k }); } } catch { /* ignore */ }
}
