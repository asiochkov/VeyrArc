/* Example data from VeyrArc Calendar.dc.html `state` / renderVals(). */

export type EvColor = 'blue' | 'green' | 'red' | 'purple';

export const EV_FILL: Record<EvColor, string> = { blue: '#4E86BE', green: '#43A483', red: '#C25749', purple: '#8670C4' };
export const EV_CAT: Record<EvColor, { tag: 'meeting' | 'work' | 'deadline' | 'review'; hue: string }> = {
  blue: { tag: 'meeting', hue: '#5B9BD5' },
  green: { tag: 'work', hue: '#5FBF9B' },
  red: { tag: 'deadline', hue: '#D96A5B' },
  purple: { tag: 'review', hue: '#9B87D6' },
};

export const ROW = 64;       // desktop px per hour
export const ROW_M = 66;     // mobile px per hour
