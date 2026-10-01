import { useQuery } from '@tanstack/react-query';
import type { T } from '../i18n';
import { useAuth } from '../lib/auth';
import { db, hasBackend } from '../lib/supabase';
import type { IconName } from '../ui/Icon';

/* The activity feed (Master Changeset task 26): rows written by database triggers, newest first. */
export type SysEvent = { id: number; at: string; domain: string; action: string; meta: Record<string, unknown> };
export const EVENTS_KEY = ['events'] as const;

async function fetchEvents(): Promise<SysEvent[]> {
  const r = await db().from('system_events').select('id, at, domain, action, meta').order('at', { ascending: false }).limit(40);
  if (r.error) throw r.error;
  return r.data as SysEvent[];
}

const ago = (m: number) => m * 60_000;
const MOCK: SysEvent[] = [
  { id: 3, at: new Date(Date.now() - ago(12)).toISOString(), domain: 'habit', action: 'done', meta: { name: 'Чтение 20 мин' } },
  { id: 2, at: new Date(Date.now() - ago(95)).toISOString(), domain: 'focus', action: 'session', meta: { minutes: 25 } },
  { id: 1, at: new Date(Date.now() - ago(60 * 20)).toISOString(), domain: 'mood', action: 'set', meta: { level: 4 } },
];

export function useEvents() {
  const session = useAuth((x) => x.session);
  return useQuery({ queryKey: EVENTS_KEY, queryFn: hasBackend ? fetchEvents : async () => MOCK, enabled: !hasBackend || !!session, staleTime: 15_000 });
}

export const EVENT_ICON: Record<string, IconName> = { habit: 'check', focus: 'bolt', planner: 'cal', goal: 'target', mood: 'spark', freeze: 'snowSm', quit: 'banProfile', arc: 'snow' };

/** One line of text for an event. */
export function eventText(t: T, e: SysEvent) {
  const m = e.meta as Record<string, string | number | boolean | undefined>;
  const x = String(m.name ?? m.title ?? '');
  const key = `events.${e.domain}.${e.action}`;
  return t(key as never, { x, n: Number(m.minutes ?? m.level ?? m.number ?? 0) });
}

/** «5 мин назад», «3 ч назад», «вчера», date. */
export function eventWhen(t: T, iso: string) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return t('events.now');
  if (min < 60) return t('events.minAgo', { n: min });
  if (min < 60 * 24) return t('events.hAgo', { n: Math.round(min / 60) });
  if (min < 60 * 48) return t('events.yesterday');
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
