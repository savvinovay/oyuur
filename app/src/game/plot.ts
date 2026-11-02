// The forest plot: a square of cells where each habit has its own place.
// Pure functions: no storage, no UI. Rules (wave 3 spec, sections 1.2, 5.1, 11):
// - The plot is square, its side is even, from 4 to 30 cells. At least 60 % of the
//   cells stay free: when a new habit would take more, the plot grows by one cell on
//   every side and every place shifts by (+1, +1). The plot never shrinks.
// - A new habit goes to the free cell nearest the centre that has no neighbours; next to
//   another tree only when no such cell is left. So trees spread over the whole plot
//   instead of a crowded middle (critic, wave 3: big crowns hid each other).
// - All generations of a habit share one place. Locking in doesn't move a tree.
// - Moving onto an occupied cell swaps the two trees.

export interface Cell { c: number; r: number }

export interface Plot {
  /** Side of the square plot, in cells. Grows by 2, never shrinks. */
  size: number;
  /** Where each habit stands: lineageId → cell. All generations of a habit share it. */
  places: Record<string, Cell>;
  /** Plot size the forest screen last showed; a bigger `size` plays the growth once. */
  shownSize: number;
  /** Habits the forest screen has already shown; the others get the "new" badge. */
  seen: string[];
  /**
   * When each habit was last moved by the person (HLC, merge.ts): on a merge the later move wins.
   * Missing — placed by the app, never moved.
   */
  at?: Record<string, string>;
}

/** What the plot needs to know about a habit. `days` — growth days of its current tree. */
export interface PlotHabit { lineageId: string; days: number }

export const MIN_PLOT = 4;
export const MAX_PLOT = 30;
export const FREE_SHARE = 0.6;

const EPS = 1e-9;

export function plotSizeFor(habits: number): number {
  const side = 2 * Math.ceil(Math.sqrt(habits / (1 - FREE_SHARE)) / 2);
  return Math.min(MAX_PLOT, Math.max(MIN_PLOT, side));
}

export function emptyPlot(): Plot {
  return { size: MIN_PLOT, places: {}, shownSize: MIN_PLOT, seen: [] };
}

export const cellKey = (cell: Cell) => `${cell.c},${cell.r}`;

export function occupiedCells(plot: Plot): Map<string, string> {
  const map = new Map<string, string>();
  for (const [id, cell] of Object.entries(plot.places)) map.set(cellKey(cell), id);
  return map;
}

export function occupant(plot: Plot, cell: Cell): string | null {
  for (const [id, at] of Object.entries(plot.places)) if (at.c === cell.c && at.r === cell.r) return id;
  return null;
}

export function isInside(size: number, cell: Cell): boolean {
  return Number.isInteger(cell.c) && Number.isInteger(cell.r) && cell.c >= 0 && cell.r >= 0 && cell.c < size && cell.r < size;
}

export function clampCell(size: number, cell: Cell): Cell {
  const clamp = (v: number) => Math.min(size - 1, Math.max(0, Math.round(v)));
  return { c: clamp(cell.c), r: clamp(cell.r) };
}

/** Free cells, row by row. */
export function freeCells(plot: Plot): Cell[] {
  const taken = occupiedCells(plot);
  const free: Cell[] = [];
  for (let r = 0; r < plot.size; r++) {
    for (let c = 0; c < plot.size; c++) if (!taken.has(cellKey({ c, r }))) free.push({ c, r });
  }
  return free;
}

/** Grows the plot to `toSize` (a ring per +2), shifting every place to stay in the middle. */
export function grow(plot: Plot, toSize: number): Plot {
  const size = Math.min(MAX_PLOT, toSize);
  if (size <= plot.size) return plot;
  const shift = Math.floor((size - plot.size) / 2);
  const places: Record<string, Cell> = {};
  for (const [id, cell] of Object.entries(plot.places)) places[id] = { c: cell.c + shift, r: cell.r + shift };
  return { ...plot, size, places };
}

// Any free cell without a neighbour beats one beside a tree; a cell touching a tree only
// at a corner beats one touching its side.
const SIDE_PENALTY = 1000;
const CORNER_PENALTY = 100;

/** The best free cell for a new tree (5.1), or null when the plot is full. */
function bestCell(plot: Plot): Cell | null {
  const taken = occupiedCells(plot);
  const has = (c: number, r: number) => taken.has(`${c},${r}`);
  const mid = (plot.size - 1) / 2;
  let best: Cell | null = null;
  let bestScore = Infinity;
  for (let r = 0; r < plot.size; r++) {
    for (let c = 0; c < plot.size; c++) {
      if (has(c, r)) continue;
      const side = has(c - 1, r) || has(c + 1, r) || has(c, r - 1) || has(c, r + 1);
      const diagonal = has(c - 1, r - 1) || has(c + 1, r - 1) || has(c - 1, r + 1) || has(c + 1, r + 1);
      const score = Math.hypot(c - mid, r - mid) + (side ? SIDE_PENALTY : 0) + (diagonal ? CORNER_PENALTY : 0);
      const better =
        best === null ||
        score < bestScore - EPS ||
        (Math.abs(score - bestScore) <= EPS && (c + r < best.c + best.r || (c + r === best.c + best.r && c < best.c)));
      if (better) {
        best = { c, r };
        bestScore = score;
      }
    }
  }
  return best;
}

/** Puts a habit that has no place yet on the best free cell (5.1); grows the plot first if needed. */
export function autoPlace(plot: Plot, lineageId: string): Plot {
  if (plot.places[lineageId]) return plot;
  const grown = grow(plot, plotSizeFor(Object.keys(plot.places).length + 1));
  const cell = bestCell(grown);
  if (!cell) return grown;
  return { ...grown, places: { ...grown.places, [lineageId]: cell } };
}

/** Lays out every habit without a place at once: biggest trees on the deepest of the cells nearest the centre. */
export function layoutAll(plot: Plot, habits: PlotHabit[]): Plot {
  const missing = habits.filter((h) => !plot.places[h.lineageId]);
  if (missing.length === 0) return plot;
  let next = grow(plot, plotSizeFor(Object.keys(plot.places).length + missing.length));
  // Find the cells planting one by one would take, then hand them out by size.
  let probe = next;
  const cells: Cell[] = [];
  for (let i = 0; i < missing.length; i++) {
    const cell = bestCell(probe);
    if (!cell) break;
    cells.push(cell);
    probe = { ...probe, places: { ...probe.places, [`\u0000${i}`]: cell } };
  }
  cells.sort((a, b) => a.c + a.r - (b.c + b.r) || a.c - b.c);
  const bySize = missing
    .map((h, order) => ({ ...h, order }))
    .sort((a, b) => b.days - a.days || a.order - b.order);
  const places = { ...next.places };
  cells.forEach((cell, i) => (places[bySize[i].lineageId] = cell));
  next = { ...next, places };
  return next;
}

/** Keeps places in step with the habits: drops deleted ones, places missing ones. Returns the same object if nothing changed. */
export function syncPlot(plot: Plot, habits: PlotHabit[]): Plot {
  const ids = new Set(habits.map((h) => h.lineageId));
  let next = plot;
  const gone = Object.keys(plot.places).filter((id) => !ids.has(id));
  if (gone.length > 0) {
    const places = { ...plot.places };
    for (const id of gone) delete places[id];
    next = { ...next, places };
  }
  if (next.seen.some((id) => !ids.has(id))) next = { ...next, seen: next.seen.filter((id) => ids.has(id)) };
  if (next.at && Object.keys(next.at).some((id) => !ids.has(id))) {
    next = { ...next, at: Object.fromEntries(Object.entries(next.at).filter(([id]) => ids.has(id))) };
  }
  // New habits are placed one by one in planting order, as if planted now.
  for (const h of habits) next = autoPlace(next, h.lineageId);
  return next;
}

/** Moves a habit; an occupied target swaps the two. Same cell — no change. `at` — the time of the move (both get it). */
export function moveTo(plot: Plot, lineageId: string, to: Cell, at?: string): { plot: Plot; swapped: string | null } {
  const from = plot.places[lineageId];
  if (!from) return { plot, swapped: null };
  const target = clampCell(plot.size, to);
  if (target.c === from.c && target.r === from.r) return { plot, swapped: null };
  const other = occupant(plot, target);
  const places = { ...plot.places, [lineageId]: target };
  if (other) places[other] = from;
  const stamps = at === undefined ? plot.at : { ...plot.at, [lineageId]: at, ...(other ? { [other]: at } : {}) };
  return { plot: { ...plot, places, ...(stamps ? { at: stamps } : {}) }, swapped: other };
}

/** The forest screen showed everything: no "new" badges, no growth to play. */
export function markShown(plot: Plot, lineageIds: string[]): Plot {
  const same = plot.shownSize === plot.size && plot.seen.length === lineageIds.length && lineageIds.every((id, i) => plot.seen[i] === id);
  if (same) return plot;
  return { ...plot, seen: [...lineageIds], shownSize: plot.size };
}

/**
 * The plot from saved data. An old save (no plot) gets a first layout and counts as
 * already shown, so the first visit has no "new" badges and no growth. A saved plot
 * is checked cell by cell: anything broken is dropped and placed again.
 */
export function migratePlot(saved: unknown, habits: PlotHabit[]): Plot {
  if (!saved || typeof saved !== 'object') {
    const plot = layoutAll(emptyPlot(), habits);
    return markShown(plot, habits.map((h) => h.lineageId));
  }
  const raw = saved as Partial<Record<keyof Plot, unknown>>;
  const okSize = (v: unknown): v is number =>
    typeof v === 'number' && Number.isInteger(v) && v % 2 === 0 && v >= MIN_PLOT && v <= MAX_PLOT;
  const size = okSize(raw.size) ? raw.size : MIN_PLOT;
  const shownSize = okSize(raw.shownSize) && raw.shownSize <= size ? raw.shownSize : size;
  const seen = Array.isArray(raw.seen)
    ? raw.seen.filter((id): id is string => typeof id === 'string')
    : habits.map((h) => h.lineageId);
  const places: Record<string, Cell> = {};
  const taken = new Set<string>();
  if (raw.places && typeof raw.places === 'object') {
    for (const [id, value] of Object.entries(raw.places as Record<string, unknown>)) {
      const cell = value as Cell | null;
      if (!cell || typeof cell !== 'object' || !isInside(size, cell) || taken.has(cellKey(cell))) continue;
      taken.add(cellKey(cell));
      places[id] = { c: cell.c, r: cell.r };
    }
  }
  const at: Record<string, string> = {};
  if (raw.at && typeof raw.at === 'object') {
    for (const [id, v] of Object.entries(raw.at as Record<string, unknown>)) if (places[id] && typeof v === 'string') at[id] = v;
  }
  return syncPlot({ size, places, shownSize, seen, ...(Object.keys(at).length ? { at } : {}) }, habits);
}
