// Where the forest's bottom sheet rests (wave 3 spec, section 6): how much of it shows
// above the bottom edge of the screen (`visible`, px, with the bottom inset). Pure
// functions, also called from gesture worklets on the UI thread. The release itself is
// decided by the main sheet's `pickDetent` (ui/sheet/detents.ts), only imported here.
import { Detent, pickDetent } from '@/ui/sheet/detents';

export type ForestDetent = 'hidden' | 'peek' | 'card' | 'list' | 'empty';

/** Above the grabber. */
export const SHEET_TOP = 8;
/** The grabber's row. */
export const GRAB = 20;
/** Folded: 4 above the three facts, 32 the facts, 16 below them. */
export const PEEK_BODY = 4 + 32 + 16;
/** No trees: the invitation to plant. */
export const EMPTY_BODY = 160;
/** In the list the sheet's top stops this far under the top inset. */
export const LIST_TOP = 64;
/** Card heights before they are measured (spec 3.2): one row of buttons, two rows, two rows with a wrapped status. */
export const CARD_EXPECTED = { oneRow: 194, twoRows: 254, narrowWrapped: 280 };
/** Narrower than this the card puts its main button on a row of its own. */
export const NARROW = 360;

export interface ForestSizes {
  /** Measured card, from the sheet's top edge to the end of its bottom padding, without the inset. */
  card: number;
  bottomInset: number;
  topInset: number;
  screenH: number;
}

/** The card's height before it is measured: two rows of buttons on a narrow screen or for a long main button. */
export function expectedCard(width: number, twoRows: boolean): number {
  if (width < NARROW) return CARD_EXPECTED.narrowWrapped;
  return twoRows ? CARD_EXPECTED.twoRows : CARD_EXPECTED.oneRow;
}

/** Visible height of each place; none goes above the list's top. */
export function forestHeights(s: ForestSizes): Record<ForestDetent, number> {
  'worklet';
  const list = s.screenH - (s.topInset + LIST_TOP);
  const fit = (v: number) => Math.min(v + s.bottomInset, list);
  return {
    hidden: 0,
    peek: fit(SHEET_TOP + GRAB + PEEK_BODY),
    card: fit(s.card),
    list,
    empty: fit(SHEET_TOP + GRAB + EMPTY_BODY),
  };
}

/**
 * Where a drag can take the sheet, from low to high (spec 6): folded ↔ list, card ↔ list,
 * card → folded. From the list it goes back to where it came from (`base`).
 * The empty sheet and the hidden one don't move.
 */
export function dragPath(start: ForestDetent, base: ForestDetent): ForestDetent[] {
  'worklet';
  switch (start) {
    case 'peek': return ['peek', 'list'];
    case 'card': return ['peek', 'card', 'list'];
    case 'list': return base === 'card' ? ['card', 'list'] : ['peek', 'list'];
    default: return [start];
  }
}

/** Where a released sheet goes: the main sheet's rule (nearest place, a flick moves on) on the forest's places. */
export function pickForestDetent(
  visible: number,
  vy: number,
  start: ForestDetent,
  path: ForestDetent[],
  h: Record<ForestDetent, number>,
): ForestDetent {
  'worklet';
  // pickDetent only compares heights of the places it is given; the names pass through.
  return pickDetent(visible, vy, start as unknown as Detent, path as unknown as Detent[], h as unknown as Record<Detent, number>) as unknown as ForestDetent;
}

/** The grabber's tap: folded or card → list, the list → back where it came from. */
export function tapTarget(current: ForestDetent, base: ForestDetent): ForestDetent {
  switch (current) {
    case 'peek':
    case 'card': return 'list';
    case 'list': return base;
    default: return current;
  }
}

/** The place under the list: the card when a tree is chosen, else folded; empty and hidden stay. */
export function baseDetent(o: { empty: boolean; moving: boolean; selected: boolean }): ForestDetent {
  if (o.moving) return 'hidden';
  if (o.empty) return 'empty';
  return o.selected ? 'card' : 'peek';
}

/** 0 at the base place, 1 at the list: the scrim and the cross-fade of the contents. */
export function listProgress(visible: number, baseH: number, listH: number): number {
  'worklet';
  if (listH <= baseH) return visible >= listH ? 1 : 0;
  return Math.min(Math.max((visible - baseH) / (listH - baseH), 0), 1);
}
