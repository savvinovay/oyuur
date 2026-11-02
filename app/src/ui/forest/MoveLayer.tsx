// While a tree is dragged (spec 4.3–4.4): every frame on the UI thread its feet follow
// the finger (30 px above it), it leans with the finger's speed, the camera drives near
// the edges, and the target cell is found again. Nothing is drawn here; React only
// hears about it when the target cell changes.
import { SharedValue, useFrameCallback } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { Cell } from '@/game/plot';
import type { Target } from './ForestGround';
import { Area, Cam, dragCamStep, edgeSpeed, toWorld, worldToCell } from './iso';
import type { TreeMotion } from './model';

/** The feet ride this far above the finger, px: the finger does not hide the tree. */
export const FINGER_GAP = 30;
const MAX_LEAN = 6;
const LEAN_SPEED = 1500;

export interface Finger { x: number; y: number; vx: number }

interface Props {
  m: TreeMotion;
  home: Cell;
  size: number;
  finger: SharedValue<Finger>;
  /** The finger is still down: once it is up the tree is the drop's, not the finger's. */
  active: SharedValue<boolean>;
  /** Feet relative to the finger, screen px: from where the tree was grabbed, springing to 30 px above it. */
  grabX: SharedValue<number>;
  grabY: SharedValue<number>;
  /** Occupied cells: 'c,r' → lineage id. */
  occ: SharedValue<Record<string, string>>;
  target: SharedValue<Target>;
  cx: SharedValue<number>;
  cy: SharedValue<number>;
  z: SharedValue<number>;
  view: Area;
  /** Where the visible area starts (under the header) and the screen size. */
  areaTop: number;
  width: number;
  height: number;
  clampMap: (cam: Cam) => Cam;
  onTarget: (occupant: string) => void;
}

export function DragFollower({ m, home, size, finger, active, grabX, grabY, occ, target, cx, cy, z, view, areaTop, width, height, clampMap, onTarget }: Props) {
  const zone = width < 360 ? 56 : 64;
  useFrameCallback((frame) => {
    'worklet';
    if (!active.value) return;
    const f = finger.value;
    const k = z.value;
    // The camera drives toward an edge the finger is near; the sheet is hidden, so the bottom edge is the screen's.
    const dt = Math.min(0.05, (frame.timeSincePreviousFrame ?? 16) / 1000);
    const vx = edgeSpeed(width - f.x, zone) - edgeSpeed(f.x, zone);
    const vy = edgeSpeed(height - f.y, zone) - edgeSpeed(f.y - areaTop, zone);
    if (vx !== 0 || vy !== 0) {
      // Never so far that the plot slips out of sight: its edge stops at the middle of the screen.
      const now = { x: cx.value, y: cy.value, z: k };
      const next = dragCamStep(now, clampMap({ x: now.x + (vx * dt) / k, y: now.y + (vy * dt) / k, z: k }), size);
      cx.value = next.x;
      cy.value = next.y;
    }
    // Feet above the finger; (px, py) is the ground under them, where the shadow lies.
    const w = toWorld(f.x + grabX.value, f.y + grabY.value, { x: cx.value, y: cy.value, z: k }, view);
    m.px.value = w.x;
    m.py.value = w.y + m.lift.value;
    const lean = Math.max(-MAX_LEAN, Math.min(MAX_LEAN, (f.vx / LEAN_SPEED) * MAX_LEAN));
    m.rot.value += (lean - m.rot.value) * 0.25;
    // A finger at rest sends no more updates: its speed fades out.
    finger.value = { ...f, vx: f.vx * 0.85 };

    // The target: the cell under the feet, pulled onto the plot.
    const cell = worldToCell(m.px.value, m.py.value);
    const c = Math.min(size - 1, Math.max(0, Math.round(cell.c)));
    const r = Math.min(size - 1, Math.max(0, Math.round(cell.r)));
    const who = occ.value[`${c},${r}`] ?? '';
    const kind = c === home.c && r === home.r ? 0 : who ? 2 : 1;
    const t = target.value;
    if (t.c !== c || t.r !== r || t.kind !== kind) {
      target.value = { c, r, kind };
      scheduleOnRN(onTarget, kind === 2 ? who : '');
    }
  });
  return null;
}
