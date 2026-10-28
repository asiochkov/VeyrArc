import { DECIDE } from './params';
import { riskOf, specOf } from './intents';
import type { Risk } from './types';

/** how many items a command touches (a list slot, or «all») */
export function itemCount(slots: Record<string, unknown>): number {
  for (const k of ['items', 'steps', 'ids', 'phrases']) { const v = slots[k]; if (Array.isArray(v)) return v.length; }
  return typeof slots.count === 'number' ? slots.count : slots.all || slots.bulk ? Infinity : 1;
}

/** the effective risk class: the intent's own, raised to R3 when a group of more than 3 is touched (6.7.1) */
export function effectiveRisk(kind: string, slots: Record<string, unknown> = {}): Risk {
  const base = riskOf(kind);
  if (base === 'R4') return 'R4';
  return itemCount(slots) > DECIDE.bulkConfirmAbove && base !== 'R0' ? 'R3' : base;
}

/** the required slots that are missing (empty strings and empty lists count as missing) */
export function missingSlots(kind: string, slots: Record<string, unknown>): string[] {
  return specOf(kind).required.filter((k) => {
    const v = slots[k];
    return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
  });
}
