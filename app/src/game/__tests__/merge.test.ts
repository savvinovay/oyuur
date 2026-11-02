// Merging two forests (OYUUR-30, design/oyuur-29/спец.md Т7).
import { describe, expect, it } from '@jest/globals';
import { addDays } from '../dates';
import {
  balanceOf,
  buy,
  earnedOf,
  Ledger,
  mergeLedger,
  migrateWallet,
  newShop,
  pruneLedger,
  sharedWateringReward,
  START_ACORNS,
  walletOf,
  wateringReward,
} from '../economy';
import { hlcMax, hlcNext, mergeClaimed, mergePlot, mergeQuests, mergeShop, mergeTree, mergeTrees, placesOf } from '../merge';
import { emptyPlot, grow, moveTo, Plot, syncPlot } from '../plot';
import { newQuests, Quests } from '../quests';
import { checkIn, complete, plantFromSeed, plantTree, setOpenHour, settle, Tree } from '../tree';

const D0 = '2026-10-01';
const day = (n: number) => addDays(D0, n);
const plant = (id = 't1') => plantTree({ id, name: 'Run', kind: 'do', visibility: 'friends', today: D0 });
/** Waters on the given day numbers, judging every day up to `upTo`. */
function watered(days: number[], upTo: number, tree = plant()): Tree {
  let t = tree;
  for (let d = 0; d <= upTo; d++) {
    t = settle(t, day(d));
    if (days.includes(d)) t = checkIn(t, day(d)).tree;
  }
  return settle(t, day(upTo));
}
const byId = (list: Tree[]) => [...list].sort((a, b) => (a.id < b.id ? -1 : 1));
const S = (ms: number, dev = 'A') => hlcNext('', ms, dev);

describe('hybrid clock', () => {
  it('a new change is later than anything seen, even with the phone clock behind', () => {
    const ahead = S(2_000_000_000_000, 'B');
    const mine = hlcNext(ahead, 1_000_000_000_000, 'A');
    expect(mine > ahead).toBe(true);
    expect(hlcNext(mine, 1_000_000_000_000, 'A') > mine).toBe(true);
    expect(hlcMax('', mine)).toBe(mine);
  });
});

describe('one tree from two phones', () => {
  it('order and repeats do not matter', () => {
    const a = watered([0, 1, 2, 4], 6);
    const b = watered([0, 1, 3, 5], 6);
    const ab = mergeTree(a, b, day(6));
    expect(mergeTree(b, a, day(6))).toEqual(ab);
    expect(mergeTree(ab, ab, day(6))).toEqual(ab);
    expect(mergeTree(a, a, day(6))).toEqual(a);
  });

  it('three phones in any grouping agree', () => {
    const a = watered([0, 1, 2], 2);
    const b = watered([0, 3, 4], 4);
    const c = { ...watered([0, 2, 5, 6, 7], 8), nickname: 'Дуб', stamps: { nickname: S(5) } };
    const t = day(8);
    const left = mergeTree(mergeTree(a, b, t), c, t);
    const right = mergeTree(a, mergeTree(b, c, t), t);
    const other = mergeTree(mergeTree(c, a, t), b, t);
    expect(right).toEqual(left);
    expect(other).toEqual(left);
    expect(left.checkins).toHaveLength(8);
    expect(left.frozen).toEqual([]);
    expect(left.nickname).toBe('Дуб');
  });

  it('a watering made without network gives the chance back', () => {
    // Phone B waters on day 3 offline; phone A saw day 3 missed and spent a chance.
    const a = watered([0, 1, 2, 4], 5);
    const b = watered([0, 1, 2, 3], 3);
    expect(a.frozen).toEqual([day(3)]);
    expect(a.chancesLeft).toBe(2);
    const m = mergeTree(a, b, day(5));
    expect(m.frozen).toEqual([]);
    expect(m.chancesLeft).toBe(3);
    expect(m.checkins).toEqual([day(0), day(1), day(2), day(3), day(4)]);
  });

  it('a tree "dead" on one phone lives again with the other phone\'s waterings', () => {
    const a = watered([0], 6); // days 1–3 frozen, day 4 kills it
    expect(a.diedOn).toBe(day(4));
    const b = watered([0, 1, 2, 3, 4, 5], 5);
    const { trees, revived } = mergeTrees([a], [b], { today: day(6), tombs: {} });
    expect(trees[0].diedOn).toBeNull();
    expect(revived).toEqual([day(1), day(2), day(3), day(4), day(5)]);
  });

  it('a death is final once a tree grows from its seed', () => {
    const dead = watered([0], 6);
    const seedling = plantFromSeed(dead, 't2', day(6));
    const late = watered([0, 1, 2, 3, 4, 5], 5);
    const { trees, revived } = mergeTrees([dead, seedling], [late], { today: day(7), tombs: {} });
    const first = trees.find((t) => t.id === 't1')!;
    expect(first.diedOn).toBe(day(4));
    expect(first.checkins.every((d) => d < day(4))).toBe(true);
    expect(revived).toEqual([]);
    // Either way round.
    expect(byId(mergeTrees([late], [dead, seedling], { today: day(7), tombs: {} }).trees)).toEqual(byId(trees));
  });

  it('a lock-in stays; waterings after its day do not count', () => {
    const locked = complete(watered([0, 1, 2], 2), day(2));
    const other = watered([0, 1, 2, 3, 4], 4);
    const m = mergeTree(locked, other, day(5));
    expect(m.completedOn).toBe(day(2));
    expect(m.checkins).toEqual([day(0), day(1), day(2)]);
    expect(mergeTree(other, locked, day(5))).toEqual(m);
  });

  it('name, kind and who sees it: the later change of each wins on its own', () => {
    const base = watered([0, 1], 1);
    const a = { ...base, nickname: 'Дубок', namedOn: day(1), stamps: { nickname: S(200) }, skin: 'oak' as const };
    const b = { ...base, nickname: 'Старый', namedOn: day(0), stamps: { nickname: S(100), skin: S(150) }, skin: 'birch' as const };
    const m = mergeTree(a, b, day(1));
    expect(m.nickname).toBe('Дубок');
    expect(m.namedOn).toBe(day(0));
    expect(m.skin).toBe('birch');
    expect(m.stamps).toEqual({ nickname: S(200), skin: S(150) });
    const c = { ...base, visibility: 'private' as const, stamps: { visibility: S(300) } };
    expect(mergeTree(base, c, day(1)).visibility).toBe('private');
    expect(mergeTree({ ...base, stamps: { visibility: S(400) } }, c, day(1)).visibility).toBe('friends');
  });

  it('the watering hour: the later change wins for the coming days; past days stay', () => {
    const t = watered([0, 1], 3);
    const a = { ...setOpenHour(t, 18, day(3)), stamps: { openHours: S(100) } };
    const b = { ...setOpenHour(t, 7, day(3)), stamps: { openHours: S(200) } };
    expect(mergeTree(a, b, day(3)).openHours).toEqual([{ from: D0, hour: 0 }, { from: day(4), hour: 7 }]);
    // Phone A's change already applied (day 4 passed there), B changed later for day 6.
    const a2 = { ...setOpenHour(t, 18, day(3)), stamps: { openHours: S(100) } };
    const b2 = { ...setOpenHour(t, 9, day(5)), stamps: { openHours: S(200) } };
    const m = mergeTree(a2, b2, day(5));
    expect(m.openHours).toEqual([{ from: D0, hour: 0 }, { from: day(4), hour: 18 }, { from: day(6), hour: 9 }]);
    expect(mergeTree(b2, a2, day(5))).toEqual(m);
  });

  it('an old phone with old data does not take back newer changes', () => {
    const old = watered([0, 1], 1);
    const fresh = { ...watered([0, 1, 2, 3], 3), nickname: 'Клён', namedOn: day(3), stamps: { nickname: S(500) } };
    const m = mergeTree(fresh, old, day(3));
    expect(m).toEqual(fresh);
  });
});

describe('a forest of trees', () => {
  it('a deleted habit goes everywhere, even watered elsewhere meanwhile', () => {
    const a = watered([0, 1], 1);
    const b = watered([0, 1, 2], 2);
    const { trees } = mergeTrees([a, plant('t9')], [b], { today: day(2), tombs: { t1: S(10) } });
    expect(trees.map((t) => t.id)).toEqual(['t9']);
  });

  it('all generations of a habit are seen by the same people: the latest choice', () => {
    const dead = watered([0], 6);
    const g2 = plantFromSeed(dead, 't2', day(6));
    const hiddenG2 = { ...g2, visibility: 'private' as const, stamps: { visibility: S(50) } };
    const { trees } = mergeTrees([dead], [hiddenG2], { today: day(6), tombs: {} });
    expect(trees.map((t) => t.visibility)).toEqual(['private', 'private']);
    expect(trees.every((t) => t.stamps?.visibility === S(50))).toBe(true);
  });

  it('a tree hidden on another phone becomes hidden here, unless shown again later here', () => {
    const t = watered([0, 1], 1);
    expect(mergeTrees([t], [], { today: day(1), tombs: {}, hiddenElsewhere: { t1: S(100, 'server') } }).trees[0].visibility).toBe('private');
    const shown = { ...t, stamps: { visibility: S(200) } };
    expect(mergeTrees([shown], [], { today: day(1), tombs: {}, hiddenElsewhere: { t1: S(100, 'server') } }).trees[0].visibility).toBe('friends');
  });

  it('a tree only on the other phone comes as it is', () => {
    const b = watered([0, 1, 2], 2);
    const { trees } = mergeTrees([], [b], { today: day(2), tombs: {} });
    expect(trees).toEqual([b]);
  });
});

describe('the plot', () => {
  const habits = (ids: string[]) => ids.map((lineageId) => ({ lineageId, days: 1 }));

  it('offsets from the centre do not change when the plot grows', () => {
    const p = syncPlot(emptyPlot(), habits(['a', 'b']));
    expect(placesOf(grow(p, 8))).toEqual(placesOf(p));
  });

  it('the later move wins; size is the larger', () => {
    let a: Plot = syncPlot(emptyPlot(), habits(['a', 'b']));
    a = moveTo(a, 'a', { c: 0, r: 0 }, S(100)).plot;
    let b: Plot = grow(syncPlot(emptyPlot(), habits(['a', 'b'])), 8);
    b = moveTo(b, 'a', { c: 7, r: 7 }, S(200)).plot;
    const m = mergePlot(a, placesOf(b), habits(['a', 'b']));
    expect(m.size).toBe(8);
    expect(placesOf(m).a).toEqual({ dc: 3, dr: 3, at: S(200) });
    const back = mergePlot(b, placesOf(a), habits(['a', 'b']));
    expect(placesOf(back)).toEqual(placesOf(m));
  });

  it('two habits on one cell: the later move keeps it, the other gets a new place', () => {
    const a: Plot = { size: 4, places: { a: { c: 1, r: 1 } }, shownSize: 4, seen: [], at: { a: S(100) } };
    const b: Plot = { size: 4, places: { b: { c: 1, r: 1 } }, shownSize: 4, seen: [], at: { b: S(200) } };
    const m = mergePlot(a, placesOf(b), habits(['a', 'b']));
    expect(m.places.b).toEqual({ c: 1, r: 1 });
    expect(m.places.a).toBeDefined();
    expect(m.places.a).not.toEqual({ c: 1, r: 1 });
  });
});

describe('the acorn journal', () => {
  it('two phones offline pay for one watering once', () => {
    const a = wateringReward({}, 't1', D0, 1).ledger;
    const b = wateringReward({}, 't1', D0, 1).ledger;
    const m = mergeLedger(a, b);
    expect(earnedOf(m)).toBe(5);
    expect(mergeLedger(b, a)).toEqual(m);
    expect(mergeLedger(m, m)).toEqual(m);
  });

  it('at most 3 waterings a day count after a merge', () => {
    let a: Ledger = {};
    let b: Ledger = {};
    for (const id of ['t1', 't2']) a = wateringReward(a, id, D0, 1).ledger;
    for (const id of ['t3', 't4']) b = wateringReward(b, id, D0, 1).ledger;
    b = sharedWateringReward(b, 's1', D0).ledger;
    expect(balanceOf(a, []) + balanceOf(b, [])).toBe(2 * START_ACORNS + 25);
    const m = mergeLedger(a, b);
    expect(earnedOf(m)).toBe(15);
    expect(balanceOf(m, [])).toBe(START_ACORNS + 15);
  });

  it('pays the watering, then nothing past 3, and each new stage once', () => {
    let l: Ledger = {};
    const paid: number[] = [];
    for (const id of ['a', 'b', 'c', 'd']) {
      const r = wateringReward(l, id, D0, 1);
      paid.push(r.water);
      l = r.ledger;
    }
    expect(paid).toEqual([5, 5, 5, 0]);
    expect(wateringReward(l, 'a', day(1), 3)).toMatchObject({ water: 5, stage: 10 });
    const twice = wateringReward(wateringReward({}, 'a', day(1), 3).ledger, 'a', day(1), 3);
    expect(twice).toMatchObject({ water: 0, stage: 0 });
  });

  it('the move from one number keeps the balance to the acorn', () => {
    const owned = ['tree:birch' as const];
    const ledger = migrateWallet({ acorns: 135, earned: 335, paidOn: D0, paidToday: 2, sharedPaid: [] }, owned, 'dev1');
    expect(ledger).toEqual({ 'legacy:dev1': 335 });
    expect(walletOf(ledger, { ...newShop(), owned })).toEqual({ acorns: 135, earned: 335 });
    expect(balanceOf(migrateWallet({ acorns: 50, earned: 0 }, [], 'd'), [])).toBe(50);
    expect(migrateWallet(undefined, [], 'd')).toEqual({});
    expect(migrateWallet({ ledger: { 'w:t:2026-10-01': 5, bad: 'x' } }, [], 'd')).toEqual({ 'w:t:2026-10-01': 5 });
  });

  it('the same item bought on two phones costs once', () => {
    const ledger: Ledger = { 'legacy:x': 500 };
    const a = buy(newShop(), ledger, 'tree:birch');
    const b = buy(newShop(), ledger, 'tree:birch');
    expect(a.result).toBe('ok');
    const shop = mergeShop(a.shop, b.shop);
    expect(shop.owned).toEqual(['tree:birch']);
    expect(balanceOf(ledger, shop.owned)).toBe(START_ACORNS + 500 - 250);
    expect(buy(newShop(), {}, 'tree:birch').result).toBe('poor');
  });

  it('old months fold into a sum per tree and one for the rest; the balance stays', () => {
    let l: Ledger = {};
    for (let d = 0; d < 120; d++) for (const id of ['a', 'b', 'c', 'd']) l = wateringReward(l, id, day(d), 1).ledger;
    const before = balanceOf(l, []);
    const today = day(120);
    const p = pruneLedger(l, today);
    expect(balanceOf(p, [])).toBe(before);
    expect(Object.keys(p).length).toBeLessThan(Object.keys(l).length);
    // Each tree's month is its own sum (3 a day count: a, b, c); nothing else earned: m: is 0.
    expect(p['m:2026-10']).toBe(0);
    expect([p['mt:a:2026-10'], p['mt:b:2026-10'], p['mt:c:2026-10'], p['mt:d:2026-10']]).toEqual([31 * 5, 31 * 5, 31 * 5, undefined]);
    expect(pruneLedger(p, today)).toEqual(p);
    // A late key for a folded month changes nothing.
    expect(balanceOf(mergeLedger(p, { 'w:z:2026-10-05': 5 }), [])).toBe(before);
    // A year of daily play stays small.
    expect(JSON.stringify(pruneLedger(l, day(400))).length).toBeLessThan(4096);
  });
});

describe('quests, achievements, the meadow', () => {
  const q = (o: Partial<Quests>): Quests => ({ ...newQuests(), day: D0, ids: ['waterAll', 'visitForest', 'nameTree'], ...o });

  it('the same day: the first pick stays, done and claimed add up', () => {
    const a = q({ rolledAt: S(100), done: ['waterAll'], claimed: ['waterAll'] });
    const b = q({ rolledAt: S(200), ids: ['waterAll', 'moveTree', 'plantHabit'], done: ['waterAll', 'moveTree', 'visitForest'] });
    const m = mergeQuests(a, b);
    expect(m.ids).toEqual(a.ids);
    expect(m.done).toEqual(['waterAll', 'visitForest']);
    expect(m.claimed).toEqual(['waterAll']);
    expect(mergeQuests(b, a)).toEqual(m);
  });

  it('different days: the later day; the best run is the larger', () => {
    const a = q({ day: D0, best: 5, streak: 2, streakDay: D0 });
    const b = q({ day: day(1), best: 3, streak: 0, streakDay: null });
    expect(mergeQuests(a, b)).toMatchObject({ day: day(1), best: 5, streak: 2, streakDay: D0 });
  });

  it('achievements claimed anywhere, with the earlier day', () => {
    expect(mergeClaimed({ firstWater: day(2) }, { firstWater: day(1), days7: day(3) })).toEqual({ firstWater: day(1), days7: day(3) });
  });

  it('the meadow put on last wins', () => {
    const a = { ...newShop(), owned: ['meadow:winter' as const], meadow: 'winter' as const, meadowAt: S(300) };
    const b = { ...newShop(), meadow: 'summer' as const, meadowAt: S(100) };
    expect(mergeShop(a, b).meadow).toBe('winter');
    expect(mergeShop(b, a).meadow).toBe('winter');
  });
});
