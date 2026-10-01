/* Settings → Data → Import (Master Changeset task 31): a VeyrArc export file is added to the account with new ids. Needs the local backend. */
import { execSync } from 'node:child_process';
import { APP, guestOnboard, log, open } from './e2e-lib.mjs';
const sql = (q) => execSync(`psql -h 127.0.0.1 -p 54322 -U postgres -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const file = {
  exported_at: new Date().toISOString(),
  habits: [{ id: 'h-old', name: 'Импорт: бег', core: true, days: 127, icon: 'sun', hue: '#5B9BD5', type: 'binary', category: 'body', sort: 0, created_at: day(-10) + 'T08:00:00Z', user_id: 'someone-else' }],
  habit_logs: [{ habit_id: 'h-old', day: day(-2), value: 1, done: true, user_id: 'someone-else' }],
  quits: [{ id: 'q-old', name: 'Импорт: кофе', icon: 'ban', hue: '#D96A5B', clean_since: day(-5) + 'T00:00:00Z' }],
  quit_relapses: [],
  goals: [{ id: 'g-old', title: 'Импорт: цель', hue: '#9B87D6', type: 'process', started_on: day(-7), status: 'active', linked_core_habit_id: 'h-old' }],
  goal_tasks: [{ id: 't-old', goal_id: 'g-old', text: 'Импорт: шаг', sort: 0 }],
  goal_entries: [{ goal_id: 'g-old', day: day(-1), done_task_ids: ['t-old'], diary: 'запись' }],
  day_entries: [{ day: day(-3), mood: 4 }],
  focus_sessions: [{ minutes: 25, started_at: day(-1) + 'T10:00:00Z', completed: true }],
  plan_items: [{ id: 'p-old', day: day(0), title: 'Импорт: событие', done: false, linked_goal_id: 'g-old' }],
};
const { browser, page, errors } = await open();
try {
  await guestOnboard(page, { 'Тело': ['Холодный душ'] });
  const uid = sql('select id from auth.users order by created_at desc limit 1');
  await page.goto(APP + '/settings');
  await page.locator('input[type="file"]').setInputFiles({ name: 'veyrarc-export.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  const body = await page.getByRole('dialog').innerText();
  log('preview:', body.replace(/\n+/g, ' | ').slice(0, 160));
  await page.getByRole('button', { name: 'Импортировать', exact: true }).click();
  await page.getByText('Данные импортированы').waitFor({ timeout: 15000 });
  const got = sql(`select (select count(*) from habits where user_id='${uid}' and name like 'Импорт%') || ' habits, ' ||
    (select count(*) from habit_logs l join habits h on h.id=l.habit_id where h.user_id='${uid}' and h.name like 'Импорт%') || ' logs, ' ||
    (select count(*) from goals where user_id='${uid}' and linked_core_habit_id is not null) || ' linked goals, ' ||
    (select count(*) from goal_entries where user_id='${uid}' and cardinality(done_task_ids)=1) || ' entries, ' ||
    (select count(*) from plan_items where user_id='${uid}' and linked_goal_id is not null) || ' linked events, ' ||
    (select count(*) from day_entries where user_id='${uid}' and mood=4) || ' moods'`);
  log('imported:', got);
  if (got !== '1 habits, 1 logs, 1 linked goals, 1 entries, 1 linked events, 1 moods') throw new Error('import incomplete');
  await page.goto(APP + '/disciplines');
  await page.getByText('Импорт: бег').first().waitFor(); log('imported habit on Disciplines');
  console.log(errors.length ? 'page errors: ' + errors.join(' | ') : 'no page errors');
} catch (e) {
  await page.screenshot({ path: '/tmp/claude-0/-home-claude-repo/2a26a2d0-2e4a-50c4-9d86-2549853ae036/scratchpad/e2e-fail.png' });
  console.error('✗', e.message.split('\n')[0], '@', page.url()); process.exitCode = 1;
} finally { await browser.close(); }
