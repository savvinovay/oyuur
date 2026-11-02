import { describe, expect, it } from '@jest/globals';
import { Skin } from '@/game/tree';
import { sceneGeo } from '../../scene/contract';
import { lookOf, treeZoom } from '../../trees/layout';
import { BUBBLE, bubbleSpot, crownOutline, Outline, treeK } from '../bubble';

// The screens we check: 375×812 and 430×932 with the sheet in its normal place,
// 320×568 with it lowered (spec 1.2), with and without a notch.
const GEOS = [
  sceneGeo(375, 812 - 224, 0, 150),
  sceneGeo(375, 812 - 258, 47, 197),
  sceneGeo(320, 568 - 92, 0, 140),
  sceneGeo(430, 932 - 258, 47, 205),
];
const SKINS: Skin[] = ['oak', 'sakura', 'spruce', 'birch', 'maple', 'apple', 'palm'];
const DAYS = [0, 1, 2, 3, 5, 7, 12, 20, 21, 35, 49, 50, 80, 99, 100, 200, 365, 450, 1000];

/** How deep a point (drawing units from the feet) is inside the outline, units; ≤ 0 outside. */
function depthInside(o: Outline, x: number, y: number): number {
  if (o.kind === 'oval') {
    const d = Math.hypot(x / o.rx, (y - o.cy) / o.ry);
    return (1 - d) * Math.min(o.rx, o.ry);
  }
  if (y < o.top || y > o.base) return 0;
  const half = (o.half * (y - o.top)) / (o.base - o.top);
  return half - Math.abs(x);
}

describe('the water-me bubble', () => {
  it('stays on screen and under the header for every kind, stage and screen', () => {
    for (const geo of GEOS)
      for (const skin of SKINS)
        for (const days of DAYS) {
          const s = bubbleSpot(skin, days, false, geo);
          expect(geo.width / 2 + s.x + BUBBLE / 2).toBeLessThanOrEqual(geo.width - 4);
          // 4 px for the bob.
          expect(geo.feetY + s.y - BUBBLE / 2 - 4).toBeGreaterThanOrEqual(geo.headerBottom);
        }
  });

  it('never covers the crown', () => {
    for (const geo of GEOS)
      for (const skin of SKINS)
        for (const days of DAYS) {
          const s = bubbleSpot(skin, days, false, geo);
          const zoom = treeZoom(skin, days, false) * treeK(geo);
          const o = crownOutline(skin, lookOf(days, false));
          let worst = 0;
          for (let i = 0; i < 32; i++) {
            const a = (i / 32) * 2 * Math.PI;
            const x = (s.x + (Math.cos(a) * BUBBLE) / 2) / zoom;
            const y = (s.y + (Math.sin(a) * BUBBLE) / 2) / zoom;
            worst = Math.max(worst, depthInside(o, x, y) * zoom);
          }
          // At most the tips of the edge leaves, px.
          expect(worst).toBeLessThanOrEqual(3);
        }
  });

  it('sits up and to the right of the crown, close to it', () => {
    const geo = GEOS[0];
    for (const skin of SKINS)
      for (const days of DAYS) {
        const s = bubbleSpot(skin, days, false, geo);
        const zoom = treeZoom(skin, days, false) * treeK(geo);
        const o = crownOutline(skin, lookOf(days, false));
        expect(s.x).toBeGreaterThan(0);
        // Its middle is no more than 40 px off the crown's edge: it belongs to this tree.
        let near = Infinity;
        for (let i = 0; i < 64; i++) {
          const a = (i / 64) * 2 * Math.PI;
          const p =
            o.kind === 'oval'
              ? { x: Math.cos(a) * o.rx, y: o.cy + Math.sin(a) * o.ry }
              : { x: (Math.cos(a) > 0 ? 1 : -1) * o.half * (i % 32) / 32, y: o.top + (o.base - o.top) * (i % 32) / 32 };
          near = Math.min(near, Math.hypot(p.x * zoom - s.x, p.y * zoom - s.y));
        }
        expect(near).toBeLessThanOrEqual(40);
      }
  });
});
