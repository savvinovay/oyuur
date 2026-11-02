import { describe, expect, test } from '@jest/globals';
import { AchievementView } from '@/game/achievements';
import { groupHabits, plantTree, Tree } from '@/game/tree';
import { makeT } from '@/i18n';
import { awardLeftText, awardOrder, firstPlanted, formatCount, formatDay, friendsSeeText, progressOf, showsProgress } from '../model';

const view = (id: AchievementView['id'], state: AchievementView['state'], value: number, goal: number, claimedOn: string | null = null): AchievementView =>
  ({ id, state, value, goal, reward: 20, claimedOn });

const tree = (id: string, plantedOn: string, visibility: Tree['visibility']): Tree =>
  plantTree({ id, name: id, kind: 'quit', visibility, skin: 'oak', today: plantedOn });

describe('the medals’ order (11.2)', () => {
  test('ready → claimed by day → by share → not started', () => {
    const order = awardOrder([
      view('firstWater', 'claimed', 1, 1, '2026-10-20'),
      view('days7', 'claimed', 7, 7, '2026-10-12'),
      view('days30', 'ready', 30, 30),
      view('days100', 'locked', 48, 100),
      view('days365', 'locked', 48, 365),
      view('firstLockIn', 'locked', 0, 1),
      view('noMiss30', 'locked', 21, 30),
      view('seedTree', 'locked', 0, 1),
    ]).map((v) => v.id);
    expect(order).toEqual(['days30', 'days7', 'firstWater', 'noMiss30', 'days100', 'days365', 'firstLockIn', 'seedTree']);
  });

  test('progress shows only for started goals above one', () => {
    expect(showsProgress(view('days100', 'locked', 48, 100))).toBe(true);
    expect(showsProgress(view('days100', 'locked', 0, 100))).toBe(false);
    expect(showsProgress(view('firstWater', 'locked', 0, 1))).toBe(false);
    expect(showsProgress(view('days7', 'claimed', 7, 7))).toBe(false);
    expect(progressOf(view('days100', 'locked', 48, 100))).toBeCloseTo(0.48);
  });
});

describe('words', () => {
  const ru = makeT('ru');
  const en = makeT('en');

  test('how much is left', () => {
    expect(awardLeftText(ru, view('days100', 'locked', 48, 100))).toBe('Ещё 52 дня — и она твоя');
    expect(awardLeftText(ru, view('trees10', 'locked', 5, 10))).toBe('Ещё 5 привычек — и она твоя');
    expect(awardLeftText(en, view('days7', 'locked', 6, 7))).toBe('1 more day to go');
  });

  test('big numbers and dates', () => {
    expect(formatCount(1240, 'ru')).toBe('1 240');
    expect(formatCount(1240, 'en')).toBe('1,240');
    expect(formatCount(312, 'en')).toBe('312');
    expect(formatDay(ru, '2026-10-12', '2026-10-28')).toBe('12 октября');
    expect(formatDay(en, '2026-10-12', '2026-10-28')).toBe('Oct 12');
    expect(formatDay(en, '2025-03-01', '2026-10-28')).toBe('Mar 1, 2025');
  });

  test('friends see N of M (by habit, the current tree)', () => {
    const habits = groupHabits([tree('a', '2026-10-01', 'friends'), tree('b', '2026-10-03', 'private'), tree('c', '2026-09-30', 'friends')]);
    expect(friendsSeeText(ru, habits)).toBe('Друзья видят 2 из 3 деревьев');
    expect(friendsSeeText(ru, habits.slice(0, 1))).toBe('Друзья видят 1 из 1 дерева');
    expect(friendsSeeText(en, habits, { b: 'friends' })).toBe('Friends see 3 of 3 trees');
    expect(firstPlanted(habits.map((h) => h.current))).toBe('2026-09-30');
    expect(firstPlanted([])).toBeNull();
  });
});
