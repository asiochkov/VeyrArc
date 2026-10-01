import { useMemo } from 'react';
import { config } from '../../config';
import { buildToday } from '../../data/today';
import { useHeader } from '../../data/header';
import { addDays, weekStart } from '../../data/model';
import { useAuth, isProPlan } from '../../lib/auth';
import { isoDay } from '../../lib/day';
import { hasBackend } from '../../lib/supabase';
import { useNow } from '../../lib/useNow';
import { dayStatus, nowAction, todayScore, type DayStatus } from '../../state/compute';
import { activeArc, todayRawOf, useSystem, type SystemRaw } from '../../state/system';

const REVIEW_KEY = (d: string) => 'veyrarc.review.' + d;
export const reviewDone = (d = isoDay()) => { try { return localStorage.getItem(REVIEW_KEY(d)) === '1'; } catch { return false; } };
export const markReviewDone = (d = isoDay()) => { try { localStorage.setItem(REVIEW_KEY(d), '1'); } catch { /* no storage */ } };
const RECOVERY_KEY = (d: string) => 'veyrarc.recovery.' + d;
export const recoveryDismissed = (d: string) => { try { return localStorage.getItem(RECOVERY_KEY(d)) === '1'; } catch { return false; } };
export const dismissRecovery = (d: string) => { try { localStorage.setItem(RECOVERY_KEY(d), '1'); } catch { /* no storage */ } };

/** Everything the Today cockpit shows, derived from the one system state (re-computed every 30 s for the time of day). */
export function useToday() {
  const q = useSystem((r) => r);
  const plan = useAuth((x) => x.plan);
  const hd = useHeader();
  const now = useNow(30_000);
  const sys: SystemRaw | undefined = q.data;
  const freezesAllowed = hasBackend && !isProPlan(plan) ? config.limits.free.freezesPerWeek : config.limits.pro.freezesPerWeek;

  const data = useMemo(() => {
    if (!sys) return null;
    const day = sys.day === isoDay() ? sys.day : isoDay();
    const raw = todayRawOf(sys);
    const view = buildToday({ ...raw, day }, { initials: hd.initials, freezesAllowed });
    const arc = activeArc(sys);
    const core = new Set(sys.habits.filter((h) => h.core).map((h) => h.id));
    const hues = new Map(sys.habits.map((h) => [h.id, h.hue]));
    const habits = view.habits.map((h) => ({ ...h, core: core.has(h.id), hue: hues.get(h.id) }));
    const idx = { habits: raw.habits, logs: sys.logs, days: sys.days, focus: sys.focus, goals: sys.goals, tasks: sys.tasks, entries: sys.entries };
    const score = todayScore(idx, day, arc?.started_on ?? null);
    const d = new Date(now);
    const mon = weekStart(day);
    const week = Array.from({ length: 7 }, (_, i) => {
      const dd = addDays(mon, i);
      return { day: dd, status: dayStatus(idx, dd, day, d.getHours()) as DayStatus };
    });
    const y = addDays(day, -1);
    const yStatus = dayStatus(idx, y, day);
    const frozenThisWeek = sys.days.filter((x) => x.frozen && x.day >= weekStart(y) && x.day <= addDays(weekStart(y), 6)).length;
    const recovery = yStatus === 'broken' && view.streakBase === 0 && d.getHours() < 12 && !recoveryDismissed(y)
      && dayStatus(idx, addDays(day, -2), day) !== 'broken' && dayStatus(idx, addDays(day, -2), day) !== 'none'
      ? { day: y, left: Math.max(0, freezesAllowed - frozenThisWeek) } : null;
    const action = nowAction({ habits: raw.habits, logs: sys.logs, plan: sys.plan, arcStart: arc?.started_on ?? null, oath: arc?.oath ?? null }, d, reviewDone(day));
    const todayMood = sys.days.find((x) => x.day === day)?.mood ?? null;
    const focusToday = sys.focus.filter((f) => f.completed && (f.session_type ?? 'focus') === 'focus' && isoDay(new Date(f.started_at)) === day);
    // planner strip: today's events within ±6 hours (untimed ones too)
    const nowMin = d.getHours() * 60 + d.getMinutes();
    const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const strip = sys.plan
      .filter((p) => p.day === day && (!p.starts_at || Math.abs(toMin(p.starts_at) - nowMin) <= 360))
      .sort((a, b) => (a.starts_at ?? '99').localeCompare(b.starts_at ?? '99'))
      .slice(0, 5);
    return {
      day, view, habits, arc, score, week, recovery, action, strip, todayMood,
      coreCount: habits.filter((h) => h.core).length,
      focusToday: { sessions: focusToday.length, minutes: focusToday.reduce((a, f) => a + f.minutes, 0) },
      freezes: { used: view.stats.freezesUsed, allowed: freezesAllowed },
    };
  }, [sys, now, hd.initials, freezesAllowed]);

  return { ready: !!data, data, loadError: q.isError && !q.data, retry: () => { void q.refetch(); } };
}
export type TodayData = NonNullable<ReturnType<typeof useToday>['data']>;
