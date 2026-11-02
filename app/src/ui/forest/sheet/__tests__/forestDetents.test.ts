import { describe, expect, test } from '@jest/globals';
import {
  baseDetent,
  CARD_EXPECTED,
  dragPath,
  expectedCard,
  ForestDetent,
  forestHeights,
  ForestSizes,
  listProgress,
  pickForestDetent,
  tapTarget,
} from '../forestDetents';

// Spec 6: iPhone 375×812 (insets 47 / 34) and a small 320×568 phone (insets 20 / 0).
const big: ForestSizes = { card: expectedCard(375, false), bottomInset: 34, topInset: 47, screenH: 812 };
const small: ForestSizes = { card: expectedCard(320, true), bottomInset: 0, topInset: 20, screenH: 568 };
const top = (s: ForestSizes, d: ForestDetent) => s.screenH - forestHeights(s)[d];

describe('heights (table 6)', () => {
  test('375×812', () => {
    expect(forestHeights(big)).toEqual({ hidden: 0, peek: 114, card: 228, list: 701, empty: 222 });
    // The list's top sits at insets.top + 64.
    expect(top(big, 'list')).toBe(47 + 64);
    expect(top(big, 'peek')).toBe(698);
    expect(top(big, 'card')).toBe(584);
  });

  test('320×568: the card has two rows of buttons and a wrapped status', () => {
    expect(forestHeights(small)).toEqual({ hidden: 0, peek: 80, card: 280, list: 484, empty: 188 });
    expect(top(small, 'list')).toBe(84);
  });

  test('expected card heights', () => {
    expect(expectedCard(375, false)).toBe(CARD_EXPECTED.oneRow);
    expect(expectedCard(375, true)).toBe(254);
    expect(expectedCard(320, false)).toBe(280);
    expect(expectedCard(430, false)).toBe(194);
  });

  test('a measured card moves the card place; nothing goes above the list', () => {
    expect(forestHeights({ ...big, card: 260 }).card).toBe(294);
    expect(forestHeights({ ...small, card: 900 }).card).toBe(484);
  });
});

describe('paths (spec 6)', () => {
  test('folded ↔ list, card ↔ list, card → folded', () => {
    expect(dragPath('peek', 'peek')).toEqual(['peek', 'list']);
    expect(dragPath('card', 'card')).toEqual(['peek', 'card', 'list']);
    expect(dragPath('list', 'card')).toEqual(['card', 'list']);
    expect(dragPath('list', 'peek')).toEqual(['peek', 'list']);
  });

  test('empty and hidden do not move', () => {
    expect(dragPath('empty', 'empty')).toEqual(['empty']);
    expect(dragPath('hidden', 'hidden')).toEqual(['hidden']);
  });

  test('grabber tap: up to the list, from the list back to where it was', () => {
    expect(tapTarget('peek', 'peek')).toBe('list');
    expect(tapTarget('card', 'card')).toBe('list');
    expect(tapTarget('list', 'card')).toBe('card');
    expect(tapTarget('list', 'peek')).toBe('peek');
    expect(tapTarget('empty', 'empty')).toBe('empty');
  });

  test('the base place', () => {
    expect(baseDetent({ empty: false, moving: false, selected: false })).toBe('peek');
    expect(baseDetent({ empty: false, moving: false, selected: true })).toBe('card');
    expect(baseDetent({ empty: true, moving: false, selected: false })).toBe('empty');
    expect(baseDetent({ empty: false, moving: true, selected: true })).toBe('hidden');
  });
});

describe('release', () => {
  const h = forestHeights(big);

  test('slow release: the nearest place on the path', () => {
    expect(pickForestDetent(300, 0, 'peek', dragPath('peek', 'peek'), h)).toBe('peek');
    expect(pickForestDetent(500, 0, 'peek', dragPath('peek', 'peek'), h)).toBe('list');
    expect(pickForestDetent(150, 0, 'card', dragPath('card', 'card'), h)).toBe('peek');
    expect(pickForestDetent(240, 0, 'card', dragPath('card', 'card'), h)).toBe('card');
  });

  test('a flick moves one place on', () => {
    expect(pickForestDetent(240, 1500, 'card', dragPath('card', 'card'), h)).toBe('list');
    expect(pickForestDetent(220, -1500, 'card', dragPath('card', 'card'), h)).toBe('peek');
    expect(pickForestDetent(650, -1500, 'list', dragPath('list', 'card'), h)).toBe('card');
  });

  test('scrim progress: 0 at the base, 1 at the list', () => {
    expect(listProgress(h.peek, h.peek, h.list)).toBe(0);
    expect(listProgress(h.list, h.peek, h.list)).toBe(1);
    expect(listProgress((h.peek + h.list) / 2, h.peek, h.list)).toBeCloseTo(0.5);
    expect(listProgress(0, h.peek, h.list)).toBe(0);
  });
});
