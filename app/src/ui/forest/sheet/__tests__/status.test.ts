import { describe, expect, test } from '@jest/globals';
import { groupHabits, plantTree, Tree } from '@/game/tree';
import { makeT } from '@/i18n';
import { cardMain, matchName, sortSections, statusLine, totalDays } from '../status';

const today = '2026-10-27';
const tree = (id: string, name: string, patch: Partial<Tree> = {}): Tree => ({
  ...plantTree({ id, name, kind: 'do', visibility: 'private', today: '2026-09-01' }),
  ...patch,
});
const days = (n: number, last = '2026-10-26') => {
  const out: string[] = [];
  const end = new Date(`${last}T12:00:00`);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
};

const trees = [
  tree('a', 'Read', { checkins: days(18) }),
  tree('b', 'No smoking', { checkins: days(41) }),
  tree('c', 'Morning run', { checkins: days(64, today) }),
  tree('d', 'No sweets', { checkins: days(120, '2026-10-01'), completedOn: '2026-10-01' }),
  tree('e', 'Meditation', { checkins: days(30, '2026-10-20'), completedOn: today }),
  tree('f', 'No social', { checkins: days(20, '2026-08-01'), diedOn: '2026-08-04' }),
  tree('g', 'No social', { lineageId: 'f', generation: 2, parentId: 'f', checkins: days(34, '2026-09-20'), diedOn: '2026-09-23' }),
];
const habits = groupHabits(trees);
const t = makeT('ru');

describe('list sections (spec 6)', () => {
  test('growing: thirsty first, then by days; locked: newest first; memory', () => {
    const s = sortSections(habits, today);
    expect(s.growing.map((h) => h.lineageId)).toEqual(['b', 'a', 'c']);
    expect(s.locked.map((h) => h.lineageId)).toEqual(['e', 'd']);
    expect(s.memory.map((h) => h.lineageId)).toEqual(['f']);
  });

  test('search: by name, any case', () => {
    expect(matchName(habits, 'NO ').map((h) => h.lineageId)).toEqual(['b', 'd', 'f']);
    expect(matchName(habits, '  ').length).toBe(habits.length);
    expect(matchName(habits, 'zzz')).toEqual([]);
  });

  test('search: by the tree’s own name too, ё = е', () => {
    const named = groupHabits([tree('x', 'Run', { nickname: 'Ёлочка' }), tree('y', 'Read')]);
    expect(matchName(named, 'елоч').map((h) => h.lineageId)).toEqual(['x']);
    expect(matchName(named, 'run').map((h) => h.lineageId)).toEqual(['x']);
  });
});

describe('status line (table 3.2)', () => {
  const byId = (id: string) => habits.find((h) => h.lineageId === id)!;

  test('each state', () => {
    expect(statusLine(byId('a'), today, t)).toMatchObject({ state: 'thirsty', glyph: 'drop', line: 'Ждёт полива · 18 дней' });
    expect(statusLine(byId('c'), today, t)).toMatchObject({ state: 'watered', glyph: 'check', line: 'Сегодня полито · 64 дня' });
    expect(statusLine(byId('d'), today, t)).toMatchObject({ state: 'locked', glyph: 'plaque', line: '120 дней · закреплено' });
    expect(statusLine(byId('e'), today, t).line).toBe('30 дней · закреплено сегодня');
    expect(statusLine(byId('f'), today, t)).toMatchObject({ state: 'dead', glyph: 'tombstone', line: 'Погибло · рекорд 34 дня' });
  });

  test('days of every try add up', () => {
    expect(totalDays(byId('f'))).toBe(54);
  });
});

describe("the card's main button (3.2, after the wave 3 review)", () => {
  test('green only for what is done today: water, plant from the seed', () => {
    expect(cardMain('thirsty', { seedUsed: false, golden: false })).toEqual({ action: 'water', variant: 'primary' });
    expect(cardMain('dead', { seedUsed: false, golden: false })).toEqual({ action: 'plant', variant: 'primary' });
  });

  test('everything else is "View", beige', () => {
    expect(cardMain('watered', { seedUsed: false, golden: false })).toEqual({ action: 'view', variant: 'secondary' });
    expect(cardMain('locked', { seedUsed: false, golden: false })).toEqual({ action: 'view', variant: 'secondary' });
    expect(cardMain('dead', { seedUsed: true, golden: false })).toEqual({ action: 'view', variant: 'secondary' });
  });

  test('gold only for the tree just locked in (5.4)', () => {
    expect(cardMain('locked', { seedUsed: false, golden: true })).toEqual({ action: 'view', variant: 'gold' });
    // The gold is the lock-in's: a growing or dead tree never gets it.
    expect(cardMain('thirsty', { seedUsed: false, golden: true }).variant).toBe('primary');
    expect(cardMain('watered', { seedUsed: false, golden: true }).variant).toBe('secondary');
  });
});

describe('waiting for the watering hour (OYUUR-34, спец 5.3)', () => {
  const evening = (id: string, patch: Partial<Tree> = {}) =>
    groupHabits([tree(id, 'No smoking', { kind: 'quit', checkins: days(24), openHours: [{ from: '2026-09-01', hour: 18 }], ...patch })])[0];

  test('before the hour: "Ждёт вечера · 24 дня" with the clock, a muted "Water"', () => {
    const s = statusLine(evening('w'), today, t, { hour: 9, minute: 0 });
    expect(s).toEqual({ state: 'waiting', glyph: 'clock', line: 'Ждёт вечера · 24 дня' });
    expect(cardMain('waiting', { seedUsed: false, golden: false })).toEqual({ action: 'water', variant: 'waiting' });
  });

  test('from the hour on, and without a clock: thirsty as before', () => {
    expect(statusLine(evening('w'), today, t, { hour: 18, minute: 0 }).state).toBe('thirsty');
    expect(statusLine(evening('w'), today, t).state).toBe('thirsty');
  });

  test('watered today or "any time": never waiting', () => {
    expect(statusLine(evening('w', { checkins: days(24, today) }), today, t, { hour: 9, minute: 0 }).state).toBe('watered');
    expect(statusLine(habits.find((h) => h.lineageId === 'a')!, today, t, { hour: 1, minute: 0 }).state).toBe('thirsty');
  });

  test('the morning and the afternoon have their own words', () => {
    const at = (hour: number) => statusLine(evening('w', { openHours: [{ from: '2026-09-01', hour }] }), today, t, { hour: 5, minute: 0 }).line;
    expect(at(6)).toBe('Ждёт утра · 24 дня');
    expect(at(12)).toBe('Ждёт обеда · 24 дня');
    expect(at(15)).toBe('Ждёт 15:00 · 24 дня');
    expect(at(21)).toBe('Ждёт ночи · 24 дня');
  });

  test('in the list a waiting tree goes after the thirsty ones', () => {
    const list = [...habits, evening('w')];
    const s = sortSections(list, today, { hour: 9, minute: 0 });
    expect(s.growing.map((h) => h.lineageId).indexOf('w')).toBeGreaterThan(s.growing.map((h) => h.lineageId).indexOf('a'));
  });
});
