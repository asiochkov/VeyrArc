import { DIRS, type DirId } from '../pages/auth/flow';
import type { IconName } from '../ui/Icon';
import { useLangStore } from '../i18n';
import { useAuth } from './auth';
import { takePendingAvatar } from './avatar';
import { db } from './supabase';

/* Onboarding answers → profile, habits and quits (stage 3). */

const HABIT_ICON: Record<Exclude<DirId, 'quit'>, IconName> = { body: 'drop', mind: 'doc', disc: 'sun', prod: 'target' };
const QUIT_ICON: Record<string, IconName> = { 'Без сахара': 'nosugar', 'Без соцсетей до сна': 'phone' };
/* per-chip icon and type (duration habits carry their minutes) */
const CHIP: Record<string, { icon: IconName; minutes?: number; counter?: number }> = {
  'Вода 8 стаканов': { icon: 'drop', counter: 8 }, 'Сон до 23:00': { icon: 'moon' }, 'Холодный душ': { icon: 'snow' }, 'Прогулка 30 мин': { icon: 'sun', minutes: 30 },
  'Чтение 20 мин': { icon: 'doc', minutes: 20 }, 'Медитация': { icon: 'lotus' }, 'Дневник': { icon: 'pencil' }, '10 новых слов': { icon: 'doc' },
  'Ранний подъём': { icon: 'sun' }, 'Заправить кровать': { icon: 'bedTracker' }, 'План на день': { icon: 'checklist' }, 'Без телефона утром': { icon: 'phone' },
  'Глубокая работа 90 мин': { icon: 'bolt', minutes: 90 }, 'Одна главная задача': { icon: 'target' }, 'Разбор входящих': { icon: 'mail' }, 'Итоги дня': { icon: 'clipboard' },
};
const HUE: Record<DirId, string> = { body: '#5B9BD5', mind: '#9B87D6', disc: '#E8A54B', prod: '#5FBF9B', quit: '#D96A5B' };

export type Created = Record<string, { kind: 'habit' | 'quit'; id: string }>;

export async function saveOnboarding(v: { name: string; habits: string[]; time: string; oath?: string }): Promise<Created> {
  const uid = useAuth.getState().session?.user.id;
  if (!uid) throw new Error('no session');
  const lang = useLangStore.getState().lang;
  const picked = DIRS.flatMap(([dir, list]) => list.filter((h) => v.habits.includes(h.ru)).map((h) => ({ dir, h })));
  const directions = [...new Set(picked.map((p) => p.dir))];

  const avatar = takePendingAvatar();
  const prof = await db().from('profiles').update({
    ...(avatar ? { avatar_url: avatar } : {}),
    first_name: v.name.trim() || null, lang, directions, reminder_time: v.time,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, onboarded_at: new Date().toISOString(),
  }).eq('id', uid);
  if (prof.error) throw prof.error;
  // the promise of the first arc (Master Changeset task 23)
  if (v.oath?.trim()) {
    const a = await db().from('arcs').update({ oath: v.oath.trim().slice(0, 200) }).eq('user_id', uid).is('ended_on', null);
    if (a.error) throw a.error;
  }

  const created: Created = {};
  const habits = picked.filter((p) => p.dir !== 'quit');
  if (habits.length) {
    // bulk inserts need the same keys on every row
    const rows = habits.map((p, i) => {
      const c = CHIP[p.h.ru];
      return {
        name: p.h[lang], category: p.dir, icon: c?.icon ?? HABIT_ICON[p.dir as Exclude<DirId, 'quit'>], hue: HUE[p.dir], sort: i,
        core: i < 5, // onboarding picks are the arc's Core habits (Free: up to 5)
        type: c?.counter ? 'counter' : c?.minutes ? 'duration' : 'binary', target: c?.counter ?? null,
        unit: c?.counter ? (lang === 'en' ? 'glasses' : 'стаканов') : null, minutes: c?.minutes ?? null,
      };
    });
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
