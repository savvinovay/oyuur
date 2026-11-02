import { describe, expect, it } from '@jest/globals';
import { SKINS } from '@/game/tree';
import { BASE_Y, CANVAS_H, CANVAS_W, fillZoom, SIZES, lookOf, treeZoom } from '../layout';

describe('tree size on screen', () => {
  for (const skin of SKINS) {
    it(`${skin}: looks bigger every day of growth and always fits`, () => {
      let last = 0;
      for (let days = 0; days < 365; days++) {
        const zoom = treeZoom(skin, days, false);
        const size = SIZES[skin][lookOf(days, false)];
        const shown = size.h * zoom;
        expect(shown).toBeGreaterThan(last);
        expect(size.w * zoom).toBeLessThanOrEqual(CANVAS_W);
        last = shown;
      }
    });

    it(`${skin}: a new stage is clearly wider too, never a step down`, () => {
      for (const days of [3, 7, 21, 50, 100]) {
        const before = SIZES[skin][lookOf(days - 1, false)].w * treeZoom(skin, days - 1, false);
        const after = SIZES[skin][lookOf(days, false)].w * treeZoom(skin, days, false);
        expect(after).toBeGreaterThanOrEqual(before * 1.1);
      }
    });

    it(`${skin}: a dead tree fits too`, () => {
      for (const days of [0, 3, 7, 30, 120, 400]) {
        expect(SIZES[skin][lookOf(days, true)].w * treeZoom(skin, days, true)).toBeLessThanOrEqual(CANVAS_W);
      }
    });
  }
});

describe('tree size in a small picture (forest card)', () => {
  const MIN = 0.58;
  const shown = (skin: (typeof SKINS)[number], days: number, dead: boolean) => {
    const size = SIZES[skin][lookOf(days, dead)];
    const zoom = treeZoom(skin, days, dead) * fillZoom(skin, days, dead, MIN);
    return { h: size.h * zoom, w: size.w * zoom };
  };

  for (const skin of SKINS) {
    it(`${skin}: any tree, alive or dead, fills at least ${MIN} of the picture and fits`, () => {
      for (const dead of [false, true]) {
        for (let days = 0; days < 400; days++) {
          const { h, w } = shown(skin, days, dead);
          // Only a tree as wide as the picture may stay lower.
          if (w < CANVAS_W * 0.96) expect(h / CANVAS_H).toBeGreaterThanOrEqual(MIN - 0.001);
          expect(w).toBeLessThanOrEqual(CANVAS_W * 0.97 + 0.001);
          expect(h).toBeLessThanOrEqual(BASE_Y - 4 + 0.001);
        }
      }
    });

    it(`${skin}: an older tree still looks bigger in a card`, () => {
      let last = 0;
      for (let days = 0; days < 365; days++) {
        const { h } = shown(skin, days, false);
        expect(h).toBeGreaterThanOrEqual(last - 0.001);
        last = h;
      }
    });
  }

  it('no extra zoom without a minimum', () => {
    expect(fillZoom('oak', 2, false, 0)).toBe(1);
    expect(fillZoom('spruce', 400, false, MIN)).toBeCloseTo(1, 1);
  });
});
