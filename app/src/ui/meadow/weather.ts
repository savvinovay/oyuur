// Weather over the meadow (wave 5 spec, 10.5): falling leaves in autumn, snow in winter,
// petals and two butterflies on the blossom meadow. Every particle's place is a pure
// function of the scene clock, so it can be worked out on the UI thread each frame and
// tested without a canvas. All places are in screen px of the scene.
import type { Weather } from './themes';

/** Where the weather falls, screen px. */
export interface WeatherBox {
  width: number;
  /** Particles appear here (the top of the scene). */
  top: number;
  /** Leaves and petals are gone by this line (the front edge of the grass); snow falls to `bottom`. */
  grassY: number;
  bottom: number;
  /** The horizon: butterflies flutter below it. */
  horizonY: number;
}

export interface Particle {
  x: number;
  y: number;
  /** Leaf length, flake radius or petal length, px. */
  size: number;
  /** Degrees. */
  rot: number;
  alpha: number;
  /** Index into the weather's colors. */
  color: number;
  /** Leaves: a maple leaf (else an almond one). */
  maple: boolean;
}

export interface Butterfly {
  x: number;
  y: number;
  /** Wings squeezed along x: 1 open, 0.3 nearly shut. */
  open: number;
  /** Wings tilt with the way it flies, degrees. */
  rot: number;
}

/** Particles by day / by night (10.5); a weak phone gets half. */
const COUNTS: Record<Weather, [day: number, night: number]> = { leaves: [6, 4], snow: [26, 20], petals: [10, 8] };

export function weatherCount(kind: Weather, night: boolean, weak: boolean): number {
  'worklet';
  const n = COUNTS[kind][night ? 1 : 0];
  return weak ? Math.ceil(n / 2) : n;
}

/** Butterflies fly only by day over the blossom meadow. */
export const butterflyCount = (kind: Weather | null, night: boolean) => (kind === 'petals' && !night ? 2 : 0);

/** A repeatable number 0..1 for particle `i` and property `k`. */
export function hash01(i: number, k: number): number {
  'worklet';
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function wrap(x: number, period: number): number {
  'worklet';
  return ((x % period) + period) % period;
}

/** How long a leaf takes to fade out at the grass, s. */
const FADE = 0.3;

/** Particle `i` of the weather at `t` seconds. */
export function particleAt(kind: Weather, i: number, t: number, box: WeatherBox, colors: number): Particle {
  'worklet';
  const h = (k: number) => hash01(i, k);
  const color = Math.floor(h(9) * colors) % Math.max(1, colors);
  if (kind === 'snow') {
    const speed = 18 + 16 * h(1);
    const period = 3 + 2 * h(2);
    const span = box.bottom - box.top;
    const y = box.top + wrap(h(6) * span + speed * t, span);
    const x = wrap(h(5) * box.width + 10 * Math.sin((2 * Math.PI * t) / period + h(3) * 6.28), box.width);
    return { x, y, size: 1 + 1.6 * h(4), rot: 0, alpha: 0.75 + 0.25 * h(7), color, maple: false };
  }
  if (kind === 'leaves') {
    const speed = 24 + 16 * h(1);
    const period = 2.6 + 1.2 * h(2);
    const span = box.grassY - box.top;
    const fall = wrap(h(6) * span + speed * t, span);
    const fade = speed * FADE;
    // Fades in under the top and out at the grass, so a leaf never pops.
    const alpha = Math.max(0, Math.min(1, fall / fade, (span - fall) / fade));
    const x = wrap(h(5) * (box.width + 24) + 18 * Math.sin((2 * Math.PI * t) / period + h(3) * 6.28), box.width + 24) - 12;
    const turn = h(8) < 0.5 ? -1 : 1;
    return { x, y: box.top + fall, size: 8 + 3 * h(4), rot: h(7) * 360 + turn * 90 * t, alpha, color, maple: h(10) < 0.5 };
  }
  // Petals drift sideways and a little down.
  const vx = 20 + 15 * h(1);
  const vy = 4 + 6 * h(2);
  const span = box.grassY - box.top;
  const fall = wrap(h(6) * span + vy * t, span);
  const fade = 12;
  const alpha = Math.max(0, Math.min(1, fall / fade, (span - fall) / fade));
  const x = wrap(h(5) * (box.width + 20) + vx * t, box.width + 20) - 10;
  return { x, y: box.top + fall + 4 * Math.sin(2 * t + h(3) * 6.28), size: 6.4, rot: h(7) * 180 + 40 * t, alpha, color, maple: false };
}

/** Lissajous loop of a butterfly: 60 × 30 px, 9 s round. */
const LOOP = { w: 60, h: 30, period: 9 };
/** Wing beats per second. */
const BEATS = 6;

export function butterflyAt(i: number, t: number, box: WeatherBox): Butterfly {
  'worklet';
  const phase = hash01(i, 21) * 6.28;
  const cx = box.width * (0.22 + 0.56 * i);
  const cy = box.horizonY + 34 + 40 * hash01(i, 22);
  const a = (2 * Math.PI * t) / LOOP.period + phase;
  const dx = Math.cos(a) * (LOOP.w / 2);
  return {
    x: cx + Math.sin(a) * (LOOP.w / 2),
    y: cy + Math.sin(2 * a) * (LOOP.h / 2),
    open: 0.65 + 0.35 * Math.cos(2 * Math.PI * BEATS * t + phase),
    rot: dx > 0 ? 8 : -8,
  };
}

/** A weak phone (Android with a low pixel ratio) gets half the particles (10.5). */
export const weakPhone = (os: string, ratio: number) => os === 'android' && ratio <= 2;
