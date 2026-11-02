// The lock-in sequence (spec section 3.2): every moment, in ms from the tap on
// "Lock in for good". The overlay draws from one clock; React and the store only
// take part at the steps listed here.
import { inOutCubic, outCubic } from '@/ui/live/timeline';

/** Moments with animations on. */
export const LOCK = {
  /** The sheet folds to peek; the status says "Result locked in". */
  peek: 0,
  /** The tree's picture takes the live tree's place. */
  snapshot: 200,
  /** The plaque grows out of the ground; the warm glow comes up (400 ms). */
  plaqueFrom: 350,
  plaqueTo: 900,
  glow: 400,
  /** Gold sparkles twinkle around the crown, each 600 ms, 70 ms apart. */
  sparkFrom: 500,
  sparkTo: 1700,
  sparkLife: 600,
  sparkStep: 70,
  /** Success vibration and the plaque's sound. */
  cueLockIn: 700,
  /** The ribbon under the header; it leaves upward over the last 200 ms. */
  ribbonFrom: 800,
  ribbonOut: 1800,
  ribbonTo: 2000,
  /** store.lockIn: the habit leaves the meadow, the camera stands on the next one. */
  lockIn: 2000,
  /** The picture folds into the crown (300 ms) and a medal grows out of it. */
  foldFrom: 2000,
  foldTo: 2300,
  /** The next live tree fades in behind the medal. */
  nextFrom: 2100,
  nextTo: 2400,
  /**
   * The medal flies to "My forest": first it rises over the empty landscape to a perch
   * above where the sheet's top will be (300 ms), then it dives into the card (400 ms).
   */
  flyFrom: 2300,
  perch: 2600,
  flyTo: 3000,
  /** The sheet rises to the menu once the medal is on its way up, above the sheet's top. */
  menu: 2400,
  /** Landing: the card glows, "+1", the count changes. The sequence ends. */
  land: 3000,
  end: 3000,
} as const;

/** With animations off (spec 3.3). */
export const LOCK_REDUCED = {
  /** The plaque fades in beside the tree. */
  plaque: 0,
  fade: 200,
  cueLockIn: 200,
  /** The ribbon stands 1.5 s; it fades in and out over 200 ms. */
  ribbonFrom: 200,
  ribbonTo: 1700,
  /** store.lockIn, the scene and the sheet change by a 200 ms fade. */
  lockIn: 1700,
  menu: 1700,
  land: 1700,
  end: 1900,
} as const;

/**
 * The medal's flight: the part at the end where it fades, the trail, its scale at the
 * perch and at the end, and how far it keeps above the sheet's top and the crown.
 */
export const FLY = { tail: 0.15, trail: 6, trailLag: 0.04, scaleTo: 0.42, perchScale: 0.8, aboveSheet: 46, overCrown: 80, belowTop: 44 };
/** Share of the flight spent rising to the perch. */
const RISE = (LOCK.perch - LOCK.flyFrom) / (LOCK.flyTo - LOCK.flyFrom);

export type LockStepName =
  | 'peek' // fold the sheet, show "Result locked in"
  | 'snapshot' // picture over the live tree, live tree hidden
  | 'cueLockIn'
  | 'ribbon' // show the ribbon
  | 'ribbonOut'
  | 'lockIn' // store.lockIn + camera
  | 'nextTree' // fade the next live tree in
  | 'menu' // raise the sheet to the menu
  | 'fly' // the "whoosh"
  | 'land'
  | 'end';

export interface LockStep {
  at: number;
  step: LockStepName;
}

/** Every step of the sequence, in time order. */
export function lockSteps(reduced: boolean): LockStep[] {
  if (reduced) {
    const r = LOCK_REDUCED;
    return [
      { at: 0, step: 'peek' },
      { at: 0, step: 'snapshot' },
      { at: r.cueLockIn, step: 'cueLockIn' },
      { at: r.ribbonFrom, step: 'ribbon' },
      { at: r.ribbonTo - r.fade, step: 'ribbonOut' },
      { at: r.lockIn, step: 'lockIn' },
      { at: r.lockIn, step: 'nextTree' },
      { at: r.menu, step: 'menu' },
      { at: r.land, step: 'land' },
      { at: r.end, step: 'end' },
    ];
  }
  return [
    { at: LOCK.peek, step: 'peek' },
    { at: LOCK.snapshot, step: 'snapshot' },
    { at: LOCK.cueLockIn, step: 'cueLockIn' },
    { at: LOCK.ribbonFrom, step: 'ribbon' },
    { at: LOCK.ribbonOut, step: 'ribbonOut' },
    { at: LOCK.lockIn, step: 'lockIn' },
    { at: LOCK.nextFrom, step: 'nextTree' },
    { at: LOCK.flyFrom, step: 'fly' },
    { at: LOCK.menu, step: 'menu' },
    { at: LOCK.land, step: 'land' },
    { at: LOCK.end, step: 'end' },
  ];
}

/** Steps that are not done yet. A step whose time came but whose timer has not fired is not done. */
const notDone = (steps: LockStep[], done: ReadonlySet<LockStepName>) => steps.filter((s) => !done.has(s.step));

/**
 * A tap on the ribbon skips to the lock-in moment: what is left before it happens at
 * once (except the ribbon itself), the rest keeps its spacing from the lock-in.
 * `done` — the steps already run: whether the lock-in happened is decided by it, not
 * by the time. Returns the steps still to run, with times from the new clock.
 */
export function skipSteps(steps: LockStep[], done: ReadonlySet<LockStepName>, now: number): { steps: LockStep[]; clock: number } {
  const lock = steps.find((s) => s.step === 'lockIn')!.at;
  const rest = notDone(steps, done);
  if (done.has('lockIn')) return { steps: rest.map((s) => ({ ...s, at: Math.max(0, s.at - now) })), clock: now };
  return {
    steps: rest
      .filter((s) => s.at >= lock || s.step === 'snapshot' || s.step === 'peek' || s.step === 'cueLockIn')
      .map((s) => ({ ...s, at: Math.max(0, s.at - lock) })),
    clock: lock,
  };
}

/** Everything still to run happens at once (the app came back after the lock-in). */
export function finishSteps(steps: LockStep[], done: ReadonlySet<LockStepName>): LockStep[] {
  return notDone(steps, done).map((s) => ({ ...s, at: 0 }));
}

// ---- Geometry ----

export type Point = { x: number; y: number };

/** The plaque stands right of the trunk, as far as the crown is wide (spec 3.2). */
export function plaqueX(trunkX: number, crownW: number): number {
  return trunkX + Math.min(Math.max(crownW * 0.38, 34), 90);
}

/** The plaque's zoom: bigger beside a bigger tree. */
export function plaqueK(treeH: number): number {
  return Math.min(Math.max(treeH / 240, 0.7), 1.2);
}

/** A point of the quadratic Bézier curve. */
export function bezier(p0: Point, p1: Point, p2: Point, t: number): Point {
  'worklet';
  const u = 1 - t;
  return { x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y };
}

/**
 * How high the medal waits before its dive: over the crown and above where the
 * sheet's top will be in the menu, but never up under the status bar.
 */
export function perchY(crownY: number, menuTop: number, topInset: number): number {
  return Math.max(Math.min(crownY - FLY.overCrown, menuTop - FLY.aboveSheet), topInset + FLY.belowTop);
}

/**
 * The medal along its flight, `u` the share of the flight's time (0..1): it rises
 * straight up from the crown to the perch, slowing down, then dives into `to`, going
 * sideways first. It shrinks all the way and fades over the last 15 % of the dive.
 */
export function flightAt(u: number, from: Point, perch: number, to: Point): { x: number; y: number; scale: number; alpha: number } {
  'worklet';
  const top = { x: from.x, y: perch };
  if (u <= RISE) {
    const v = outCubic(Math.max(u, 0) / RISE);
    return { x: from.x, y: from.y + (perch - from.y) * v, scale: 1 + (FLY.perchScale - 1) * v, alpha: 1 };
  }
  const w = inOutCubic(Math.min((u - RISE) / (1 - RISE), 1));
  const p = bezier(top, { x: to.x, y: perch }, to, w);
  const alpha = w <= 1 - FLY.tail ? 1 : Math.max(0, (1 - w) / FLY.tail);
  return { x: p.x, y: p.y, scale: FLY.perchScale + (FLY.scaleTo - FLY.perchScale) * w, alpha };
}

/** A gold sparkle's size (0..1) at `ms`: it twinkles every 600 ms, each starting 70 ms later. */
export function sparkleAt(i: number, ms: number): number {
  'worklet';
  const from = LOCK.sparkFrom + i * LOCK.sparkStep;
  if (ms < from || ms > LOCK.sparkTo) return 0;
  const phase = ((ms - from) % LOCK.sparkLife) / LOCK.sparkLife;
  // Fade the last twinkle out at the end instead of cutting it.
  const end = Math.min(1, (LOCK.sparkTo - ms) / 120);
  return Math.sin(Math.PI * phase) * end;
}

// ---- Text ----

/** A habit name short enough for the dialog's two-line title: cut at a word if one ends near, with "…". */
export function clipName(name: string, max = 24): string {
  const clean = name.trim();
  if (clean.length <= max) return clean;
  let cut = clean.slice(0, max - 1);
  // Mid-word: go back to the last space, if it is not too far.
  const space = cut.lastIndexOf(' ');
  if (/\p{L}|\p{N}/u.test(clean[max - 1]) && space >= max - 9) cut = cut.slice(0, space);
  return `${cut.replace(/[\s.,;:!?·—–-]+$/u, '')}…`;
}
