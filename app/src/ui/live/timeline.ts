// Every timing of the watering (spec 8.3) and of the new-stage celebration (spec 8.6),
// as constants and pure functions of the time since the tap. The live tree reads the
// whole picture from one number (`ms`) every frame on the UI thread, so a skip is
// just a jump of that number and nothing can be left hanging on the screen.
//
// ms < 0 means "before the tap" (the thirsty look); ms >= the end means "watered".

/** Any time after every animation: the calm watered look. */
export const DONE = 1e6;

export const WATER = {
  squash: 80,
  bubblePop: 160,
  canIn: 300,
  tiltFrom: 300,
  tiltTo: 600,
  /** Degrees the can tips to pour. */
  tilt: -34,
  dropsFrom: 450,
  dropEvery: 65,
  drops: 14,
  splashLife: 280,
  wetFrom: 600,
  wetTo: 1500,
  fallenTo: 900,
  reviveFrom: 800,
  reviveTo: 1400,
  success: 900,
  sparklesFrom: 900,
  sparkleEvery: 80,
  sparkleLife: 600,
  sparkles: 5,
  growFrom: 1100,
  growTo: 1700,
  canOutFrom: 1300,
  canOutTo: 1600,
  tokenFrom: 1200,
  flyFrom: 1400,
  flyTo: 2050,
  end: 2050,
};

/** Celebration times, counted from STAGE.origin ms after the tap (spec's "C"). */
export const STAGE = {
  origin: 1100,
  dimIn: 400,
  gatherTo: 500,
  motes: 20,
  flash: 500,
  flashLife: 450,
  oldOut: 180,
  white: 350,
  raysIn: 300,
  /** Degrees per second. */
  raySpin: 12,
  leaves: 24,
  leafLife: 1600,
  success: 650,
  bannerFrom: 800,
  bannerTo: 2300,
  calmFrom: 2300,
  calmFade: 600,
  // The +1 is thrown out by the flash and the counter turns while the flash is still
  // on: the ribbon's "21 days" line never shows next to an old number, and the token
  // is gone before the ribbon comes in (it would cut through it).
  tokenFrom: 500,
  flyFrom: 540,
  flyTo: 900,
  end: 2950,
};

/** Animations off: colors and soil change by fading, the ribbon just stands. */
export const REDUCED = { fade: 200, banner: 2000, plusPill: 1200 };

/** A tap during the celebration fades everything out this fast. */
export const SKIP_FADE = 250;

/** "Already watered" chip. */
export const CHIP = { in: 180, hold: 1400, out: 220 };

/** How long after the tap the +1 reaches the counter. */
export function landingTime(stage: boolean, reduced: boolean): number {
  'worklet';
  if (reduced) return 0;
  return stage ? STAGE.origin + STAGE.flyTo : WATER.flyTo;
}

/** When the live tree is calm again and can be swiped away. */
export function busyTime(stage: boolean, reduced: boolean): number {
  'worklet';
  if (reduced) return stage ? REDUCED.fade + REDUCED.banner : REDUCED.fade;
  return stage ? STAGE.origin + STAGE.end : WATER.end;
}

// ---- Curves ----

export function clamp01(x: number): number {
  'worklet';
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function lerp(a: number, b: number, t: number): number {
  'worklet';
  return a + (b - a) * t;
}

/** Progress 0..1 of `ms` between a and b. */
export function seg(ms: number, a: number, b: number): number {
  'worklet';
  return clamp01((ms - a) / (b - a));
}

export function outCubic(x: number): number {
  'worklet';
  const u = 1 - x;
  return 1 - u * u * u;
}

export function inCubic(x: number): number {
  'worklet';
  return x * x * x;
}

export function inOutCubic(x: number): number {
  'worklet';
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function outQuad(x: number): number {
  'worklet';
  return 1 - (1 - x) * (1 - x);
}

export function outBack(x: number, s = 1.6): number {
  'worklet';
  const u = x - 1;
  return 1 + (s + 1) * u * u * u + s * u * u;
}

/**
 * A spring released at rest from 0 towards 1 (same physics as Reanimated's withSpring
 * with damping / stiffness / mass), `ms` after the release. Overshoots when underdamped.
 */
export function spring(ms: number, damping: number, stiffness: number, mass = 1): number {
  'worklet';
  if (ms <= 0) return 0;
  const t = ms / 1000;
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
}

/** Repeatable "random" 0..1 for particle i, so the same particles fly every time. */
export function hash01(i: number, salt: number): number {
  'worklet';
  const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// ---- The whole look at one moment ----

export interface Frame {
  /** 1 = faded and dry, 0 = fresh colors. */
  thirst: number;
  /** 0 = sagging thirsty pose, 1 = upright (overshoots a little when it revives). */
  pose: number;
  squashX: number;
  squashY: number;
  wet: number;
  cracks: number;
  fallen: number;
  canAlpha: number;
  canScale: number;
  canShift: number;
  /** Degrees. */
  canTilt: number;
  /** 0..1 from yesterday's size to today's. */
  grow: number;
  tokenAlpha: number;
  tokenScale: number;
  /** 0..1 along the flight to the counter. */
  tokenT: number;
  // Celebration.
  dim: number;
  gather: number;
  moteAlpha: number;
  /** Degrees of the shiver before the flash. */
  jitter: number;
  glow: number;
  flashR: number;
  flashAlpha: number;
  oldAlpha: number;
  oldScale: number;
  newAlpha: number;
  newScale: number;
  white: number;
  raysAlpha: number;
  /** Radians. */
  raysRot: number;
  /** Seconds since the leaves burst out, or -1. */
  leavesT: number;
}

function calm(thirsty: boolean): Frame {
  'worklet';
  const k = thirsty ? 1 : 0;
  return {
    thirst: k, pose: 1 - k, squashX: 1, squashY: 1, wet: 1 - k, cracks: k, fallen: k,
    canAlpha: 0, canScale: 1, canShift: 0, canTilt: 0, grow: 1,
    tokenAlpha: 0, tokenScale: 1, tokenT: 0,
    dim: 0, gather: 0, moteAlpha: 0, jitter: 0, glow: 0, flashR: 0, flashAlpha: 0,
    oldAlpha: 1, oldScale: 1, newAlpha: 0, newScale: 1, white: 0, raysAlpha: 0, raysRot: 0, leavesT: -1,
  };
}

/**
 * At rest between watered (0) and thirsty (1): a tree whose watering hour has just come starts
 * to ask for water in one drawing (OYUUR-33, frames 10a–c). restFrame(1) is the thirsty look.
 */
export function restFrame(k: number): Frame {
  'worklet';
  const f = calm(false);
  f.thirst = k;
  f.pose = 1 - k;
  f.wet = 1 - k;
  f.cracks = k;
  f.fallen = k;
  return f;
}

/** The token: pops in with a spring at `from`, flies `flyFrom`..`flyTo`, fades over the last 15 %. */
function token(f: Frame, ms: number, from: number, flyFrom: number, flyTo: number) {
  'worklet';
  if (ms < from || ms >= flyTo) return;
  const raw = seg(ms, flyFrom, flyTo);
  f.tokenT = inOutCubic(raw);
  f.tokenScale = Math.max(0, spring(ms - from, 12, 200)) * lerp(1, 0.55, f.tokenT);
  f.tokenAlpha = raw > 0.85 ? 1 - (raw - 0.85) / 0.15 : 1;
}

/**
 * Everything the watering (and, with `stage`, the celebration) shows `ms` after the tap.
 * `reduced`: animations are off — only fades of 200 ms.
 */
export function frameAt(ms: number, stage: boolean, reduced: boolean): Frame {
  'worklet';
  if (ms < 0) return calm(true);
  const f = calm(false);
  if (reduced) {
    const p = seg(ms, 0, REDUCED.fade);
    f.thirst = 1 - p;
    f.pose = p;
    f.wet = p;
    f.cracks = 1 - p;
    f.fallen = 1 - p;
    f.grow = p;
    if (stage) {
      f.oldAlpha = 1 - p;
      f.newAlpha = p;
    }
    return f;
  }

  // The tree squats when touched, then springs back.
  const squat = ms < WATER.squash ? outQuad(ms / WATER.squash) : 1 - spring(ms - WATER.squash, 10, 300);
  f.squashY = 1 - 0.06 * squat;
  f.squashX = 1 + 0.03 * squat;

  // Water: the soil darkens, the dry cracks and fallen leaves go.
  f.wet = outCubic(seg(ms, WATER.wetFrom, WATER.wetTo));
  f.cracks = 1 - seg(ms, WATER.wetFrom, WATER.wetTo);
  f.fallen = 1 - seg(ms, WATER.wetFrom, WATER.fallenTo);

  // The tree comes back to life.
  f.thirst = 1 - outCubic(seg(ms, WATER.reviveFrom, WATER.reviveTo));
  f.pose = spring(ms - WATER.reviveFrom, 9, 120);

  // The watering can floats in, pours and leaves.
  const inP = seg(ms, 0, WATER.canIn);
  const back = outBack(inP, 1.6);
  const out = inCubic(seg(ms, WATER.canOutFrom, WATER.canOutTo));
  f.canAlpha = inP * (1 - out);
  f.canScale = lerp(0.6 + 0.4 * back, 0.8, out);
  f.canShift = 24 * (1 - back) + 16 * out;
  f.canTilt = WATER.tilt * inOutCubic(seg(ms, WATER.tiltFrom, WATER.tiltTo)) * (1 - out);
  if (ms >= WATER.canOutTo) f.canAlpha = 0;

  if (!stage) {
    f.grow = outCubic(seg(ms, WATER.growFrom, WATER.growTo));
    token(f, ms, WATER.tokenFrom, WATER.flyFrom, WATER.flyTo);
    return f;
  }

  // The new stage. The old tree stays until the flash; there is no growing step.
  f.grow = 1;
  f.newAlpha = 0;
  const c = ms - STAGE.origin;
  if (c < 0) return f;
  const fadeOut = 1 - seg(c, STAGE.calmFrom, STAGE.calmFrom + STAGE.calmFade);
  f.dim = outCubic(seg(c, 0, STAGE.dimIn)) * fadeOut;
  if (c < STAGE.flash) {
    f.gather = inCubic(seg(c, 0, STAGE.gatherTo));
    f.moteAlpha = Math.min(1, c / 120);
    f.jitter = 1.5 * seg(c, 0, STAGE.gatherTo);
    f.glow = seg(c, 0, STAGE.gatherTo);
    return f;
  }
  f.glow = 1 - seg(c, STAGE.flash, STAGE.flash + 300);
  const flash = outCubic(seg(c, STAGE.flash, STAGE.flash + STAGE.flashLife));
  f.flashR = flash;
  f.flashAlpha = c < STAGE.flash + STAGE.flashLife ? 1 - flash : 0;
  const q = inCubic(seg(c, STAGE.flash, STAGE.flash + STAGE.oldOut));
  f.oldAlpha = 1 - q;
  f.oldScale = 1 + 0.12 * q;
  f.newAlpha = 1;
  f.newScale = 0.7 + 0.3 * spring(c - STAGE.flash, 9, 170);
  f.white = 1 - outCubic(seg(c, STAGE.flash, STAGE.flash + STAGE.white));
  f.raysAlpha = 0.75 * outCubic(seg(c, STAGE.flash, STAGE.flash + STAGE.raysIn)) * fadeOut;
  f.raysRot = (((c - STAGE.flash) / 1000) * STAGE.raySpin * Math.PI) / 180;
  if (c < STAGE.flash + STAGE.leafLife) f.leavesT = (c - STAGE.flash) / 1000;
  token(f, c, STAGE.tokenFrom, STAGE.flyFrom, STAGE.flyTo);
  return f;
}

// ---- Particles: where each one is, from time alone ----

/** Where the spout is, relative to the tree's feet, in screen px. */
export const SPOUT = { x: 40, y: -96 };
const DROP_V0 = 60;
const DROP_VX = -18;
const GRAVITY = 1400;
/** Drops land on the soil a little above the feet line. */
const DROP_GROUND = -2;
/** Seconds a drop falls from the spout to the soil (~0.33 s). */
export const DROP_FALL =
  (-DROP_V0 + Math.sqrt(DROP_V0 * DROP_V0 + 2 * GRAVITY * (DROP_GROUND - SPOUT.y))) / GRAVITY;

/** Drop i of the stream: falling (landed < 0) or, once on the soil, seconds since it landed. */
export function dropAt(i: number, ms: number): { x: number; y: number; landed: number } | null {
  'worklet';
  const t = (ms - (WATER.dropsFrom + i * WATER.dropEvery)) / 1000;
  if (t < 0) return null;
  if (t < DROP_FALL) {
    return { x: SPOUT.x + DROP_VX * t, y: SPOUT.y + DROP_V0 * t + (GRAVITY / 2) * t * t, landed: -1 };
  }
  return { x: SPOUT.x + DROP_VX * DROP_FALL, y: DROP_GROUND, landed: t - DROP_FALL };
}

/** A splash fleck thrown up where a drop landed, `t` seconds after; null when gone. */
export function sprayAt(drop: number, k: number, t: number): { x: number; y: number; alpha: number } | null {
  'worklet';
  const life = WATER.splashLife / 1000;
  if (t < 0 || t > life) return null;
  const side = k % 2 ? 1 : -1;
  const vx = side * (40 + 50 * hash01(drop, k + 1));
  const vy = -(120 + 80 * hash01(drop, k + 7));
  return { x: vx * t, y: vy * t + (GRAVITY / 2) * t * t, alpha: 1 - t / life };
}

/**
 * Leaf i of the burst, `t` seconds after the flash, around the crown center:
 * fast at first, slowed by the air (1.6/s), pulled down by gravity (900 px/s²).
 */
export function burstAt(i: number, t: number): { x: number; y: number; rot: number; alpha: number } | null {
  'worklet';
  const life = STAGE.leafLife / 1000;
  if (t < 0 || t > life) return null;
  const up = hash01(i, 3) < 0.7;
  const deg = up ? -160 + 140 * hash01(i, 5) : 20 + 140 * hash01(i, 5);
  const a = (deg * Math.PI) / 180;
  const speed = 260 + 260 * hash01(i, 9);
  const drag = 1.6;
  const g = 900;
  const e = (1 - Math.exp(-drag * t)) / drag;
  const spin = ((180 + 540 * hash01(i, 13)) * Math.PI) / 180;
  return {
    x: Math.cos(a) * speed * e,
    y: Math.sin(a) * speed * e + (g / drag) * (t - e),
    rot: spin * t * (i % 2 ? 1 : -1),
    alpha: t > life - 0.4 ? (life - t) / 0.4 : 1,
  };
}

/** Mote i of the gathering: on a ring 150–190 px out, spiralling into the tree. */
export function moteAt(i: number, gather: number): { x: number; y: number } {
  'worklet';
  const a0 = (i / STAGE.motes) * Math.PI * 2 + hash01(i, 21) * 0.4;
  const r0 = 150 + 40 * hash01(i, 23);
  const a = a0 + 1.2 * gather;
  const r = lerp(r0, 10, gather);
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}

/** "Already watered": the tree's merry sway, degrees, `ms` after the tap. */
export function wiggleAt(ms: number): number {
  'worklet';
  if (ms < 0) return 0;
  if (ms < 90) return lerp(0, 2.2, outQuad(ms / 90));
  if (ms < 230) return lerp(2.2, -1.6, inOutCubic((ms - 90) / 140));
  if (ms < 350) return lerp(-1.6, 0.8, inOutCubic((ms - 230) / 120));
  return 0.8 * (1 - spring(ms - 350, 10, 260));
}

/** A leaf shaken off by a repeated tap: falls, turning, and fades in 900 ms. */
export function shakenLeafAt(i: number, ms: number): { x: number; y: number; rot: number; alpha: number } | null {
  'worklet';
  if (ms < 0 || ms > 900) return null;
  const t = ms / 1000;
  return {
    x: (i - 1) * 6 + 14 * Math.sin(t * 7 + i * 2),
    y: 70 * t + 40 * t * t,
    rot: (i % 2 ? 1 : -1) * t * 6,
    alpha: ms < 120 ? ms / 120 : 1 - seg(ms, 500, 900),
  };
}
