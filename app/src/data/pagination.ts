/** Fetch in stable, explicitly ordered pages; the API may cap every response. */
export async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, size = 500): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; ) {
    const r = await page(from, from + size - 1);
    if (r.error) throw r.error;
    if (!r.data) throw new Error('Missing query data');
    rows.push(...r.data);
    if (!r.data.length) return rows;
    from += r.data.length;
  }
}
export const rowKeys: Record<string, string[]> = {
  profiles: ['id'], arcs: ['id'], habits: ['id'], habit_logs: ['day', 'habit_id'],
  day_entries: ['day'], focus_sessions: ['id'], plan_items: ['id'], plan_categories: ['id'],
  quits: ['id'], quit_relapses: ['id'], goals: ['id'], goal_tasks: ['id'], goal_entries: ['day', 'goal_id'],
};
