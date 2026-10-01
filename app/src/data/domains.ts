import type { TKey } from '../i18n';
import type { Category } from './model';

/* Habit domains (Master Changeset RC-6): the stored id is the source of truth; labels come from i18n
   and colours from here, so analytics never depends on a translated string. */
export type DomainId = Exclude<Category, 'quit'>;
export const HABIT_DOMAINS: Record<DomainId, { label: TKey; hue: string }> = {
  body: { label: 'categories.body' as TKey, hue: '#5FBF9B' },
  mind: { label: 'categories.mind' as TKey, hue: '#9B87D6' },
  disc: { label: 'categories.disc' as TKey, hue: '#6FA0D6' },
  prod: { label: 'categories.prod' as TKey, hue: '#E8A54B' },
};
export const DOMAIN_IDS = Object.keys(HABIT_DOMAINS) as DomainId[];
