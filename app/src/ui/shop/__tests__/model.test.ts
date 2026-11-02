import { describe, expect, test } from '@jest/globals';
import { newShop, Shop, Wallet } from '@/game/economy';
import { cardState, countDown, formatAcorns, parseItem, parseSkin, SHOP_MEADOWS, SHOP_TREES, SHOW_STAGES, stageFromDay, stageFromSo, treeBox } from '../model';

const wallet = (acorns: number): Wallet => ({ acorns, earned: 0 });

describe('shop order (6.2)', () => {
  test('paid trees first, then the free ones; cards never move', () => {
    expect(SHOP_TREES).toEqual(['tree:birch', 'tree:maple', 'tree:apple', 'tree:palm', 'tree:oak', 'tree:sakura', 'tree:spruce']);
  });
  test('meadows in the catalog order', () => {
    expect(SHOP_MEADOWS).toEqual(['meadow:summer', 'meadow:autumn', 'meadow:winter', 'meadow:bloom']);
  });
});

describe('card labels', () => {
  const shop: Shop = { ...newShop(), owned: ['tree:birch', 'meadow:winter'] };
  test('free and bought trees are owned', () => {
    expect(cardState(shop, wallet(0), 'tree:oak')).toBe('owned');
    expect(cardState(shop, wallet(0), 'tree:birch')).toBe('owned');
  });
  test('enough or not enough', () => {
    expect(cardState(shop, wallet(400), 'tree:maple')).toBe('afford');
    expect(cardState(shop, wallet(399), 'tree:maple')).toBe('poor');
  });
  test('the meadow on is "selected", another owned one is "owned"', () => {
    expect(cardState(shop, wallet(0), 'meadow:summer')).toBe('selected');
    expect(cardState(shop, wallet(0), 'meadow:winter')).toBe('owned');
    expect(cardState({ ...shop, meadow: 'winter' }, wallet(0), 'meadow:winter')).toBe('selected');
    expect(cardState({ ...shop, meadow: 'winter' }, wallet(0), 'meadow:summer')).toBe('owned');
  });
});

describe('links', () => {
  test('?item= takes only real items', () => {
    expect(parseItem('tree:maple')).toBe('tree:maple');
    expect(parseItem(['meadow:bloom'])).toBe('meadow:bloom');
    expect(parseItem('tree:baobab')).toBeNull();
    expect(parseItem(undefined)).toBeNull();
  });
  test('?skin= takes only kinds the player has', () => {
    expect(parseSkin('birch', ['oak', 'birch'])).toBe('birch');
    expect(parseSkin('palm', ['oak', 'birch'])).toBeNull();
  });
});

describe('stages', () => {
  test('the growth show goes from the sprout to "tree"', () => {
    expect(SHOW_STAGES).toEqual(['sprout', 'seedling', 'bush', 'young', 'tree']);
  });
  test('captions count from day 1; Russian says «со» before 100', () => {
    expect(['sprout', 'seedling', 'bush', 'young', 'tree', 'grand'].map((s) => stageFromDay(s as never))).toEqual([1, 3, 7, 21, 50, 100]);
    expect(stageFromSo(100)).toBe(true);
    expect(stageFromSo(50)).toBe(false);
  });
});

describe('numbers (1.3)', () => {
  test('groups of three', () => {
    expect(formatAcorns(50, 'en')).toBe('50');
    expect(formatAcorns(1240, 'en')).toBe('1,240');
    expect(formatAcorns(1240, 'ru')).toBe('1 240');
    expect(formatAcorns(1234567, 'en')).toBe('1,234,567');
    expect(formatAcorns(-3, 'en')).toBe('0');
  });
  test('the wallet counts down smoothly and lands exactly', () => {
    expect(countDown(320, 70, 0, 600)).toBe(320);
    expect(countDown(320, 70, 600, 600)).toBe(70);
    const mid = countDown(320, 70, 300, 600);
    expect(mid).toBeLessThan(320 - 125);
    expect(mid).toBeGreaterThan(70);
  });
});

describe('tree placement', () => {
  test('feet on the line, the tree as tall as asked', () => {
    const box = treeBox({ boxW: 150, boxH: 132, feet: 111, share: 0.82, treeShare: 0.6, treeWidthShare: 0.5 });
    const pictureH = (box.size * 320) / 300;
    expect(box.top + (pictureH * 312) / 320).toBeCloseTo(111);
    expect(pictureH * 0.6).toBeCloseTo(132 * 0.82);
    expect(box.left).toBeCloseTo((150 - box.size) / 2);
  });
  test('a wide crown is held inside the box', () => {
    const box = treeBox({ boxW: 100, boxH: 200, feet: 180, share: 0.9, treeShare: 0.8, treeWidthShare: 0.97 });
    expect(box.size * 0.97).toBeLessThanOrEqual(96.01);
  });
});
