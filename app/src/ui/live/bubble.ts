// Where the live tree stands and how big it is drawn, and where the "water me" bubble
// goes over it. Pure numbers, so they can be tested without a canvas.
import { Skin } from '@/game/tree';
import { SceneGeo } from '../scene/contract';
import { BASE_Y, CANVAS_W, Look, lookOf, SIZES, treeZoom } from '../trees/layout';

export const BUBBLE = 38;

/** How far the tail's tip reaches from the bubble's middle, left and down (each), px. */
export const TAIL_REACH = 24;

/** The tail's tip stops this far off the crown, px: the tree sways in the wind. */
const TAIL_GAP = 5;
/** Room kept between the bubble and the screen edge, and over its bob under the header, px. */
const EDGE = 6;
const BOB = 4;

/** Screen px per drawing unit for the front tree: as wide as allowed, never up on the header. */
export function treeK(geo: SceneGeo): number {
  return Math.min((geo.width * 0.86) / CANVAS_W, (geo.feetY - geo.headerBottom - 12) / (0.95 * (BASE_Y - 4)));
}

/** How big the tree is drawn on screen, px. */
export function drawnSize(skin: Skin, days: number, dead: boolean, k: number) {
  const s = SIZES[skin][lookOf(days, dead)];
  const zoom = treeZoom(skin, days, dead) * k;
  return { w: s.w * zoom, h: s.h * zoom };
}

/**
 * The outline of the leafy part, in drawing units from the feet (y up is negative):
 * an oval crown for leafy kinds, a cone for spruces. Small plants are their box.
 * The numbers follow the drawings in ui/trees.
 */
export type Outline =
  | { kind: 'oval'; cy: number; rx: number; ry: number }
  | { kind: 'cone'; top: number; base: number; half: number };

const OVALS: Partial<Record<Skin, Partial<Record<Look, [cy: number, rx: number, ry: number]>>>> = {
  oak: { young: [-150, 68, 50], tree: [-185, 115, 77], grand: [-200, 146, 100] },
  sakura: { young: [-150, 75, 46], tree: [-195, 125, 57], grand: [-220, 140, 70] },
  birch: { young: [-164, 48, 66], tree: [-200, 75, 98], grand: [-206, 109, 98] },
  maple: { young: [-150, 74, 54], tree: [-186, 124, 80], grand: [-202, 152, 98] },
  apple: { young: [-130, 87, 52], tree: [-162, 129, 72], grand: [-180, 146, 90] },
  // The palm's fronds lean right and droop: an oval around them, as wide as the farthest frond.
  palm: { young: [-118, 88, 58], tree: [-226, 123, 70], grand: [-240, 137, 74] },
};

// Spruce cones: tip, the lowest tier's edge and half its width (spruce.tsx, Cone).
const CONES: Partial<Record<Look, [top: number, base: number, half: number]>> = {
  bush: [-128, -10, 42],
  young: [-210, -24, 52],
  tree: [-272, -32, 75],
  grand: [-304, -38, 100],
};

export function crownOutline(skin: Skin, look: Look): Outline {
  const oval = OVALS[skin]?.[look];
  if (oval) return { kind: 'oval', cy: oval[0], rx: oval[1], ry: oval[2] };
  const cone = skin === 'spruce' ? CONES[look] : undefined;
  if (cone) return { kind: 'cone', top: cone[0], base: cone[1], half: cone[2] };
  const s = SIZES[skin][look];
  return { kind: 'oval', cy: -s.h / 2, rx: s.w / 2, ry: s.h / 2 };
}

/** The point of the outline the bubble's tail points at: its upper right, facing up-right. */
function contact(o: Outline): { x: number; y: number } {
  if (o.kind === 'cone') return { x: 0.3 * o.half, y: o.top + 0.3 * (o.base - o.top) };
  // Where the oval's edge faces 45° up-right: the bubble sits clear of it there.
  const l = Math.hypot(o.rx, o.ry);
  return { x: (o.rx * o.rx) / l, y: o.cy - (o.ry * o.ry) / l };
}

/**
 * Middle of the bubble, px from the tree's feet. Up and to the right of the crown, its
 * tail (down-left) ending just off the crown's edge, so the bubble never covers the tree,
 * whatever the kind and stage. It never goes past the screen edge or up on the header.
 */
export function bubbleSpot(skin: Skin, days: number, dead: boolean, geo: SceneGeo) {
  const zoom = treeZoom(skin, days, dead) * treeK(geo);
  const c = contact(crownOutline(skin, lookOf(days, dead)));
  const off = TAIL_REACH + TAIL_GAP / Math.SQRT2;
  const maxX = geo.width / 2 - BUBBLE / 2 - EDGE;
  const minY = geo.headerBottom + BOB + EDGE + BUBBLE / 2 - geo.feetY;
  return { x: Math.min(c.x * zoom + off, maxX), y: Math.max(c.y * zoom - off, minY) };
}
