/* Periods named in a question («на этой неделе», «за месяц»): shared by the parser and the executors. */
export type Period = 'day' | 'week' | 'month' | '30' | 'all';
export const PERIOD_WORDS: [RegExp, Period][] = [
  [/(?:на этой неделе|за неделю|эту неделю|за последнюю неделю|this week|last 7 days|past week|in a week)/, 'week'],
  [/(?:в этом месяце|за месяц|этот месяц|this month|past month|last month)/, 'month'],
  [/(?:за 30 дней|за тридцать дней|30 days|thirty days)/, '30'],
  [/(?:сегодня|today)/, 'day'],
  [/(?:за все время|за всё время|всего|overall|in total|all time)/, 'all'],
];
export const periodIn = (text: string): Period | null => { for (const [re, p] of PERIOD_WORDS) if (re.test(text)) return p; return null; };
