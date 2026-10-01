// VeyrArc · push reminders (UX audit 3.6 / 5.7). Called every minute by pg_cron.
//  - reminder: at the user's reminder time (onboarding), if habits are left for today
//  - evening:  21:00–23:00 local, if habits are still left («успей до полуночи»)
//  - silence:  19:00–21:00 local, if the app was not opened for 3+ days
//  - event:    a planner task with a time starts within 15 minutes (once per task)
//  - plan:     at the reminder time with no habits left but tasks planned for today
//  - overdue:  at the reminder time, yesterday's unfinished tasks
//  - goals:    20:00 local, goal steps not ticked today
//  - deadline: 10:00 local, a goal deadline today / tomorrow / in 3 days
//  - quit:     10:00 local, a clean-days milestone (1, 3, 7, 14, 21, 30, 60, 90, 180, 365, the goal)
//  - arc:      10:00 local, arc milestones (day 30, halfway, 10 days left, the last day)
//  - focus:    a Pomodoro session ended while the app was closed (profiles.pomodoro.endsAt)
// Each kind goes out at most once per local day (push_log).
//  - quiet hours (profiles.quiet_from/quiet_to): nothing is sent inside them; a reminder that
//    falls inside is moved to the end of the quiet window (Master Changeset task 32)
//  - test: POST with the user's own access token and {"test": true} sends one test push (task 30)
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
webpush.setVapidDetails('mailto:support@veyrarc.online', Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);

type Lang = 'ru' | 'en';
const plural = (lang: Lang, n: number, one: string, few: string, many: string) => {
  if (lang === 'en') return n === 1 ? one : many;
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};
const TEXT = {
  reminder: (l: Lang, n: number) => l === 'en'
    ? { title: 'Time to check in', body: `${n} ${plural(l, n, 'habit', '', 'habits')} left for today` }
    : { title: 'Время отметить привычки', body: `Осталось ${n} ${plural(l, n, 'привычка', 'привычки', 'привычек')} на сегодня` },
  evening: (l: Lang, n: number) => l === 'en'
    ? { title: 'Make it before midnight', body: `${n} ${plural(l, n, 'habit is', '', 'habits are')} still open — keep your streak` }
    : { title: 'Успей до полуночи', body: `${n} ${plural(l, n, 'привычка не отмечена', 'привычки не отмечены', 'привычек не отмечено')} — сохрани серию` },
  event: (l: Lang, title: string, m: number, at: string) => l === 'en'
    ? { title, body: m <= 1 ? `Starts now · ${at}` : `In ${m} min · ${at}` }
    : { title, body: m <= 1 ? `Начинается сейчас · ${at}` : `Через ${m} мин · ${at}` },
  plan: (l: Lang, n: number) => l === 'en'
    ? { title: 'Your plan for today', body: `${n} ${plural(l, n, 'task', '', 'tasks')} planned — open the planner` }
    : { title: 'План на сегодня', body: `${n} ${plural(l, n, 'задача', 'задачи', 'задач')} в плане — загляни в планер` },
  summary: (l: Lang, h: [number, number], e: [number, number]) => {
    const parts = l === 'en'
      ? [h[1] ? `habits ${h[0]}/${h[1]}` : '', e[1] ? `tasks ${e[0]}/${e[1]}` : '']
      : [h[1] ? `привычки ${h[0]}/${h[1]}` : '', e[1] ? `задачи ${e[0]}/${e[1]}` : ''];
    return { title: l === 'en' ? 'Your day' : 'Итог дня', body: parts.filter(Boolean).join(' · ') + (l === 'en' ? '. Close the day in 30 seconds.' : '. Подведи день за 30 секунд.') };
  },
  overdue: (l: Lang, n: number) => l === 'en'
    ? { title: 'Left from yesterday', body: `${n} ${plural(l, n, 'task', '', 'tasks')} not done — move them in the planner` }
    : { title: 'Хвосты со вчера', body: `${n} ${plural(l, n, 'задача не выполнена', 'задачи не выполнены', 'задач не выполнено')} — перенеси в планере` },
  goals: (l: Lang, title: string, left: number, total: number, more: number) => l === 'en'
    ? { title: 'Steps to your goals', body: `«${title}»: ${left} of ${total} left${more ? ` and ${more} more ${more === 1 ? 'goal' : 'goals'}` : ''}` }
    : { title: 'Шаги к целям', body: `«${title}»: осталось ${left} из ${total}${more ? ` и ещё ${more} ${plural(l, more, 'цель', 'цели', 'целей')}` : ''}` },
  deadline: (l: Lang, title: string, d: number) => l === 'en'
    ? { title: d === 0 ? 'Deadline today' : d === 1 ? 'Deadline tomorrow' : `Deadline in ${d} days`, body: `Goal «${title}»` }
    : { title: d === 0 ? 'Дедлайн сегодня' : d === 1 ? 'Дедлайн завтра' : `До дедлайна ${d} ${plural(l, d, 'день', 'дня', 'дней')}`, body: `Цель «${title}»` },
  quit: (l: Lang, name: string, d: number) => l === 'en'
    ? { title: `${d} ${d === 1 ? 'day' : 'days'} without «${name}»`, body: 'A new milestone. Keep going.' }
    : { title: `${d} ${plural(l, d, 'день', 'дня', 'дней')} без «${name}»`, body: 'Новая веха. Так держать.' },
  arc: (l: Lang, n: string, d: number, len: number) => {
    const left = len - d;
    if (l === 'en') return { title: `Arc ${n} · day ${d} of ${len}`, body: left === 0 ? 'The last day — finish strong.' : d * 2 === len ? 'Halfway there.' : left === 10 ? 'Ten days to go.' : 'A third of the way. Keep the rhythm.' };
    return { title: `Arc ${n} · день ${d} из ${len}`, body: left === 0 ? 'Последний день — заверши сильно.' : d * 2 === len ? 'Половина пути пройдена.' : left === 10 ? 'Осталось десять дней.' : 'Треть пути. Держи ритм.' };
  },
  rest: (l: Lang) => l === 'en'
    ? { title: 'Break is over', body: 'Back to focus — the next session is ready' }
    : { title: 'Перерыв окончен', body: 'Пора к фокусу — следующая сессия готова' },
  focus: (l: Lang, label: string | null) => l === 'en'
    ? { title: 'Focus session done', body: label ? `«${label}» — time for a break` : 'Time for a short break' }
    : { title: 'Фокус-сессия завершена', body: label ? `«${label}» — время для перерыва` : 'Время для короткого перерыва' },
  silence: (l: Lang) => l === 'en'
    ? { title: 'Your Arc is on pause', body: 'Three days without check-ins. One small step today brings the index back.' }
    : { title: 'Твой Arc на паузе', body: 'Три дня без отметок. Один маленький шаг сегодня — и индекс снова растёт.' },
};

function local(tz: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hm: `${parts.hour}:${parts.minute}`, wd: parts.weekday as string };
}
const addHours = (hm: string, h: number) => { const [a, b] = hm.split(':').map(Number); return `${String(Math.min(23, a + h)).padStart(2, '0')}:${String(b).padStart(2, '0')}`; };
// weekday bitmap of the habit (bit 0 = Monday, 127 = every day)
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const scheduled = (days: number | null, wd: string) => ((days ?? 127) & (1 << WD.indexOf(wd))) !== 0;

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const QUIT_STEPS = [1, 3, 7, 14, 21, 30, 60, 90, 180, 365];
const dayDiff = (a: string, b: string) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000);
const shiftDay = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info' };
/** hm inside [from, to) — the window may cross midnight. */
const inQuiet = (hm: string, from?: string | null, to?: string | null) => {
  if (!from || !to || from === to) return false;
  return from < to ? hm >= from && hm < to : hm >= from || hm < to;
};
async function send(subs: { id: string; endpoint: string; p256dh: string; auth: string }[], payload: Record<string, unknown>) {
  let n = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload));
      n++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await sb.from('push_subscriptions').delete().eq('id', s.id);
    }
  }
  return n;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  // a test push to the signed-in user's own devices (Settings → Notifications)
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) {
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const body = await req.json().catch(() => ({}));
    const { data: u } = token ? await sb.auth.getUser(token) : { data: { user: null } };
    if (!u?.user || !body?.test) return new Response('forbidden', { status: 403, headers: cors });
    const { data: subs } = await sb.from('push_subscriptions').select('*').eq('user_id', u.user.id);
    const { data: p } = await sb.from('profiles').select('lang').eq('id', u.user.id).maybeSingle();
    const en = p?.lang === 'en';
    const n = await send(subs ?? [], { title: en ? 'VeyrArc test' : 'Проверка VeyrArc', body: en ? 'Notifications work on this device.' : 'Уведомления на этом устройстве работают.', tag: 'test', type: 'test', url: '/settings' });
    return Response.json({ devices: subs?.length ?? 0, sent: n }, { headers: cors });
  }
  const { data: subs } = await sb.from('push_subscriptions').select('*');
  const byUser = new Map<string, typeof subs>();
  for (const s of subs ?? []) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
  let sent = 0;

  for (const [uid, list] of byUser) {
    const { data: p } = await sb.from('profiles').select('timezone, reminder_time, notify_habits, notify_summary, notify_focus, notify_arc, pomodoro, last_seen_at, lang, quiet_from, quiet_to').eq('id', uid).maybeSingle();
    if (!p) continue;
    const lang: Lang = p.lang === 'en' ? 'en' : 'ru';
    const { day, hm, wd } = local(p.timezone || 'Europe/Moscow');
    const qf = p.quiet_from?.slice(0, 5), qt = p.quiet_to?.slice(0, 5);
    // a focus session the user started ends — goes out even in quiet hours
    const pom = p.pomodoro as { endsAt?: number | null; label?: string | null; tab?: number } | null;
    if (p.notify_focus !== false && pom?.endsAt && Date.now() >= pom.endsAt && Date.now() - pom.endsAt < 15 * 60000) {
      await sb.from('profiles').update({ pomodoro: { ...pom, endsAt: null } }).eq('id', uid);
      sent += await send(list!, { ...(pom.tab ? TEXT.rest(lang) : TEXT.focus(lang, pom.label ?? null)), tag: 'focus', type: 'focus', url: '/' });
    }
    if (inQuiet(hm, qf, qt)) continue;
    /** once per user, kind and local day */
    const once = async (kind: string) => !(await sb.from('push_log').insert({ user_id: uid, kind, day })).error;
    const push = async (kind: string, m: { title: string; body: string }, url: string) => {
      if (await once(kind)) sent += await send(list!, { ...m, tag: kind, type: kind.split(':')[0], url });
    };

    if (p.notify_habits) {
      // yesterday's unfinished tasks, at the reminder time
      const rtm = p.reminder_time?.slice(0, 5);
      if (rtm && hm >= rtm && hm < addHours(rtm, 2)) {
        const { count } = await sb.from('plan_items').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('day', shiftDay(day, -1)).eq('done', false);
        if (count) await push('overdue', TEXT.overdue(lang, count), '/planner');
      }
      // goal steps not ticked today
      if (hm >= '20:00' && hm < '20:30') {
        const { data: goals } = await sb.from('goals').select('id, title').eq('user_id', uid).eq('status', 'active');
        const open: { title: string; left: number; total: number }[] = [];
        for (const g of goals ?? []) {
          const { data: tasks } = await sb.from('goal_tasks').select('id').eq('goal_id', g.id);
          if (!tasks?.length) continue;
          const { data: e } = await sb.from('goal_entries').select('done_task_ids').eq('goal_id', g.id).eq('day', day).maybeSingle();
          const done = new Set((e?.done_task_ids as string[] | null) ?? []);
          const left = tasks.filter((x) => !done.has(x.id)).length;
          if (left) open.push({ title: g.title, left, total: tasks.length });
        }
        if (open.length) await push('goals', TEXT.goals(lang, open[0].title, open[0].left, open[0].total, open.length - 1), '/goals');
      }
      // goal deadlines
      if (hm >= '10:00' && hm < '10:30') {
        const { data: goals } = await sb.from('goals').select('id, title, deadline').eq('user_id', uid).eq('status', 'active').not('deadline', 'is', null);
        for (const g of goals ?? []) {
          const d = dayDiff(g.deadline, day);
          if (d === 0 || d === 1 || d === 3) await push('deadline:' + g.id, TEXT.deadline(lang, g.title, d), '/goals/' + g.id);
        }
      }
    }

    // milestones: clean days and arc days
    if (p.notify_arc !== false && hm >= '10:00' && hm < '10:30') {
      const { data: quits } = await sb.from('quits').select('id, name, clean_since, goal_days').eq('user_id', uid).is('archived_at', null);
      for (const q of quits ?? []) {
        const d = Math.floor((Date.now() - Date.parse(q.clean_since)) / 86400000);
        if (d > 0 && (QUIT_STEPS.includes(d) || d === q.goal_days)) await push('quit:' + q.id, TEXT.quit(lang, q.name, d), '/disciplines?tab=quits');
      }
      const { data: arc } = await sb.from('arcs').select('number, started_on, length_days').eq('user_id', uid).is('ended_on', null).order('number', { ascending: false }).limit(1).maybeSingle();
      if (arc) {
        const d = dayDiff(day, arc.started_on) + 1, len = arc.length_days || 90;
        if (d === 30 || d * 2 === len || len - d === 10 || d === len) await push('arc', TEXT.arc(lang, ROMAN[arc.number] ?? String(arc.number), d, len), '/');
      }
    }

    const undone = async () => {
      const { data: habits } = await sb.from('habits').select('id, days').eq('user_id', uid).is('archived_at', null);
      const today = (habits ?? []).filter((h) => scheduled(h.days, wd));
      if (!today.length) return 0;
      const { data: logs } = await sb.from('habit_logs').select('habit_id').eq('user_id', uid).eq('day', day).eq('done', true);
      const done = new Set((logs ?? []).map((l) => l.habit_id));
      return today.filter((h) => !done.has(h.id)).length;
    };

    // planner tasks starting soon: one push per task
    if (p.notify_habits) {
      const toMin = (t: string) => { const [a, b] = t.split(':').map(Number); return a * 60 + b; };
      const { data: evs } = await sb.from('plan_items').select('id, title, starts_at').eq('user_id', uid).eq('day', day).eq('done', false).not('starts_at', 'is', null);
      for (const e of evs ?? []) {
        const at = String(e.starts_at).slice(0, 5);
        const m = toMin(at) - toMin(hm);
        if (m < 0 || m > 15) continue;
        const { error: seen } = await sb.from('push_log').insert({ user_id: uid, kind: 'event:' + e.id, day });
        if (seen) continue;
        sent += await send(list!, { ...TEXT.event(lang, e.title, m, at), tag: 'event-' + e.id, type: 'event', url: '/planner' });
      }
    }

    // day summary at 22:00–22:30 local (once a day)
    if (p.notify_summary !== false && hm >= '22:00' && hm < '22:30') {
      const { data: habits } = await sb.from('habits').select('id, days').eq('user_id', uid).is('archived_at', null);
      const todayH = (habits ?? []).filter((h) => scheduled(h.days, wd));
      const { data: logs } = await sb.from('habit_logs').select('habit_id').eq('user_id', uid).eq('day', day).eq('done', true);
      const doneH = new Set((logs ?? []).map((l) => l.habit_id));
      const { data: evs } = await sb.from('plan_items').select('done').eq('user_id', uid).eq('day', day);
      const h: [number, number] = [todayH.filter((x) => doneH.has(x.id)).length, todayH.length];
      const e: [number, number] = [(evs ?? []).filter((x) => x.done).length, (evs ?? []).length];
      if (h[1] || e[1]) {
        const { error: seen } = await sb.from('push_log').insert({ user_id: uid, kind: 'summary', day });
        if (!seen) sent += await send(list!, { ...TEXT.summary(lang, h, e), tag: 'summary', type: 'summary', url: '/?review=1' });
      }
    }

    let kind: 'reminder' | 'evening' | 'silence' | 'plan' | null = null;
    let msg: { title: string; body: string } | null = null;
    const rt0 = p.reminder_time?.slice(0, 5);
    const rt = rt0 && inQuiet(rt0, qf, qt) ? qt : rt0;
    if (p.notify_habits && rt && hm >= rt && hm < addHours(rt, 2)) {
      const n = await undone();
      if (n) { kind = 'reminder'; msg = TEXT.reminder(lang, n); }
      else {
        const { count } = await sb.from('plan_items').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('day', day).eq('done', false);
        if (count) { kind = 'plan'; msg = TEXT.plan(lang, count); }
      }
    }
    if (!kind && p.notify_habits && hm >= '21:00' && hm < '23:00') { const n = await undone(); if (n) { kind = 'evening'; msg = TEXT.evening(lang, n); } }
    if (!kind && p.last_seen_at && Date.now() - new Date(p.last_seen_at).getTime() > 3 * 86400000 && hm >= '19:00' && hm < '21:00') { kind = 'silence'; msg = TEXT.silence(lang); }
    if (!kind || !msg) continue;

    const { error: dup } = await sb.from('push_log').insert({ user_id: uid, kind, day });
    if (dup) continue; // already sent today

    // push contract: type + deep link (the service worker opens `url`)
    sent += await send(list!, { ...msg, tag: kind, type: kind, url: kind === 'silence' ? '/' : kind === 'plan' ? '/planner' : '/?from=push' });
  }
  return Response.json({ users: byUser.size, sent });
});
