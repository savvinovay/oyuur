import { expect, test } from '@jest/globals';
import { sceneGeo, slotAt } from '../contract';

const g = sceneGeo(375, 545, 47, 180);

test('scene geometry for a 375x812 phone', () => {
  expect(g.horizonY).toBe(360);
  expect(g.feetY).toBe(507);
  expect(g.backFeetY).toBe(402);
});

test('the tree never stands under the bottom sheet, even on a small phone', () => {
  // 320x568: about 300 px of scene under a 150 px header.
  const small = sceneGeo(320, 300, 20, 150);
  expect(small.feetY).toBe(262);
  // The horizon gives way so the front tree still stands in front of the neighbours.
  expect(small.horizonY).toBeLessThanOrEqual(small.feetY - 70);
  expect(small.horizonY).toBeGreaterThan(small.headerBottom);
  expect(small.backFeetY).toBeLessThan(small.feetY);
  // Room for the tree between the header and its feet.
  expect(small.feetY - small.headerBottom).toBeGreaterThan(80);
});

test('the feet are 38 px above the sheet on every phone', () => {
  const sizes = [[320, 300, 150], [360, 372, 160], [375, 545, 180], [430, 660, 190], [320, 260, 200]];
  for (const [w, h, header] of sizes) {
    const s = sceneGeo(w, h, 20, header);
    expect(s.feetY).toBe(h - 38);
    expect(s.horizonY).toBeLessThanOrEqual(s.feetY - 70);
  }
});

test('when there is room, the horizon keeps clear of the header', () => {
  const tall = sceneGeo(375, 420, 47, 200);
  expect(tall.horizonY).toBe(310);
  expect(tall.feetY).toBe(382);
});

test('the front tree stands in the middle, full size', () => {
  expect(slotAt(0, g)).toEqual({ x: 187.5, feetY: 507, scale: 1, opacity: 1, haze: 0 });
});

test('neighbours stand symmetrically, smaller and further back', () => {
  const l = slotAt(-1, g);
  const r = slotAt(1, g);
  expect(r.x - 187.5).toBeCloseTo(187.5 - l.x);
  expect(r.scale).toBeCloseTo(0.46);
  expect(slotAt(2, g).scale).toBeCloseTo(0.32);
  expect(slotAt(3, g).scale).toBeCloseTo(0.24);
  expect(r.feetY).toBe(402);
  expect(slotAt(3, g).opacity).toBe(0);
  expect(slotAt(10, g)).toEqual(slotAt(3, g));
});

test('moves smoothly between slots', () => {
  const half = slotAt(0.5, g);
  expect(half.scale).toBeCloseTo(0.73);
  expect(half.feetY).toBeCloseTo((507 + 402) / 2);
  for (let d = 0; d < 3; d += 0.1) {
    expect(slotAt(d + 0.1, g).scale).toBeLessThanOrEqual(slotAt(d, g).scale);
    expect(slotAt(d + 0.1, g).feetY).toBeLessThanOrEqual(slotAt(d, g).feetY);
  }
});
