import { describe, expect, it } from '@jest/globals';
import { checkIn, complete, plantTree, settle, Tree } from '@/game/tree';
import { stageUp, treeMood } from '../mood';

const plant = (today = '2026-03-10'): Tree => plantTree({ id: 'a', name: 'No sugar', kind: 'quit', visibility: 'private', today });

describe('treeMood', () => {
  it('a fresh tree waits for water', () => {
    expect(treeMood(plant(), '2026-03-10')).toBe('thirsty');
  });

  it('watered today stays watered until midnight, then is thirsty again', () => {
    const watered = checkIn(plant(), '2026-03-10').tree;
    expect(treeMood(watered, '2026-03-10')).toBe('watered');
    expect(treeMood(settle(watered, '2026-03-11'), '2026-03-11')).toBe('thirsty');
  });

  it('a dead tree is dead', () => {
    // Three chances and a fourth missed day kill it.
    const dead = settle(plant(), '2026-03-16');
    expect(dead.diedOn).not.toBeNull();
    expect(treeMood(dead, '2026-03-16')).toBe('dead');
  });

  it('a locked-in tree rests: it can’t be watered', () => {
    expect(treeMood(complete(plant(), '2026-03-10'), '2026-03-10')).toBe('resting');
  });

  it('a day that is already judged rests (the clock went back)', () => {
    const later = settle(plant(), '2026-03-12');
    expect(later.frozen).toContain('2026-03-11');
    expect(treeMood(later, '2026-03-11')).toBe('resting');
    expect(treeMood(later, '2026-03-10')).toBe('resting');
    expect(checkIn(later, '2026-03-10').result).toBe('closed');
  });

  it('a day before planting rests', () => {
    expect(treeMood(plant('2026-03-10'), '2026-03-09')).toBe('resting');
  });
});

describe('stageUp', () => {
  it('names the stage reached on its first day', () => {
    expect(stageUp(2, 3)).toBe('seedling');
    expect(stageUp(6, 7)).toBe('bush');
    expect(stageUp(20, 21)).toBe('young');
    expect(stageUp(49, 50)).toBe('tree');
    expect(stageUp(99, 100)).toBe('grand');
  });

  it('is null inside a stage and past the last one', () => {
    expect(stageUp(0, 1)).toBeNull();
    expect(stageUp(11, 12)).toBeNull();
    expect(stageUp(100, 101)).toBeNull();
    expect(stageUp(400, 401)).toBeNull();
  });
});
