// VeyrArc · push reminders (UX audit 3.6 / 5.7). Called every 5 minutes by pg_cron.
//  - reminder: at the user's reminder time (onboarding), if habits are left for today
//  - evening:  21:00–23:00 local, if habits are still left («успей до полуночи»)
//  - silence:  19:00–21:00 local, if the app was not opened for 3+ days
//  - event:    a planner task with a time starts within 15 minutes (once per task)
//  - plan:     at the reminder time with no habits left but tasks planned for today
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
    const { data: p } = await sb.from('profiles').select('timezone, reminder_time, notify_habits, notify_summary, last_seen_at, lang, quiet_from, quiet_to').eq('id', uid).maybeSingle();
    if (!p) continue;
    const lang: Lang = p.lang === 'en' ? 'en' : 'ru';
    const { day, hm, wd } = local(p.timezone || 'Europe/Moscow');
    const qf = p.quiet_from?.slice(0, 5), qt = p.quiet_to?.slice(0, 5);
    if (inQuiet(hm, qf, qt)) continue;

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
