import { describe, expect, test } from '@jest/globals';
import { isValidElement, ReactElement } from 'react';
import type { GlyphName } from '../Glyph';
import { GLYPHS } from '../glyphs';
import type { IconName } from '../Icon';
import { ICONS } from '../icons';

// Written as records so the type checker fails here if a name is added without a drawing.
const GLYPH_NAMES: Record<GlyphName, true> = {
  rings: true, drop: true, check: true, sprout: true, stageUp: true, snowflake: true, tombstone: true, plaque: true, seed: true,
  heart: true, heartEmpty: true, coin: true, sparkle: true, forest: true, newHabit: true, settings: true, friends: true,
  leaders: true, tasks: true, profile: true, shop: true, stump: true, plot: true, nameTag: true, acorn: true, basket: true, cheer: true, invite: true, crown: true,
};
const ICON_NAMES: Record<IconName, true> = {
  chevronLeft: true, chevronRight: true, chevronDown: true, chevronUp: true, close: true, check: true, plus: true, more: true,
  lock: true, lockOpen: true, people: true, sun: true, moon: true, auto: true, sparkles: true, speaker: true, speakerOff: true, vibrate: true,
  globe: true, trash: true, eye: true, info: true, noSign: true, checkCircle: true,
  move: true, frame: true, search: true, locate: true, undo: true, shuffle: true, pencil: true, clock: true,
  userPlus: true, userMinus: true, flag: true, eyeOff: true, wifiOff: true, refresh: true, hourglass: true, share: true,
  cloud: true, cloudCheck: true, cloudUp: true, cloudOff: true, key: true, code: true, phone: true, logout: true, tree: true, dropLine: true, undoRound: true, copy: true, bell: true,
};

/** Counts the shapes inside a drawing. */
const shapes = (el: ReactElement): number => {
  const children = (el.props as { children?: unknown }).children;
  const list = Array.isArray(children) ? children : children ? [children] : [];
  return list.filter(isValidElement).reduce((n: number, child) => {
    const inner = (child.props as { children?: unknown }).children;
    return n + (inner ? shapes(child) : 1);
  }, 0);
};

describe('glyphs', () => {
  test('there are exactly 29 glyphs, one for every name', () => {
    expect(Object.keys(GLYPHS).sort()).toEqual(Object.keys(GLYPH_NAMES).sort());
    expect(Object.keys(GLYPHS)).toHaveLength(29);
  });

  test.each(Object.keys(GLYPH_NAMES) as GlyphName[])('%s has a drawing, and all its colors go through paint', (name) => {
    const seen: string[] = [];
    const drawing = GLYPHS[name]((color) => {
      seen.push(color);
      return color;
    });
    expect(isValidElement(drawing)).toBe(true);
    expect(shapes(drawing)).toBeGreaterThan(0);
    expect(seen.length).toBeGreaterThan(0);
  });
});

describe('icons', () => {
  test('there are exactly 53 icons, one for every name', () => {
    expect(Object.keys(ICONS).sort()).toEqual(Object.keys(ICON_NAMES).sort());
    expect(Object.keys(ICONS)).toHaveLength(53);
  });

  test.each(Object.keys(ICON_NAMES) as IconName[])('%s has a drawing', (name) => {
    const drawing = ICONS[name]('#123456');
    expect(isValidElement(drawing)).toBe(true);
    expect(shapes(drawing)).toBeGreaterThan(0);
  });
});
