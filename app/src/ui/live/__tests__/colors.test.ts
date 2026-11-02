import { describe, expect, it } from '@jest/globals';
import { chainMatrix, DRY, DRY_NIGHT, NIGHT, NIGHT_WARM, nightMatrix, treeMatrix } from '../colors';

const I = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];

/** Applies a 4×5 color matrix to an rgb color (alpha 1). */
const apply = (m: number[], [r, g, b]: number[]) => [0, 1, 2].map((i) => m[i * 5] * r + m[i * 5 + 1] * g + m[i * 5 + 2] * b + m[i * 5 + 3] + m[i * 5 + 4]);
const luma = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

describe('color matrices', () => {
  it('chaining does the inner matrix first, then the outer one', () => {
    expect(chainMatrix(I, DRY)).toEqual(DRY);
    expect(chainMatrix(DRY, I)).toEqual(DRY);
    const green = [0.545, 0.765, 0.29];
    const both = apply(chainMatrix(nightMatrix(), DRY), green);
    const step = apply(nightMatrix(), apply(DRY, green));
    both.forEach((v, i) => expect(v).toBeCloseTo(step[i], 6));
  });

  it('night is no change by day and about 0.75 of the brightness at night, a little bluer', () => {
    expect(nightMatrix(0)).toEqual(I);
    const green = [0.545, 0.765, 0.29];
    const night = apply(nightMatrix(), green);
    expect(luma(night) / luma(green)).toBeGreaterThan(0.68);
    expect(luma(night) / luma(green)).toBeLessThan(0.8);
    expect(night[2] / night[1]).toBeGreaterThan(green[2] / green[1]);
  });

  it('the live tree with no effects keeps its colors', () => {
    expect(treeMatrix(0, 0, 0, 0, [0, 0, 0])).toEqual(I);
    expect(treeMatrix(0, 0, 0, 0, [0, 0, 0], 1)).toEqual(nightMatrix());
  });

  it('a thirsty tree at night is softer and lighter than the old night × thirst (wave 2, 5.3)', () => {
    const green = [0.545, 0.765, 0.29];
    const sat = ([r, g, b]: number[]) => Math.max(r, g, b) - Math.min(r, g, b);
    const old = apply(chainMatrix(nightMatrix(), DRY), green);
    const now = apply(treeMatrix(1, 0, 0, 0, [0, 0, 0], 1), green);
    expect(luma(now)).toBeGreaterThan(luma(old) * 1.1);
    expect(sat(now)).toBeGreaterThan(sat(old));
    // Exactly: the night's thirst matrix under 0.7 of the night.
    expect(treeMatrix(1, 0, 0, 0, [0, 0, 0], 1)).toEqual(chainMatrix(nightMatrix(0.7), DRY_NIGHT));
  });

  it('the night thirst keeps grey grey, and the day thirst is unchanged', () => {
    const grey = [0.5, 0.5, 0.5];
    apply(DRY_NIGHT, grey).forEach((v) => expect(v).toBeCloseTo(0.5, 1));
    expect(treeMatrix(1, 0, 0, 0, [0, 0, 0], 0)).toEqual(DRY);
  });

  it('half way into the night, the thirst is half way between the day and night ones', () => {
    const m = treeMatrix(1, 0, 0, 0, [0, 0, 0], 0.5);
    const dry = DRY.map((v, i) => v + (DRY_NIGHT[i] - v) * 0.5);
    chainMatrix(nightMatrix(0.5 * 0.7), dry).forEach((v, i) => expect(m[i]).toBeCloseTo(v, 9));
  });

  it('the maple keeps its fire at night: about 0.8 of the brightness, no less saturated', () => {
    const sat = ([r, g, b]: number[]) => (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b);
    const orange = [0.94, 0.478, 0.18];
    const night = apply(nightMatrix(1, 'maple'), orange);
    expect(luma(night) / luma(orange)).toBeGreaterThan(0.75);
    expect(luma(night) / luma(orange)).toBeLessThan(0.85);
    expect(sat(night)).toBeGreaterThanOrEqual(sat(orange));
    // Still a touch of blue, like every tree at night: grey bark turns a little bluish.
    const bark = apply(nightMatrix(1, 'maple'), [0.5, 0.5, 0.5]);
    expect(bark[2]).toBeGreaterThan(bark[0]);
    expect(treeMatrix(0, 0, 0, 0, [0, 0, 0], 1, 'maple')).toEqual(NIGHT_WARM);
  });

  it('the other kinds keep the plain night', () => {
    for (const skin of ['oak', 'sakura', 'spruce', 'birch', 'apple', 'palm'] as const) {
      expect(nightMatrix(1, skin)).toEqual(NIGHT);
      expect(treeMatrix(1, 0, 0, 0, [0, 0, 0], 1, skin)).toEqual(treeMatrix(1, 0, 0, 0, [0, 0, 0], 1));
    }
  });
});
