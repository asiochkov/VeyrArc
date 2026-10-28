import { addDays } from '../../data/model';
import { isoDay } from '../../lib/day';
import { getSystem } from '../../state/system';
import { useLangStore } from '../../i18n';
import type { ParseEnv } from '../nlp/types';

const lang = () => useLangStore.getState().lang as 'ru' | 'en';

/** what the parser may know about the person, from the live data */
export function envFromSystem(l: 'ru' | 'en' = lang(), now = new Date()): ParseEnv {
  const sys = getSystem();
  const today = isoDay(now);
  const goals = (sys?.goals ?? []).filter((g) => g.status === 'active');
  return {
    now, lang: l,
    habits: (sys?.habits ?? []).filter((h) => !h.archived_at).map((h) => ({ id: h.id, name: h.name, core: h.core, type: h.type, target: h.target, unit: h.unit, minutes: h.minutes, days: h.days, category: h.category })),
    tasks: (sys?.plan ?? []).filter((p) => p.day >= addDays(today, -1) && p.day <= addDays(today, 30)).map((p) => ({ id: p.id, title: p.title, day: p.day, time: p.starts_at, end: p.ends_at, done: p.done })),
    goals: goals.map((g) => ({ id: g.id, title: g.title, deadline: (g as { deadline?: string | null }).deadline ?? null, steps: (sys?.tasks ?? []).filter((t) => t.goal_id === g.id).map((t) => (t as { text?: string }).text ?? '') })),
    quits: (sys?.quits ?? []).map((q) => ({ id: q.id, name: q.name })),
  };
}

