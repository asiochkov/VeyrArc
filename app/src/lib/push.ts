import { useLangStore } from '../i18n';
import { useAuth } from './auth';
import { db, hasBackend } from './supabase';

/*
 * Web push (UX audit 3.6): the device subscribes once notifications are allowed;
 * the server (Edge Function push-reminders, every 15 min) sends reminders even when
 * the app is closed. iOS delivers web push only to the app added to the home screen.
 */
const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

const b64ToBytes = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export async function subscribePush() {
  if (!hasBackend || !VAPID || !('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  if (Notification.permission !== 'granted' || !useAuth.getState().session) return false;
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID) }));
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const r = await db().from('push_subscriptions').upsert(
    { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, lang: useLangStore.getState().lang },
    { onConflict: 'endpoint' },
  );
  return !r.error;
}

/** App opened: remember the visit (for the «3 дня тишины» reminder) and refresh the subscription. */
export function onAppOpen() {
  if (!hasBackend) return;
  void db().rpc('touch_last_seen').then(() => {}, () => {});
  void subscribePush().catch(() => false);
}
