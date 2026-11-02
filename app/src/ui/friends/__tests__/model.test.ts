import { describe, expect, test } from '@jest/globals';
import { addDays } from '@/game/dates';
import { plantTree, Tree } from '@/game/tree';
import { makeT } from '@/i18n';
import type { PublicForest } from '@/net/api';
import {
  agoText, cheersToday, displayName, freshness, heroTrees, nameInCase, previousTry, requestsRow, requestsSummary, sortFriends, statsOf, todayState, treeRows, waitingNow,
} from '../model';

const TODAY = '2026-10-28';
const ru = makeT('ru');
const en = makeT('en');

/** A tree planted `ago` days before today and watered on the given days back (0 — today). */
function tree(id: string, ago: number, watered: number[], patch: Partial<Tree> = {}): Tree {
  const base = plantTree({ id, name: id, kind: 'do', visibility: 'friends', skin: 'oak', today: addDays(TODAY, -ago) });
  return { ...base, checkins: watered.map((d) => addDays(TODAY, -d)).sort(), ...patch };
}

const noon = (day: string) => new Date(`${day}T12:00:00`).getTime();

describe('did the friend water today (4.2, 6.8)', () => {
  test('all, some, none — when their phone sent data today', () => {
    const at = noon(TODAY);
    expect(todayState([tree('a', 5, [0]), tree('b', 5, [0, 1])], at, TODAY)).toEqual({ kind: 'all' });
    expect(todayState([tree('a', 5, [0]), tree('b', 5, [1])], at, TODAY)).toEqual({ kind: 'some', watered: 1, total: 2 });
    expect(todayState([tree('a', 5, [1]), tree('b', 5, [1])], at, TODAY)).toEqual({ kind: 'none' });
  });

  test('in the morning their evening trees wait: "from 18:00", not "hasn’t watered" (OYUUR-34)', () => {
    const at = noon(TODAY);
    const evening = (id: string, hour: number) => tree(id, 5, [1], { openHours: [{ from: addDays(TODAY, -5), hour }] });
    expect(todayState([evening('a', 18), evening('b', 21)], at, TODAY, { hour: 10, minute: 0 })).toEqual({ kind: 'waiting', hour: 18 });
    expect(todayState([evening('a', 18), tree('b', 5, [1])], at, TODAY, { hour: 10, minute: 0 })).toEqual({ kind: 'none' });
    expect(todayState([evening('a', 18)], at, TODAY, { hour: 19, minute: 0 })).toEqual({ kind: 'none' });
  });

  test('nothing sent today: "no data", not "hasn’t watered"', () => {
    expect(todayState([tree('a', 5, [1])], noon(addDays(TODAY, -1)), TODAY)).toEqual({ kind: 'noData' });
    expect(todayState([tree('a', 5, [1])], null, TODAY)).toEqual({ kind: 'noData' });
  });

  test('memories and locked-in trees don’t count; none growing — nothing to say', () => {
    const dead = tree('d', 30, [20], { diedOn: addDays(TODAY, -2) });
    expect(todayState([dead], noon(TODAY), TODAY)).toEqual({ kind: 'noTrees' });
    expect(todayState([dead, tree('a', 5, [0])], noon(TODAY), TODAY)).toEqual({ kind: 'all' });
  });
});

describe('three numbers (6.3)', () => {
  test('growing, best streak of a growing tree, days watered this week', () => {
    const trees = [tree('a', 40, [0, 1, 2, 3, 4, 5, 6, 7]), tree('b', 9, [0, 2]), tree('d', 60, Array.from({ length: 30 }, (_, i) => i + 20), { diedOn: addDays(TODAY, -3) })];
    expect(statsOf(trees, TODAY)).toEqual({ growing: 2, best: 8, week: 7 });
  });
});

describe('order and names', () => {
  const forest = (trees: Tree[]): PublicForest => ({ trees, plot: { size: 3, places: {} }, meadow: 'spring', hidden: 0 });
  const person = (nick: string, name: string | null, days: number) => ({ nick, name, avatar: 'fox', color: 0, forest: forest([tree(nick, days, Array.from({ length: days }, (_, i) => i))]) });

  test('friends by best streak, equal ones by name', () => {
    const sorted = sortFriends([person('lukas', 'Лукас', 58), person('aisha', 'Аиша', 26), person('mei', 'Мэй', 112), person('anna', 'Анна', 26)]);
    expect(sorted.map((f) => f.nick)).toEqual(['mei', 'lukas', 'aisha', 'anna']);
  });

  test('a name, or the @nick; a case of the name in Russian is the @nick', () => {
    const p = { nick: 'aisha_k', name: 'Аиша', avatar: 'fox', color: 0 };
    expect(displayName(p)).toBe('Аиша');
    expect(displayName({ ...p, name: null })).toBe('@aisha_k');
    expect(displayName({ ...p, name: '  ' })).toBe('@aisha_k');
    expect(nameInCase(ru, p)).toBe('@aisha_k');
    expect(nameInCase(en, p)).toBe('Аиша');
  });
});

describe('old data (6.8)', () => {
  const now = noon(TODAY);
  test('fresh under 3 h, "updated" up to 2 days, then "last seen"', () => {
    expect(freshness(now - 2 * 3_600_000, now).kind).toBe('fresh');
    expect(freshness(now - 6 * 3_600_000, now)).toEqual({ kind: 'updated', ms: 6 * 3_600_000 });
    expect(freshness(now - 3 * 86_400_000, now).kind).toBe('away');
    expect(freshness(null, now).kind).toBe('fresh');
  });

  test('how long ago, in words', () => {
    expect(agoText(ru, 20_000)).toBe('только что');
    expect(agoText(ru, 5 * 60_000)).toBe('5 мин назад');
    expect(agoText(ru, 6 * 3_600_000 + 5)).toBe('6 ч назад');
    expect(agoText(ru, 3 * 86_400_000)).toBe('3 дня назад');
    expect(agoText(ru, 5 * 86_400_000)).toBe('5 дней назад');
    expect(agoText(en, 86_400_000)).toBe('1 day ago');
  });
});

describe('the requests row (4.1)', () => {
  test('new, the rest of incoming, mine waiting', () => {
    expect(requestsSummary(ru, 1, 1, 1)).toBe('1 новая · 1 ждёт ответа');
    expect(requestsSummary(ru, 2, 3, 0)).toBe('2 новые · 1 входящая');
    expect(requestsSummary(ru, 0, 0, 5)).toBe('5 ждут ответа');
    expect(requestsSummary(en, 1, 1, 2)).toBe('1 new · 2 waiting');
  });
  test('friend requests only: "Friend requests" and the summary as before', () => {
    expect(requestsRow(ru, { fresh: 1, incoming: 1, outgoing: 1, offers: 0 })).toEqual({ title: 'Заявки в друзья', summary: '1 новая · 1 ждёт ответа' });
  });
  test('with a shared tree offered: "Requests" and what is in them', () => {
    expect(requestsRow(ru, { fresh: 1, incoming: 0, outgoing: 0, offers: 1 })).toEqual({ title: 'Заявки', summary: 'Общее дерево · приглашение' });
    expect(requestsRow(ru, { fresh: 2, incoming: 1, outgoing: 0, offers: 1 })).toEqual({ title: 'Заявки', summary: '1 в друзья · 1 общее дерево' });
    expect(requestsRow(ru, { fresh: 0, incoming: 0, outgoing: 2, offers: 2 })).toEqual({ title: 'Заявки', summary: '2 общих дерева · 2 ждут ответа' });
    expect(requestsRow(en, { fresh: 1, incoming: 0, outgoing: 0, offers: 1 })).toEqual({ title: 'Requests', summary: 'Shared tree · invitation' });
    expect(requestsRow(en, { fresh: 0, incoming: 2, outgoing: 1, offers: 1 })).toEqual({ title: 'Requests', summary: '2 friend requests · 1 shared tree · 1 waiting' });
  });
});

describe('a friend’s trees (6.2, 6.5)', () => {
  test('rows: growing by days, locked in, memory; a previous try under its habit', () => {
    const dead = tree('n1', 60, Array.from({ length: 28 }, (_, i) => i + 10), { lineageId: 'n', diedOn: addDays(TODAY, -5), name: 'No smoking' });
    const again = tree('n2', 4, [0, 1, 2, 3], { lineageId: 'n', generation: 2, parentId: 'n1', name: 'No smoking' });
    const push = tree('p', 20, Array.from({ length: 15 }, (_, i) => i));
    const locked = tree('l', 90, [30, 31], { completedOn: addDays(TODAY, -20) });
    const rows = treeRows([dead, locked, again, push]);
    expect(rows.map((h) => h.current.id)).toEqual(['p', 'n2', 'l']);
    expect(previousTry(rows[1])?.id).toBe('n1');
    expect(previousTry(rows[0])).toBeNull();
  });

  test('the hero shows up to four growing trees, most days first', () => {
    const trees = [1, 5, 3, 9, 7].map((d) => tree(`t${d}`, d + 1, Array.from({ length: d }, (_, i) => i)));
    expect(heroTrees(trees).map((x) => x.id)).toEqual(['t9', 't7', 't5', 't3']);
  });
});

describe('cheers I got today (4.3)', () => {
  const from = (nick: string) => ({ nick, name: null, avatar: 'owl', color: 1 });
  test('the inbox, the remembered ones and the list’s marks, newest first, one per friend', () => {
    const got = cheersToday(
      [{ nick: 'mei', at: noon(TODAY) - 3_600_000 }],
      [{ from: from('mei'), day: TODAY, at: noon(TODAY) }, { from: from('old'), day: addDays(TODAY, -1), at: noon(addDays(TODAY, -1)) }],
      ['lukas', 'mei'],
      TODAY,
    );
    expect(got).toEqual([{ nick: 'mei', at: noon(TODAY) }, { nick: 'lukas', at: null }]);
  });
});

describe("a friend's tree waiting for its hour (OYUUR-34, спец 5.4)", () => {
  const quit = tree('q', 10, [1, 2], { kind: 'quit', openHours: [{ from: addDays(TODAY, -10), hour: 18 }] });

  test('before the hour by my clock — waiting, not "hasn\'t watered"', () => {
    expect(waitingNow(quit, TODAY, { hour: 10, minute: 0 })).toBe(true);
    expect(waitingNow(quit, TODAY, { hour: 18, minute: 0 })).toBe(false);
  });

  test('watered, "any time" or no longer growing — not waiting', () => {
    expect(waitingNow({ ...quit, checkins: [...quit.checkins, TODAY] }, TODAY, { hour: 10, minute: 0 })).toBe(false);
    expect(waitingNow(tree('d', 10, [1]), TODAY, { hour: 10, minute: 0 })).toBe(false);
    expect(waitingNow({ ...quit, diedOn: TODAY }, TODAY, { hour: 10, minute: 0 })).toBe(false);
  });
});
