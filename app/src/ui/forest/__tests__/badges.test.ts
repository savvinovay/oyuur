import { describe, expect, test } from '@jest/globals';
import { BADGE_H, badgeHideZoom, MarkTree } from '../badges';
import { cellCenter } from '../iso';

const W = 64;
const tree = (id: string, c: number, r: number, h = 40, w = 40): MarkTree => {
  const p = cellCenter({ c, r });
  return { id, x: p.x, top: p.y - h, w, depth: c + r };
};

/** Screen boxes of the badges shown at zoom `z`. */
function shown(trees: MarkTree[], hide: Map<string, number>, z: number) {
  return trees.filter((t) => z >= hide.get(t.id)!).map((t) => ({ id: t.id, x: t.x * z, y: t.top * z }));
}

describe('"new" badges (5.2)', () => {
  test('a lone badge always shows', () => {
    expect(badgeHideZoom([tree('a', 2, 2)], [], W).get('a')).toBe(0);
  });

  test('at any zoom the badges shown never overlap; the nearer one wins', () => {
    const trees = [tree('back', 1, 1), tree('front', 2, 2), tree('side', 2, 1, 60), tree('far', 5, 0)];
    const hide = badgeHideZoom(trees, [], W);
    for (const z of [0.3, 0.5, 0.75, 1, 1.2, 1.6]) {
      const list = shown(trees, hide, z);
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          const overlap = Math.abs(a.x - b.x) < W && Math.abs(a.y - b.y) < BADGE_H;
          expect(overlap).toBe(false);
        }
      }
    }
    // Far out the front one keeps its badge, the one behind it hides.
    expect(hide.get('front')!).toBeLessThan(0.5);
    expect(hide.get('back')!).toBeGreaterThan(0.5);
  });

  test('a badge gives way to a neighbour\'s drop, not to its own', () => {
    const a = tree('a', 2, 2);
    const b = tree('b', 2, 1);
    const hide = badgeHideZoom([a], [a, b], W);
    expect(hide.get('a')!).toBeGreaterThan(0.5);
    expect(badgeHideZoom([a], [a], W).get('a')).toBe(0);
  });
});
