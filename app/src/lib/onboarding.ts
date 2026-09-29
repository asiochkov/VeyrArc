import { DIRS, type DirId } from '../pages/auth/flow';
import type { IconName } from '../ui/Icon';
import { useLangStore } from '../i18n';
import { useAuth } from './auth';
import { isoDay } from './day';
import { db } from './supabase';

/* Onboarding answers → profile, habits and quits (stage 3). */

const HABIT_ICON: Record<Exclude<DirId, 'quit'>, IconName> = { body: 'drop', mind: 'doc', disc: 'sun', prod: 'target' };
const QUIT_ICON: Record<string, IconName> = { 'Без сахара': 'nosugar', 'Без соцсетей до сна': 'phone' };
const HUE: Record<DirId, string> = { body: '#5B9BD5', mind: '#9B87D6', disc: '#E8A54B', prod: '#5FBF9B', quit: '#D96A5B' };

export type Created = Record<string, { kind: 'habit' | 'quit'; id: string }>;

export async function saveOnboarding(v: { name: string; habits: string[]; time: string }): Promise<Created> {
  const uid = useAuth.getState().session?.user.id;
  if (!uid) throw new Error('no session');
  const lang = useLangStore.getState().lang;
  const picked = DIRS.flatMap(([dir, list]) => list.filter((h) => v.habits.includes(h.ru)).map((h) => ({ dir, h })));
  const directions = [...new Set(picked.map((p) => p.dir))];

  const prof = await db().from('profiles').update({
    first_name: v.name.trim() || null, lang, directions, reminder_time: v.time,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, onboarded_at: new Date().toISOString(),
  }).eq('id', uid);
  if (prof.error) throw prof.error;

  const created: Created = {};
  const habits = picked.filter((p) => p.dir !== 'quit');
  if (habits.length) {
    const rows = habits.map((p, i) => ({
      name: p.h[lang], category: p.dir, icon: HABIT_ICON[p.dir as Exclude<DirId, 'quit'>], hue: HUE[p.dir], sort: i,
      ...(p.h.ru === 'Вода 8 стаканов' ? { type: 'counter', target: 8 } : {}),
    }));
    const r = await db().from('habits').insert(rows).select('id');
    if (r.error) throw r.error;
    r.data.forEach((row, i) => { created[habits[i].h.ru] = { kind: 'habit', id: row.id }; });
  }
  const quits = picked.filter((p) => p.dir === 'quit');
  if (quits.length) {
    const r = await db().from('quits').insert(quits.map((p) => ({ name: p.h[lang], icon: QUIT_ICON[p.h.ru] ?? 'ban', hue: HUE.quit }))).select('id');
    if (r.error) throw r.error;
    r.data.forEach((row, i) => { created[quits[i].h.ru] = { kind: 'quit', id: row.id }; });
  }
  await useAuth.getState().loadProfile();
  return created;
}

/** First check-ins on the "first home" screen. */
export async function setHabitDone(habitId: string, done: boolean) {
  const day = isoDay();
  const r = done
    ? await db().from('habit_logs').upsert({ habit_id: habitId, day, value: 1, done: true })
    : await db().from('habit_logs').delete().eq('habit_id', habitId).eq('day', day);
  if (r.error) throw r.error;
}
