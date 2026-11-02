// Camera rules for the meadow, as pure functions (worklets, so the gesture can call
// them on the UI thread). The camera is measured in habits: 0 … n−1, fractional.
import { DRAG_PX } from '../scene/contract';

/** How far past the edge the camera goes for x habits of finger past it: at most a quarter. */
export function rubber(x: number): number {
  'worklet';
  if (x <= 0) return 0;
  return 0.25 * (1 - 1 / (1 + 2 * x));
}

/** The camera for a raw finger position: free between the edges, rubbery past them. */
export function dragCamera(raw: number, n: number): number {
  'worklet';
  const last = Math.max(n - 1, 0);
  if (raw < 0) return -rubber(-raw);
  if (raw > last) return last + rubber(raw - last);
  return raw;
}

/**
 * Where the camera settles when the finger lets go. `vx` is the finger speed in px/s
 * (positive to the right, which moves the camera left). A flick goes on a little, but
 * never more than one habit from where the drag started, and never past the edges.
 */
export function targetIndex(cameraX: number, vx: number, start: number, n: number): number {
  'worklet';
  if (n <= 0) return 0;
  const projected = cameraX - (0.2 * vx) / DRAG_PX;
  let target = Math.round(projected);
  target = Math.min(Math.max(target, start - 1), start + 1);
  return Math.min(Math.max(target, 0), n - 1);
}

/** How long a tap on the dots drives the camera across `delta` habits, ms. */
export function driveDuration(delta: number): number {
  'worklet';
  const steps = Math.max(Math.abs(delta), 1);
  return Math.min(450 + 150 * (steps - 1), 900);
}

/** −0.5 … 0.5: how far the camera is from the nearest habit (0 when it stands on one). */
export function betweenHabits(cameraX: number): number {
  'worklet';
  return cameraX - Math.round(cameraX);
}

/** The habit the camera is closest to, within 0 … n−1. */
export function nearestIndex(cameraX: number, n: number): number {
  'worklet';
  if (n <= 0) return 0;
  return Math.min(Math.max(Math.round(cameraX), 0), n - 1);
}
