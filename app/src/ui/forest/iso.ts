// Geometry of the forest map (wave 3 spec, 1.1) and its camera (2.1–2.2). Pure functions,
// also called from gesture worklets on the UI thread.
// The world is a plane in "world px" (screen px at zoom 1). A cell (c, r) is an 80×40
// diamond: c goes right-down on screen, r goes left-down. The feet of a tree stand in
// the middle of its cell.
import type { Cell } from '@/game/plot';
import { rubber } from '@/ui/sheet/detents';

export const CELL_W = 80;
export const CELL_H = 40;
/** The earth bank under the two front edges of the lawn, world px. */
export const BANK = 9;
/** Room above the plot for the tallest trees, world px (2.2). */
export const TREE_ROOM = 130;
export const Z_MAX = 1.6;
/** Never further out than this, however big the plot. */
const Z_FLOOR = 0.3;
/** "Whole plot" never zooms in closer than this when the plot is small. */
const Z_MIN_CAP = 0.9;
/** Margin around the plot when it is fitted on screen, px. */
const FIT_PAD = 16;
/** The camera centre stays this close to the plot box, screen px (divided by zoom). */
export const CAM_SLACK = 120;
/** Zoom stretches this far past its limits while pinching. */
const ZOOM_RUBBER = 0.12;

/** Where the feet of a tree on this cell stand. */
export function cellCenter(cell: Cell): { x: number; y: number } {
  'worklet';
  return { x: ((cell.c - cell.r) * CELL_W) / 2, y: ((cell.c + cell.r) * CELL_H) / 2 };
}

/** A world point in cells, not rounded. */
export function worldToCell(x: number, y: number): { c: number; r: number } {
  'worklet';
  return { c: x / CELL_W + y / CELL_H, r: y / CELL_H - x / CELL_W };
}

/** The cell under a world point, or null outside the plot. */
export function cellAt(x: number, y: number, size: number): Cell | null {
  'worklet';
  const f = worldToCell(x, y);
  // + 0: no -0 for a point just above the edge.
  const c = Math.round(f.c) + 0;
  const r = Math.round(f.r) + 0;
  return c >= 0 && r >= 0 && c < size && r < size ? { c, r } : null;
}

/** Far cells first: smaller depth is drawn earlier; on a tie, smaller c is further. */
export const depth = (cell: Cell) => {
  'worklet';
  return cell.c + cell.r;
};

/** The camera: the world point in the middle of the visible area, and the zoom. */
export interface Cam { x: number; y: number; z: number }
/** The visible area: screen width, its top (under the header) and bottom (over the sheet), px. */
export interface Area { width: number; top: number; bottom: number }
/** A rectangle in world px. */
export interface Box { left: number; top: number; right: number; bottom: number }

export function toScreen(x: number, y: number, cam: Cam, area: Area): { x: number; y: number } {
  'worklet';
  return { x: area.width / 2 + (x - cam.x) * cam.z, y: (area.top + area.bottom) / 2 + (y - cam.y) * cam.z };
}

export function toWorld(sx: number, sy: number, cam: Cam, area: Area): { x: number; y: number } {
  'worklet';
  return { x: cam.x + (sx - area.width / 2) / cam.z, y: cam.y + (sy - (area.top + area.bottom) / 2) / cam.z };
}

/** The cell under a screen point, or null off the plot: what a tap on the ground means. */
export function cellUnder(sx: number, sy: number, cam: Cam, area: Area, size: number): Cell | null {
  'worklet';
  const p = toWorld(sx, sy, cam, area);
  return cellAt(p.x, p.y, size);
}

/** The lawn with its bank, without the trees. */
export function plotBox(size: number): Box {
  'worklet';
  return { left: (-size * CELL_W) / 2, top: -CELL_H / 2, right: (size * CELL_W) / 2, bottom: (size - 0.5) * CELL_H + BANK };
}

/** The plot box with room for the trees above its back corner. */
export function plotWithTrees(size: number): Box {
  'worklet';
  const box = plotBox(size);
  return { ...box, top: box.top - TREE_ROOM };
}

/** Around the pictures of these trees (feet on their cells, `w`×`h` world px above the feet); null for none. */
export function treesBox(items: { cell: Cell; w: number; h: number }[]): Box | null {
  if (items.length === 0) return null;
  let box: Box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (const { cell, w, h } of items) {
    const p = cellCenter(cell);
    box = {
      left: Math.min(box.left, p.x - w / 2),
      top: Math.min(box.top, p.y - h),
      right: Math.max(box.right, p.x + w / 2),
      // The hole and shadow at the feet.
      bottom: Math.max(box.bottom, p.y + 8),
    };
  }
  return box;
}

/** The camera that shows the whole box with `pad` px around it, the zoom kept within the limits. */
export function fitBox(box: Box, area: Area, pad: number, zMin: number, zMax: number): Cam {
  'worklet';
  const w = Math.max(box.right - box.left, 1);
  const h = Math.max(box.bottom - box.top, 1);
  const fit = Math.min((area.width - 2 * pad) / w, (area.bottom - area.top - 2 * pad) / h);
  return { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2, z: Math.min(zMax, Math.max(zMin, fit)) };
}

/** Zoom limits (2.2): `fit` shows the whole plot with its trees, `min` never goes below 0.3. */
export function zoomLimits(size: number, area: Area): { min: number; max: number; fit: number } {
  'worklet';
  const box = plotBox(size);
  const fit = Math.min(
    (area.width - 2 * FIT_PAD) / (box.right - box.left),
    (area.bottom - area.top - 2 * FIT_PAD) / (box.bottom - box.top + TREE_ROOM),
  );
  return { min: Math.max(Z_FLOOR, Math.min(fit, Z_MIN_CAP)), max: Z_MAX, fit };
}

/** The "whole plot" view: as close as `fit` allows (never past the limits), on the middle of the plot with its trees. */
export function plotCam(size: number, area: Area): Cam {
  'worklet';
  const lim = zoomLimits(size, area);
  const box = plotWithTrees(size);
  return { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2, z: Math.min(lim.max, Math.max(lim.min, lim.fit)) };
}

const clamp = (v: number, lo: number, hi: number) => {
  'worklet';
  return Math.min(hi, Math.max(lo, v));
};

/** The whole plot in `area`, its zoom kept within the limits of the reference `view`. */
export function wholeCam(size: number, area: Area, view: Area): Cam {
  'worklet';
  const lim = zoomLimits(size, view);
  return { ...plotCam(size, area), z: clamp(zoomLimits(size, area).fit, lim.min, lim.max) };
}

/** Calm view: px around the tree pictures, and the closest zoom. */
export const TREES_PAD = 20;
export const TREES_ZMAX = 1.2;
/** An empty plot is shown this close. */
const EMPTY_Z = 1.15;

/**
 * The calm view (2.3): an empty plot from its middle, else around every tree picture (crowns,
 * not cells) with 20 px around. The fence corners may be cut, as in the approved frame 01:
 * showing a small plot whole made the trees tiny and turned their drops into dots.
 */
export function treesCam(size: number, items: { cell: Cell; w: number; h: number }[], area: Area, view: Area): Cam {
  const lim = zoomLimits(size, view);
  const box = treesBox(items);
  if (!box) return { ...plotCam(size, area), z: Math.max(lim.min, Math.min(EMPTY_Z, lim.fit)) };
  return fitBox(box, area, TREES_PAD, lim.min, Math.min(TREES_ZMAX, lim.max));
}

/** A tree brought to the eye (2.6, a tap or "To the tree"): at least this close. */
export const FOCUS_Z = 1.4;
const FOCUS_PAD = 8;

/**
 * The camera on one tree (feet at `x, y`, picture `h` high) in `area`, the one over the card:
 * at least 1.4 close, the picture in the upper half of the area, never cut by its top or bottom.
 */
export function focusCam(x: number, y: number, h: number, zNow: number, area: Area): Cam {
  'worklet';
  const areaH = area.bottom - area.top;
  // A short area (a phone on its side) takes what fits.
  const z = Math.min(Z_MAX, Math.max(zNow, FOCUS_Z), Math.max(0.3, (areaH - 2 * FOCUS_PAD) / Math.max(h, 1)));
  const mid = (area.top + area.bottom) / 2;
  const half = (h * z) / 2;
  // The picture's middle a quarter down the area, pushed down if its top would be cut.
  const at = Math.min(Math.max(area.top + areaH / 4, area.top + FOCUS_PAD + half), area.bottom - FOCUS_PAD - half);
  return { x, y: y - h / 2 - (at - mid) / z, z };
}

/**
 * "Choose a spot" (4.7): a cell at least this wide on screen, px (28 px high), so a finger hits
 * it and the "+" of neighbouring cells do not run into each other. A 6×6 plot still fits on 375.
 */
export const CHOOSE_CELL_PX = 56;

/** The "+" of a free cell, screen px: 12 px round, smaller when the cells are small, so the marks never touch. */
export function plusRadius(z: number): number {
  'worklet';
  return Math.max(6, Math.min(12, (CELL_H * z) / 2 - 2));
}
const CHOOSE_ZMAX = 1.2;

/**
 * The camera for "choose a spot" in `area` (the sheet is hidden): the whole plot when it
 * fits with cells wide enough for a finger; otherwise that close, around the lifted tree
 * (`at`), not looking past the plot.
 */
export function chooseCam(size: number, at: { x: number; y: number }, area: Area): Cam {
  const fit = zoomLimits(size, area).fit;
  const z = clamp(fit, CHOOSE_CELL_PX / CELL_W, CHOOSE_ZMAX);
  const whole = plotCam(size, area);
  if (fit >= z) return { ...whole, z };
  const box = plotWithTrees(size);
  const halfW = area.width / 2 / z;
  const halfH = (area.bottom - area.top) / 2 / z;
  const keep = (v: number, lo: number, hi: number) => (hi - lo < 0 ? (lo + hi) / 2 : clamp(v, lo, hi));
  return { x: keep(at.x, box.left + halfW, box.right - halfW), y: keep(at.y, box.top + halfH, box.bottom - halfH), z };
}

/**
 * While a tree is dragged the camera drives toward an edge (4.4), but never so far that the
 * plot's edge passes the middle of the screen: its centre stays over the plot. A camera
 * already further out stays where it is rather than jumping back.
 */
export function dragCamStep(now: Cam, next: Cam, size: number): Cam {
  'worklet';
  const box = plotBox(size);
  const step = (from: number, to: number, lo: number, hi: number) => {
    if (to > from) return Math.max(from, Math.min(to, hi));
    if (to < from) return Math.min(from, Math.max(to, lo));
    return from;
  };
  return { x: step(now.x, next.x, box.left, box.right), y: step(now.y, next.y, box.top, box.bottom), z: next.z };
}

/** Range of the camera centre at zoom z. */
export function camRange(size: number, z: number): Box {
  'worklet';
  const box = plotWithTrees(size);
  const slack = CAM_SLACK / z;
  return { left: box.left - slack, top: box.top - slack, right: box.right + slack, bottom: box.bottom + slack };
}

/** The camera pulled back inside its limits. */
export function clampCam(cam: Cam, size: number, area: Area): Cam {
  'worklet';
  const lim = zoomLimits(size, area);
  const z = clamp(cam.z, lim.min, lim.max);
  const r = camRange(size, z);
  return { x: clamp(cam.x, r.left, r.right), y: clamp(cam.y, r.top, r.bottom), z };
}

/** Past the limits the camera stretches less and less (2.2): 60 screen px at most, zoom ±12 %. */
export function rubberCam(cam: Cam, size: number, area: Area): Cam {
  'worklet';
  const lim = zoomLimits(size, area);
  let z = cam.z;
  if (z > lim.max) z = lim.max * (1 + ZOOM_RUBBER * (1 - Math.exp(-(z / lim.max - 1) / ZOOM_RUBBER)));
  else if (z < lim.min) z = lim.min * (1 - ZOOM_RUBBER * (1 - Math.exp(-(1 - z / lim.min) / ZOOM_RUBBER)));
  const r = camRange(size, z);
  const soft = (v: number, lo: number, hi: number) => {
    if (v > hi) return hi + rubber((v - hi) * z) / z;
    if (v < lo) return lo - rubber((lo - v) * z) / z;
    return v;
  };
  return { x: soft(cam.x, r.left, r.right), y: soft(cam.y, r.top, r.bottom), z };
}

/** Sample points across the visible area for `lawnShare`. */
const SHARE_COLS = 12;
const SHARE_ROWS = 20;

/**
 * How much of the plot the camera shows: the share of the visible area that is lawn, or
 * the share of the lawn that is in view when the whole plot is smaller than the area —
 * whichever is bigger. 1 — all lawn or the whole plot; 0 — only meadow.
 * `cam` is relative to the reference `view`; `area` is the part of the screen actually seen.
 */
export function lawnShare(cam: Cam, size: number, area: Area, view: Area = area): number {
  const h = area.bottom - area.top;
  let inside = 0;
  for (let i = 0; i < SHARE_COLS; i++) {
    for (let j = 0; j < SHARE_ROWS; j++) {
      const p = toWorld(((i + 0.5) / SHARE_COLS) * area.width, area.top + ((j + 0.5) / SHARE_ROWS) * h, cam, view);
      const f = worldToCell(p.x, p.y);
      if (f.c >= -0.5 && f.r >= -0.5 && f.c <= size - 0.5 && f.r <= size - 0.5) inside++;
    }
  }
  const covered = inside / (SHARE_COLS * SHARE_ROWS);
  // The lawn is a diamond, half its box; its part in view, from the area it covers.
  const lawn = (size * CELL_W * size * CELL_H) / 2;
  const seen = (covered * area.width * h) / (cam.z * cam.z);
  return Math.max(covered, Math.min(1, seen / lawn));
}

/** Below this share of the plot in view the camera comes back after a drag or a delete. */
export const LAWN_SHARE_MIN = 0.5;

/**
 * The camera brought back over the plot: the same zoom, the nearest point on the way to the
 * plot's middle from where the plot fills enough of the view. Null: it already does.
 */
export function backOnPlot(cam: Cam, size: number, area: Area, view: Area = area): Cam | null {
  if (lawnShare(cam, size, area, view) >= LAWN_SHARE_MIN) return null;
  // The lawn's middle in the middle of `area` (the camera is relative to `view`).
  const mid = cellCenter({ c: (size - 1) / 2, r: (size - 1) / 2 });
  const off = ((area.top + area.bottom) / 2 - (view.top + view.bottom) / 2) / cam.z;
  const goal = { x: mid.x, y: mid.y - off, z: cam.z };
  for (let i = 1; i < 10; i++) {
    const t = i / 10;
    const at = { x: cam.x + (goal.x - cam.x) * t, y: cam.y + (goal.y - cam.y) * t, z: cam.z };
    if (lawnShare(at, size, area, view) >= LAWN_SHARE_MIN + 0.1) return at;
  }
  return goal;
}

/** Camera speed near an edge while dragging a tree (4.4), screen px/s; `d` — the finger's distance to the edge. */
export function edgeSpeed(d: number, zone: number): number {
  'worklet';
  if (d >= zone) return 0;
  const k = (zone - Math.max(0, d)) / zone;
  return 700 * k * k;
}

/** How long the camera flies to a tree (2.6), ms; `distPx` — the way in screen px. */
export function flyDuration(distPx: number): number {
  'worklet';
  return clamp(320 + 0.35 * distPx, 360, 720);
}
