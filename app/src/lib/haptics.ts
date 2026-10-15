/*
 * One vocabulary of vibrations (audit 4.3): the bigger the moment, the longer the pattern.
 * Silent where the device has no vibration (iOS Safari) — the visuals carry the moment there.
 */
export const HAPTICS = {
  tap: [10],
  check: [15],
  dayKept: [18, 50, 18, 50, 40],
  milestone: [50, 80, 50, 80, 150],
  focusEnd: [80, 60, 80, 60, 120],
  error: [20, 40, 20],
  undo: [10, 20, 10],
} as const;
export function haptic(p: keyof typeof HAPTICS) {
  try { navigator.vibrate?.(HAPTICS[p] as unknown as number[]); } catch { /* not allowed */ }
}
