import { describe, expect, test } from '@jest/globals';
import { newQuests, Quests } from '@/game/quests';
import { plantTree, setOpenHour, Tree } from '@/game/tree';
import { basketOf, menuQuests, questRows, untilNewDay, waitFrom, waterTarget } from '../model';

const today = '2026-10-28';
const quests = (patch: Partial<Quests>): Quests => ({ ...newQuests(), day: today, ids: ['waterAll', 'visitForest', 'nameTree'], ...patch });
const tree = (id: string, watered: boolean): Tree => {
  const t = plantTree({ id, name: id, kind: 'do', visibility: 'private', skin: 'oak', today: '2026-10-20' });
  return watered ? { ...t, checkins: [today] } : t;
};

describe('the rows (spec 5.4)', () => {
  test('open, done and claimed; "water all" counts the trees watered today', () => {
    const rows = questRows(quests({ done: ['visitForest', 'nameTree'], claimed: ['nameTree'] }), today, [tree('a', true), tree('b', false), tree('c', false)]);
    expect(rows).toEqual([
      { id: 'waterAll', state: 'open', progress: { n: 1, total: 3 } },
      { id: 'visitForest', state: 'done', progress: null },
      { id: 'nameTree', state: 'claimed', progress: null },
    ]);
  });

  test('a finished "water all" shows its bar full', () => {
    const rows = questRows(quests({ done: ['waterAll'] }), today, [tree('a', true)]);
    expect(rows[0]).toEqual({ id: 'waterAll', state: 'done', progress: { n: 1, total: 1 } });
  });

  test('yesterday\'s quests are not today\'s: nothing to show', () => {
    expect(questRows(quests({ day: '2026-10-27' }), today, [])).toEqual([]);
  });
});

describe('the basket (spec 5.5)', () => {
  test('waits with a dot per quest, is ready when all are done, claimed with the bonus', () => {
    expect(basketOf(quests({ done: ['visitForest'] }), today)).toEqual({ state: 'waiting', dots: [false, true, false] });
    expect(basketOf(quests({ done: ['waterAll', 'visitForest', 'nameTree'] }), today).state).toBe('ready');
    expect(basketOf(quests({ done: ['waterAll', 'visitForest', 'nameTree'], claimed: ['waterAll', 'visitForest', 'nameTree'], bonus: true }), today).state).toBe('claimed');
  });
});

describe('the menu tile (spec 4.2, 4.3)', () => {
  test('number: done and not claimed', () => {
    expect(menuQuests(quests({ done: ['visitForest', 'nameTree'], claimed: ['nameTree'] }), today)).toEqual({ count: 1, caption: { kind: 'of', n: 2, total: 3 } });
  });

  test('captions: "n of 3", "claim reward", "all done", nothing without quests', () => {
    expect(menuQuests(quests({}), today).caption).toEqual({ kind: 'of', n: 0, total: 3 });
    expect(menuQuests(quests({ done: ['waterAll', 'visitForest', 'nameTree'], claimed: ['waterAll'] }), today)).toEqual({ count: 2, caption: { kind: 'claim' } });
    const all = quests({ done: ['waterAll', 'visitForest', 'nameTree'], claimed: ['waterAll', 'visitForest', 'nameTree'], bonus: true });
    expect(menuQuests(all, today)).toEqual({ count: 0, caption: { kind: 'done' } });
    expect(menuQuests(quests({ ids: [] }), today)).toEqual({ count: 0, caption: null });
    expect(menuQuests(quests({ day: '2026-10-27', done: ['waterAll'] }), today)).toEqual({ count: 0, caption: null });
  });
});

describe('time to new quests (spec 5.9; the game day ends at 3:00, OYUUR-33 3)', () => {
  test('counts to 3:00 at night, rounded up to a minute', () => {
    expect(untilNewDay(new Date(2026, 9, 28, 18, 48, 0))).toEqual({ h: 8, m: 12 });
    expect(untilNewDay(new Date(2026, 9, 28, 23, 18, 0))).toEqual({ h: 3, m: 42 });
    expect(untilNewDay(new Date(2026, 9, 29, 2, 59, 30))).toEqual({ h: 0, m: 0 });
    expect(untilNewDay(new Date(2026, 9, 29, 2, 58, 30))).toEqual({ h: 0, m: 2 });
    expect(untilNewDay(new Date(2026, 9, 29, 1, 30, 0))).toEqual({ h: 1, m: 30 });
    expect(untilNewDay(new Date(2026, 9, 28, 3, 0, 0))).toEqual({ h: 24, m: 0 });
  });
});

describe('waiting trees (OYUUR-33 9)', () => {
  const at = (hour: number, minute = 0) => ({ hour, minute });
  const quit = (id: string, openHour?: number) => plantTree({ id, name: id, kind: 'quit', visibility: 'private', today: '2026-10-20', openHour });

  test('"from 18:00" while every tree left waits: the soonest hour', () => {
    expect(waitFrom([quit('a', 21), quit('b')], today, at(9))).toBe(18);
    // One can be watered now: no caption.
    expect(waitFrom([quit('a', 21), quit('b', 0)], today, at(9))).toBeNull();
    expect(waitFrom([quit('a', 21), quit('b')], today, at(18))).toBeNull();
    // Nothing left to water.
    expect(waitFrom([], today, at(9))).toBeNull();
    // Today's hour, not tomorrow's change.
    expect(waitFrom([setOpenHour(quit('a'), 6, today)], today, at(9))).toBe(18);
  });

  test('"go": a tree that can be watered now, else the one that opens soonest', () => {
    expect(waterTarget([{ index: 2, minutes: 300 }, { index: 4, minutes: 0 }, { index: 5, minutes: 0 }])).toEqual({ index: 4, waits: false });
    expect(waterTarget([{ index: 2, minutes: 300 }, { index: 4, minutes: 120 }, { index: 5, minutes: 120 }])).toEqual({ index: 4, waits: true });
    expect(waterTarget([])).toBeNull();
  });
});
