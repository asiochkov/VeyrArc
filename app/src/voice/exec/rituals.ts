import { findRitual, type Ritual } from '../flows/practices';
import { startFlow } from '../flows/engine';
import { usePrefs } from '../prefs';
import { R } from '../reply';
import { q } from './common';
import { register } from './index';

/* WP5.8 — rituals: an ordered set of habits kept on this device (catalog 128–130, 134). Running one is the 'ritual' flow. */
const list = () => usePrefs.getState().rituals;
const save = (next: Ritual[]) => { const prev = list(); usePrefs.getState().set({ rituals: next }); return [{ t: 'prefs' as const, key: 'rituals', prev }]; };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

register('ritual.create', (p, c) => {
  const name = String(p.slots.name ?? '').trim().toLowerCase();
  const steps = (Array.isArray(p.slots.steps) ? p.slots.steps : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 12);
  if (!name) return R.error(c.ru ? 'Как назвать ритуал?' : 'What should I call the ritual?');
  if (steps.length < 2) return R.error(c.ru ? 'Назовите хотя бы два шага через запятую' : 'Name at least two steps, separated by commas');
  const same = list().findIndex((r) => r.name === name);
  const next = same >= 0 ? list().map((r, i) => (i === same ? { name, steps } : r)) : [...list(), { name, steps }].slice(-12);
  const undo = save(next);
  return R.done(c.ru ? `${same >= 0 ? 'Обновил' : 'Сохранил'} ритуал «${name}»: ${steps.join(' → ')}. Скажите «запусти ${name} ритуал»` : `${same >= 0 ? 'Updated' : 'Saved'} ritual “${name}”: ${steps.join(' → ')}`, { undo });
});

register('ritual.edit', (p, c) => {
  const r = findRitual(String(p.slots.name ?? ''), list());
  if (!r) return R.error(c.ru ? 'Не нашёл такой ритуал' : 'No such ritual');
  const step = String(p.slots.step ?? '').trim();
  const op = String(p.slots.op ?? 'first');
  if (!step) return R.error(c.ru ? 'Какой шаг?' : 'Which step?');
  const at = r.steps.findIndex((s) => s.toLowerCase().includes(step.toLowerCase()) || step.toLowerCase().includes(s.toLowerCase()));
  let steps = [...r.steps];
  if (op === 'add') steps.push(step);
  else if (at < 0) return R.error(c.ru ? `В ритуале нет шага «${step}»` : `There is no step “${step}”`);
  else if (op === 'remove') steps.splice(at, 1);
  else { const [s] = steps.splice(at, 1); if (op === 'last') steps.push(s); else steps.unshift(s); }
  if (steps.length < 1) return R.error(c.ru ? 'В ритуале должен остаться хотя бы один шаг' : 'A ritual needs at least one step');
  const undo = save(list().map((x) => (x === r ? { ...x, steps } : x)));
  return R.done(c.ru ? `Ритуал «${r.name}»: ${steps.join(' → ')}` : `Ritual “${r.name}”: ${steps.join(' → ')}`, { undo });
});

register('ritual.list', (_p, c) => {
  const rs = list(), ts = usePrefs.getState().templates;
  if (!rs.length && !ts.length) return R.info(c.ru ? 'Ритуалов и шаблонов пока нет. Скажите «создай утренний ритуал: зарядка, вода, медитация»' : 'No rituals or templates yet. Say “create a morning ritual: workout, water, meditation”');
  const lines = [...rs.map((r) => `${cap(r.name)} (${c.ru ? 'ритуал' : 'ritual'}): ${r.steps.join(' → ')}`), ...ts.map((t) => `${cap(t.name)} (${c.ru ? 'шаблон' : 'template'}): ${t.items.length}`)];
  return R.answer(c.ru ? `Ритуалов: ${rs.length}, шаблонов: ${ts.length}` : `${rs.length} rituals, ${ts.length} templates`, { list: lines });
});

register('ritual.run', (p, c) => {
  if (!findRitual(String(p.slots.name ?? ''), list())) return R.error(c.ru ? `Не нашёл ритуал ${q(String(p.slots.name ?? ''))}. Скажите «покажи мои ритуалы»` : 'No such ritual. Say “show my rituals”');
  return startFlow('ritual', c, p.slots);
});
