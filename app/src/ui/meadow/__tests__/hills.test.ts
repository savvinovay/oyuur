import { expect, test } from '@jest/globals';
import {
  blink, bushes, farForest, forestAt, frontRows, GRASS_ROWS, GRASS_TILE, HILLS, MOUNTAINS, PERIOD, ridge, ridgeMax, tufts, underRows,
  wrap,
} from '../hills';

test('every wave fits a whole number of times into the period', () => {
  for (const w of [...MOUNTAINS, ...HILLS]) expect(PERIOD % w.period).toBe(0);
});

test('mountains and hills repeat without a seam every 2048 px', () => {
  for (const x of [0, 13, 377.5, 1000, 2047, -300]) {
    expect(ridge(x + PERIOD, MOUNTAINS)).toBeCloseTo(ridge(x, MOUNTAINS), 6);
    expect(ridge(x + PERIOD, HILLS)).toBeCloseTo(ridge(x, HILLS), 6);
  }
});

test('ridges stay between the base and their highest point', () => {
  for (let x = 0; x < PERIOD; x += 7) {
    const h = ridge(x, MOUNTAINS);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(ridgeMax(MOUNTAINS));
  }
});

test('the far forest repeats every 2048 px, trees 6–18 px tall', () => {
  const trees = farForest();
  for (const x of [0, 6.9, 500, 2047.5, -10, 1234.5]) expect(forestAt(x + PERIOD, trees)).toBe(forestAt(x, trees));
  for (const t of trees) {
    expect(t.h).toBeGreaterThanOrEqual(6);
    expect(t.h).toBeLessThanOrEqual(18);
    // Whole trees inside one period: the copy one period on joins without a seam.
    expect(t.x - t.w / 2).toBeGreaterThanOrEqual(0);
    expect(t.x + t.w / 2).toBeLessThanOrEqual(PERIOD);
  }
});

test('the far forest stands in groups, round crowns and fir trees mixed', () => {
  const trees = farForest();
  expect(trees.some((t) => t.kind === 'round')).toBe(true);
  expect(trees.some((t) => t.kind === 'fir')).toBe(true);
  // Gaps of open land between the groups.
  let open = 0;
  for (let x = 0; x < PERIOD; x += 2) if (forestAt(x, trees) === 0) open += 2;
  expect(open).toBeGreaterThan(PERIOD * 0.15);
  expect(open).toBeLessThan(PERIOD * 0.7);
  // Not a fence: the heights really differ.
  const hs = trees.map((t) => t.h);
  expect(Math.max(...hs) - Math.min(...hs)).toBeGreaterThan(8);
});

test('thick front grass along the bottom of the scene, 24–40 px tall', () => {
  const bottom = 185;
  const rows = frontRows(bottom);
  const all = rows.flatMap((row, i) => tufts(row, 3 + i, bottom));
  const tops = all.map((t) => bottom - (t.y - t.h));
  expect(Math.max(...tops)).toBeGreaterThanOrEqual(24);
  expect(Math.max(...tops)).toBeLessThanOrEqual(40);
  for (const t of all) expect(t.y).toBeLessThanOrEqual(bottom);
  // About three times as dense as the nearest meadow row.
  const front = rows[rows.length - 1];
  expect(front.count).toBeGreaterThanOrEqual(GRASS_ROWS[2].count * 3);
});

test('under the sheet the thick grass goes on down past the bottom of the screen', () => {
  // 375×812: the sheet rests 224 px up, so 224 px of meadow hide under it.
  const bottom = 185;
  const screenBottom = bottom + 224;
  const rows = underRows(bottom, screenBottom);
  expect(rows.length).toBeGreaterThan(0);
  const all = rows.flatMap((row, i) => tufts(row, 5 + i, bottom));
  // Covers the whole strip, the last tufts standing at the very bottom.
  expect(Math.min(...all.map((t) => t.y))).toBeLessThan(bottom + 40);
  expect(Math.max(...all.map((t) => t.y))).toBeGreaterThan(screenBottom - 10);
  // At rest it hides under the sheet: no tip comes up more than 4 px over its edge.
  for (const t of all) expect(t.y - t.h).toBeGreaterThanOrEqual(bottom - 4);
  // Every 32 px or so its own band, so a swaying tuft's foot hardly slides.
  for (const row of rows) expect((row.to! - row.from) / row.bands).toBeLessThanOrEqual(32);
  // Thick: at least as many tufts per tile and 100 px as the bright front row has per tile.
  const perTile = rows.reduce((s, r) => s + r.count, 0);
  expect((perTile * 100) / (screenBottom - bottom)).toBeGreaterThanOrEqual(frontRows(bottom)[1].count);
});

test('no grass under the sheet when the screen ends at the scene bottom', () => {
  expect(underRows(185, 185)).toEqual([]);
  expect(underRows(185, 190)).toEqual([]);
});

test('the landscape is the same every time', () => {
  expect(bushes()).toEqual(bushes());
  expect(tufts(GRASS_ROWS[2], 2, 180)).toEqual(tufts(GRASS_ROWS[2], 2, 180));
  expect(bushes()).toHaveLength(7);
  for (const b of bushes()) expect(b.x).toBeLessThan(PERIOD);
});

test('grass tufts stay inside their tile and band', () => {
  GRASS_ROWS.forEach((row, i) => {
    const list = tufts(row, i, 190);
    expect(list).toHaveLength(row.count);
    for (const t of list) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThan(GRASS_TILE);
      expect(t.y).toBeGreaterThanOrEqual(row.from);
      expect(t.y).toBeLessThanOrEqual(row.to ?? 190);
      expect(t.h).toBeGreaterThanOrEqual(row.minH);
      expect(t.h).toBeLessThanOrEqual(row.maxH);
    }
  });
});

test('a firefly glows for 1.6 s, then rests dark', () => {
  expect(blink(0, 1, 0)).toBe(0);
  expect(blink(0.8, 1, 0)).toBeCloseTo(1);
  expect(blink(2, 1, 0)).toBe(0);
  expect(blink(2.6 + 0.8, 1, 0)).toBeCloseTo(1);
});

test('wrap keeps any shift inside the period', () => {
  expect(wrap(-1, PERIOD)).toBe(PERIOD - 1);
  expect(wrap(PERIOD * 3 + 5, PERIOD)).toBe(5);
});
