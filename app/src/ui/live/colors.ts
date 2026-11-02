// Colors of the live tree and its effects (wave 1 spec, section 4). They live here and
// not in theme.ts so the three wave-1 developers never edit one file.
import type { Skin } from '@/game/tree';

export interface LiveColors {
  dryCenter: string;
  dryEdge: string;
  crack: string;
  wetCenter: string;
  wetMid: string;
  wetShine: number;
  neutral: string;
  fallen: [string, string];
  flash: string;
  flashAlpha: number;
  /** Darkening of the scene during the celebration: rgb and alpha. */
  dim: [number, number, number, number];
  /** Sky color at the horizon: far trees fade into it. */
  haze: string;
  bubble: string;
  /** Text in the "What's my name?" bubble (the bubble stays light at night). */
  bubbleInk: string;
}

export const liveDay: LiveColors = {
  dryCenter: '#D9B077',
  dryEdge: '#C99A60',
  crack: '#A97E4B',
  wetCenter: '#7A5233',
  wetMid: '#9A6B43',
  wetShine: 0.16,
  neutral: '#D2B486',
  fallen: ['#C9B25A', '#B89F4A'],
  flash: '#FFFBE6',
  flashAlpha: 0.9,
  dim: [24, 18, 52, 0.45],
  haze: '#EAFBFF',
  bubble: '#FFFFFF',
  bubbleInk: '#1E1B16',
};

export const liveNight: LiveColors = {
  // Lighter than the day's soil gone dark, so the thirsty hole doesn't sink into the night (wave 2, 5.3).
  dryCenter: '#8A6A4A',
  dryEdge: '#735638',
  crack: '#5A4230',
  wetCenter: '#3B281B',
  wetMid: '#4F3624',
  wetShine: 0.08,
  neutral: '#6B5340',
  fallen: ['#8D7D3F', '#816F34'],
  flash: '#FFF3C4',
  flashAlpha: 0.8,
  dim: [10, 10, 40, 0.5],
  haze: '#5357A8',
  bubble: '#E9E8FF',
  bubbleInk: '#2E2D63',
};

export const liveColors = (night: boolean) => (night ? liveNight : liveDay);

/** Moonlight on a thirsty tree at night, and the glow behind its bubble (wave 2, 5.3). */
export const MOON = '#C9C7FF';

/** Same for day and night. */
export const fx = {
  // The name celebration (wave 4, section 4): glow behind the name, sparks with a darker edge.
  nameGlow: '#FFE7A0',
  nameSpark: '#FFF6C2',
  nameSparkEdge: '#E9A92A',
  canBody: '#5BB8E8',
  canShade: '#3F9FD4',
  canShine: '#C9ECFB',
  canRim: '#2F86BE',
  drop: '#6EC6F2',
  splash: '#BFE8FA',
  bubbleDrop: '#3FA2DE',
  token: '#4CC764',
  mote: '#FFF3B0',
  rayIn: '#FFF3C4',
  rayOut: '#FFE7A0',
  sparkles: ['#FFFFFF', '#FFF6C2'],
  sakuraFallen: '#E3C3CF',
  gold: '#FFE27A',
  ribbonTop: '#FFD866',
  ribbonBottom: '#F0B53A',
  ribbonEdge: '#B9801E',
  ribbonEnds: '#D9962A',
  ribbonFold: '#9C6516',
  ribbonCaption: '#FFF7E0',
  ribbonText: '#5A3A0E',
};

/** Leaves thrown by the celebration, per kind; the last color is the gold one. */
export const burstColors = {
  oak: ['#8BC34A', '#B9DE6C', '#5E9A2C'],
  sakura: ['#F4A6C6', '#E486AE', '#FFFFFF'],
  spruce: ['#2C6E3C', '#76B65E'],
  birch: ['#C9E26A', '#F2E27A', '#8DB846'],
  maple: ['#E8642C', '#F4A23A', '#C2361F'],
  apple: ['#8BC34A', '#E8483C', '#FFFFFF'],
  palm: ['#4FA84A', '#9ED36A', '#2E7D32'],
} satisfies Record<Skin, string[]>;

/** A leaf shaken off by a repeated tap, per kind. */
export const shakenLeaf = {
  oak: '#8BC34A',
  sakura: '#F4A6C6',
  spruce: '#43914B',
  birch: '#A8D45A',
  maple: '#F07A2E',
  apple: '#6FB24A',
  palm: '#5DAE3E',
} satisfies Record<Skin, string>;

/** Leaves a thirsty tree has dropped into its hole, when they are not the season's (LiveColors.fallen). */
export const fallenLeaves: Partial<Record<Skin, [string, string]>> = {
  sakura: ['#E3C3CF', '#E3C3CF'],
  maple: ['#E8643C', '#D9822B'],
};

// ---- Color matrices for the tree (Skia's ColorMatrix: 4 rows × 5, the last column adds) ----

/**
 * Skia takes the added column in 0..1 (checked by eye against frame 01 of the mockup:
 * with 0..255 the tree turns white).
 */
const OFFSET = 1;

const IDENTITY = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];

/** Thirst: saturation 0.55 and a warm shift (spec section 4). */
export const DRY = [
  0.6457, 0.3218, 0.0325, 0, 0.035 * OFFSET,
  0.0957, 0.8718, 0.0325, 0, 0.02 * OFFSET,
  0.0957, 0.3218, 0.5825, 0, -0.03 * OFFSET,
  0, 0, 0, 1, 0,
];

/**
 * Thirst at night: saturation 0.7 instead of 0.55. Under the night matrix the stronger
 * fade turned the tree grey-brown (wave 2 spec, 5.3).
 */
export const DRY_NIGHT = [
  0.7638, 0.2146, 0.0217, 0, 0.03 * OFFSET,
  0.0638, 0.9146, 0.0217, 0, 0.02 * OFFSET,
  0.0638, 0.2146, 0.7217, 0, -0.01 * OFFSET,
  0, 0, 0, 1, 0,
];

/** A thirsty tree keeps this share of the night's darkening off (wave 2 spec, 5.3). */
export const THIRST_NIGHT_EASE = 0.3;

/**
 * Night: the tree goes down with the scene — 0.75 of the brightness, a little less
 * saturated, a touch of blue — so a bright green crown doesn't sit on the dark meadow
 * like a sticker. The same matrix suits pictures of trees (TreeArtProps.night).
 */
export const NIGHT = [
  0.6066, 0.103, 0.0104, 0, 0,
  0.0319, 0.7073, 0.0108, 0, 0,
  0.0349, 0.1173, 0.6678, 0, 0.03 * OFFSET,
  0, 0, 0, 1, 0,
];

/**
 * Night for the maple. The plain night takes red down the most and turns an orange crown
 * dirty brown, like a dried-up tree (wave 5 fixes). Here: 0.8 of the brightness with the
 * saturation a little up (×1.1) and the same touch of blue, so it stays a fiery maple.
 */
export const NIGHT_WARM = [
  0.863, -0.0572, -0.0058, 0, 0,
  -0.017, 0.8228, -0.0058, 0, 0,
  -0.017, -0.0572, 0.8742, 0, 0.02 * OFFSET,
  0, 0, 0, 1, 0,
];

/** Kinds whose colors the plain night spoils; the rest use NIGHT. */
const NIGHT_OF: Partial<Record<Skin, number[]>> = { maple: NIGHT_WARM };

/** `amount` of the way from `from` (0) to `to` (1). */
function mix(from: number[], to: number[], amount: number): number[] {
  'worklet';
  const m: number[] = [];
  for (let i = 0; i < 20; i++) m.push(from[i] + (to[i] - from[i]) * amount);
  return m;
}

/** `amount` of the way from no change (0) to the full matrix `to` (1). */
function towards(to: number[], amount: number): number[] {
  'worklet';
  return mix(IDENTITY, to, amount);
}

/** The night look: 0 = day, 1 = night (in between while the theme changes). */
export function nightMatrix(amount = 1, skin?: Skin): number[] {
  'worklet';
  return towards((skin && NIGHT_OF[skin]) || NIGHT, amount);
}

/** One matrix that does `inner` first, then `outer`. */
export function chainMatrix(outer: number[], inner: number[]): number[] {
  'worklet';
  const m: number[] = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      let v = c === 4 ? outer[r * 5 + 4] : 0;
      for (let k = 0; k < 4; k++) v += outer[r * 5 + k] * inner[k * 5 + c];
      m.push(v);
    }
  }
  return m;
}

export const hexRgb =(hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/**
 * The live tree's colors in one matrix:
 * thirst 0..1 (faded), glow 0..1 (warm light before the flash), white 0..1 (the new
 * stage is born white), haze 0..1 (far away, melting into the horizon color),
 * night 0..1 (darker and cooler with the night scene). At night the thirst is softer and
 * the darkening gives way to it, so a thirsty tree stays readable (wave 2 spec, 5.3).
 * `skin` picks the kind's own night, if it has one (NIGHT_WARM).
 */
export function treeMatrix(thirst: number, glow: number, white: number, haze: number, hazeRgb: number[], night = 0, skin?: Skin): number[] {
  'worklet';
  let m = towards(night > 0 ? mix(DRY, DRY_NIGHT, night) : DRY, thirst);
  if (night > 0) m = chainMatrix(nightMatrix(night * (1 - THIRST_NIGHT_EASE * thirst), skin), m);
  // Warm glow: a little brighter, towards yellow.
  const warm = [0.14, 0.1, 0.02];
  for (let r = 0; r < 3; r++) m[r * 5 + 4] += warm[r] * glow * OFFSET;
  // White, then haze: out = color × (1 − k) + target × k.
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 5; c++) m[r * 5 + c] *= (1 - white) * (1 - haze);
    m[r * 5 + 4] += (white * (1 - haze) + hazeRgb[r] * haze) * OFFSET;
  }
  return m;
}
