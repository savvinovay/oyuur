// The sky's timetable and layout as pure functions of a seed and the time:
// when gusts blow, when birds fly by, when a star falls, where clouds and stars
// sit. The same seed always gives the same sky, so it can be tested, and the
// worklets that run every frame only look numbers up here.

/** Repeatable random number in [0, 1) for event `i` of a series seeded by `seed`. */
export function hash01(seed: number, i: number): number {
  'worklet';
  let h = Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((i | 0) + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Sequence of random numbers for laying things out once (not for worklets). */
export function rng(seed: number) {
  let i = 0;
  return () => hash01(seed, i++);
}

const lerp = (a: number, b: number, t: number) => {
  'worklet';
  return a + (b - a) * t;
};

// ---------- events that repeat at random intervals ----------

/** Events that come again and again: the first after `first` seconds, then every `gap`. */
export interface Series {
  first: [number, number];
  gap: [number, number];
  /** Mixed into the seed so that different series don't line up. */
  salt: number;
}

/** Gusts of wind: every 6–12 s. */
export const GUSTS: Series = { first: [6, 12], gap: [6, 12], salt: 101 };
/** Flocks of birds: the first after 4 s, so that people notice it, then every 18–40 s. */
export const FLOCKS: Series = { first: [4, 4], gap: [18, 40], salt: 202 };
/** Shooting stars: every 30–60 s. */
export const METEORS: Series = { first: [30, 60], gap: [30, 60], salt: 303 };

/** Seconds from the start to event 0 (k = -1), or from event k to event k + 1. */
export function gapAfter(s: Series, seed: number, k: number): number {
  'worklet';
  const [lo, hi] = k < 0 ? s.first : s.gap;
  return lerp(lo, hi, hash01(seed + s.salt, k + 1));
}

/**
 * Where a series stands: the last event `k` that has started (-1 if none yet),
 * when it started, and when event k + 1 will start.
 */
export type Cursor = [k: number, start: number, next: number];

const NEVER = -1e9;

export function cursorStart(s: Series, seed: number): Cursor {
  'worklet';
  return [-1, NEVER, gapAfter(s, seed, -1)];
}

/** Moves the cursor forward to time t. Cheap when called every frame; restarts if time went back. */
export function cursorAt(s: Series, seed: number, c: Cursor, t: number): Cursor {
  'worklet';
  let [k, start, next] = t < c[1] ? cursorStart(s, seed) : c;
  // A long pause (app in the background) skips the events that were missed.
  let guard = 0;
  while (t >= next && guard++ < 10000) {
    k += 1;
    start = next;
    next = start + gapAfter(s, seed, k);
  }
  return [k, start, next];
}

/** Start time of event k, counted from scratch (for tests and checks). */
export function eventStart(s: Series, seed: number, k: number): number {
  let t = 0;
  for (let i = -1; i < k; i++) t += gapAfter(s, seed, i);
  return t;
}

// ---------- wind ----------

/** Calm wind between gusts. */
export const GUST_BASE = 0.25;
export const GUST_RISE = 0.8;
export const GUST_HOLD = 0.5;
export const GUST_FALL = 1.8;

/** How strong gust k gets: 0.6–1.0. */
export function gustPeak(seed: number, k: number): number {
  'worklet';
  return lerp(0.6, 1, hash01(seed + GUSTS.salt + 1, k));
}

/** Wind strength `dt` seconds after a gust began: rises on a sine, holds, then dies down. */
export function gustEnvelope(dt: number, peak: number): number {
  'worklet';
  if (dt < 0) return GUST_BASE;
  const up = peak - GUST_BASE;
  if (dt < GUST_RISE) return GUST_BASE + (up * (1 - Math.cos((Math.PI * dt) / GUST_RISE))) / 2;
  if (dt < GUST_RISE + GUST_HOLD) return peak;
  const u = dt - GUST_RISE - GUST_HOLD;
  if (u < GUST_FALL) return GUST_BASE + (up * (1 + Math.cos((Math.PI * u) / GUST_FALL))) / 2;
  return GUST_BASE;
}

/** Wind strength at time t for an already moved cursor. */
export function gustFromCursor(seed: number, c: Cursor, t: number): number {
  'worklet';
  if (c[0] < 0) return GUST_BASE;
  return gustEnvelope(t - c[1], gustPeak(seed, c[0]));
}

/** Wind strength at time t, counted from scratch. */
export function gustAt(seed: number, t: number): number {
  return gustFromCursor(seed, cursorAt(GUSTS, seed, cursorStart(GUSTS, seed), t), t);
}

/** How much a gust speeds clouds up: 1 in calm air, 1.3 at the strongest gust. */
export function gustSpeed(gust: number): number {
  'worklet';
  return 1 + (0.3 * Math.max(0, gust - GUST_BASE)) / (1 - GUST_BASE);
}

// ---------- clouds ----------

export interface CloudLayer {
  count: number;
  scale: [number, number];
  /** Opacity by day and by night. */
  alpha: [number, number];
  /** Pixels per second. */
  speed: number;
  /** Shift per habit the camera moves, as a share of the screen width. */
  parallax: number;
  /** Band of the cloud centers, as shares of the scene height. */
  band: [number, number];
}

/** Far, middle and near clouds, drawn in this order. */
export const CLOUD_LAYERS: CloudLayer[] = [
  { count: 4, scale: [0.45, 0.55], alpha: [0.6, 0.45], speed: 4, parallax: 0.03, band: [0.3, 0.48] },
  { count: 3, scale: [0.75, 0.85], alpha: [0.85, 0.6], speed: 7, parallax: 0.07, band: [0.36, 0.52] },
  { count: 2, scale: [1, 1.1], alpha: [0.95, 0.7], speed: 11, parallax: 0.1, band: [0.38, 0.5] },
];

/** Clouds wrap around a field this much wider than the screen on each side. */
export const CLOUD_MARGIN = 120;
/** How far a cloud reaches above its center at scale 1. */
export const CLOUD_TOP = 26;

export interface CloudSpot {
  layer: number;
  /** Position at time 0, before the wind and the camera move it. */
  x0: number;
  y: number;
  scale: number;
  /** Extra horizontal stretch so the clouds don't look stamped. */
  stretch: number;
}

/** Where the clouds start. None of them rises above the header. */
export function cloudLayout(seed: number, width: number, height: number, headerBottom: number): CloudSpot[] {
  const r = rng(seed + 7);
  const field = width + 2 * CLOUD_MARGIN;
  const spots: CloudSpot[] = [];
  CLOUD_LAYERS.forEach((l, layer) => {
    const offset = r() * field;
    for (let i = 0; i < l.count; i++) {
      const scale = lerp(l.scale[0], l.scale[1], r());
      const top = headerBottom + 8 + CLOUD_TOP * scale;
      const lo = Math.max(l.band[0] * height, top);
      const hi = Math.max(l.band[1] * height, lo);
      // Spread evenly along the field with some jitter, so they never bunch up.
      const x0 = (offset + ((i + 0.5 + (r() - 0.5) * 0.6) / l.count) * field) % field;
      spots.push({ layer, x0, y: lerp(lo, hi, r()), scale, stretch: lerp(0.9, 1.15, r()) });
    }
  });
  return spots;
}

/** Cloud center x: drifts right with the wind, shifts against the camera, wraps around. */
export function cloudX(x0: number, layer: number, drift: number, camera: number, width: number): number {
  'worklet';
  const l = CLOUD_LAYERS[layer];
  const field = width + 2 * CLOUD_MARGIN;
  const x = x0 + l.speed * drift - camera * l.parallax * width;
  return (((x % field) + field) % field) - CLOUD_MARGIN;
}

// ---------- stars ----------

export interface Star {
  x: number;
  y: number;
  /** Radius of a dot, or the size of a sparkle. */
  r: number;
  alpha: number;
  /** Twinkle group 0..2. */
  group: number;
}

/** The three twinkle periods, seconds. */
export const TWINKLE_PERIODS = [3.1, 4.3, 5.7];
const TWINKLE_PHASES = [0.9, 1.9, 2.6];

/** Brightness factor of a twinkle group at time t: 0.2–1.0. At t = 0 each group has its own still value. */
export function twinkle(group: number, t: number): number {
  'worklet';
  return 0.6 + 0.4 * Math.sin((2 * Math.PI * t) / TWINKLE_PERIODS[group] + TWINKLE_PHASES[group]);
}

/** 46 dots and 14 four-pointed sparkles, kept off the moon. */
export function starLayout(seed: number, width: number, horizonY: number, moon: { x: number; y: number }) {
  const r = rng(seed + 13);
  const top = 30;
  const bottom = Math.max(horizonY - 40, top + 40);
  const place = (pad: number) => {
    for (let tries = 0; ; tries++) {
      const x = pad + r() * (width - 2 * pad);
      const y = top + r() * (bottom - top);
      if (Math.hypot(x - moon.x, y - moon.y) > 30 || tries > 20) return { x, y };
    }
  };
  const dots: Star[] = [];
  for (let i = 0; i < 46; i++) dots.push({ ...place(2), r: lerp(0.7, 1.7, r()), alpha: lerp(0.35, 0.95, r()), group: i % 3 });
  const sparkles: Star[] = [];
  for (let i = 0; i < 14; i++) sparkles.push({ ...place(10), r: lerp(2.4, 5.6, r()), alpha: lerp(0.55, 1, r()), group: i % 3 });
  return { dots, sparkles };
}

// ---------- birds ----------

/** Flight of one flock, seconds. */
export interface Bird {
  /** How far behind the leader, px. */
  behind: number;
  /** Own height offset, ±16 px. */
  dy: number;
  /** Wingspan, px. */
  span: number;
  /** Seconds per wing beat. */
  beat: number;
  phase: number;
  /** When the bird glides for 0.8 s without flapping, seconds into the flight; -1 if it doesn't. */
  glide: number;
}

export interface Flock {
  duration: number;
  /** 1: flies to the right, -1: to the left. */
  dir: number;
  y0: number;
  birds: Bird[];
}

export const MAX_BIRDS = 5;
export const GLIDE = 0.8;
const WING_UP = 0.49; // 28°
const WING_DOWN = -0.31; // -18°
const WING_GLIDE = 0.14; // 8°: wings held slightly raised

/** Flock k: 3–5 birds crossing the screen in 7–9 s, in the band 0.25–0.42 of the scene, below the header. */
export function flockOf(seed: number, k: number, height: number, headerBottom: number): Flock {
  'worklet';
  const s = seed + FLOCKS.salt + 2;
  const at = (j: number) => hash01(s, k * 64 + j);
  const duration = lerp(7, 9, at(0));
  const lo = Math.max(0.25 * height, headerBottom + 16);
  const hi = Math.max(0.42 * height, lo + 20);
  const count = 3 + Math.floor(at(2) * 3);
  const birds: Bird[] = [];
  for (let i = 0; i < count; i++) {
    const j = 4 + i * 8;
    const glides = at(j + 5) < 0.5;
    birds.push({
      behind: i === 0 ? 0 : i * 13 + (at(j) - 0.5) * 8,
      dy: (at(j + 1) * 2 - 1) * 16,
      span: lerp(10, 14, at(j + 2)),
      beat: lerp(0.32, 0.4, at(j + 3)),
      phase: at(j + 4) * 2 * Math.PI,
      glide: glides ? lerp(1, duration - 2, at(j + 6)) : -1,
    });
  }
  return { duration, dir: at(1) < 0.5 ? 1 : -1, y0: lerp(lo, hi, at(3)), birds };
}

export interface BirdPose {
  x: number;
  y: number;
  /** Wing angle, radians: positive is up. */
  wing: number;
  visible: boolean;
}

/** Where bird i of a flock is `time` seconds into its flight. */
export function birdPose(f: Flock, i: number, time: number, width: number): BirdPose {
  'worklet';
  const b = f.birds[i];
  if (!b || time < 0 || time > f.duration) return { x: -100, y: -100, wing: 0, visible: false };
  const p = time / f.duration;
  const tail = 4 * 16; // room for the birds behind the leader
  const lead = lerp(-30, width + 30 + tail, p);
  const along = lead - b.behind;
  const x = f.dir > 0 ? along : width - along;
  const y = f.y0 + 10 * Math.sin(2 * Math.PI * p * 1.5) + b.dy;
  const flap = lerp(WING_DOWN, WING_UP, 0.5 + 0.5 * Math.sin((2 * Math.PI * time) / b.beat + b.phase));
  let w = 0;
  if (b.glide >= 0) {
    // Ease into and out of the glide over 0.15 s so the wings don't snap.
    const into = (time - b.glide) / 0.15;
    const out = (b.glide + GLIDE - time) / 0.15;
    w = Math.max(0, Math.min(1, into, out));
  }
  return { x, y, wing: lerp(flap, WING_GLIDE, w), visible: x > -20 && x < width + 20 };
}

// ---------- shooting stars ----------

export const METEOR_TIME = 0.65;
export const METEOR_TRAIL = 90;
const METEOR_TRAVEL = 190;

export interface Meteor {
  x: number;
  y: number;
  /** Unit direction: down and to the left, 20–30° below the horizon. */
  dx: number;
  dy: number;
}

export function meteorOf(seed: number, k: number, width: number, horizonY: number): Meteor {
  'worklet';
  const s = seed + METEORS.salt + 3;
  const a = ((20 + 10 * hash01(s, k * 8 + 2)) * Math.PI) / 180;
  return {
    x: lerp(0.45 * width, width - 10, hash01(s, k * 8)),
    y: lerp(40, Math.max(0.42 * horizonY, 60), hash01(s, k * 8 + 1)),
    dx: -Math.cos(a),
    dy: Math.sin(a),
  };
}

export interface MeteorPose {
  headX: number;
  headY: number;
  tailX: number;
  tailY: number;
  alpha: number;
}

/** A shooting star `dt` seconds after it started; speeds up (ease-in quad), fades at the end. */
export function meteorPose(m: Meteor, dt: number): MeteorPose {
  'worklet';
  if (dt < 0 || dt > METEOR_TIME) return { headX: -50, headY: -50, tailX: -50, tailY: -50, alpha: 0 };
  const p = dt / METEOR_TIME;
  const d = METEOR_TRAVEL * p * p;
  // The trail grows out of the head at first and never gets longer than 90 px.
  const trail = Math.min(METEOR_TRAIL, 12 + d);
  const alpha = Math.min(1, p / 0.1, (1 - p) / 0.3);
  return {
    headX: m.x + m.dx * d,
    headY: m.y + m.dy * d,
    tailX: m.x + m.dx * (d - trail),
    tailY: m.y + m.dy * (d - trail),
    alpha,
  };
}
