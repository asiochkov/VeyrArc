import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';

/*
 * Press and hold a tile to pick it up, drag it over another tile to take its place, release to drop.
 * Tiles carry data-hid={id}; their containers carry data-zone={zone}. Other tiles slide out of the
 * way (FLIP). A movement before the hold fires means the finger is scrolling, so nothing is lifted.
 */
export type Zones = Record<string, string[]>;
const HOLD_MS = 380;
const SLOP = 8;

export function useHoldReorder(opts: {
  zones: Zones;
  /** may the tile go into this zone (e.g. Core is full) */
  canEnter?: (id: string, zone: string) => boolean;
  onDrop: (zones: Zones, id: string, from: string, to: string) => void;
}) {
  const [preview, setPreview] = useState<Zones | null>(null);
  const [liftId, setLiftId] = useState<string | null>(null);
  const st = useRef<{
    id: string; el: HTMLElement; x0: number; y0: number; gx: number; gy: number; x: number; y: number;
    active: boolean; instant: boolean; timer?: ReturnType<typeof setTimeout>; raf?: number; zones: Zones; from: string;
  } | null>(null);
  const before = useRef(new Map<string, DOMRect>());
  const lastDrop = useRef(0);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const zoneOf = (z: Zones, id: string) => Object.keys(z).find((k) => z[k].includes(id)) ?? '';

  const follow = () => {
    const s = st.current;
    if (!s) return;
    const op = (s.el.offsetParent as HTMLElement | null)?.getBoundingClientRect() ?? { left: 0, top: 0 };
    s.el.style.translate = `${s.x - s.gx - op.left - s.el.offsetLeft}px ${s.y - s.gy - op.top - s.el.offsetTop}px`;
  };

  const retarget = () => {
    const s = st.current;
    if (!s) return;
    // layout boxes (transforms ignored), so tiles that are still sliding do not bounce back
    const box = (el: HTMLElement) => {
      const op = (el.offsetParent as HTMLElement | null)?.getBoundingClientRect() ?? { left: 0, top: 0 };
      const left = op.left + el.offsetLeft, top = op.top + el.offsetTop;
      return { left, top, right: left + el.offsetWidth, bottom: top + el.offsetHeight };
    };
    let toZone = '', toIdx = -1;
    for (const el of document.querySelectorAll<HTMLElement>('[data-hid]')) {
      const id = el.dataset.hid!;
      if (id === s.id) continue;
      const r = box(el);
      if (s.x >= r.left && s.x <= r.right && s.y >= r.top && s.y <= r.bottom) { toZone = zoneOf(s.zones, id); toIdx = s.zones[toZone].indexOf(id); break; }
    }
    if (!toZone) {
      // past the last tile of a zone (or an empty zone): go to its end
      for (const el of document.querySelectorAll<HTMLElement>('[data-zone]')) {
        const r = el.getBoundingClientRect();
        const z = el.dataset.zone!;
        if (!s.zones[z] || s.x < r.left || s.x > r.right || s.y < r.top || s.y > r.bottom) continue;
        const rest = s.zones[z].filter((x) => x !== s.id);
        const last = rest.length ? document.querySelector<HTMLElement>(`[data-hid="${rest[rest.length - 1]}"]`) : null;
        const lb = last ? box(last) : null;
        if (!lb || s.y > lb.bottom || (s.y >= lb.top && s.x > lb.right)) { toZone = z; toIdx = rest.length; }
        break;
      }
    }
    if (!toZone) return;
    const cur = zoneOf(s.zones, s.id);
    if (toZone !== cur && optsRef.current.canEnter && !optsRef.current.canEnter(s.id, toZone)) return;
    const next: Zones = Object.fromEntries(Object.entries(s.zones).map(([k, v]) => [k, v.filter((x) => x !== s.id)]));
    next[toZone].splice(Math.min(toIdx, next[toZone].length), 0, s.id);
    if (JSON.stringify(next) === JSON.stringify(s.zones)) return;
    // FLIP: remember where everything is now
    before.current.clear();
    for (const el of document.querySelectorAll<HTMLElement>('[data-hid]')) before.current.set(el.dataset.hid!, el.getBoundingClientRect());
    s.zones = next;
    navigator.vibrate?.(6);
    setPreview(next);
  };

  useLayoutEffect(() => {
    const s = st.current;
    if (s) follow();
    if (!before.current.size) return;
    for (const el of document.querySelectorAll<HTMLElement>('[data-hid]')) {
      const id = el.dataset.hid!;
      const a = before.current.get(id);
      if (!a || id === s?.id) continue;
      const b = el.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      if (dx || dy) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
    before.current.clear();
  });

  const end = (commit: boolean) => {
    const s = st.current;
    st.current = null;
    if (!s) return;
    clearTimeout(s.timer);
    if (s.raf) cancelAnimationFrame(s.raf);
    if (!s.active) return;
    lastDrop.current = Date.now();
    delete document.documentElement.dataset.dragging;
    // settle the lifted tile into its slot
    const from = s.el.style.translate;
    s.el.style.translate = '';
    s.el.animate([{ translate: from || '0 0', scale: '1.05' }, { translate: '0 0', scale: '1' }], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
    setLiftId(null);
    setPreview(null);
    const to = zoneOf(s.zones, s.id);
    if (commit && JSON.stringify(s.zones) !== JSON.stringify(optsRef.current.zones)) {
      navigator.vibrate?.(10);
      optsRef.current.onDrop(s.zones, s.id, s.from, to);
    }
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const s = st.current;
      if (!s) return;
      s.x = e.clientX; s.y = e.clientY;
      if (!s.active) {
        if (Math.hypot(s.x - s.x0, s.y - s.y0) <= SLOP) return;
        if (!s.instant) { end(false); return; } // the finger is scrolling
        clearTimeout(s.timer); activate();
      }
      follow();
      retarget();
    };
    const up = () => end(true);
    const block = (e: TouchEvent) => { if (st.current?.active) e.preventDefault(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('touchmove', block, { passive: false });
    return () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up); window.removeEventListener('touchmove', block);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activate = () => {
    const s = st.current;
    if (!s) return;
    s.active = true;
    navigator.vibrate?.(18);
    document.documentElement.dataset.dragging = '';
    setLiftId(s.id);
    follow();
    const scroller = s.el.closest<HTMLElement>('[data-scroll]');
    const tick = () => {
      const x = st.current;
      if (!x?.active) return;
      if (scroller) {
        const r = scroller.getBoundingClientRect();
        const bottom = Math.min(r.bottom, window.innerHeight - 110);
        const v = x.y < r.top + 70 ? -Math.ceil((r.top + 70 - x.y) / 5) : x.y > bottom - 70 ? Math.ceil((x.y - bottom + 70) / 5) : 0;
        if (v) { scroller.scrollTop += v; follow(); retarget(); }
      }
      x.raf = requestAnimationFrame(tick);
    };
    s.raf = requestAnimationFrame(tick);
  };

  /** spread onto each tile; a handle inside it can take `handle(id)` to drag at once */
  const press = (id: string, instant: boolean) => (e: RPointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const el = e.currentTarget.closest<HTMLElement>('[data-hid]') ?? e.currentTarget;
      if (instant) e.preventDefault();
      const r = el.getBoundingClientRect();
      const zones = optsRef.current.zones;
      st.current = { id, el, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, gx: e.clientX - r.left, gy: e.clientY - r.top, active: false, instant, zones, from: zoneOf(zones, id) };
      st.current.timer = setTimeout(activate, instant ? 160 : HOLD_MS);
  };
  const noMenu = (e: { preventDefault: () => void }) => e.preventDefault();
  const bind = (id: string) => ({ 'data-hid': id, 'data-lift': liftId === id || undefined, onPointerDown: press(id, false), onContextMenu: noMenu });
  const handle = (id: string) => ({ onPointerDown: press(id, true), onContextMenu: noMenu, style: { touchAction: 'none' } as const });
  /** true right after a drop: the click that follows must not open the tile */
  const justDropped = () => Date.now() - lastDrop.current < 400;

  return { zones: preview ?? opts.zones, liftId, bind, handle, justDropped };
}
