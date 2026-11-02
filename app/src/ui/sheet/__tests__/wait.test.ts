import { describe, expect, it } from '@jest/globals';
import { checkIn, complete, plantTree, setOpenHour, Tree } from '@/game/tree';
import { changeNote, clockText, earlyStreak, eveningTrees, isWaiting, sheetHours, treeWaits, waitLine } from '../wait';

const DAY = '2026-03-10';
const NEXT = '2026-03-11';
const at = (hour: number, minute = 0) => ({ hour, minute });
/** A "Quit" tree planted the day before: from 18:00 today. */
const quit = (o: { id?: string; openHour?: number; today?: string } = {}): Tree =>
  plantTree({ id: o.id ?? 'q', name: 'No smoking', kind: 'quit', visibility: 'private', today: o.today ?? '2026-03-09', openHour: o.openHour });
const anyTime = (id = 'a'): Tree => plantTree({ id, name: 'Run', kind: 'do', visibility: 'private', today: '2026-03-09' });

describe('waitLine', () => {
  it('before the hour: "from 18:00"', () => {
    expect(waitLine(quit(), DAY, at(9), true)).toEqual({ kind: 'from', hour: 18, tomorrow: null });
    expect(waitLine(quit(), DAY, at(16, 59), true)).toEqual({ kind: 'from', hour: 18, tomorrow: null });
  });

  it('under an hour to go: the minutes count down', () => {
    // An hour exactly is still "from 18:00".
    expect(waitLine(quit(), DAY, at(17), true)).toEqual({ kind: 'from', hour: 18, tomorrow: null });
    expect(waitLine(quit(), DAY, at(17, 1), true)).toEqual({ kind: 'in', minutes: 59 });
    expect(waitLine(quit(), DAY, at(17, 18), true)).toEqual({ kind: 'in', minutes: 42 });
    expect(waitLine(quit(), DAY, at(17, 59), true)).toEqual({ kind: 'in', minutes: 1 });
  });

  it('from the hour on: the usual lines', () => {
    expect(waitLine(quit(), DAY, at(18), true)).toBeNull();
    expect(waitLine(quit(), DAY, at(23, 59), true)).toBeNull();
  });

  it('past midnight, still open: "until 3:00 at night"', () => {
    expect(waitLine(quit(), DAY, at(24, 30), true)).toEqual({ kind: 'late' });
    expect(waitLine(anyTime(), DAY, at(26, 59), true)).toEqual({ kind: 'late' });
  });

  it('watered, dead, locked in or a judged day (not thirsty): nothing about the time', () => {
    expect(waitLine(quit(), DAY, at(9), false)).toBeNull();
    expect(waitLine(quit(), DAY, at(25), false)).toBeNull();
  });

  it('any time: never waits', () => {
    expect(waitLine(anyTime(), DAY, at(3), true)).toBeNull();
    expect(waitLine(anyTime(), DAY, at(12), true)).toBeNull();
  });

  it('the planting day is open at once', () => {
    expect(waitLine(quit({ today: DAY }), DAY, at(9), true)).toBeNull();
  });

  it('a change for tomorrow: "today from 18:00, tomorrow from 12:00" (frame 05)', () => {
    const changed = setOpenHour(quit(), 12, DAY);
    expect(waitLine(changed, DAY, at(9), true)).toEqual({ kind: 'from', hour: 18, tomorrow: 12 });
    // Tomorrow it is just the new hour.
    expect(waitLine(changed, NEXT, at(9), true)).toEqual({ kind: 'from', hour: 12, tomorrow: null });
    // To "any time": tomorrow it never waits.
    const open = setOpenHour(quit(), 0, DAY);
    expect(waitLine(open, DAY, at(9), true)).toEqual({ kind: 'from', hour: 18, tomorrow: 0 });
    expect(waitLine(open, NEXT, at(9), true)).toBeNull();
  });
});

describe('isWaiting / treeWaits', () => {
  it('waits only when thirsty and before its hour', () => {
    expect(isWaiting(quit(), DAY, at(9), true)).toBe(true);
    expect(isWaiting(quit(), DAY, at(9), false)).toBe(false);
    expect(isWaiting(quit(), DAY, at(18), true)).toBe(false);
  });

  it('a tree of mine: by its mood', () => {
    expect(treeWaits(quit(), DAY, at(9))).toBe(true);
    expect(treeWaits(quit(), DAY, at(19))).toBe(false);
    expect(treeWaits(anyTime(), DAY, at(9))).toBe(false);
    // Watered on the planting day, then the next morning it waits again.
    const planted = quit({ today: DAY });
    const watered = checkIn(planted, DAY, at(9)).tree;
    expect(treeWaits(watered, DAY, at(10))).toBe(false);
    expect(treeWaits(watered, NEXT, at(10))).toBe(true);
    // Locked in: nothing to wait for.
    expect(treeWaits(complete(quit(), DAY), DAY, at(9))).toBe(false);
  });
});

describe('earlyStreak', () => {
  it('the third tap within 10 s pulses, then it starts over', () => {
    let s = earlyStreak([], 1000);
    expect(s.third).toBe(false);
    s = earlyStreak(s.taps, 4000);
    expect(s.third).toBe(false);
    s = earlyStreak(s.taps, 9000);
    expect(s.third).toBe(true);
    expect(s.taps).toEqual([]);
    // The fourth is the first of a new streak.
    s = earlyStreak(s.taps, 9500);
    expect(s).toEqual({ taps: [9500], third: false });
  });

  it('taps older than 10 s drop out', () => {
    let s = earlyStreak([], 0);
    s = earlyStreak(s.taps, 5000);
    s = earlyStreak(s.taps, 10_500);
    expect(s.third).toBe(false);
    expect(s.taps).toEqual([5000, 10_500]);
    expect(earlyStreak(s.taps, 12_000).third).toBe(true);
  });

  it('a clock that went back does not count old taps from the "future"', () => {
    expect(earlyStreak([50_000, 51_000], 1000)).toEqual({ taps: [1000], third: false });
  });
});

describe('eveningTrees', () => {
  const old = (id: string, kind: 'quit' | 'do'): Tree => plantTree({ id, name: id, kind, visibility: 'private', today: '2026-03-01', openHour: 0 });

  it('growing "Quit" trees open all day', () => {
    const trees = [old('a', 'quit'), old('b', 'do'), old('c', 'quit')];
    expect(eveningTrees(trees, DAY).map((x) => x.id)).toEqual(['a', 'c']);
  });

  it('not the ones with an hour, a change waiting, or that are dead or locked in', () => {
    const withHour = quit({ id: 'h' });
    const changing = setOpenHour(old('p', 'quit'), 21, DAY);
    const locked = complete(old('l', 'quit'), DAY);
    expect(eveningTrees([withHour, changing, locked], DAY)).toEqual([]);
  });
});

describe('changing the time (frames 04–05)', () => {
  it('the sheet opens on tomorrow’s hour, with today’s marked', () => {
    expect(sheetHours(quit(), DAY)).toEqual({ hour: 18, todayHour: 18 });
    expect(sheetHours(setOpenHour(quit(), 12, DAY), DAY)).toEqual({ hour: 12, todayHour: 18 });    // The planting day is open at once: today is "any time", the hour set starts tomorrow.
    expect(sheetHours(quit({ today: DAY }), DAY)).toEqual({ hour: 18, todayHour: 0 });
  });

  it('the developer clock reads as the phone shows time', () => {
    expect(clockText({ hour: 9, minute: 5 }, true)).toBe('9:05');
    expect(clockText({ hour: 25, minute: 30 }, true)).toBe('1:30');
    expect(clockText({ hour: 18, minute: 0 }, false)).toBe('6:00 PM');
    expect(clockText({ hour: 24, minute: 10 }, false)).toBe('12:10 AM');
  });

  it('the note after: saved from tomorrow, or kept when back to today’s hour', () => {
    expect(changeNote(setOpenHour(quit(), 12, DAY), DAY)).toEqual({ kind: 'saved', hour: 12 });
    expect(changeNote(setOpenHour(quit(), 0, DAY), DAY)).toEqual({ kind: 'saved', hour: 0 });
    expect(changeNote(setOpenHour(setOpenHour(quit(), 12, DAY), 18, DAY), DAY)).toEqual({ kind: 'kept', hour: 18 });
  });
});
