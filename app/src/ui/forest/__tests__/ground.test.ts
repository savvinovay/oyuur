import { describe, expect, test } from '@jest/globals';
import { bankPebbles, edgeSvg, fencePosts, fenceSvg, freeCellRings, lawnSvg, MAX_DECOR, MAX_TUFTS, onPlot, plotCorners, wildMeadow, wildSvg } from '../ground';
import { cellCenter } from '../iso';

describe('wild meadow (1.3)', () => {
  test.each([4, 6, 12, 30])('%i×%i: at most 1500 tufts, none on the plot', (size) => {
    const wild = wildMeadow(size);
    expect(wild.tufts.length).toBeLessThanOrEqual(MAX_TUFTS);
    expect(wild.tufts.length).toBeGreaterThan(MAX_TUFTS / 3);
    expect(wild.decor.length).toBeLessThanOrEqual(MAX_DECOR);
    for (const t of wild.tufts) expect(onPlot(t.x, t.y, size, 0.25)).toBe(false);
    for (const d of wild.decor) expect(onPlot(d.x, d.y, size, 0.5)).toBe(false);
  });

  test('the same every time', () => {
    expect(wildMeadow(6)).toEqual(wildMeadow(6));
  });

  test('paths: one per color', () => {
    const svg = wildSvg(wildMeadow(6), 4);
    expect(svg.flowers).toHaveLength(4);
    expect(svg.tufts[0].length).toBeGreaterThan(0);
    expect(svg.bush.length + svg.stone.length).toBeGreaterThan(0);
  });
});

describe('fence (1.1)', () => {
  test.each([4, 6, 8, 30])('%i×%i: 4·size posts, one at every cell corner', (size) => {
    const posts = fencePosts(size, size);
    expect(posts).toHaveLength(4 * size);
    const keys = new Set(posts.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`));
    expect(keys.size).toBe(4 * size);
  });

  test('the corners of the plot have posts', () => {
    const posts = fencePosts(6, 6).map((p) => `${p.x},${p.y}`);
    const { top, right, bottom, left } = plotCorners(6, 6);
    for (const p of [top, right, bottom, left]) expect(posts).toContain(`${p.x},${p.y}`);
    expect(top).toEqual({ x: 0, y: -20 });
  });

  test('a growing plot: the fence sits in the middle and ends in a corner post', () => {
    // From 6 to 8: the old plot is the middle of the new one.
    expect(plotCorners(6, 8).top).toEqual(cellCenter({ c: 0.5, r: 0.5 }));
    const posts = fencePosts(6.5, 8);
    const { right } = plotCorners(6.5, 8);
    expect(posts.some((p) => Math.abs(p.x - right.x) < 1e-9 && Math.abs(p.y - right.y) < 1e-9)).toBe(true);
    expect(fenceSvg(6.5, 8).post.length).toBeGreaterThan(0);
  });
});

describe('lawn and bank', () => {
  test('stripes by column', () => {
    const lawn = lawnSvg(6);
    expect(lawn.stripes[0].split('Z').length - 1).toBe(3);
    expect(lawn.stripes[1].split('Z').length - 1).toBe(3);
  });

  test('bank and lip for a fractional plot', () => {
    const edge = edgeSvg(7, 8, bankPebbles(8));
    expect(edge.diamond.startsWith('M')).toBe(true);
    expect(edge.pebbles.split('Z').length - 1).toBe(24);
  });

  test('free cells by distance from the lifted tree', () => {
    const rings = freeCellRings([{ c: 0, r: 0 }, { c: 2, r: 1 }, { c: 3, r: 3 }, { c: 1, r: 2 }], { c: 1, r: 1 });
    expect(rings.map((r) => r.d)).toEqual([1, 2]);
  });
});
