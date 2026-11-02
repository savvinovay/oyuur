import { describe, expect, it } from '@jest/globals';
import { addDays, DayKey } from '@/game/dates';
import type { SharedTree } from '@/game/shared';
import { plantTree, Tree } from '@/game/tree';
import type { PublicTree } from '@/net/api';
import { bestTree, buildBoard, friendsWateredToday, placeLabel, Player, playersOf, weekDots } from '../model';

const TODAY = '2026-10-28';

/** A tree watered on the given days back from today (0 — today). */
function tree(id: string, back: number[], o: Partial<Tree> = {}): Tree {
  const t = plantTree({ id, name: `habit ${id}`, kind: 'do', visibility: 'friends', today: addDays(TODAY, -40) });
  return { ...t, checkins: back.map((n) => addDays(TODAY, -n)).sort(), ...o };
}

const player = (nick: string, trees: Tree[], o: Partial<Player> = {}): Player => ({
  nick, name: nick, me: false, avatar: 'fox', color: 0, trees, extra: [], ...o,
});

describe('leaders board', () => {
  it('week dots: oldest first, today not yet is "wait"', () => {
    expect(weekDots([tree('a', [6, 5, 3, 1])], TODAY)).toEqual(['on', 'on', 'off', 'on', 'off', 'on', 'wait']);
    expect(weekDots([tree('a', [0])], TODAY, [addDays(TODAY, -6)])).toEqual(['on', 'off', 'off', 'off', 'off', 'off', 'on']);
  });

  it('best tree: the growing one with most days', () => {
    const dead = tree('dead', [1, 2, 3, 4, 5], { diedOn: TODAY });
    const small = tree('small', [1]);
    const big = tree('big', [1, 2, 3], { skin: 'birch' });
    expect(bestTree([dead, small, big])?.id).toBe('big');
    expect(bestTree([dead])).toBeNull();
  });

  it('places with ties, me first among equals; the podium is the first three', () => {
    const players = [
      player('me', [tree('m', [1, 2, 3, 4, 5, 6])], { me: true, name: 'You' }),
      player('mei', [tree('a', [0, 1, 2, 3, 4, 5, 6])]),
      player('lucas', [tree('b', [0, 1, 2, 3, 4, 5])]),
      player('daniel', [tree('c', [0, 1, 3, 4, 5, 6])]),
      player('aisha', [tree('d', [1, 2, 3, 4, 5])]),
    ];
    const { ranked, out } = buildBoard(players, 'week', TODAY);
    expect(ranked.map((r) => [r.player.nick, r.place, r.value])).toEqual([
      ['mei', 1, 7], ['me', 2, 6], ['daniel', 2, 6], ['lucas', 2, 6], ['aisha', 5, 5],
    ]);
    expect(ranked[1].tiedWith).toEqual(['daniel', 'lucas']);
    expect(ranked[0].tiedWith).toEqual([]);
    expect(out).toEqual([]);
  });

  it('only open trees count; without them one is out, me first', () => {
    const hidden = tree('h', [0, 1, 2], { visibility: 'private' });
    const me = player('me', [hidden], { me: true, name: 'You' });
    const { ranked, out } = buildBoard([player('zoe', []), me, player('ann', [])], 'week', TODAY);
    expect(ranked.map((r) => r.player.nick)).toEqual(['me']);
    // playersOf filters my hidden trees; buildBoard trusts what it gets.
    const players = playersOf({
      me: { nick: 'me', name: null, avatar: 'fox', color: 0 },
      youName: 'You',
      myTrees: [hidden],
      friends: [],
      shared: [],
    });
    expect(buildBoard(players, 'week', TODAY).out.map((r) => [r.player.nick, r.value])).toEqual([['me', null]]);
    expect(out.map((r) => r.player.nick)).toEqual(['ann', 'zoe']);
  });

  it('my half of a shared tree counts in the week, not in the streak', () => {
    const shared: SharedTree = {
      id: 's', name: 'Run', kind: 'do', skin: 'oak', status: 'active', plantedOn: addDays(TODAY, -3), createdAt: 0, endedAt: null,
      proposer: { nick: 'me', name: null, avatar: 'fox', color: 0 },
      partner: { nick: 'mei', name: 'Mei', avatar: 'owl', color: 1 },
      waterings: { me: [addDays(TODAY, -1), TODAY], mei: [TODAY] },
    };
    const players = playersOf({
      me: { nick: 'me', name: 'Sasha', avatar: 'fox', color: 0 },
      youName: 'You',
      myTrees: [],
      friends: [{ nick: 'mei', name: 'Mei', avatar: 'owl', color: 1, forest: { trees: [] } }],
      shared: [shared],
    });
    expect(players.map((p) => [p.name, p.extra.length])).toEqual([['You', 2], ['Mei', 1]]);
    const week = buildBoard(players, 'week', TODAY);
    expect(week.ranked.map((r) => [r.player.nick, r.value])).toEqual([['me', 2], ['mei', 1]]);
    const streak = buildBoard(players, 'streak', TODAY);
    expect(streak.ranked).toEqual([]);
    expect(streak.out.map((r) => r.player.nick)).toEqual(['me', 'mei']);
  });

  it('streak: the best growing tree and its line', () => {
    const { ranked } = buildBoard([player('a', [tree('x', [1, 2], { name: 'No sweets', skin: 'maple' }), tree('y', [1])])], 'streak', TODAY);
    expect(ranked[0].value).toBe(2);
    expect(ranked[0].best).toEqual({ habit: 'No sweets', skin: 'maple' });
  });

  it('friends without a name show their @nick; who watered today', () => {
    const pub = (checkins: DayKey[]) => ({ ...tree('p', []), checkins }) as unknown as PublicTree;
    const friends = [
      { nick: 'lucas', name: null, avatar: 'bear', color: 2, forest: { trees: [pub([TODAY])] } },
      { nick: 'mei', name: 'Mei', avatar: 'owl', color: 1, forest: { trees: [pub([addDays(TODAY, -1)])] } },
    ];
    const players = playersOf({ me: { nick: 'me', name: null, avatar: 'fox', color: 0 }, youName: 'You', myTrees: [], friends, shared: [] });
    expect(players[1].name).toBe('@lucas');
    expect(friendsWateredToday(friends, TODAY)).toBe(1);
  });

  it('a shared place reads as a tie: "=2", a place of one alone: "2"', () => {
    const board = buildBoard([player('a', [tree('a', [0, 1, 2])]), player('b', [tree('b', [0, 1])]), player('c', [tree('c', [0, 1])]), player('d', [tree('d', [0])])], 'week', TODAY);
    expect(board.ranked.map((r) => placeLabel(r))).toEqual(['1', '=2', '=2', '4']);
    expect(placeLabel({ place: null, tiedWith: [] })).toBe('');
  });
});
