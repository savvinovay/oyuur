// How big a tree looks on screen. Each kind draws its stages at their own size;
// here the drawing is zoomed so that the tree looks a little bigger every day of
// growth, whatever the kind, and still fits into the picture.
import { Skin, Stage, stageOf } from '@/game/tree';

/** The picture is CANVAS_W × CANVAS_H units; the tree stands on BASE_Y. */
export const CANVAS_W = 300;
export const CANVAS_H = 320;
export const BASE_Y = 312;

export interface Size {
  /** Full width of the drawing, units. */
  w: number;
  /** Height from the ground to the top, units. */
  h: number;
}

export type Look = Stage | 'deadSmall' | 'dead';

const OAK_SIZES: Record<Look, Size> = {
  sprout: { w: 46, h: 40 },
  seedling: { w: 70, h: 84 },
  bush: { w: 124, h: 124 },
  young: { w: 136, h: 200 },
  tree: { w: 230, h: 262 },
  grand: { w: 292, h: 300 },
  deadSmall: { w: 44, h: 42 },
  dead: { w: 130, h: 140 },
};

/** Size of each kind's drawing at every stage (the drawings follow these numbers). */
export const SIZES: Record<Skin, Record<Look, Size>> = {
  oak: OAK_SIZES,
  sakura: {
    sprout: { w: 46, h: 40 },
    seedling: { w: 66, h: 84 },
    bush: { w: 120, h: 120 },
    young: { w: 150, h: 196 },
    tree: { w: 250, h: 252 },
    grand: { w: 280, h: 290 },
    deadSmall: { w: 44, h: 42 },
    dead: { w: 140, h: 136 },
  },
  spruce: {
    sprout: { w: 34, h: 40 },
    seedling: { w: 50, h: 86 },
    bush: { w: 84, h: 128 },
    young: { w: 104, h: 210 },
    tree: { w: 150, h: 272 },
    grand: { w: 200, h: 304 },
    deadSmall: { w: 40, h: 42 },
    dead: { w: 134, h: 150 },
  },
  // Wave 5 kinds, measured on the drawings (the width is twice the farthest edge from the
  // axis). Where a kind's shape would break the growth rule (each stage bigger and wider
  // than the last, tests/layout.test.ts) the box is roomier than the drawing: a slim birch
  // gets a wider box, a short wide apple tree and a flat palm fan a taller one (then drawn smaller).
  birch: {
    sprout: { w: 40, h: 38 },
    seedling: { w: 64, h: 88 },
    bush: { w: 98, h: 130 },
    young: { w: 118, h: 228 },
    tree: { w: 166, h: 298 },
    grand: { w: 218, h: 302 },
    deadSmall: { w: 44, h: 42 },
    dead: { w: 130, h: 140 },
  },
  maple: {
    sprout: { w: 40, h: 40 },
    seedling: { w: 60, h: 88 },
    bush: { w: 110, h: 122 },
    young: { w: 148, h: 208 },
    tree: { w: 248, h: 272 },
    grand: { w: 296, h: 306 },
    deadSmall: { w: 44, h: 42 },
    dead: { w: 130, h: 140 },
  },
  apple: {
    sprout: { w: 40, h: 38 },
    seedling: { w: 62, h: 84 },
    bush: { w: 104, h: 118 },
    young: { w: 174, h: 188 },
    tree: { w: 258, h: 258 },
    grand: { w: 292, h: 300 },
    deadSmall: { w: 44, h: 42 },
    dead: { w: 130, h: 140 },
  },
  palm: {
    sprout: { w: 40, h: 32 },
    seedling: { w: 80, h: 74 },
    bush: { w: 148, h: 131 },
    young: { w: 176, h: 228 },
    tree: { w: 246, h: 296 },
    grand: { w: 274, h: 314 },
    deadSmall: { w: 44, h: 42 },
    dead: { w: 130, h: 140 },
  },
};

// Share of the usable height the tree fills on a growth day; rises every day.
// On the first day of a new stage it jumps, so the new shape is clearly bigger
// (wider too, not just taller) than the old one: a slim young tree must not look
// smaller than the round bush it grew from.
const CURVE: [day: number, share: number][] = [
  [0, 0.14], [2, 0.16], [3, 0.26], [6, 0.3], [7, 0.32], [20, 0.37], [21, 0.6],
  [49, 0.7], [50, 0.72], [99, 0.84], [100, 0.95], [365, 0.97],
];

export function heightShare(days: number): number {
  if (days <= CURVE[0][0]) return CURVE[0][1];
  for (let i = 1; i < CURVE.length; i++) {
    const [d1, s1] = CURVE[i];
    if (days <= d1) {
      const [d0, s0] = CURVE[i - 1];
      return s0 + ((s1 - s0) * (days - d0)) / (d1 - d0);
    }
  }
  return CURVE[CURVE.length - 1][1];
}

export function lookOf(days: number, dead: boolean): Look {
  if (dead) return days < 7 ? 'deadSmall' : 'dead';
  return stageOf(days).stage;
}

/** Units → screen zoom for a tree of this kind and age. */
export function treeZoom(skin: Skin, days: number, dead: boolean): number {
  const size = SIZES[skin][lookOf(days, dead)];
  const usable = BASE_Y - 4;
  return Math.min((heightShare(days) * usable) / size.h, (CANVAS_W * 0.97) / size.w);
}

/**
 * Extra zoom for a small picture (a forest card): the youngest tree fills `min` of
 * the picture's height, the biggest stays as it is, and the ones between are spread
 * over that range, so an older tree still looks bigger. 0 — no extra zoom.
 */
export function fillZoom(skin: Skin, days: number, dead: boolean, min: number): number {
  if (min <= 0) return 1;
  const size = SIZES[skin][lookOf(days, dead)];
  const zoom = treeZoom(skin, days, dead);
  const top = (BASE_Y - 4) / CANVAS_H;
  const low = (heightShare(0) * (BASE_Y - 4)) / CANVAS_H;
  const share = (zoom * size.h) / CANVAS_H;
  const t = Math.min(1, Math.max(0, (share - low) / (top - low)));
  const want = min + (top - min) * t;
  const byWidth = (CANVAS_W * 0.97) / (zoom * size.w);
  return Math.max(1, Math.min(want / share, byWidth));
}
