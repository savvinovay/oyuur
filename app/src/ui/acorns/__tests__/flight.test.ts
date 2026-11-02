import { describe, expect, test } from '@jest/globals';
import { arcControl, bezier, EARN, earnArrival, earnTotal, flockSize, shares, SPEND, spendArrival, spendTotal } from '../flight';

describe('how many acorns fly (spec 3.3)', () => {
  test('two more than a fifth of the amount, 3 to 8', () => {
    expect(flockSize(5)).toBe(3);
    expect(flockSize(10)).toBe(4);
    expect(flockSize(15)).toBe(5);
    expect(flockSize(20)).toBe(6);
    expect(flockSize(25)).toBe(7);
    expect(flockSize(40)).toBe(8);
    expect(flockSize(200)).toBe(8);
    expect(flockSize(1)).toBe(3);
  });

  test('the amount is split evenly, the rest goes to the last one', () => {
    expect(shares(15, 5)).toEqual([3, 3, 3, 3, 3]);
    expect(shares(5, 3)).toEqual([1, 1, 3]);
    expect(shares(10, 4)).toEqual([2, 2, 2, 4]);
    expect(shares(2, 3)).toEqual([0, 0, 2]);
    for (const [a, n] of [[5, 3], [13, 5], [150, 8], [7, 6]]) expect(shares(a, n).reduce((s, x) => s + x, 0)).toBe(a);
  });
});

describe('timing (spec 3.4, 3.5)', () => {
  test('earning: each acorn lands 85 ms after the one before, from 780 ms', () => {
    expect(earnArrival(0)).toBe(780);
    expect(earnArrival(2)).toBe(780 + 170);
    // +5: about 1.25 s with the fade and the "+N"; +40: about 1.85 s.
    expect(earnTotal(3)).toBe(780 + 170 + EARN.fade);
    expect(earnTotal(8)).toBe(780 + 7 * 85 + EARN.fade);
  });

  test('spending: six acorns, 70 ms apart, from 120 ms, 480 ms each', () => {
    expect(spendArrival(0)).toBe(600);
    expect(spendArrival(5)).toBe(950);
    expect(spendTotal(6)).toBe(950 + SPEND.fade);
  });
});

describe('the arc', () => {
  const center = { x: 187, y: 400 };

  test('the bend is 60 px off the middle of the path, toward the middle of the screen', () => {
    // From the crown straight up to the wallet on the right: the arc bows to the left (inward).
    const c = arcControl({ x: 300, y: 500 }, { x: 300, y: 60 }, center);
    expect(c.y).toBeCloseTo(280);
    expect(c.x).toBeCloseTo(240);
    // A path on the left side bows to the right.
    const d = arcControl({ x: 40, y: 500 }, { x: 40, y: 100 }, center);
    expect(d.x).toBeCloseTo(100);
  });

  test('a path of no length has its middle as the control point', () => {
    expect(arcControl({ x: 10, y: 10 }, { x: 10, y: 10 }, center)).toEqual({ x: 10, y: 10 });
  });

  test('the curve starts and ends at the ends', () => {
    const a = { x: 0, y: 0 };
    const c = { x: 50, y: 100 };
    const b = { x: 100, y: 0 };
    expect(bezier(a, c, b, 0)).toEqual(a);
    expect(bezier(a, c, b, 1)).toEqual(b);
    expect(bezier(a, c, b, 0.5)).toEqual({ x: 50, y: 50 });
  });
});
