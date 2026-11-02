import { describe, expect, it } from '@jest/globals';
import { addDays } from '../dates';
import { bestStreak, rank, weekDays } from '../leaders';
import { atNick, nickProblem, typeNick } from '../nick';
import { bothWatered, partnerOf, SharedTree, sharedAsTree, todayOf } from '../shared';
import { checkIn, growthDays, isDead, isCompleted, plantTree, Tree } from '../tree';

const D0 = '2026-10-05';

describe('nick', () => {
  it('typing: lower case, no @, space is _, nothing else', () => {
    expect(typeNick('@Sasha T')).toBe('sasha_t');
    expect(typeNick('Ёжик-42!')).toBe('42');
    expect(typeNick('a'.repeat(30))).toHaveLength(20);
  });

  it('rules', () => {
    expect(nickProblem('')).toBe('empty');
    expect(nickProblem('ab')).toBe('short');
    expect(nickProblem('1abc')).toBe('letter');
    expect(nickProblem('ab__c')).toBe('underscores');
    expect(nickProblem('abc_')).toBe('underscores');
    expect(nickProblem('admin')).toBe('reserved');
    expect(nickProblem('mei_2')).toBeNull();
    expect(atNick('mei')).toBe('@mei');
  });
});

const person = (nick: string) => ({ nick, name: null, avatar: 'fox', color: 0 });
const shared = (waterings: Record<string, string[]>, extra: Partial<SharedTree> = {}): SharedTree => ({
  id: 's1', name: 'Читать', kind: 'do', skin: 'maple', status: 'active', plantedOn: D0, createdAt: 0, endedAt: null,
  proposer: person('me'), partner: person('mei'), waterings, ...extra,
});
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => addDays(D0, from + i));

describe('shared tree', () => {
  it('a day counts only when both watered', () => {
    const s = shared({ me: range(0, 4), mei: [addDays(D0, 0), addDays(D0, 2), addDays(D0, 4)] });
    expect(bothWatered(s)).toEqual([addDays(D0, 0), addDays(D0, 2), addDays(D0, 4)]);
    expect(growthDays(sharedAsTree(s, addDays(D0, 4)))).toBe(3);
  });

  it('missed days use shared chances, yesterday is not judged yet', () => {
    const s = shared({ me: range(0, 0), mei: range(0, 0) });
    // Days 1..3 missed by both; on day 4 the day before (3) isn't judged yet.
    const t = sharedAsTree(s, addDays(D0, 4));
    expect(t.frozen).toEqual([addDays(D0, 1), addDays(D0, 2)]);
    expect(t.chancesLeft).toBe(1);
    expect(isDead(sharedAsTree(s, addDays(D0, 6)))).toBe(true);
  });

  it('an ended tree is a memory', () => {
    const s = shared({ me: range(0, 2), mei: range(0, 2) }, { status: 'ended' });
    const t = sharedAsTree(s, addDays(D0, 2), addDays(D0, 2));
    expect(isCompleted(t)).toBe(true);
    expect(growthDays(t)).toBe(3);
  });

  it('a memory stays as it was, days after it ended', () => {
    const s = shared({ me: range(0, 2), mei: range(0, 2) }, { status: 'ended' });
    const t = sharedAsTree(s, addDays(D0, 30), addDays(D0, 2));
    expect(isDead(t)).toBe(false);
    expect(isCompleted(t)).toBe(true);
    expect(growthDays(t)).toBe(3);
  });

  it('partner and today', () => {
    const s = shared({ me: [D0], mei: [] });
    expect(partnerOf(s, 'me')?.nick).toBe('mei');
    expect(partnerOf(s, 'mei')?.nick).toBe('me');
    expect(todayOf(s, 'me', D0)).toEqual({ mine: true, theirs: false });
  });
});

function grown(n: number, id: string, start = D0): Tree {
  let tree = plantTree({ id, name: 'Run', kind: 'do', visibility: 'friends', today: start });
  for (let i = 0; i < n; i++) tree = checkIn(tree, addDays(start, i)).tree;
  return tree;
}

describe('leaders', () => {
  it('week: days with any watering among the last 7', () => {
    const today = addDays(D0, 9);
    expect(weekDays([grown(10, 'a')], today)).toBe(7);
    expect(weekDays([grown(5, 'a')], today)).toBe(2);
    expect(weekDays([grown(5, 'a')], today, [today, addDays(today, -1), addDays(D0, 4)])).toBe(4);
  });

  it('best streak: growing trees only', () => {
    expect(bestStreak([grown(12, 'a'), { ...grown(30, 'b'), diedOn: D0 }])).toBe(12);
  });

  it('sports places, me first among equals', () => {
    const r = rank([
      { nick: 'b', name: 'Борис', me: false, value: 6 },
      { nick: 'me', name: 'Я', me: true, value: 6 },
      { nick: 'a', name: 'Аня', me: false, value: 6 },
      { nick: 'top', name: 'Мэй', me: false, value: 7 },
      { nick: 'z', name: 'Зоя', me: false, value: 5 },
    ]);
    expect(r.map((x) => [x.nick, x.place])).toEqual([['top', 1], ['me', 2], ['a', 2], ['b', 2], ['z', 5]]);
  });
});
