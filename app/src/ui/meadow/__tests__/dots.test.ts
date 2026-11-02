import { expect, test } from '@jest/globals';
import { dotWindow } from '../dots';

test('a few habits: every dot shown, each 44 px wide to tap', () => {
  const w = dotWindow(3, 1, 160);
  expect([w.start, w.end]).toEqual([0, 3]);
  expect(w.slot).toBe(44);
  for (let i = 0; i < 3; i++) expect(w.size(i)).toBe(1);
});

test('many habits: a window of 7 around the current one, smaller dots at the edges', () => {
  const w = dotWindow(22, 10, 160);
  expect([w.start, w.end]).toEqual([7, 14]);
  expect(w.slot * 7).toBeLessThanOrEqual(160);
  expect(w.slot).toBeGreaterThanOrEqual(20);
  expect(w.size(7)).toBe(0.5);
  expect(w.size(8)).toBe(0.75);
  expect(w.size(10)).toBe(1);
  expect(w.size(13)).toBe(0.5);
});

test('at the ends the window stops, and that edge keeps full dots', () => {
  const first = dotWindow(22, 0, 160);
  expect([first.start, first.end]).toEqual([0, 7]);
  expect(first.size(0)).toBe(1);
  expect(first.size(6)).toBe(0.5);
  const last = dotWindow(22, 21, 160);
  expect([last.start, last.end]).toEqual([15, 22]);
  expect(last.size(21)).toBe(1);
  expect(last.size(15)).toBe(0.5);
});

test('a narrow row shows fewer dots, never thinner than 20 px', () => {
  const w = dotWindow(22, 10, 104);
  expect(w.end - w.start).toBe(5);
  expect(w.slot).toBe(20);
});
