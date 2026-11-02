import { describe, expect, test } from '@jest/globals';
import { DEFAULT_SIZES, Detent, detentHeights, detentList, dragVisible, menuHeight, pickDetent, progress, restDetent, rubber, sameDetent, SheetSizes, tapTarget } from '../detents';

// Spec 1.1: iPhone 375×812 (insets 47 / 34) and a small 320×568 phone (insets 20 / 0).
const big: SheetSizes = { ...DEFAULT_SIZES, menu: menuHeight(375), bottomInset: 34, topInset: 47, screenH: 812 };
const small: SheetSizes = { ...DEFAULT_SIZES, menu: menuHeight(320), bottomInset: 0, topInset: 20, screenH: 568 };
const top = (s: SheetSizes, d: Detent) => s.screenH - detentHeights(s)[d];

describe('detent heights (table 1.1)', () => {
  test('375×812', () => {
    expect(detentHeights(big)).toEqual({ peek: 126, normal: 258, menu: 559, empty: 224, emptyMenu: 533 });
    expect(top(big, 'peek')).toBe(686);
    expect(top(big, 'normal')).toBe(554);
    expect(top(big, 'menu')).toBe(253);
    expect(top(big, 'empty')).toBe(588);
    expect(top(big, 'emptyMenu')).toBe(279);
  });

  test('320×568: the menu stops at insets.top + 56 and scrolls inside', () => {
    expect(small.menu).toBe(285);
    expect(top(small, 'peek')).toBe(476);
    expect(top(small, 'normal')).toBe(344);
    expect(top(small, 'menu')).toBe(76);
    expect(top(small, 'empty')).toBe(378);
    expect(top(small, 'emptyMenu')).toBe(85);
  });

  test('a taller measured status moves every place with it', () => {
    const tall = detentHeights({ ...big, status: 74 });
    expect(tall.peek).toBe(126 + 22);
    expect(tall.normal).toBe(258 + 22);
  });
});

describe('rest place (spec 1.2)', () => {
  test('tall phones rest in normal, small ones folded', () => {
    expect(restDetent(big, 180, true)).toBe('normal'); // room 336
    expect(restDetent({ ...big, screenH: 667, topInset: 20, bottomInset: 0 }, 170, true)).toBe('normal'); // room 235
    expect(restDetent(small, 150, true)).toBe('peek'); // room 156
    expect(restDetent({ ...small, screenH: 640, topInset: 24 }, 210, true)).toBe('peek'); // Android 360×640: ~170
  });

  test('right at the edge', () => {
    // room = 812 − 258 − hb − 38 = 230 at hb 286.
    expect(restDetent(big, 286, true)).toBe('normal');
    expect(restDetent(big, 287, true)).toBe('peek');
  });

  test('no habits: the empty sheet', () => {
    expect(restDetent(big, 180, false)).toBe('empty');
    expect(detentList(false)).toEqual(['empty', 'emptyMenu']);
  });
});

describe('release (spec 1.5)', () => {
  const h = detentHeights(big);
  const list = detentList(true);

  test('a slow release goes to the nearest place', () => {
    expect(pickDetent(250, 0, 'normal', list, h)).toBe('normal');
    expect(pickDetent(400, 0, 'normal', list, h)).toBe('normal');
    expect(pickDetent(450, 0, 'normal', list, h)).toBe('menu');
    expect(pickDetent(180, 0, 'normal', list, h)).toBe('peek');
  });

  test('the speed carries the sheet for 150 ms', () => {
    // 400 + 800 × 0.15 = 520: nearer to the menu.
    expect(pickDetent(400, 800, 'normal', list, h)).toBe('menu');
    expect(pickDetent(400, -800, 'normal', list, h)).toBe('normal');
  });

  test('a flick faster than 1000 px/s moves at least one place', () => {
    // Barely moved, but flicked up: one place up from where the gesture began.
    expect(pickDetent(262, 1100, 'normal', list, h)).toBe('menu');
    expect(pickDetent(254, -1100, 'normal', list, h)).toBe('peek');
    expect(pickDetent(600, -1100, 'menu', list, h)).toBe('normal');
    // Not past the ends.
    expect(pickDetent(126, -3000, 'peek', list, h)).toBe('peek');
    expect(pickDetent(598, 3000, 'menu', list, h)).toBe('menu');
    // A long flick can go two places.
    expect(pickDetent(200, 3000, 'peek', list, h)).toBe('menu');
    // At 1000 exactly it is not a flick.
    expect(pickDetent(240, 1000, 'normal', list, h)).toBe('normal');
  });

  test('the empty sheet has two places', () => {
    const empty = detentList(false);
    expect(pickDetent(300, 0, 'empty', empty, h)).toBe('empty');
    expect(pickDetent(230, 1200, 'empty', empty, h)).toBe('emptyMenu');
  });
});

describe('rubber band', () => {
  test('never more than 60 px', () => {
    expect(rubber(0)).toBe(0);
    expect(rubber(120)).toBeCloseTo(60 * (1 - Math.exp(-1)));
    expect(rubber(10000)).toBeLessThanOrEqual(60);
    expect(rubber(10000)).toBeGreaterThan(59.9);
  });

  test('only past the ends', () => {
    expect(dragVisible(300, 126, 598)).toBe(300);
    expect(dragVisible(700, 126, 598)).toBeCloseTo(598 + rubber(102));
    expect(dragVisible(26, 126, 598)).toBeCloseTo(126 - rubber(100));
  });
});

test('progress is clamped to 0..1', () => {
  expect(progress(258, 258, 598)).toBe(0);
  expect(progress(428, 258, 598)).toBe(0.5);
  expect(progress(126, 258, 598)).toBe(0);
  expect(progress(640, 258, 598)).toBe(1);
  expect(progress(5, 5, 5)).toBe(1);
});

test('grabber tap and the other list', () => {
  expect(tapTarget('peek', 'normal')).toBe('normal');
  expect(tapTarget('normal', 'normal')).toBe('menu');
  expect(tapTarget('menu', 'peek')).toBe('peek');
  expect(tapTarget('empty', 'empty')).toBe('emptyMenu');
  expect(tapTarget('emptyMenu', 'empty')).toBe('empty');
  expect(sameDetent('menu', false, 'empty')).toBe('emptyMenu');
  expect(sameDetent('normal', false, 'empty')).toBe('empty');
  expect(sameDetent('emptyMenu', true, 'peek')).toBe('menu');
  expect(sameDetent('empty', true, 'peek')).toBe('peek');
});

test('on a small phone (folded at rest) the grabber tap goes straight to the menu', () => {
  expect(tapTarget('peek', 'peek')).toBe('menu');
  expect(tapTarget('menu', 'peek')).toBe('peek');
  // Dragged up to the days by hand: one more tap opens the menu.
  expect(tapTarget('normal', 'peek')).toBe('menu');
});
