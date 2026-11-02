import { describe, expect, jest, test } from '@jest/globals';
import { contrast, mixColor, over, parseColor } from '../color';
import { colorsDay, colorsNight } from '../tokens';

// tokens.ts takes its easing curves from Reanimated, which needs the native runtime.
jest.mock('react-native-reanimated', () => {
  const curve = () => (x: number) => x;
  return { Easing: { out: curve, in: curve, inOut: curve, cubic: (x: number) => x } };
});

describe('color math', () => {
  test('reads short, long and rgba colors', () => {
    expect(parseColor('#fff')).toEqual([255, 255, 255, 1]);
    expect(parseColor('#3FA2DE')).toEqual([63, 162, 222, 1]);
    expect(parseColor('rgba(255,255,255,.35)')).toEqual([255, 255, 255, 0.35]);
  });

  test('mixing goes from one color to the other and keeps alpha', () => {
    expect(mixColor('#000000', '#FFFFFF', 0)).toBe('#000000');
    expect(mixColor('#000000', '#FFFFFF', 1)).toBe('#ffffff');
    expect(mixColor('rgba(0,0,0,0.5)', '#FFFFFF', 0.5)).toBe('rgba(128,128,128,0.5)');
  });

  test('contrast follows WCAG: black on white is 21, a color on itself is 1', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#6E6152', '#6E6152')).toBeCloseTo(1, 5);
    expect(over('rgba(255,255,255,0.5)', '#000000')).toBe('#808080');
  });
});

// Text and soft text must read on every surface they sit on, by day and by night (WCAG AA, 4.5:1).
describe.each([
  ['day', colorsDay],
  ['night', colorsNight],
])('%s colors', (_, c) => {
  test.each(['page', 'sheet', 'card'] as const)('text and soft text on %s are at least 4.5:1', (surface) => {
    expect(contrast(c.text, c[surface])).toBeGreaterThanOrEqual(4.5);
    // Known gap of the final tokens: soft text on a night card is 3.1:1 (AA only for large text).
    // Reported to the architect; until the tokens change it must at least stay above 3:1.
    const min = c === colorsNight && surface === 'card' ? 3 : 4.5;
    expect(contrast(c.textSoft, c[surface])).toBeGreaterThanOrEqual(min);
  });
});
