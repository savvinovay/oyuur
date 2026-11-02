// The numbers of an acorn flight (wave 5 spec, sections 3.3–3.5): how many fly, how the
// amount is split between them, when each lands and the arc it flies along. Pure; the
// curve functions are also called from worklets on the UI thread.

export type Pt = { x: number; y: number };

/** Earning, ms from the start of the flight (spec 3.4). */
export const EARN = {
  /** The warm spot under the source: in, then out. */
  glowIn: 80,
  glowOut: 180,
  /** The acorns fan out of the source. */
  burst: 260,
  /** Each acorn leaves this much after the one before. */
  gap: 85,
  fly: 520,
  /** It goes out inside the wallet's glyph. */
  fade: 60,
  /** Fan-out distance, px, and the bend of the arc. */
  near: 18,
  far: 34,
  bend: 60,
};

/** Spending (spec 3.5): no fan-out, straight from the wallet into the item. */
export const SPEND = { from: 120, gap: 70, fly: 480, fade: 80, count: 6, tween: 600 };

/** The flock for an amount: +5 → 3, +10 → 4, +15 → 5, +20 → 6, +40 and more → 8. */
export const flockSize = (amount: number) => Math.min(8, Math.max(3, Math.round(amount / 5) + 2));

/** The amount split evenly between the acorns, the rest to the last one. */
export function shares(amount: number, n: number): number[] {
  const each = Math.floor(amount / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? amount - each * (n - 1) : each));
}

export const earnStart = (i: number) => EARN.burst + i * EARN.gap;
export const earnArrival = (i: number) => earnStart(i) + EARN.fly;
export const earnTotal = (n: number) => earnArrival(n - 1) + EARN.fade;
export const spendStart = (i: number) => SPEND.from + i * SPEND.gap;
export const spendArrival = (i: number) => spendStart(i) + SPEND.fly;
export const spendTotal = (n: number) => spendArrival(n - 1) + SPEND.fade;

/** The arc's control point: the middle of the path, bent `bend` px toward the middle of the screen. */
export function arcControl(from: Pt, to: Pt, center: Pt, bend = EARN.bend): Pt {
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return mid;
  let px = -dy / len;
  let py = dx / len;
  if (px * (center.x - mid.x) + py * (center.y - mid.y) < 0) {
    px = -px;
    py = -py;
  }
  return { x: mid.x + px * bend, y: mid.y + py * bend };
}

/** A point of the quadratic curve a → b bent by c, at t (0..1). */
export function bezier(a: Pt, c: Pt, b: Pt, t: number): Pt {
  'worklet';
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}
