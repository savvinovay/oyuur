// What the ground of the forest map is made of (wave 3 spec, 1.3): the wild meadow
// around the plot, the lawn, its bank and fence, and the marks under the trees. Pure
// functions that give points and SVG path strings; ForestGround turns them into Skia
// paths once per plot size. The bank and fence also take a fractional size `s` (the
// plot growing, 5.3), so those builders are worklets that run every frame of the growth.
import type { Cell } from '@/game/plot';
import { seeded } from '@/ui/meadow/hills';
import { BANK, cellCenter, plotBox, worldToCell } from './iso';

/** Never more tufts than this on the wild meadow, all in one path per color (spec 8). */
export const MAX_TUFTS = 1500;
/** The wild meadow reaches this far around the plot, world px. */
export const WILD_MARGIN = 1400;
/** Most tufts are near the plot, where the camera usually looks. */
const NEAR_MARGIN = 600;
const NEAR_SHARE = 0.6;
/** Bushes and stones. */
export const MAX_DECOR = 60;
/** Tufts keep this far from the lawn edge, cells. */
const TUFT_GAP = 0.25;
const DECOR_GAP = 0.6;
/** Share of wild tufts with a flower (1.3). */
const FLOWER_SHARE = 0.16;
/** Little tufts on the lawn, per cell, and their scale. */
const LAWN_TUFTS = 1.2;
export const LAWN_TUFT_SCALE = 0.45;

/** Fence (1.1): post 3.6×13, rails 1.9 thick at 10 and 5 px over the edge. */
export const POST_W = 3.6;
export const POST_H = 13;
export const RAIL_W = 1.9;
const RAILS = [10, 5];

/** Past generations stand around the tree's feet (1.5), world px. */
export const STUMP_SPOTS: [number, number][] = [[-24, 7], [21, 9], [-12, 13]];

export interface Tuft { x: number; y: number; s: number; shade: 0 | 1; flower: number }
export interface Decor { x: number; y: number; k: number; kind: 'bush' | 'stone' }
export interface Wild { tufts: Tuft[]; decor: Decor[] }
export interface Point { x: number; y: number }
/** A pebble on the bank: which face, how far along it (0…1), how deep (share of the bank). */
export interface Pebble { side: 0 | 1; t: number; d: number }

/** On the plot, `margin` cells around it included. */
export function onPlot(x: number, y: number, size: number, margin: number): boolean {
  const f = worldToCell(x, y);
  const lo = -0.5 - margin;
  const hi = size - 0.5 + margin;
  return f.c > lo && f.r > lo && f.c < hi && f.r < hi;
}

/** Tufts, flowers, bushes and stones around a plot of this size: the same every time. */
export function wildMeadow(size: number): Wild {
  const rnd = seeded(4049 + size);
  const box = plotBox(size);
  const tufts: Tuft[] = [];
  const scatter = (count: number, margin: number) => {
    for (let i = 0; i < count; i++) {
      const x = box.left - margin + rnd() * (box.right - box.left + 2 * margin);
      const y = box.top - margin + rnd() * (box.bottom - box.top + 2 * margin);
      const s = 0.7 + rnd() * 0.7;
      const shade = (rnd() < 0.5 ? 0 : 1) as 0 | 1;
      const flower = rnd() < FLOWER_SHARE ? Math.floor(rnd() * 4) : -1;
      if (!onPlot(x, y, size, TUFT_GAP)) tufts.push({ x, y, s, shade, flower });
    }
  };
  scatter(Math.round(MAX_TUFTS * NEAR_SHARE), NEAR_MARGIN);
  scatter(MAX_TUFTS - Math.round(MAX_TUFTS * NEAR_SHARE), WILD_MARGIN);

  // Bushes and stones in a loose ring around the plot, more of them close by.
  const decor: Decor[] = [];
  const mid = { x: 0, y: (box.top + box.bottom) / 2 };
  const halfW = (box.right - box.left) / 2;
  const halfH = (box.bottom - box.top) / 2;
  for (let i = 0; i < MAX_DECOR; i++) {
    const angle = rnd() * Math.PI * 2;
    const dist = 70 + 700 * rnd() * rnd();
    const x = mid.x + Math.cos(angle) * (halfW + dist);
    const y = mid.y + Math.sin(angle) * (halfH + dist * 0.55);
    const k = 0.7 + rnd() * 0.8;
    const kind = rnd() < 0.7 ? 'bush' : 'stone';
    if (!onPlot(x, y, size, DECOR_GAP)) decor.push({ x, y, k, kind });
  }
  return { tufts, decor };
}

/** Little tufts scattered over the lawn. */
export function lawnTufts(size: number): Point[] {
  const rnd = seeded(733 + size);
  return Array.from({ length: Math.round(LAWN_TUFTS * size * size) }, () =>
    cellCenter({ c: rnd() * size - 0.5, r: rnd() * size - 0.5 }),
  );
}

/** Pebbles on the bank, three per cell of a side. */
export function bankPebbles(size: number): Pebble[] {
  const rnd = seeded(97 + size);
  return Array.from({ length: size * 3 }, () => ({ t: rnd(), side: (rnd() < 0.5 ? 0 : 1) as 0 | 1, d: 0.35 + rnd() * 0.45 }));
}

// ---------- SVG path strings ----------

const n = (v: number) => {
  'worklet';
  return Math.round(v * 100) / 100;
};

export function ellipseSvg(cx: number, cy: number, rx: number, ry: number): string {
  'worklet';
  return `M${n(cx - rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx + rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx - rx)} ${n(cy)}Z`;
}

export function polySvg(points: Point[], close = true): string {
  'worklet';
  let d = '';
  for (let i = 0; i < points.length; i++) d += `${i ? 'L' : 'M'}${n(points[i].x)} ${n(points[i].y)}`;
  return close ? `${d}Z` : d;
}

/** A tuft of three blades from one foot (the mock-up's shape), `s` — its scale. */
export function tuftSvg(x: number, y: number, s: number): string {
  return `M${n(x - 3 * s)} ${n(y)}Q${n(x - 3.5 * s)} ${n(y - 6 * s)} ${n(x - 5 * s)} ${n(y - 9 * s)}`
    + `Q${n(x - 1.5 * s)} ${n(y - 5 * s)} ${n(x)} ${n(y)}Q${n(x + 0.4 * s)} ${n(y - 8 * s)} ${n(x + s)} ${n(y - 11 * s)}`
    + `Q${n(x + 2 * s)} ${n(y - 6 * s)} ${n(x + 2.4 * s)} ${n(y)}Q${n(x + 4 * s)} ${n(y - 6 * s)} ${n(x + 6 * s)} ${n(y - 8 * s)}`
    + `Q${n(x + 4 * s)} ${n(y - 3 * s)} ${n(x + 4 * s)} ${n(y)}Z`;
}

export interface WildSvg {
  tufts: [string, string];
  /** One path per flower color. */
  flowers: string[];
  bushShadow: string;
  bush: string;
  bushTop: string;
  stoneSide: string;
  stone: string;
}

/** The wild meadow as paths; flowers cycle through `flowerColors` colors. */
export function wildSvg(wild: Wild, flowerColors: number): WildSvg {
  const tufts: [string[], string[]] = [[], []];
  const flowers: string[][] = Array.from({ length: flowerColors }, () => []);
  for (const t of wild.tufts) {
    tufts[t.shade].push(tuftSvg(t.x, t.y, t.s));
    if (t.flower >= 0) flowers[t.flower % flowerColors].push(ellipseSvg(t.x + 7, t.y - 2, 1.9, 1.9));
  }
  const parts = { bushShadow: [] as string[], bush: [] as string[], bushTop: [] as string[], stoneSide: [] as string[], stone: [] as string[] };
  for (const { x, y, k, kind } of wild.decor) {
    if (kind === 'bush') {
      parts.bushShadow.push(ellipseSvg(x + 4 * k, y + 2 * k, 22 * k, 7 * k));
      parts.bush.push(ellipseSvg(x - 9 * k, y - 7 * k, 10 * k, 10 * k), ellipseSvg(x + 8 * k, y - 6 * k, 11 * k, 11 * k), ellipseSvg(x, y - 13 * k, 12 * k, 12 * k));
      parts.bushTop.push(ellipseSvg(x - 3 * k, y - 17 * k, 6 * k, 6 * k), ellipseSvg(x + 9 * k, y - 11 * k, 4 * k, 4 * k));
    } else {
      parts.stoneSide.push(ellipseSvg(x, y, 9 * k, 5 * k));
      parts.stone.push(ellipseSvg(x - k, y - 2 * k, 8 * k, 4.4 * k));
    }
  }
  const join = (list: string[]) => list.join('');
  return {
    tufts: [join(tufts[0]), join(tufts[1])],
    flowers: flowers.map(join),
    bushShadow: join(parts.bushShadow),
    bush: join(parts.bush),
    bushTop: join(parts.bushTop),
    stoneSide: join(parts.stoneSide),
    stone: join(parts.stone),
  };
}

/** The lawn in stripes by column (even, odd) and its little tufts. */
export function lawnSvg(size: number): { stripes: [string, string]; tufts: string } {
  const stripes: [string[], string[]] = [[], []];
  const a = -0.5;
  const e = size - 0.5;
  for (let c = 0; c < size; c++) {
    stripes[c % 2].push(polySvg([
      cellCenter({ c: c - 0.5, r: a }), cellCenter({ c: c + 0.5, r: a }),
      cellCenter({ c: c + 0.5, r: e }), cellCenter({ c: c - 0.5, r: e }),
    ]));
  }
  const tufts = lawnTufts(size).map((p) => tuftSvg(p.x, p.y, LAWN_TUFT_SCALE)).join('');
  return { stripes: [stripes[0].join(''), stripes[1].join('')], tufts };
}

/**
 * Corners of a plot `s` cells wide in the middle of a `size` plot (s may be fractional
 * while the plot grows): the back (top), right, front (bottom) and left corners.
 */
export function plotCorners(s: number, size: number): { top: Point; right: Point; bottom: Point; left: Point } {
  'worklet';
  const a = (size - 1) / 2 - s / 2;
  const b = a + s;
  return {
    top: cellCenter({ c: a, r: a }),
    right: cellCenter({ c: b, r: a }),
    bottom: cellCenter({ c: b, r: b }),
    left: cellCenter({ c: a, r: b }),
  };
}

export interface EdgeSvg {
  /** The lawn's diamond: the clip of the lawn and the shape of its shadow. */
  diamond: string;
  bankL: string;
  bankR: string;
  bankLine: string;
  lip: string;
  pebbles: string;
}

/** The plot's outline, bank and light lip for a plot `s` cells wide. */
export function edgeSvg(s: number, size: number, pebbles: Pebble[]): EdgeSvg {
  'worklet';
  const { top, right, bottom, left } = plotCorners(s, size);
  const down = (p: Point, d: number) => ({ x: p.x, y: p.y + d });
  let stones = '';
  for (let i = 0; i < pebbles.length; i++) {
    const { side, t, d } = pebbles[i];
    const A = side === 0 ? left : bottom;
    const B = side === 0 ? bottom : right;
    stones += ellipseSvg(A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t + BANK * d, 1.6, 1);
  }
  return {
    diamond: polySvg([top, right, bottom, left]),
    bankL: polySvg([left, bottom, down(bottom, BANK), down(left, BANK)]),
    bankR: polySvg([bottom, right, down(right, BANK), down(bottom, BANK)]),
    bankLine: polySvg([down(left, BANK), down(bottom, BANK), down(right, BANK)], false),
    lip: polySvg([left, bottom, right], false),
    pebbles: stones,
  };
}

/** Fence posts at every cell corner along the four edges: 4·s for a whole plot, each corner once. */
export function fencePosts(s: number, size: number): Point[] {
  'worklet';
  const a = (size - 1) / 2 - s / 2;
  const b = a + s;
  // Posts every cell from a corner; a fractional edge ends in its own corner post.
  const steps: number[] = [];
  for (let k = 0; k <= s + 1e-6; k++) steps.push(a + k);
  if (b - steps[steps.length - 1] > 0.05) steps.push(b);
  const last = steps.length - 1;
  const posts: Point[] = [];
  for (let i = 0; i <= last; i++) posts.push(cellCenter({ c: steps[i], r: a }));
  for (let i = 1; i <= last; i++) posts.push(cellCenter({ c: b, r: steps[i] }));
  for (let i = last - 1; i >= 0; i--) posts.push(cellCenter({ c: steps[i], r: b }));
  for (let i = last - 1; i >= 1; i--) posts.push(cellCenter({ c: a, r: steps[i] }));
  return posts;
}

export interface FenceSvg { rails: string; post: string; postSide: string; cap: string }

/** The fence of a plot `s` cells wide: rails (stroked) and posts (filled), back posts first. */
export function fenceSvg(s: number, size: number): FenceSvg {
  'worklet';
  const { top, right, bottom, left } = plotCorners(s, size);
  let rails = '';
  for (let i = 0; i < RAILS.length; i++) {
    const h = RAILS[i];
    const up = (p: Point) => ({ x: p.x, y: p.y - h });
    rails += polySvg([up(top), up(right), up(bottom), up(left)]);
  }
  const posts = fencePosts(s, size).sort((p, q) => p.y - q.y);
  let post = '';
  let postSide = '';
  let cap = '';
  for (let i = 0; i < posts.length; i++) {
    const { x, y } = posts[i];
    post += polySvg([{ x: x - POST_W / 2, y: y - POST_H }, { x: x + POST_W / 2, y: y - POST_H }, { x: x + POST_W / 2, y }, { x: x - POST_W / 2, y }]);
    postSide += polySvg([{ x, y: y - POST_H }, { x: x + POST_W / 2, y: y - POST_H }, { x: x + POST_W / 2, y }, { x, y }]);
    cap += ellipseSvg(x, y - POST_H, POST_W / 2, POST_W / 4);
  }
  return { rails, post, postSide, cap };
}

// ---------- Under the trees ----------

/** A tree on the ground: its feet, the width of its crown and how many past tries it had. */
export interface GroundTree { x: number; y: number; w: number; past: number }

/** Shadow under a tree (1.3, layer 12). */
export function treeShadow(x: number, y: number, w: number, k = 1): string {
  'worklet';
  return ellipseSvg(x + 5, y + 1.5, Math.max(10, 0.36 * w) * k, Math.max(4, 0.13 * w));
}

/** The hole at the trunk: never smaller than 24×9, so even a sprout's spot is seen from afar. */
export function treeHole(x: number, y: number, w: number): string {
  'worklet';
  return ellipseSvg(x, y, Math.min(16, Math.max(12, 0.2 * w)), Math.min(6, Math.max(4.5, 0.075 * w)));
}

export interface StumpSvg { shadow: string; body: string; top: string; ring: string }

/** Stumps of past generations around these feet: up to three. */
export function stumpsSvg(trees: GroundTree[]): StumpSvg {
  const out = { shadow: '', body: '', top: '', ring: '' };
  for (const t of trees) {
    for (let i = 0; i < Math.min(3, t.past); i++) {
      const x = t.x + STUMP_SPOTS[i][0];
      const y = t.y + STUMP_SPOTS[i][1];
      const w = 9;
      const h = 6;
      out.shadow += ellipseSvg(x + 1.5, y + 1, w * 0.8, w * 0.3);
      // A short cylinder: straight sides, a rounded bottom.
      out.body += `M${n(x - w / 2)} ${n(y - h)}L${n(x - w / 2)} ${n(y)}A${w / 2} ${n(w * 0.22)} 0 0 0 ${n(x + w / 2)} ${n(y)}L${n(x + w / 2)} ${n(y - h)}Z`;
      out.top += ellipseSvg(x, y - h, w / 2, w * 0.22);
      out.ring += ellipseSvg(x, y - h, w * 0.22, w * 0.09);
    }
  }
  return out;
}

/** A cell's diamond, `k` of its size. */
export function cellSvg(cell: Cell, k: number): string {
  'worklet';
  const h = k / 2;
  return polySvg([
    cellCenter({ c: cell.c - h, r: cell.r - h }),
    cellCenter({ c: cell.c + h, r: cell.r - h }),
    cellCenter({ c: cell.c + h, r: cell.r + h }),
    cellCenter({ c: cell.c - h, r: cell.r + h }),
  ]);
}

/** Free cells as dashed diamonds, grouped by Chebyshev distance from `from` (the wave of 4.2). */
export function freeCellRings(free: Cell[], from: Cell): { d: number; path: string }[] {
  const rings = new Map<number, string[]>();
  for (const cell of free) {
    const d = Math.max(Math.abs(cell.c - from.c), Math.abs(cell.r - from.r));
    const list = rings.get(d) ?? [];
    list.push(cellSvg(cell, 0.8));
    rings.set(d, list);
  }
  return [...rings.entries()].sort((a, b) => a[0] - b[0]).map(([d, list]) => ({ d, path: list.join('') }));
}
