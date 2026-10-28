/*
 * Main holidays by fixed date (decision #22): kept on the device, refreshed by hand once a year. Moved days off are not
 * counted. Used by the assistant's «когда ближайший праздник».
 */
export type Holiday = { md: string; ru: string; en: string; only?: 'ru' | 'en' };
export const HOLIDAYS: Holiday[] = [
  { md: '01-01', ru: 'Новый год', en: 'New Year’s Day' },
  { md: '01-07', ru: 'Рождество', en: 'Orthodox Christmas' },
  { md: '02-14', only: 'en', ru: 'День святого Валентина', en: 'Valentine’s Day' },
  { md: '02-23', ru: 'День защитника Отечества', en: 'Defender of the Fatherland Day' },
  { md: '03-08', ru: 'Международный женский день', en: 'International Women’s Day' },
  { md: '05-01', ru: 'Праздник Весны и Труда', en: 'Labour Day' },
  { md: '05-09', ru: 'День Победы', en: 'Victory Day' },
  { md: '06-12', ru: 'День России', en: 'Russia Day' },
  { md: '10-31', only: 'en', ru: 'Хеллоуин', en: 'Halloween' },
  { md: '11-04', ru: 'День народного единства', en: 'Unity Day' },
  { md: '12-25', only: 'en', ru: 'Католическое Рождество', en: 'Christmas Day' },
  { md: '12-31', ru: 'Новогодняя ночь', en: 'New Year’s Eve' },
];
/** the first holiday on or after `day` (YYYY-MM-DD) */
export function nextHoliday(day: string, lang: 'ru' | 'en' = 'ru'): { date: string; h: Holiday } {
  const y = Number(day.slice(0, 4));
  const list = HOLIDAYS.filter((h) => !h.only || h.only === lang);
  for (const yy of [y, y + 1]) for (const h of list) { const d = `${yy}-${h.md}`; if (d >= day) return { date: d, h }; }
  return { date: `${y + 1}-${list[0].md}`, h: list[0] };
}
