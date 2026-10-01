/* Example data from VeyrArc Calendar.dc.html `state` / renderVals(). */

export type EvColor = 'blue' | 'green' | 'red' | 'purple';

export const EV_FILL: Record<EvColor, string> = { blue: '#004BE0', green: '#0B7358', red: '#A8352B', purple: '#5236B8' };
export const EV_CAT: Record<EvColor, { tag: 'meeting' | 'work' | 'deadline' | 'review'; hue: string }> = {
  blue: { tag: 'meeting', hue: '#2D6CF0' },
  green: { tag: 'work', hue: '#1F9C79' },
  red: { tag: 'deadline', hue: '#D0503F' },
  purple: { tag: 'review', hue: '#7A5FE0' },
};

export const ROW = 64;       // desktop px per hour
export const ROW_M = 66;     // mobile px per hour
