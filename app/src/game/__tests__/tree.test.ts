import { describe, expect, it } from '@jest/globals';
import { addDays, daysBetween, todayKey, toDayKey } from '../dates';
import {
  checkIn,
  complete,
  groupHabits,
  isCompleted,
  migrateTrees,
  nextStage,
  dayStatus,
  growthDays,
  MAX_CHANCES,
  plantFromSeed,
  plantTree,
  seedUsed,
  settle,
  stageOf,
  Tree,
} from '../tree';

const D0 = '2026-10-05'; // mid-month: no monthly refill in the basic tests
const plant = (today = D0) =>
  plantTree({ id: 't1', name: '  No sugar ', kind: 'quit', visibility: 'private', today });

/** Check in on each of the given day offsets from D0. */
function checkInOn(tree: Tree, offsets: number[]): Tree {
  for (const o of offsets) tree = checkIn(tree, addDays(D0, o)).tree;
  return tree;
}

describe('dates', () => {
  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('counts days between keys', () => {
    expect(daysBetween('2026-10-27', '2026-11-03')).toBe(7);
    expect(daysBetween('2026-11-03', '2026-10-27')).toBe(-7);
  });

  it('survives a daylight-saving change', () => {
    // Europe/US clocks change around the end of March and October.
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
  });

  it('builds today from local time plus the dev offset', () => {
    const now = new Date(2026, 9, 27, 23, 59);
    expect(toDayKey(now)).toBe('2026-10-27');
    expect(todayKey(now, 3)).toBe('2026-10-30');
  });
});

describe('planting', () => {
  it('starts with zero days and all chances', () => {
    const tree = plant();
    expect(tree.name).toBe('No sugar');
    expect(growthDays(tree)).toBe(0);
    expect(tree.chancesLeft).toBe(MAX_CHANCES);
    expect(tree.diedOn).toBeNull();
  });

  it('does not count the planting day as missed', () => {
    const tree = settle(plant(), addDays(D0, 1));
    expect(tree.chancesLeft).toBe(3);
    expect(tree.frozen).toEqual([]);
  });
});

describe('check-in', () => {
  it('grows the tree once per day', () => {
    let { tree, result } = checkIn(plant(), D0);
    expect(result).toBe('grown');
    expect(growthDays(tree)).toBe(1);

    ({ tree, result } = checkIn(tree, D0));
    expect(result).toBe('already');
    expect(growthDays(tree)).toBe(1);

    ({ tree, result } = checkIn(tree, addDays(D0, 1)));
    expect(result).toBe('grown');
    expect(growthDays(tree)).toBe(2);
  });

  it('ignores days before planting (time travel backwards)', () => {
    const { result } = checkIn(plant(), addDays(D0, -1));
    expect(result).toBe('notPlanted');
  });

  it('never judges today before it ends', () => {
    const tree = settle(checkInOn(plant(), [0]), addDays(D0, 1));
    expect(tree.chancesLeft).toBe(3);
  });
});

describe('clock going backwards', () => {
  it('a frozen day cannot be checked in later', () => {
    const tree = settle(checkInOn(plant(), [0]), addDays(D0, 4)); // days 1–3 frozen
    const { tree: after, result } = checkIn(tree, addDays(D0, 2));
    expect(result).toBe('closed');
    expect(after.checkins).toEqual([D0]);
    expect(after.chancesLeft).toBe(0);
  });

  it('a judged day before the last settled one is closed too', () => {
    const tree = checkInOn(plant(), [0, 1, 3, 4]); // day 2 frozen, settled through day 3
    expect(checkIn(tree, addDays(D0, 2)).result).toBe('closed');
  });

  it('the planting day stays open', () => {
    expect(checkIn(plant(), D0).result).toBe('grown');
  });

  it('keeps check-ins in date order', () => {
    // Today is day 2; the clock jumps back to day 1 before it was judged.
    let tree = checkInOn(plant(), [0, 2]);
    tree = { ...tree, frozen: [], chancesLeft: 3, settledThrough: D0 };
    tree = checkIn(tree, addDays(D0, 1)).tree;
    expect(tree.checkins).toEqual([D0, addDays(D0, 1), addDays(D0, 2)]);
  });
});

describe('chances and death', () => {
  it('a missed day spends a chance and freezes growth', () => {
    // Day 0 checked, day 1 missed, day 2 checked.
    const tree = checkInOn(plant(), [0, 2]);
    expect(tree.chancesLeft).toBe(2);
    expect(tree.frozen).toEqual([addDays(D0, 1)]);
    expect(growthDays(tree)).toBe(2);
    expect(tree.diedOn).toBeNull();
  });

  it('chances belong to each tree for its whole life, not per streak', () => {
    // Misses on days 1, 3, 5 — spread out, still three chances total.
    const tree = settle(checkInOn(plant(), [0, 2, 4, 6]), addDays(D0, 7));
    expect(tree.chancesLeft).toBe(0);
    expect(tree.diedOn).toBeNull();
  });

  it('the fourth missed day kills the tree', () => {
    const tree = settle(checkInOn(plant(), [0, 2, 4, 6]), addDays(D0, 9));
    expect(tree.diedOn).toBe(addDays(D0, 7));
    expect(growthDays(tree)).toBe(4);
  });

  it('a long absence spends chances then kills the tree on the next day', () => {
    const tree = settle(checkInOn(plant(), [0, 1]), addDays(D0, 30));
    expect(tree.frozen).toEqual([addDays(D0, 2), addDays(D0, 3), addDays(D0, 4)]);
    expect(tree.diedOn).toBe(addDays(D0, 5));
  });

  it('a dead tree cannot grow and keeps its record', () => {
    const dead = settle(checkInOn(plant(), [0, 1, 2]), addDays(D0, 20));
    const { tree, result } = checkIn(dead, addDays(D0, 20));
    expect(result).toBe('dead');
    expect(growthDays(tree)).toBe(3);
  });

  it('settling is repeatable and does not double-spend chances', () => {
    const once = settle(plant(), addDays(D0, 3));
    const twice = settle(once, addDays(D0, 3));
    expect(twice).toEqual(once);
    expect(once.chancesLeft).toBe(1); // days 1 and 2 missed
  });
});

describe('seed', () => {
  it('grows a new tree of the same habit from a dead one', () => {
    const dead = settle(plant(), addDays(D0, 10));
    const seedling = plantFromSeed(dead, 't2', addDays(D0, 10));
    expect(seedling).toMatchObject({
      name: 'No sugar',
      kind: 'quit',
      generation: 2,
      parentId: 't1',
      chancesLeft: 3,
      diedOn: null,
      plantedOn: addDays(D0, 10),
    });
    expect(growthDays(seedling)).toBe(0);
  });

  it('gives only one seed per dead tree', () => {
    const dead = settle(plant(), addDays(D0, 10));
    expect(seedUsed(dead, [dead])).toBe(false);
    const child = plantFromSeed(dead, 't2', addDays(D0, 10));
    expect(seedUsed(dead, [dead, child])).toBe(true);
  });
});

describe('stages', () => {
  it('maps growth days to stages', () => {
    expect(stageOf(0).stage).toBe('sprout');
    expect(stageOf(3).stage).toBe('seedling');
    expect(stageOf(7).stage).toBe('bush');
    expect(stageOf(21).stage).toBe('young');
    expect(stageOf(50).stage).toBe('tree');
    expect(stageOf(100).stage).toBe('grand');
    expect(stageOf(500).stage).toBe('grand');
  });

  it('reports progress inside a stage', () => {
    expect(stageOf(14).progress).toBeCloseTo(0.5);
    expect(stageOf(1000).progress).toBe(1);
  });
});

describe('day cards', () => {
  it('labels each kind of day', () => {
    const tree = settle(checkInOn(plant(), [0, 2]), addDays(D0, 3));
    const today = addDays(D0, 3);
    expect(dayStatus(tree, addDays(D0, -1), today)).toBe('beforePlanting');
    expect(dayStatus(tree, D0, today)).toBe('done');
    expect(dayStatus(tree, addDays(D0, 1), today)).toBe('frozen');
    expect(dayStatus(tree, today, today)).toBe('today');
    expect(dayStatus(tree, addDays(D0, 4), today)).toBe('future');
  });

  it('marks the day the tree died', () => {
    const dead = settle(plant(), addDays(D0, 10));
    expect(dayStatus(dead, dead.diedOn!, addDays(D0, 10))).toBe('died');
  });
});

describe('monthly chance refill', () => {
  const at = (day: string) => plantTree({ id: 'm', name: 'Run', kind: 'do', visibility: 'friends', today: day });

  it('gives one chance back on the 1st of the month', () => {
    // Planted Oct 20, misses Oct 21–22 (2 chances spent), checked in every day after.
    let tree = at('2026-10-20');
    for (let d = '2026-10-23'; d <= '2026-11-01'; d = addDays(d, 1)) tree = checkIn(tree, d).tree;
    expect(tree.chancesLeft).toBe(2); // 3 − 2 + 1 on Nov 1
    expect(tree.refilledMonth).toBe('2026-11');
  });

  it('never goes above 3', () => {
    const tree = settle(checkIn(at('2026-10-31'), '2026-10-31').tree, '2026-11-01');
    expect(tree.chancesLeft).toBe(3);
  });

  it('shows the refill on the 1st itself, before the day is over', () => {
    const tree = settle(at('2026-10-29'), '2026-11-01'); // Oct 30, 31 missed
    expect(tree.chancesLeft).toBe(2);
  });

  it('does not refill twice in one month', () => {
    const once = settle(at('2026-10-29'), '2026-11-01');
    expect(settle(once, '2026-11-01')).toBe(once);
    expect(settle(once, '2026-11-02').chancesLeft).toBe(1); // Nov 1 missed
  });

  it('a missed 1st of the month can use that month’s new chance', () => {
    // Without the Nov 1 refill the 4th miss would kill the tree.
    const tree = settle(at('2026-10-28'), '2026-11-02'); // misses Oct 29, 30, 31, Nov 1
    expect(tree.frozen).toEqual(['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
    expect(tree.diedOn).toBeNull();
    expect(tree.chancesLeft).toBe(0);
  });

  it('planting on the 1st gives no extra chance', () => {
    expect(settle(at('2026-11-01'), '2026-11-02').chancesLeft).toBe(3); // Nov 1 is the planting day: not judged, no refill
    expect(at('2026-11-01').chancesLeft).toBe(3);
  });
});

describe('lock in the result', () => {
  it('stops asking for taps and cannot die', () => {
    let tree = checkInOn(plant(), [0, 1, 2]);
    tree = complete(tree, addDays(D0, 2));
    expect(isCompleted(tree)).toBe(true);
    const later = settle(tree, addDays(D0, 60));
    expect(later.diedOn).toBeNull();
    expect(later.chancesLeft).toBe(3);
    expect(checkIn(later, addDays(D0, 60)).result).toBe('completed');
    expect(growthDays(later)).toBe(3);
  });

  it('judges missed days before locking in', () => {
    const tree = complete(checkInOn(plant(), [0]), addDays(D0, 3)); // days 1, 2 missed
    expect(tree.chancesLeft).toBe(1);
    expect(tree.completedOn).toBe(addDays(D0, 3));
  });

  it('a dead tree cannot be locked in', () => {
    const dead = settle(plant(), addDays(D0, 10));
    expect(complete(dead, addDays(D0, 10)).completedOn).toBeNull();
  });

  it('is for good: the tree stays exactly as it was', () => {
    const locked = complete(checkInOn(plant(), [0, 1, 2]), addDays(D0, 2));
    expect(complete(locked, addDays(D0, 30))).toEqual(locked);
    for (const day of [addDays(D0, 2), addDays(D0, 3), addDays(D0, 400)]) {
      const { tree, result } = checkIn(locked, day);
      expect(result).toBe('completed');
      expect(tree).toEqual(locked);
    }
  });

  it('shows days after the lock-in as finished', () => {
    const tree = complete(checkInOn(plant(), [0]), D0);
    expect(dayStatus(tree, addDays(D0, 1), addDays(D0, 1))).toBe('afterEnd');
  });
});

describe('next stage forecast', () => {
  it('counts the taps left and the day of the last one', () => {
    // 1 growth day, tapped today: seedling at 3 → 2 more taps, tomorrow and the day after.
    const tree = checkInOn(plant(), [0]);
    expect(nextStage(tree, D0)).toEqual({ stage: 'seedling', taps: 2, on: addDays(D0, 2) });
  });

  it('includes today when today is not tapped yet', () => {
    expect(nextStage(plant(), D0)).toEqual({ stage: 'seedling', taps: 3, on: addDays(D0, 2) });
  });

  it('has nothing to forecast for dead, locked-in or grand trees', () => {
    expect(nextStage(settle(plant(), addDays(D0, 9)), addDays(D0, 9))).toBeNull();
    expect(nextStage(complete(plant(), D0), D0)).toBeNull();
    const grand = { ...plant(), checkins: Array.from({ length: 100 }, (_, i) => addDays(D0, i - 100)) };
    expect(nextStage(grand, D0)).toBeNull();
  });
});

describe('habits and generations', () => {
  it('keeps every generation in one habit', () => {
    const first = settle(plant(), addDays(D0, 10));
    const second = settle(plantFromSeed(first, 't2', addDays(D0, 10)), addDays(D0, 20));
    const third = plantFromSeed(second, 't3', addDays(D0, 20));
    const other = plantTree({ id: 'x', name: 'Run', kind: 'do', visibility: 'friends', today: D0 });
    const habits = groupHabits([first, other, third, second]);
    expect(habits.map((h) => h.lineageId)).toEqual(['t1', 'x']);
    expect(habits[0].generations.map((t) => t.id)).toEqual(['t1', 't2', 't3']);
    expect(habits[0].current.id).toBe('t3');
  });

  it('upgrades trees saved by the first version', () => {
    const v1 = (id: string, parentId: string | null) =>
      ({ id, parentId, plantedOn: '2026-10-27', generation: 1 }) as Partial<Tree>;
    const [a, b, c] = migrateTrees([v1('a', null), v1('b', 'a'), v1('c', 'b')]);
    expect([a.lineageId, b.lineageId, c.lineageId]).toEqual(['a', 'a', 'a']);
    expect(c).toMatchObject({ refilledMonth: '2026-10', completedOn: null });
  });
});

describe('review fixes', () => {
  it('a version-1 tree whose parent was deleted stays in its habit', () => {
    const v1 = (id: string, parentId: string | null, generation: number) =>
      ({ id, parentId, generation, name: 'No sugar', kind: 'quit', plantedOn: '2026-10-01' }) as Partial<Tree>;
    const trees = migrateTrees([v1('a', null, 1), v1('c', 'b', 3)]); // b was deleted
    expect(trees.map((x) => x.lineageId)).toEqual(['a', 'a']);
    expect(seedUsed(trees[0], trees)).toBe(true);
  });
});

describe('tree kinds', () => {
  it('plants an oak unless another kind is chosen', () => {
    expect(plant().skin).toBe('oak');
    const sakura = plantTree({ id: 's1', name: 'Read', kind: 'do', visibility: 'private', today: D0, skin: 'sakura' });
    expect(sakura.skin).toBe('sakura');
  });

  it('a tree from a seed keeps the kind of its parent', () => {
    const spruce = plantTree({ id: 's1', name: 'Run', kind: 'do', visibility: 'private', today: D0, skin: 'spruce' });
    const dead = settle(spruce, addDays(D0, 10));
    expect(plantFromSeed(dead, 's2', addDays(D0, 10)).skin).toBe('spruce');
  });

  it('trees saved before kinds existed become oaks', () => {
    const { skin, ...old } = plant();
    expect(skin).toBe('oak');
    expect(migrateTrees([old])[0].skin).toBe('oak');
  });

  it('an unknown saved kind becomes an oak instead of breaking the screen', () => {
    const broken = { ...plant(), skin: 'baobab' } as unknown as Tree;
    expect(migrateTrees([broken])[0].skin).toBe('oak');
  });
});
