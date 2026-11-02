import { expect, test } from '@jest/globals';
import { betweenHabits, dragCamera, driveDuration, nearestIndex, rubber, targetIndex } from '../camera';

test('rubber grows with the pull but never past a quarter of a habit', () => {
  expect(rubber(0)).toBe(0);
  expect(rubber(-1)).toBe(0);
  expect(rubber(0.5)).toBeCloseTo(0.125);
  expect(rubber(1)).toBeGreaterThan(rubber(0.5));
  expect(rubber(100)).toBeLessThan(0.25);
  expect(rubber(100)).toBeGreaterThan(0.24);
});

test('the camera follows the finger between the edges and stretches past them', () => {
  expect(dragCamera(1.3, 4)).toBe(1.3);
  expect(dragCamera(-0.5, 4)).toBeCloseTo(-0.125);
  expect(dragCamera(3.5, 4)).toBeCloseTo(3.125);
  // One habit: only the rubber band on both sides.
  expect(dragCamera(0.5, 1)).toBeCloseTo(0.125);
  expect(dragCamera(-3, 1)).toBeLessThan(0);
  expect(dragCamera(-3, 1)).toBeGreaterThan(-0.25);
});

test('letting go settles on the nearest habit', () => {
  expect(targetIndex(1.4, 0, 1, 4)).toBe(1);
  expect(targetIndex(1.6, 0, 1, 4)).toBe(2);
  expect(targetIndex(0.45, 0, 1, 4)).toBe(0);
});

test('a flick carries the camera on, by at most one habit from the start', () => {
  // Finger flicked left (negative speed): the camera moves right.
  expect(targetIndex(1.3, -800, 1, 4)).toBe(2);
  expect(targetIndex(1.3, -10000, 1, 4)).toBe(2);
  // Flicked right: back to the left.
  expect(targetIndex(1.7, 1200, 1, 4)).toBe(1);
  expect(targetIndex(0.6, 5000, 1, 4)).toBe(0);
});

test('the camera never settles past the edges', () => {
  expect(targetIndex(-0.2, 3000, 0, 4)).toBe(0);
  expect(targetIndex(3.2, -3000, 3, 4)).toBe(3);
  expect(targetIndex(0.2, -3000, 0, 1)).toBe(0);
  expect(targetIndex(0, 0, 0, 0)).toBe(0);
});

test('a drive across several habits takes longer, up to 0.9 s', () => {
  expect(driveDuration(1)).toBe(450);
  expect(driveDuration(-2)).toBe(600);
  expect(driveDuration(3)).toBe(750);
  expect(driveDuration(10)).toBe(900);
  expect(driveDuration(0)).toBe(450);
});

test('the share between two habits and the nearest habit', () => {
  expect(betweenHabits(2)).toBe(0);
  expect(betweenHabits(2.3)).toBeCloseTo(0.3);
  expect(betweenHabits(2.7)).toBeCloseTo(-0.3);
  expect(nearestIndex(2.7, 4)).toBe(3);
  expect(nearestIndex(-0.2, 4)).toBe(0);
  expect(nearestIndex(3.2, 4)).toBe(3);
});
