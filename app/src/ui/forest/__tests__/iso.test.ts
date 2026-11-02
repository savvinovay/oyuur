import { describe, expect, test } from '@jest/globals';
import {
  Area, backOnPlot, CAM_SLACK, CELL_H, CELL_W, cellAt, cellCenter, cellUnder, CHOOSE_CELL_PX, chooseCam, clampCam, depth, dragCamStep, edgeSpeed, fitBox, flyDuration,
  focusCam, lawnShare, LAWN_SHARE_MIN, plotBox, plotCam, plusRadius, plotWithTrees, rubberCam, toScreen, toWorld, treesBox, treesCam, wholeCam, worldToCell,
  Z_MAX, zoomLimits,
} from '../iso';

// Spec 2.2: iPhone 375×812, insets 47 / 34. The area runs from under the header
// (47 + 56) to the top of the folded sheet (80 + 34 above the bottom).
const phone: Area = { width: 375, top: 103, bottom: 812 - 114 };

describe('cells (1.1)', () => {
  test('a cell centre and back', () => {
    for (let c = 0; c < 8; c++) {
      for (let r = 0; r < 8; r++) {
        const p = cellCenter({ c, r });
        const back = worldToCell(p.x, p.y);
        expect(back.c).toBeCloseTo(c, 9);
        expect(back.r).toBeCloseTo(r, 9);
        expect(cellAt(p.x, p.y, 8)).toEqual({ c, r });
      }
    }
  });

  test('centres and corners in world px', () => {
    expect(cellCenter({ c: 0, r: 0 })).toEqual({ x: 0, y: 0 });
    expect(cellCenter({ c: 1, r: 0 })).toEqual({ x: 40, y: 20 });
    expect(cellCenter({ c: 0, r: 1 })).toEqual({ x: -40, y: 20 });
    // The top corner of the plot is (0, -20); a 6×6 plot is 480×240 (plus the bank).
    const box = plotBox(6);
    expect(box.top).toBe(-20);
    expect(box.right - box.left).toBe(480);
    expect(box.bottom - box.top).toBe(240 + 9);
  });

  test('a point near a cell edge rounds to the nearest cell; outside the plot is null', () => {
    const p = cellCenter({ c: 2, r: 3 });
    expect(cellAt(p.x + 15, p.y + 4, 6)).toEqual({ c: 2, r: 3 });
    expect(cellAt(0, -40, 6)).toBeNull();
    expect(cellAt(cellCenter({ c: 6, r: 0 }).x, cellCenter({ c: 6, r: 0 }).y, 6)).toBeNull();
  });

  test('depth: further cells first', () => {
    expect(depth({ c: 0, r: 0 })).toBeLessThan(depth({ c: 1, r: 0 }));
    expect(depth({ c: 2, r: 3 })).toBe(5);
  });
});

describe('camera (2.1)', () => {
  test('screen ↔ world', () => {
    const cam = { x: 30, y: 100, z: 1.3 };
    const s = toScreen(70, 140, cam, phone);
    expect(s.x).toBeCloseTo(375 / 2 + 40 * 1.3, 9);
    expect(s.y).toBeCloseTo((103 + 698) / 2 + 40 * 1.3, 9);
    const w = toWorld(s.x, s.y, cam, phone);
    expect(w.x).toBeCloseTo(70, 9);
    expect(w.y).toBeCloseTo(140, 9);
  });
});

describe('limits (2.2) on 375×812', () => {
  test('fit zoom for 4×4, 6×6, 12×12', () => {
    expect(zoomLimits(4, phone).fit).toBeCloseTo(1.07, 2);
    expect(zoomLimits(6, phone).fit).toBeCloseTo(0.71, 2);
    expect(zoomLimits(12, phone).fit).toBeCloseTo(0.36, 2);
  });

  test('min zoom: fit, but no more than 0.9 and never under 0.3; max 1.6', () => {
    expect(zoomLimits(4, phone).min).toBe(0.9);
    expect(zoomLimits(6, phone).min).toBeCloseTo(0.71, 2);
    expect(zoomLimits(30, phone).min).toBe(0.3);
    expect(zoomLimits(6, phone).max).toBe(1.6);
  });

  test('the whole-plot view', () => {
    const cam = plotCam(6, phone);
    expect(cam.z).toBeCloseTo(0.71, 2);
    expect(cam.x).toBe(0);
    // A big plot stops at the lowest zoom.
    expect(plotCam(30, phone).z).toBe(0.3);
  });

  test('clamping: zoom and centre, 120/z px from the plot box', () => {
    expect(clampCam({ x: 0, y: 100, z: 3 }, 6, phone).z).toBe(1.6);
    expect(clampCam({ x: 0, y: 100, z: 0.1 }, 6, phone).z).toBeCloseTo(0.71, 2);
    const far = clampCam({ x: 5000, y: -5000, z: 1 }, 6, phone);
    expect(far.x).toBe(240 + CAM_SLACK);
    expect(far.y).toBe(-20 - 130 - CAM_SLACK);
    const inside = { x: 10, y: 50, z: 1 };
    expect(clampCam(inside, 6, phone)).toEqual(inside);
  });

  test('rubber: past the limit by at most 60 px, inside unchanged', () => {
    const inside = { x: 10, y: 50, z: 1 };
    expect(rubberCam(inside, 6, phone)).toEqual(inside);
    const far = rubberCam({ x: 10000, y: 50, z: 1 }, 6, phone);
    expect(far.x).toBeGreaterThan(240 + CAM_SLACK);
    expect(far.x).toBeLessThanOrEqual(240 + CAM_SLACK + 60);
    const big = rubberCam({ x: 0, y: 50, z: 10 }, 6, phone);
    expect(big.z).toBeGreaterThan(1.6);
    expect(big.z).toBeLessThanOrEqual(1.6 * 1.12 + 1e-9);
  });
});

describe('fitting trees (2.3)', () => {
  test('one tree comes as close as 1.2', () => {
    const box = treesBox([{ cell: { c: 1, r: 1 }, w: 40, h: 60 }])!;
    const lim = zoomLimits(4, phone);
    expect(fitBox(box, phone, 24, lim.min, 1.2).z).toBe(1.2);
  });

  test('a box around trees spread over a 6×6 plot', () => {
    const box = treesBox([
      { cell: { c: 0, r: 5 }, w: 60, h: 100 },
      { cell: { c: 5, r: 0 }, w: 60, h: 100 },
    ])!;
    expect(box.left).toBe(-200 - 30);
    expect(box.right).toBe(200 + 30);
    expect(box.top).toBe(100 - 100);
    expect(fitBox(box, phone, 24, 0.3, 1.2).z).toBeCloseTo((375 - 48) / 460, 5);
    // The lowest zoom wins over a fit that would go further out.
    const lim = zoomLimits(6, phone);
    const cam = fitBox(box, phone, 24, lim.min, 1.2);
    expect(cam.z).toBe(lim.min);
    expect(cam.x).toBe(0);
  });

  test('no trees — no box', () => {
    expect(treesBox([])).toBeNull();
  });
});

describe('motion', () => {
  test('edge speed (4.4)', () => {
    expect(edgeSpeed(64, 64)).toBe(0);
    expect(edgeSpeed(100, 64)).toBe(0);
    expect(edgeSpeed(0, 64)).toBe(700);
    expect(edgeSpeed(-10, 64)).toBe(700);
    expect(edgeSpeed(32, 64)).toBeCloseTo(175, 9);
  });

  test('flight duration (2.6)', () => {
    expect(flyDuration(0)).toBe(360);
    expect(flyDuration(400)).toBe(460);
    expect(flyDuration(5000)).toBe(720);
  });
});

describe('camera views (fixes after the wave 3 check)', () => {
  const spread = [
    { cell: { c: 0, r: 5 }, w: 60, h: 100 },
    { cell: { c: 5, r: 0 }, w: 60, h: 100 },
    { cell: { c: 3, r: 3 }, w: 40, h: 40 },
  ];

  test('calm view of a small plot: around the tree pictures too, as in frame 01', () => {
    const cam = treesCam(6, spread, phone, phone);
    expect(cam).toEqual(fitBox(treesBox(spread)!, phone, 20, zoomLimits(6, phone).min, 1.2));
  });

  test('calm view of a big plot: around the tree pictures with 20 px', () => {
    const far = [{ cell: { c: 0, r: 0 }, w: 60, h: 100 }, { cell: { c: 2, r: 0 }, w: 60, h: 100 }];
    const cam = treesCam(12, far, phone, phone);
    expect(cam).toEqual(fitBox(treesBox(far)!, phone, 20, zoomLimits(12, phone).min, 1.2));
  });

  test('calm view of an empty plot: its middle, no closer than 1.15', () => {
    const cam = treesCam(4, [], phone, phone);
    expect(cam.x).toBe(0);
    expect(cam.z).toBeLessThanOrEqual(1.15);
  });

  test('a tree brought to the eye: 1.4 close, in the upper half, whole', () => {
    // The area over a card: from under the header to y 470.
    const area: Area = { width: 375, top: 103, bottom: 470 };
    const cam = focusCam(100, 200, 120, 0.8, area);
    expect(cam.z).toBe(1.4);
    const top = toScreen(100, 200 - 120, cam, area);
    const feet = toScreen(100, 200, cam, area);
    expect(top.y).toBeGreaterThanOrEqual(area.top);
    expect((top.y + feet.y) / 2).toBeLessThanOrEqual((area.top + area.bottom) / 2);
    expect(feet.x).toBeCloseTo(375 / 2, 9);
    // Already closer: stays as close, never past the limit.
    expect(focusCam(0, 0, 60, 1.5, area).z).toBe(1.5);
    expect(focusCam(0, 0, 60, 3, area).z).toBe(Z_MAX);
  });

  test('a tree too tall for a short area: zoom eases so it fits', () => {
    const area: Area = { width: 375, top: 100, bottom: 260 };
    const cam = focusCam(0, 0, 124, 1, area);
    const top = toScreen(0, -124, cam, area);
    const feet = toScreen(0, 0, cam, area);
    expect(top.y).toBeGreaterThanOrEqual(area.top - 1e-9);
    expect(feet.y).toBeLessThanOrEqual(area.bottom + 1e-9);
  });

  test('choose a spot: every cell wide enough for a finger on screen', () => {
    const full: Area = { width: 320, top: 76, bottom: 568 };
    for (const size of [4, 6, 8, 12]) {
      const cam = chooseCam(size, cellCenter({ c: 1, r: 1 }), full);
      expect(cam.z * CELL_W).toBeGreaterThanOrEqual(CHOOSE_CELL_PX - 1e-9);
    }
    // A 6×6 plot fits whole on 375×812 without the sheet.
    const phoneFull: Area = { width: 375, top: 103, bottom: 812 };
    const cam = chooseCam(6, { x: 0, y: 0 }, phoneFull);
    const box = plotBox(6);
    expect(toScreen(box.left, 0, cam, phoneFull).x).toBeGreaterThanOrEqual(0);
    expect(toScreen(box.right, 0, cam, phoneFull).x).toBeLessThanOrEqual(375);
  });

  test('choose a spot on a big plot: around the tree, not past the plot', () => {
    const full: Area = { width: 320, top: 76, bottom: 568 };
    const cam = chooseCam(12, cellCenter({ c: 11, r: 0 }), full);
    const box = plotWithTrees(12);
    expect(toScreen(box.right, 0, cam, full).x).toBeGreaterThanOrEqual(320 - 1e-9);
    expect(cam.x).toBeLessThan(cellCenter({ c: 11, r: 0 }).x);
  });

  test('dragging to an edge: the camera centre stays over the plot', () => {
    const box = plotBox(6);
    const now = { x: box.right - 10, y: 100, z: 1 };
    expect(dragCamStep(now, { x: box.right + 50, y: 100, z: 1 }, 6).x).toBe(box.right);
    // Already further out (panned before lifting): no jump back, no further either.
    const out = { x: box.right + 40, y: 100, z: 1 };
    expect(dragCamStep(out, { x: box.right + 60, y: 100, z: 1 }, 6).x).toBe(box.right + 40);
    expect(dragCamStep(out, { x: box.right + 30, y: 100, z: 1 }, 6).x).toBe(box.right + 30);
    expect(dragCamStep(now, { x: now.x, y: box.top - 500, z: 1 }, 6).y).toBe(box.top);
  });
});

describe('choosing a spot by a tap (4.7)', () => {
  const small: Area = { width: 320, top: 76, bottom: 568 };

  test('a tap anywhere in a cell, around its "+", means that cell', () => {
    for (const size of [6, 8, 12]) {
      const cam = chooseCam(size, cellCenter({ c: 1, r: 1 }), small);
      for (let c = 0; c < size; c++) {
        for (let r = 0; r < size; r++) {
          const s = toScreen(cellCenter({ c, r }).x, cellCenter({ c, r }).y, cam, small);
          // The "+" and a finger off its middle: a third of the cell to each side.
          for (const [dx, dy] of [[0, 0], [CELL_W / 6, 0], [-CELL_W / 6, 0], [0, CELL_H / 6], [0, -CELL_H / 6]]) {
            expect(cellUnder(s.x + dx * cam.z, s.y + dy * cam.z, cam, small, size)).toEqual({ c, r });
          }
        }
      }
    }
  });

  test('off the plot a tap means no cell', () => {
    const cam = chooseCam(6, cellCenter({ c: 0, r: 0 }), small);
    const back = toScreen(cellCenter({ c: 0, r: 0 }).x, cellCenter({ c: 0, r: 0 }).y - CELL_H, cam, small);
    expect(cellUnder(back.x, back.y, cam, small, 6)).toBeNull();
  });

  test('the "+" of neighbouring cells never touch', () => {
    for (const z of [0.4, 0.55, CHOOSE_CELL_PX / CELL_W, 1, 1.6]) {
      const r = plusRadius(z);
      // The closest "+" are a row apart: (c + 1, r + 1) is straight below, CELL_H·z away.
      expect(2 * r).toBeLessThan(CELL_H * z);
      expect(r).toBeLessThanOrEqual(12);
    }
    expect(plusRadius(1)).toBe(12);
  });
});

describe('back over the plot after a drag or a delete', () => {
  test('a camera over the plot stays', () => {
    const cam = { x: 0, y: (6 * CELL_H) / 2, z: 1 };
    expect(lawnShare(cam, 6, phone)).toBeGreaterThan(LAWN_SHARE_MIN);
    expect(backOnPlot(cam, 6, phone)).toBeNull();
  });

  test('a camera left at the side comes back, at the same zoom, enough of the plot in view', () => {
    const box = plotBox(6);
    // Driven to the right edge while dragging: the plot is mostly off screen.
    const cam = { x: box.right + 60, y: 120, z: 1.2 };
    expect(lawnShare(cam, 6, phone)).toBeLessThan(LAWN_SHARE_MIN);
    const back = backOnPlot(cam, 6, phone)!;
    expect(back.z).toBe(1.2);
    expect(back.x).toBeLessThan(cam.x);
    expect(lawnShare(back, 6, phone)).toBeGreaterThanOrEqual(LAWN_SHARE_MIN);
  });

  test('a big plot, close in: half the screen lawn is enough', () => {
    const cam = { x: cellCenter({ c: 6, r: 6 }).x, y: cellCenter({ c: 6, r: 6 }).y, z: 1.4 };
    expect(lawnShare(cam, 12, phone)).toBeGreaterThan(0.9);
    expect(backOnPlot(cam, 12, phone)).toBeNull();
  });
});
