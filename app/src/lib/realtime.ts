import type { QueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { translate, useLangStore } from '../i18n';
import { ownWriteRecent } from '../state/actions';
import { SYSTEM_KEY } from '../state/system';
import { toast } from '../ui/toast';
import { useAuth } from './auth';
import { db, hasBackend } from './supabase';

/*
 * Cross-device sync (Master Changeset task 38): changes made on another device arrive through
 * Supabase realtime; the system query is refreshed and a short toast says so.
 * Changes this device just wrote are ignored (they are already on screen).
 */
const TABLES = ['habits', 'habit_logs', 'day_entries', 'focus_sessions', 'plan_items', 'goals', 'goal_tasks', 'goal_entries', 'quits', 'quit_relapses', 'arcs'];

export function startRealtime(qc: QueryClient) {
  if (!hasBackend || import.meta.env.VITE_REALTIME === '0') return;
  let ch: RealtimeChannel | null = null;
  let uid: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const changed = () => {
    if (ownWriteRecent()) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      void qc.invalidateQueries({ queryKey: SYSTEM_KEY });
      void qc.invalidateQueries({ queryKey: ['events'] });
      toast.info(translate(useLangStore.getState().lang, 'common.syncedRemote'), 1400);
    }, 700);
  };
  const bind = (id: string | null) => {
    if (id === uid) return;
    uid = id;
    if (ch) { void db().removeChannel(ch); ch = null; }
    if (!id) return;
    ch = db().channel('system:' + id);
    for (const table of TABLES) ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: `user_id=eq.${id}` }, changed);
    ch.subscribe();
  };
  bind(useAuth.getState().session?.user.id ?? null);
  useAuth.subscribe((st) => bind(st.session?.user.id ?? null));
}
