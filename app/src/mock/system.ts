import { isoDay } from '../lib/day';
import { addDays } from '../data/model';
import type { SystemRaw } from '../state/system';

/* Design preview (no backend): a believable week of data in the same shape as the real system state. */
export function mockSystem(): SystemRaw {
  const day = isoDay();
  const created = addDays(day, -20) + 'T08:00:00Z';
  const h = (id: string, name: string, icon: string, category: 'body' | 'mind' | 'disc' | 'prod', core: boolean, extra: Partial<SystemRaw['habits'][number]> = {}) => ({
    id, name, icon, hue: '#6FA0D6', type: 'binary' as const, target: null, unit: null, minutes: null, days: 127,
    category, core, sort: 0, created_at: created, archived_at: null, ...extra,
  });
  const habits = [
    h('rise', 'Ранний подъём', 'sun', 'disc', true),
    h('water', 'Вода 8 стаканов', 'drop', 'body', true, { type: 'counter', target: 8, unit: 'стаканов' }),
    h('read', 'Чтение 20 мин', 'doc', 'mind', true, { type: 'duration', minutes: 20 }),
    h('cold', 'Холодный душ', 'snow', 'body', false),
    h('plan', 'План на день', 'checklist', 'prod', false, { days: 31 }),
  ];
  const logs: SystemRaw['logs'] = [];
  for (let i = 1; i <= 13; i++) {
    const d = addDays(day, -i);
    if (i === 4) continue; // one missed day
    logs.push({ habit_id: 'rise', day: d, value: 1, done: true }, { habit_id: 'water', day: d, value: 8, done: true }, { habit_id: 'read', day: d, value: 20, done: true });
    if (i % 2) logs.push({ habit_id: 'cold', day: d, value: 1, done: true });
  }
  logs.push({ habit_id: 'rise', day, value: 1, done: true }, { habit_id: 'water', day, value: 3, done: false });
  const at = (d: string, hh: number) => new Date(`${d}T${String(hh).padStart(2, '0')}:00:00`).toISOString();
  return {
    day, habits, logs,
    days: [{ day: addDays(day, -2), mood: 4, water: 0, frozen: false }, { day: addDays(day, -4), mood: null, water: 0, frozen: true }],
    focus: [1, 2, 3, 5, 6].map((i) => ({ id: 'f' + i, started_at: at(addDays(day, -i), 10), minutes: 25 * (1 + (i % 3)), category: null, completed: true, session_type: 'focus' as const })),
    plan: [
      { id: 'p1', title: 'Созвон с командой', category_id: null, day, starts_at: '10:00', ends_at: '10:45', note: null, done: false },
      { id: 'p2', title: 'Глубокая работа', category_id: null, day, starts_at: '14:00', ends_at: '16:00', note: null, done: false, focus: true },
      { id: 'p3', title: 'Спортзал', category_id: null, day: addDays(day, 1), starts_at: '08:00', ends_at: '09:00', note: null, done: false },
    ],
    cats: [],
    arcs: [{ id: 'arc2', number: 2, started_on: addDays(day, -13), length_days: 90, ended_on: null, summary: null, oath: 'Каждое утро — бег и чтение. Без исключений.' }],
    quits: [], relapses: [],
    goals: [{ id: 'g1', title: 'Пробежать полумарафон', hue: '#5FBF9B', type: 'process', deadline: addDays(day, 60), started_on: addDays(day, -10), status: 'active', best_streak: 6, created_at: created }],
    tasks: [{ id: 't1', goal_id: 'g1', text: 'Пробежка 5 км', detail: null, sort: 0 }, { id: 't2', goal_id: 'g1', text: 'Растяжка 10 мин', detail: null, sort: 1 }],
    entries: [],
  };
}
