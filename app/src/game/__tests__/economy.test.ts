import { describe, expect, it } from '@jest/globals';
import { addDays } from '../dates';
import {
  ACHIEVEMENTS,
  achievementViews,
  claimAchievement,
  Facts,
  longestRun,
  migrateClaimed,
  readyCount,
  statsOf,
} from '../achievements';
import {
  buy,
  CATALOG,
  chooseMeadow,
  earnedOf,
  mergeLedger,
  migrateShop,
  missing,
  newShop,
  ownedSkins,
  owns,
  pruneLedger,
  seeAffordable,
  sharedWateringReward,
  shopNews,
  START_ACORNS,
  treeOfKey,
  walletOf,
  wateringReward,
} from '../economy';
import { migrateProfile, newProfile, withProfile } from '../profile';
import { ALL_QUESTS_BONUS, claimQuest, migrateQuests, newQuests, QUEST_REWARD, QuestContext, questDone, questStreak, rollQuests, unclaimed } from '../quests';
import { checkIn, complete, plantFromSeed, plantTree, SKINS, Tree } from '../tree';

const D0 = '2026-10-05';
const plant = (id = 't1') => plantTree({ id, name: 'Run', kind: 'do', visibility: 'friends', today: D0 });
function grown(n: number, id = 't1'): Tree {
  let tree = plant(id);
  for (let i = 0; i < n; i++) tree = checkIn(tree, addDays(D0, i)).tree;
  return tree;
}

describe('wallet', () => {
  it('starts with 50 acorns', () => {
    expect(walletOf({}, newShop())).toEqual({ acorns: START_ACORNS, earned: 0 });
  });

  it('pays 5 for a watering, at most 3 trees a day', () => {
    let l = {};
    const paid: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = wateringReward(l, `t${i}`, D0, 1);
      paid.push(r.water);
      l = r.ledger;
    }
    expect(paid).toEqual([5, 5, 5, 0]);
    expect(walletOf(l, newShop())).toEqual({ acorns: START_ACORNS + 15, earned: 15 });
    expect(wateringReward(l, 't0', addDays(D0, 1), 2).water).toBe(5);
  });

  it('pays for a new stage on the day it comes, and only then', () => {
    expect(wateringReward({}, 't', D0, 3).stage).toBe(10);
    expect(wateringReward({}, 't', D0, 4).stage).toBe(0);
    expect(wateringReward({}, 't', D0, 7).stage).toBe(20);
    expect(wateringReward({}, 't', D0, 21).stage).toBe(40);
    expect(wateringReward({}, 't', D0, 50).stage).toBe(80);
    expect(wateringReward({}, 't', D0, 100).stage).toBe(150);
    expect(wateringReward({}, 't', D0, 101).stage).toBe(0);
  });

  it('a stage pays even past the daily watering limit', () => {
    let l = {};
    for (let i = 0; i < 3; i++) l = wateringReward(l, `t${i}`, D0, 1).ledger;
    expect(wateringReward(l, 'x', D0, 7)).toMatchObject({ water: 0, stage: 20 });
  });

  it('a shared tree half is paid once per tree and day', () => {
    let l = {};
    const first = sharedWateringReward(l, 's1', D0);
    expect(first.water).toBe(5);
    l = first.ledger;
    expect(sharedWateringReward(l, 's1', D0).water).toBe(0);
    expect(sharedWateringReward(l, 's2', D0).water).toBe(5);
    expect(sharedWateringReward(l, 's1', addDays(D0, 1)).water).toBe(5);
  });
});

describe('folding old months', () => {
  // October: X and Y watered on two days, a shared tree's half and a quest on the first; on the
  // second day four waterings (the 4th past the daily limit).
  const ledger = {
    'w:X:2026-10-01': 5,
    'w:Y:2026-10-01': 5,
    'sh:s1:2026-10-01': 5,
    'q:2026-10-01:walk': 10,
    'w:X:2026-10-02': 5,
    'w:Y:2026-10-02': 5,
    'w:Z:2026-10-02': 5,
    'w:W:2026-10-02': 5,
    'st:X:1': 10,
  };
  const today = '2027-01-15';

  it('keeps the balance', () => {
    expect(earnedOf(pruneLedger(ledger, today))).toBe(earnedOf(ledger));
    expect(earnedOf(pruneLedger(ledger, today, new Set(['X'])))).toBe(earnedOf(ledger));
  });

  it('two phones that saw a tree differently (hidden on one) count each reward once after a merge', () => {
    const total = earnedOf(ledger);
    const a = pruneLedger(ledger, today, new Set(['X']));
    const b = pruneLedger(ledger, today);
    expect(earnedOf(mergeLedger(a, b))).toBe(total);
    expect(earnedOf(mergeLedger(b, a))).toBe(total);
    // A phone that hadn't folded yet takes the folded month instead of its own keys.
    expect(earnedOf(mergeLedger(ledger, a))).toBe(total);
    expect(earnedOf(mergeLedger(b, ledger))).toBe(total);
  });

  it("a tree's folded sum is told by its tree: the account or the chest takes it by who sees the tree", () => {
    const folded = pruneLedger(ledger, today);
    const keys = Object.keys(folded).filter((k) => treeOfKey(k) === 'X');
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((k) => k === 'st:X:1' || !k.startsWith('w:'))).toBe(true);
  });

  it('a month folded elsewhere: trees whose part this phone alone has keep it as their own sum', () => {
    const elsewhere = pruneLedger({ 'w:Y:2026-10-01': 5 }, today);
    const mine = pruneLedger({ ...elsewhere, 'w:H:2026-10-03': 5, 'w:Y:2026-10-01': 5 }, today, new Set(['H']));
    expect(earnedOf(mine)).toBe(10);
  });
});

const rich = (n: number) => ({ 'legacy:x': n - START_ACORNS });

describe('shop', () => {
  it('the first three kinds and the summer meadow are free', () => {
    const shop = newShop();
    expect(ownedSkins(shop)).toEqual(['oak', 'sakura', 'spruce']);
    expect(owns(shop, 'meadow:summer')).toBe(true);
    expect(owns(shop, 'tree:birch')).toBe(false);
  });

  it('every kind of tree is in the catalog', () => {
    for (const skin of SKINS) expect(CATALOG.some((i) => i.id === `tree:${skin}`)).toBe(true);
  });

  it('buys when there are enough acorns', () => {
    const r = buy(newShop(), rich(300), 'tree:birch');
    expect(r.result).toBe('ok');
    expect(walletOf(rich(300), r.shop).acorns).toBe(50);
    expect(ownedSkins(r.shop)).toContain('birch');
    expect(buy(r.shop, rich(300), 'tree:birch').result).toBe('owned');
  });

  it('says how many are missing', () => {
    const shop = newShop();
    expect(buy(shop, {}, 'tree:birch')).toEqual({ result: 'poor', shop });
    expect(missing(walletOf({}, shop), 'tree:birch')).toBe(200);
    expect(buy(shop, {}, 'tree:oak').result).toBe('owned');
  });

  it('puts on only owned meadows', () => {
    const shop = newShop();
    expect(chooseMeadow(shop, 'winter')).toBe(shop);
    const bought = buy(shop, rich(800), 'meadow:winter').shop;
    expect(chooseMeadow(bought, 'winter').meadow).toBe('winter');
  });

  it('the dot: something new is affordable, until the shop is seen', () => {
    const shop = newShop();
    const w = { acorns: 260, earned: 210 };
    expect(shopNews(shop, walletOf({}, shop))).toBe(false);
    expect(shopNews(shop, w)).toBe(true);
    const seen = seeAffordable(shop, w);
    expect(seen.seenAffordable).toEqual(['tree:birch']);
    expect(shopNews(seen, w)).toBe(false);
    expect(shopNews(seen, { ...w, acorns: 400 })).toBe(true);
    expect(seeAffordable(seen, w)).toBe(seen);
  });

  it('saved shop keeps only known bought items', () => {
    const shop = migrateShop({ owned: ['tree:birch', 'tree:birch', 'tree:oak', 'tree:nope' as never], meadow: 'winter' });
    expect(shop).toEqual({ owned: ['tree:birch'], meadow: 'summer', seenAffordable: [] });
    expect(migrateShop({ owned: ['meadow:winter'], meadow: 'winter' }).meadow).toBe('winter');
  });
});

const ctx = (c: Partial<QuestContext> = {}): QuestContext => ({ growing: 2, habits: 2, unnamed: true, friends: 4, shared: true, ...c });

describe('quests', () => {
  it('three a day, watering first while trees grow', () => {
    const q = rollQuests(newQuests(), D0, ctx());
    expect(q.ids).toHaveLength(3);
    expect(q.ids[0]).toBe('waterAll');
    expect(new Set(q.ids).size).toBe(3);
  });

  it('a day picked before the first tree gets its three once a tree grows', () => {
    const bare = rollQuests(newQuests(), D0, ctx({ growing: 0, habits: 0, unnamed: false, friends: 0, shared: false }));
    expect(bare.ids).toEqual(['plantHabit']);
    const full = rollQuests(bare, D0, ctx({ growing: 1, habits: 1 }));
    expect(full.ids).toHaveLength(3);
    expect(full.ids[0]).toBe('waterAll');
    // Planting the first tree is done already: it stays done if it is among the three.
    const planted = rollQuests(questDone(bare, 'plantHabit', D0), D0, ctx({ growing: 1, habits: 1 }));
    expect(planted.ids).toHaveLength(3);
    expect(planted.done).toEqual(planted.ids.includes('plantHabit') ? ['plantHabit'] : []);
    // Once something is claimed, the day stays as it is.
    const claimed = claimQuest(questDone(bare, 'plantHabit', D0), 'plantHabit', D0).quests;
    expect(rollQuests(claimed, D0, ctx({ growing: 1, habits: 1 }))).toBe(claimed);
  });

  it('the same day keeps its quests', () => {
    const q = rollQuests(newQuests(), D0, ctx());
    expect(rollQuests(q, D0, ctx({ friends: 0 }))).toBe(q);
  });

  it('only quests that can be done', () => {
    const q = rollQuests(newQuests(), D0, ctx({ growing: 0, habits: 0, unnamed: false, friends: 0, shared: false }));
    expect(q.ids).toEqual(['plantHabit']);
    const r = rollQuests(newQuests(), D0, ctx({ friends: 0, shared: false, unnamed: false, habits: 1, growing: 1 }));
    expect(r.ids).toEqual(['waterAll', 'visitForest', 'plantHabit']);
  });

  it('not yesterday\'s again when there are others', () => {
    let q = rollQuests(newQuests(), D0, ctx());
    for (let i = 1; i < 6; i++) {
      const next = rollQuests(q, addDays(D0, i), ctx());
      const repeated = next.ids.slice(1).filter((id) => q.ids.includes(id));
      expect(repeated).toEqual([]);
      q = next;
    }
  });

  it('done, then claimed; all three give the bonus', () => {
    let q = rollQuests(newQuests(), D0, ctx());
    const [a, b, c] = q.ids;
    expect(claimQuest(q, a, D0).reward).toBe(0);
    q = questDone(questDone(questDone(q, a, D0), b, D0), c, D0);
    expect(unclaimed(q, D0)).toBe(3);
    let r = claimQuest(q, a, D0);
    expect(r.reward).toBe(QUEST_REWARD);
    r = claimQuest(r.quests, a, D0);
    expect(r.reward).toBe(0);
    r = claimQuest(r.quests, b, D0);
    r = claimQuest(r.quests, c, D0);
    expect(r.reward).toBe(QUEST_REWARD + ALL_QUESTS_BONUS);
    expect(questStreak(r.quests, D0)).toBe(1);
    expect(unclaimed(r.quests, D0)).toBe(0);
  });

  it('a quest not of today does not count', () => {
    const q = rollQuests(newQuests(), D0, ctx({ friends: 0, shared: false }));
    expect(questDone(q, 'cheerFriend', D0)).toBe(q);
    expect(questDone(q, 'waterAll', addDays(D0, 1))).toBe(q);
  });

  it('full days in a row make a streak; a missed day breaks it', () => {
    let q = newQuests();
    const fullDay = (day: string) => {
      q = rollQuests(q, day, ctx());
      for (const id of q.ids) q = questDone(q, id, day);
      for (const id of q.ids) q = claimQuest(q, id, day).quests;
    };
    fullDay(D0);
    fullDay(addDays(D0, 1));
    expect(questStreak(q, addDays(D0, 1))).toBe(2);
    expect(questStreak(q, addDays(D0, 3))).toBe(0);
    fullDay(addDays(D0, 3));
    expect(q.streak).toBe(1);
    expect(q.best).toBe(2);
  });

  it('damaged saved quests are fixed', () => {
    expect(migrateQuests({ ids: ['waterAll', 'bogus' as never], streak: -1 })).toMatchObject({ ids: ['waterAll'], streak: 0 });
  });
});

const facts = (f: Partial<Facts> = {}): Facts => ({ trees: [], bought: 0, questBest: 0, friends: 0, ...f });

describe('achievements', () => {
  it('nothing at the start (but friends)', () => {
    expect(readyCount(facts(), {})).toBe(0);
    expect(readyCount(facts({ friends: 4 }), {})).toBe(1);
  });

  it('days of growth reach the day achievements', () => {
    const v = achievementViews(facts({ trees: [grown(30)] }), {});
    const by = (id: string) => v.find((x) => x.id === id)!;
    expect(by('firstWater').state).toBe('ready');
    expect(by('days7').state).toBe('ready');
    expect(by('days30').state).toBe('ready');
    expect(by('days100')).toMatchObject({ state: 'locked', value: 30, goal: 100 });
    expect(by('noMiss30').state).toBe('ready');
  });

  it('a frozen day breaks the run without misses', () => {
    let tree = grown(10);
    // Day 10 is missed (frozen), then 25 more days.
    for (let i = 11; i < 36; i++) tree = checkIn(tree, addDays(D0, i)).tree;
    expect(tree.frozen).toEqual([addDays(D0, 10)]);
    expect(longestRun(tree)).toBe(25);
  });

  it('claimed once, with the day', () => {
    const f = facts({ trees: [grown(1)] });
    const r = claimAchievement({}, 'firstWater', f, D0);
    expect(r.reward).toBe(20);
    expect(claimAchievement(r.claimed, 'firstWater', f, D0).reward).toBe(0);
    expect(claimAchievement({}, 'days7', f, D0).reward).toBe(0);
    expect(achievementViews(facts(), r.claimed)[0]).toMatchObject({ state: 'claimed', claimedOn: D0, value: 1 });
  });

  it('lock-in, seed, name, shop, quests', () => {
    const t = grown(3);
    const dead = { ...t, diedOn: addDays(D0, 5) };
    const seed = plantFromSeed(dead, 't2', addDays(D0, 6));
    const f = facts({ trees: [complete(grown(3, 'x'), D0), dead, seed, { ...t, id: 'n', namedOn: D0 }], bought: 1, questBest: 7 });
    const ready = achievementViews(f, {}).filter((v) => v.state === 'ready').map((v) => v.id);
    expect(ready).toEqual(expect.arrayContaining(['firstLockIn', 'seedTree', 'firstName', 'firstBuy', 'quests7']));
  });

  it('every achievement has a reward', () => {
    for (const a of ACHIEVEMENTS) expect(a.reward).toBeGreaterThan(0);
  });

  it('saved claims keep only known ones', () => {
    expect(migrateClaimed({ firstWater: D0, nope: D0, days7: 3 })).toEqual({ firstWater: D0 });
    expect(migrateClaimed(null)).toEqual({});
  });

  it('stats', () => {
    const s = statsOf([grown(5), complete(grown(2, 'b'), D0), { ...grown(1, 'c'), diedOn: D0 }]);
    expect(s).toEqual({ waterings: 8, growing: 1, lockedIn: 1, memories: 1, bestDays: 5 });
  });
});

describe('profile', () => {
  it('name follows the tree name rules', () => {
    expect(withProfile(newProfile(), { name: '  Аня🌳 ' }).name).toBe('Аня');
    expect(withProfile(newProfile(), { name: '   ' }).name).toBeNull();
  });

  it('unknown avatar or color is ignored', () => {
    const p = withProfile(newProfile(), { avatar: 'dragon' as never, color: 99 });
    expect(p).toEqual(newProfile());
    expect(migrateProfile({ name: 'Bo', avatar: 'owl', color: 3 })).toEqual({ name: 'Bo', avatar: 'owl', color: 3 });
  });
});
