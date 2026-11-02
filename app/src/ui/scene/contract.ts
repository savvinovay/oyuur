// The seam of wave 1: the scene's size and where each habit's tree stands on the
// meadow. Sky (ui/sky), the live tree (ui/live) and the meadow (ui/meadow) all
// place things by these numbers, so they move together when the camera pans.
import type { SharedValue } from 'react-native-reanimated';

/** Scene size (everything above the bottom sheet), in screen pixels. */
export interface SceneGeo {
  width: number;
  /** Top of the bottom sheet. */
  height: number;
  topInset: number;
  headerBottom: number;
  horizonY: number;
  feetY: number;
  backFeetY: number;
}

/** The front tree's feet never come closer to the horizon than this, px. */
const MIN_MEADOW = 70;

export function sceneGeo(width: number, height: number, topInset: number, headerBottom: number): SceneGeo {
  // The feet always stand 38 px above the sheet, or the tree hides under it. On a short
  // screen the horizon gives way instead (and the tree gets smaller, see treeK).
  const feetY = height - 38;
  const horizonY = Math.min(Math.max(Math.round(height * 0.66), headerBottom + 110), feetY - MIN_MEADOW);
  return { width, height, topInset, headerBottom, horizonY, feetY, backFeetY: horizonY + 42 };
}

/** One wind for the whole scene: t in seconds, gust strength 0..1. */
export interface Wind {
  t: SharedValue<number>;
  gust: SharedValue<number>;
}

export interface Slot {
  x: number;
  feetY: number;
  scale: number;
  opacity: number;
  haze: number;
}

const A = [0, 1, 2, 3];
const X = [0, 0.34, 0.47, 0.56];
const S = [1, 0.46, 0.32, 0.24];
const H = [0, 0.16, 0.28, 0.4];

function lerpTable(a: number, xs: number[], ys: number[]): number {
  'worklet';
  if (a <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) {
    if (a <= xs[i]) return ys[i - 1] + ((ys[i] - ys[i - 1]) * (a - xs[i - 1])) / (xs[i] - xs[i - 1]);
  }
  return ys[ys.length - 1];
}

/** Where the tree stands that is d habits away from the camera (d < 0: on the left). */
export function slotAt(d: number, g: SceneGeo): Slot {
  'worklet';
  const a = Math.min(Math.abs(d), 3);
  const s = d < 0 ? -1 : 1;
  return {
    x: g.width / 2 + s * g.width * lerpTable(a, A, X),
    feetY: lerpTable(a, A, [g.feetY, g.backFeetY, g.horizonY + 16, g.horizonY + 8]),
    scale: lerpTable(a, A, S),
    opacity: lerpTable(a, [0, 1, 2, 2.6, 3], [1, 1, 0.9, 0.5, 0]),
    haze: lerpTable(a, A, H),
  };
}

/** Finger pixels per habit. */
export const DRAG_PX = 300;
