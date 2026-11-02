import { describe, expect, it } from '@jest/globals';
import {
  autoPlace,
  Cell,
  cellKey,
  clampCell,
  emptyPlot,
  freeCells,
  grow,
  isInside,
  layoutAll,
  markShown,
  MAX_PLOT,
  migratePlot,
  moveTo,
  occupant,
  occupiedCells,
  Plot,
  plotSizeFor,
  syncPlot,
} from '../plot';

const habitsOf = (n: number, days: (i: number) => number = () => 0) =>
  Array.from({ length: n }, (_, i) => ({ lineageId: `h${i}`, days: days(i) }));

/** Places habits h0..h(n-1) one by one, as planting does. */
function plantMany(n: number, plot: Plot = emptyPlot()): Plot {
  for (let i = 0; i < n; i++) plot = autoPlace(plot, `h${i}`);
  return plot;
}

const sideNeighbours = (a: Cell, b: Cell) => Math.abs(a.c - b.c) + Math.abs(a.r - b.r) === 1;
const depthOf = (cell: Cell) => cell.c + cell.r;

describe('plotSizeFor', () => {
  it('follows the table: at least 60 % of the cells stay free', () => {
    const table: [number, number][] = [
      [0, 4], [1, 4], [6, 4], [7, 6], [14, 6], [15, 8], [25, 8], [26, 10], [40, 10],
      [41, 12], [57, 12], [60, 14], [360, 30], [900, 30], [5000, 30],
    ];
    for (const [n, size] of table) expect([n, plotSizeFor(n)]).toEqual([n, size]);
  });

  it('is always even', () => {
    for (let n = 0; n < 400; n++) expect(plotSizeFor(n) % 2).toBe(0);
  });
});

describe('cells', () => {
  it('knows inside and outside', () => {
    expect(isInside(4, { c: 0, r: 3 })).toBe(true);
    expect(isInside(4, { c: 4, r: 0 })).toBe(false);
    expect(isInside(4, { c: -1, r: 0 })).toBe(false);
    expect(isInside(4, { c: 1.5, r: 0 })).toBe(false);
  });

  it('clamps and rounds a cell onto the plot', () => {
    expect(clampCell(4, { c: -3, r: 9 })).toEqual({ c: 0, r: 3 });
    expect(clampCell(6, { c: 2.4, r: 2.6 })).toEqual({ c: 2, r: 3 });
  });

  it('lists free cells and occupants', () => {
    const plot = { ...emptyPlot(), places: { a: { c: 1, r: 2 } } };
    expect(occupant(plot, { c: 1, r: 2 })).toBe('a');
    expect(occupant(plot, { c: 2, r: 1 })).toBeNull();
    expect(occupiedCells(plot).get(cellKey({ c: 1, r: 2 }))).toBe('a');
    expect(freeCells(plot)).toHaveLength(15);
  });
});

describe('autoPlace', () => {
  it('puts the first tree in the middle, on the farther of the centre cells', () => {
    expect(autoPlace(emptyPlot(), 'h0').places.h0).toEqual({ c: 1, r: 1 });
  });

  it('keeps the second tree off the first one\'s sides', () => {
    const plot = plantMany(2);
    expect(sideNeighbours(plot.places.h0, plot.places.h1)).toBe(false);
  });

  it('leaves a placed habit where it is', () => {
    const plot = plantMany(1);
    expect(autoPlace(plot, 'h0')).toBe(plot);
  });

  it('grows 4×4 to 6×6 on the 7th tree and shifts the old places by one', () => {
    const six = plantMany(6);
    expect(six.size).toBe(4);
    const seven = autoPlace(six, 'h6');
    expect(seven.size).toBe(6);
    for (let i = 0; i < 6; i++) {
      expect(seven.places[`h${i}`]).toEqual({ c: six.places[`h${i}`].c + 1, r: six.places[`h${i}`].r + 1 });
    }
    expect(isInside(6, seven.places.h6)).toBe(true);
  });

  it('leaves a free cell around every tree while there is room', () => {
    // An 8×8 plot holds 16 trees with a free cell around each; plant 10.
    const plot = plantMany(10, grow(emptyPlot(), 8));
    expect(plot.size).toBe(8);
    const cells = Object.values(plot.places);
    for (const a of cells) {
      for (const b of cells) {
        if (a !== b) expect(Math.max(Math.abs(a.c - b.c), Math.abs(a.r - b.r))).toBeGreaterThan(1);
      }
    }
  });

  it('never puts two habits on one cell and keeps 60 % free', () => {
    const plot = plantMany(120);
    expect(occupiedCells(plot).size).toBe(120);
    expect(freeCells(plot).length / (plot.size * plot.size)).toBeGreaterThanOrEqual(0.6);
  });

  it('does not break on a full 30×30 plot', () => {
    let plot = plantMany(900);
    expect(plot.size).toBe(MAX_PLOT);
    expect(freeCells(plot)).toHaveLength(0);
    plot = autoPlace(plot, 'extra');
    expect(plot.places.extra).toBeUndefined();
  });
});

describe('grow', () => {
  it('adds a ring and shifts places', () => {
    const plot = { ...emptyPlot(), places: { a: { c: 0, r: 3 } } };
    const grown = grow(plot, 8);
    expect(grown.size).toBe(8);
    expect(grown.places.a).toEqual({ c: 2, r: 5 });
    expect(grown.shownSize).toBe(4);
  });

  it('never shrinks', () => {
    const plot = { ...emptyPlot(), size: 8 };
    expect(grow(plot, 6)).toBe(plot);
  });
});

describe('moveTo', () => {
  const base: Plot = { ...emptyPlot(), places: { a: { c: 0, r: 0 }, b: { c: 2, r: 2 } } };

  it('moves to a free cell', () => {
    const { plot, swapped } = moveTo(base, 'a', { c: 3, r: 1 });
    expect(plot.places.a).toEqual({ c: 3, r: 1 });
    expect(swapped).toBeNull();
  });

  it('swaps with the tree on an occupied cell', () => {
    const { plot, swapped } = moveTo(base, 'a', { c: 2, r: 2 });
    expect(swapped).toBe('b');
    expect(plot.places.a).toEqual({ c: 2, r: 2 });
    expect(plot.places.b).toEqual({ c: 0, r: 0 });
  });

  it('changes nothing on its own cell', () => {
    expect(moveTo(base, 'a', { c: 0, r: 0 })).toEqual({ plot: base, swapped: null });
    expect(moveTo(base, 'a', { c: 0, r: 0 }).plot).toBe(base);
  });

  it('clamps a cell outside the plot', () => {
    expect(moveTo(base, 'a', { c: 9, r: -2 }).plot.places.a).toEqual({ c: 3, r: 0 });
  });

  it('ignores a habit with no place', () => {
    expect(moveTo(base, 'ghost', { c: 1, r: 1 }).plot).toBe(base);
  });
});

describe('syncPlot', () => {
  it('returns the same object when nothing changed', () => {
    const plot = plantMany(3);
    expect(syncPlot(plot, habitsOf(3))).toBe(plot);
  });

  it('frees the cell of a deleted habit and keeps the size', () => {
    const plot = plantMany(7);
    const synced = syncPlot(plot, habitsOf(7).filter((h) => h.lineageId !== 'h2'));
    expect(synced.places.h2).toBeUndefined();
    expect(synced.size).toBe(6);
    expect(Object.keys(synced.places)).toHaveLength(6);
  });

  it('places a new habit and drops it from seen when deleted', () => {
    const plot = markShown(plantMany(2), ['h0', 'h1']);
    const added = syncPlot(plot, habitsOf(3));
    expect(added.places.h2).toBeDefined();
    const removed = syncPlot(added, habitsOf(1));
    expect(removed.seen).toEqual(['h0']);
  });

  it('keeps one place per habit, whatever the generations', () => {
    // Habits come in grouped already: one entry per lineage.
    const plot = syncPlot(emptyPlot(), [{ lineageId: 'x', days: 3 }]);
    expect(Object.keys(plot.places)).toEqual(['x']);
  });
});

describe('layoutAll', () => {
  const habits = habitsOf(12, (i) => [0, 120, 5, 60, 2, 30, 9, 0, 1, 77, 14, 3][i]);

  it('is the same every time', () => {
    expect(layoutAll(emptyPlot(), habits)).toEqual(layoutAll(emptyPlot(), habits));
  });

  it('puts big trees behind small ones', () => {
    const plot = layoutAll(emptyPlot(), habits);
    expect(plot.size).toBe(plotSizeFor(12));
    const byDays = [...habits].sort((a, b) => b.days - a.days);
    for (let i = 1; i < byDays.length; i++) {
      expect(depthOf(plot.places[byDays[i - 1].lineageId])).toBeLessThanOrEqual(depthOf(plot.places[byDays[i].lineageId]));
    }
  });

  it('uses the same cells as planting one by one', () => {
    const cells = (p: Plot) => Object.values(p.places).map(cellKey).sort();
    expect(cells(layoutAll(emptyPlot(), habits))).toEqual(cells(plantMany(12, grow(emptyPlot(), plotSizeFor(12)))));
  });
});

describe('migratePlot', () => {
  const habits = habitsOf(8, (i) => i * 3);

  it('lays out an old save: every habit placed and seen, no growth to play', () => {
    const plot = migratePlot(undefined, habits);
    expect(Object.keys(plot.places).sort()).toEqual(habits.map((h) => h.lineageId).sort());
    expect([...plot.seen].sort()).toEqual(habits.map((h) => h.lineageId).sort());
    expect(plot.shownSize).toBe(plot.size);
    expect(plot.size).toBe(6);
  });

  it('keeps a saved plot and repairs it', () => {
    const saved = { size: 6, shownSize: 4, seen: ['h0'], places: { h0: { c: 5, r: 5 }, gone: { c: 0, r: 0 } } };
    const plot = migratePlot(saved, habits);
    expect(plot.places.h0).toEqual({ c: 5, r: 5 });
    expect(plot.places.gone).toBeUndefined();
    expect(Object.keys(plot.places)).toHaveLength(8);
    expect(plot.shownSize).toBe(4);
  });

  it('survives damaged data', () => {
    const damaged = { size: 'big', places: { h0: { c: 99, r: 0 }, h1: null, h2: { c: 1, r: 1 }, h3: { c: 1, r: 1 } } };
    const plot = migratePlot(damaged, habits);
    expect(plot.size % 2).toBe(0);
    expect(occupiedCells(plot).size).toBe(8);
    for (const cell of Object.values(plot.places)) expect(isInside(plot.size, cell)).toBe(true);
  });
});
