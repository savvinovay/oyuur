// Where the bottom sheet rests (spec section 1.1): how much of it shows above the
// bottom edge of the screen (`visible`, px, with the bottom inset). Pure functions,
// also called from gesture worklets on the UI thread.

export type Detent = 'peek' | 'normal' | 'menu' | 'empty' | 'emptyMenu';

/** Measured block heights and the screen, px. */
export interface SheetSizes {
  /** Status: water line and forecast (52 expected). */
  status: number;
  /** Day cards and the lock-in row (4 + 96 + 36 = 136 expected). */
  days: number;
  /** The menu (301, or 285 under 360 px wide; wave 5 spec 4.1). */
  menu: number;
  /** The "plant a tree" block when no habit is on the meadow (150). */
  empty: number;
  bottomInset: number;
  topInset: number;
  screenH: number;
}

/** Above the grabber. */
export const SHEET_TOP = 8;
/** The grabber's row (its touch area is 44 with hitSlop). */
export const GRAB = 20;
/** Under the status when the sheet is folded. */
export const PEEK_PAD = 12;
/** Between the days (or the empty block's padding) and the menu. */
export const GAP = 8;
/** The sheet's top never goes higher than this under the top inset. */
export const TOP_ROOM = 56;
/** How far the sheet stretches past its highest and lowest place, px. */
export const RUBBER = 60;
/** A release faster than this (px/s) moves the sheet at least one place on. */
export const FLING = 1000;
/** The scene needs this much room above the sheet in `normal`, or the sheet rests folded. */
export const REST_ROOM = 230;

/** Expected block heights before they are measured. */
export const DEFAULT_SIZES = { status: 52, days: 136, empty: 150 };
export const menuHeight = (width: number) => (width < 360 ? 285 : 301);

/** Visible height of each place, never higher than `topInset + 56` from the top. */
export function detentHeights(s: SheetSizes): Record<Detent, number> {
  'worklet';
  const cap = s.screenH - (s.topInset + TOP_ROOM);
  const fit = (v: number) => Math.min(v + s.bottomInset, cap);
  const normal = SHEET_TOP + GRAB + s.status + s.days + GAP;
  const empty = SHEET_TOP + GRAB + s.empty + PEEK_PAD;
  return {
    peek: fit(SHEET_TOP + GRAB + s.status + PEEK_PAD),
    normal: fit(normal),
    menu: fit(normal + s.menu),
    empty: fit(empty),
    emptyMenu: fit(empty + GAP + s.menu),
  };
}

/** Where the sheet rests by default: folded when the tree would be too small (spec 1.2). */
export function restDetent(s: SheetSizes, headerBottom: number, hasHabits: boolean): Detent {
  if (!hasHabits) return 'empty';
  const room = s.screenH - detentHeights(s).normal - headerBottom - 38;
  return room >= REST_ROOM ? 'normal' : 'peek';
}

/** The places the sheet can stop at, from low to high. */
export function detentList(hasHabits: boolean): Detent[] {
  'worklet';
  return hasHabits ? ['peek', 'normal', 'menu'] : ['empty', 'emptyMenu'];
}

/**
 * Where a released sheet goes: the place nearest to where it would fly in 150 ms;
 * a fast flick moves it at least one place on from where the gesture started.
 * `vy` is the release speed, px/s, up is positive.
 */
export function pickDetent(visible: number, vy: number, start: Detent, list: Detent[], h: Record<Detent, number>): Detent {
  'worklet';
  const projected = visible + vy * 0.15;
  let best = 0;
  for (let i = 1; i < list.length; i++) {
    if (Math.abs(h[list[i]] - projected) < Math.abs(h[list[best]] - projected)) best = i;
  }
  if (Math.abs(vy) > FLING) {
    let from = list.indexOf(start);
    if (from < 0) {
      // Started between places (the list changed): count from the nearest one.
      from = 0;
      for (let i = 1; i < list.length; i++) {
        if (Math.abs(h[list[i]] - visible) < Math.abs(h[list[from]] - visible)) from = i;
      }
    }
    if (vy > 0) best = Math.max(best, Math.min(from + 1, list.length - 1));
    else best = Math.min(best, Math.max(from - 1, 0));
  }
  return list[best];
}

/** Past the highest or lowest place the sheet stretches less and less, never more than 60 px. */
export function rubber(over: number): number {
  'worklet';
  return RUBBER * (1 - Math.exp(-over / 120));
}

/** The finger's height with the rubber band past the ends. */
export function dragVisible(raw: number, low: number, high: number): number {
  'worklet';
  if (raw > high) return high + rubber(raw - high);
  if (raw < low) return low - rubber(low - raw);
  return raw;
}

/** 0 at `from`, 1 at `to`, clamped. */
export function progress(visible: number, from: number, to: number): number {
  'worklet';
  if (to === from) return visible >= to ? 1 : 0;
  return Math.min(Math.max((visible - from) / (to - from), 0), 1);
}

/**
 * The grabber's tap: one place up, from the menu back to rest. On a small phone the sheet
 * rests folded and the days alone would hide the menu under the edge: the tap opens the menu.
 */
export function tapTarget(current: Detent, rest: Detent): Detent {
  switch (current) {
    case 'peek': return rest === 'peek' ? 'menu' : 'normal';
    case 'normal': return 'menu';
    case 'empty': return 'emptyMenu';
    default: return rest;
  }
}

/** The same place in the other list: the last habit is gone, or the first one planted. */
export function sameDetent(d: Detent, hasHabits: boolean, rest: Detent): Detent {
  'worklet';
  const up = d === 'menu' || d === 'emptyMenu';
  if (hasHabits) return up ? 'menu' : d === 'empty' ? rest : d;
  return up ? 'emptyMenu' : 'empty';
}

export const isMenu = (d: Detent) => {
  'worklet';
  return d === 'menu' || d === 'emptyMenu';
};
