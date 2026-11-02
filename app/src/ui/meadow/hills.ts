// The shapes of the far landscape, as pure numbers: mountain and hill ridges, the
// strip of far forest, bushes and grass tufts. Everything repeats exactly every
// PERIOD px, so a layer can slide by any amount (the camera pans across any number
// of habits) and wrap around without a seam.

/** Every far layer repeats after this many px. */
export const PERIOD = 2048;
/** Every grass row repeats after this many px. */
export const GRASS_TILE = 760;

export interface Wave {
  amp: number;
  /** Must divide PERIOD. */
  period: number;
  phase: number;
}

// Far mountains: amplitudes 58/26/12 on periods 256/128/64 (spec 6.1), plus a slow
// swell over the whole period so the peaks are not all the same height.
export const MOUNTAINS: Wave[] = [
  { amp: 58, period: 256, phase: 0.6 },
  { amp: 26, period: 128, phase: 2.2 },
  { amp: 12, period: 64, phase: 4.1 },
  { amp: 22, period: 1024, phase: 1.3 },
];

// Middle hills: amplitudes 30/14/6 on periods 512/128/32.
export const HILLS: Wave[] = [
  { amp: 30, period: 512, phase: 3.4 },
  { amp: 14, period: 128, phase: 0.9 },
  { amp: 6, period: 32, phase: 5.2 },
];

/** Height of a ridge above its base at x, always ≥ 0. */
export function ridge(x: number, waves: Wave[]): number {
  let h = 0;
  for (const w of waves) h += (w.amp * (1 + Math.sin((2 * Math.PI * x) / w.period + w.phase))) / 2;
  return h;
}

/** Highest the ridge can rise. */
export const ridgeMax = (waves: Wave[]) => waves.reduce((s, w) => s + w.amp, 0);

/** Small fast random numbers from a seed: the same landscape every time. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface FarTree {
  /** Middle of the tree. */
  x: number;
  w: number;
  h: number;
  kind: 'round' | 'fir';
}

/**
 * Far forest along the horizon, one period's worth: groups of 3–9 trees (round crowns
 * and firs mixed, 6–18 px tall, taller in the middle of a group) with open land between.
 * Every tree lies wholly inside the period, so the copy one period on joins seamlessly.
 */
export function farForest(): FarTree[] {
  const rnd = seeded(11);
  const trees: FarTree[] = [];
  let x = 4 + rnd() * 20;
  for (;;) {
    const n = 3 + Math.floor(rnd() * 7);
    const group: FarTree[] = [];
    let gx = x;
    for (let i = 0; i < n; i++) {
      const fir = rnd() < 0.45;
      const w = fir ? 6 + rnd() * 4 : 8 + rnd() * 6;
      const bump = 0.7 + 0.3 * Math.sin((Math.PI * (i + 0.5)) / n);
      const h = Math.min(18, Math.max(6, (fir ? 11 + rnd() * 7 : 8 + rnd() * 7) * bump));
      group.push({ x: gx + w / 2, w, h, kind: fir ? 'fir' : 'round' });
      gx += w * (0.55 + rnd() * 0.25);
    }
    const end = Math.max(...group.map((t) => t.x + t.w / 2));
    if (end > PERIOD - 2) return trees;
    trees.push(...group);
    x = end + 14 + rnd() * 56;
  }
}

/** Height of the far forest at x (0 on open land), repeating every PERIOD. */
export function forestAt(x: number, trees: FarTree[]): number {
  const p = wrap(x, PERIOD);
  let h = 0;
  for (const t of trees) {
    const dx = Math.abs(p - t.x) / (t.w / 2);
    if (dx >= 1) continue;
    h = Math.max(h, t.kind === 'fir' ? t.h * (1 - dx) : t.h);
  }
  return h;
}

export interface Bush {
  x: number;
  scale: number;
}

/** Seven pale bushes along the horizon, one period's worth. */
export function bushes(): Bush[] {
  const rnd = seeded(23);
  const step = PERIOD / 7;
  return Array.from({ length: 7 }, (_, i) => ({ x: (i + 0.15 + rnd() * 0.7) * step, scale: 0.7 + rnd() * 0.6 }));
}

export interface GrassRow {
  /** Band of tuft bases, px below the horizon; `to` null means down to the scene bottom + 6. */
  from: number;
  to: number | null;
  minH: number;
  maxH: number;
  /** Tufts per tile. */
  count: number;
  alpha: number;
  /** Shift per habit of camera, share of the screen width. */
  parallax: number;
  /** Share of tufts with a flower, and its radius. */
  flowers: number;
  flowerR: number;
  /** Sub-bands that sway separately, so a tuft's foot hardly slides. */
  bands: number;
}

export const GRASS_ROWS: GrassRow[] = [
  { from: 8, to: 46, minH: 3, maxH: 5, count: 26, alpha: 0.55, parallax: 0.14, flowers: 0.25, flowerR: 1.3, bands: 1 },
  { from: 46, to: 110, minH: 5, maxH: 9, count: 22, alpha: 0.75, parallax: 0.25, flowers: 0.25, flowerR: 2, bands: 2 },
  { from: 110, to: null, minH: 9, maxH: 15, count: 16, alpha: 0.95, parallax: 0.42, flowers: 0.45, flowerR: 3, bands: 3 },
];

// Thick grass in the foreground, right above the bottom sheet: a dark low layer and a
// bright tall one in front, together 24–40 px high (feet given in px above the bottom).
const FRONT = [
  { feet: [16, 6], minH: 10, maxH: 20, count: 150, parallax: 0.6, flowers: 0, flowerR: 0 },
  { feet: [10, 0], minH: 13, maxH: 28, count: 96, parallax: 0.6, flowers: 0.1, flowerR: 3.4 },
];

/** The foreground grass rows, px below the horizon like GRASS_ROWS; `bottom` is the scene bottom. */
export function frontRows(bottom: number): GrassRow[] {
  return FRONT.map((r) => ({
    from: bottom - r.feet[0],
    to: bottom - r.feet[1],
    minH: r.minH,
    maxH: r.maxH,
    count: r.count,
    alpha: 1,
    parallax: r.parallax,
    flowers: r.flowers,
    flowerR: r.flowerR,
    bands: 1,
  }));
}

// Under the bottom sheet: the scene is laid out for the sheet's rest place, and a sheet
// pulled lower opens more of the foreground. The thick grass goes on there down past the
// bottom of the screen, in bands of up to 32 px so a tuft's foot hardly slides as it sways.
// Tips come up at most 4 px over the scene bottom, so at rest the sheet hides it all.
const UNDER = { gap: 22, minH: 14, maxH: 26, band: 32, perBand: 40, below: 16, flowers: 0.06, flowerR: 3.4 };

/** Thick grass from just under the scene bottom down past the screen bottom, px below the horizon. */
export function underRows(bottom: number, screenBottom: number): GrassRow[] {
  const from = bottom + UNDER.gap;
  const to = screenBottom + UNDER.below;
  if (to - from < UNDER.band / 2) return [];
  const bands = Math.ceil((to - from) / UNDER.band);
  return [{
    from,
    to,
    minH: UNDER.minH,
    maxH: UNDER.maxH,
    count: UNDER.perBand * bands,
    alpha: 1,
    parallax: FRONT[1].parallax,
    flowers: UNDER.flowers,
    flowerR: UNDER.flowerR,
    bands,
  }];
}

export interface Tuft {
  x: number;
  /** Foot of the tuft, px below the horizon. */
  y: number;
  h: number;
  /** Which of the two grass colors. */
  shade: 0 | 1;
  /** Index into the flower colors, or −1 for none. */
  flower: number;
  lean: number;
}

/** The tufts of one row over one tile, spread evenly with a little jitter. */
export function tufts(row: GrassRow, rowIndex: number, bottom: number): Tuft[] {
  const rnd = seeded(101 + rowIndex * 17);
  const to = row.to ?? bottom;
  const step = GRASS_TILE / row.count;
  return Array.from({ length: row.count }, (_, i) => {
    const x = (i + 0.1 + rnd() * 0.8) * step;
    const y = row.from + rnd() * (to - row.from);
    const h = row.minH + rnd() * (row.maxH - row.minH);
    const flower = rnd() < row.flowers ? Math.floor(rnd() * 4) : -1;
    return { x, y, h, shade: (i % 2) as 0 | 1, flower, lean: (rnd() - 0.5) * 0.6 };
  });
}

export interface Firefly {
  /** Rest point: x as a share of the width, y px below the horizon. */
  x: number;
  y: number;
  ax: number;
  ay: number;
  /** Lissajous periods, s. */
  tx: number;
  ty: number;
  /** Blink: 1.6 s glow then a pause, s. */
  pause: number;
  phase: number;
}

export const FIREFLY_GLOW = 1.6;

export function fireflies(): Firefly[] {
  const rnd = seeded(77);
  return Array.from({ length: 8 }, (_, i) => ({
    x: (i + 0.2 + rnd() * 0.6) / 8,
    y: 30 + rnd() * 140,
    ax: 20 + rnd() * 20,
    ay: 20 + rnd() * 20,
    tx: 8 + rnd() * 6,
    ty: 8 + rnd() * 6,
    pause: 0.5 + rnd() * 2.5,
    phase: rnd() * 10,
  }));
}

/** Brightness 0…1 of a firefly at time t: fades in and out over 1.6 s, then rests dark. */
export function blink(t: number, pause: number, phase: number): number {
  'worklet';
  const cycle = FIREFLY_GLOW + pause;
  const p = (((t + phase) % cycle) + cycle) % cycle;
  if (p >= FIREFLY_GLOW) return 0;
  return Math.sin((Math.PI * p) / FIREFLY_GLOW);
}

/** x wrapped into 0 … period. */
export function wrap(x: number, period: number): number {
  'worklet';
  return ((x % period) + period) % period;
}
