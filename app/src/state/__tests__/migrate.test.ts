// A save of the 1.0 APK (data version 4) opened by the version with the watering time (5).
import { describe, expect, it } from '@jest/globals';
import { migrateClaimed } from '@/game/achievements';
import { balanceOf, migrateShop, migrateWallet } from '@/game/economy';
import { migratePlot } from '@/game/plot';
import { migrateQuests } from '@/game/quests';
import { checkIn, groupHabits, growthDays, migrateTrees, settle, Tree } from '@/game/tree';
import { migrateEveningOffer, migrateSharedHours } from '../migrate';

// Exactly what 1.0 writes to storage (store.tsx of v1.0): trees without `openHours`, no evening offer.
const V1_0 = `{"version":4,"trees":[
{"id":"mh1a2b3c","lineageId":"mh1a2b3c","name":"Не курить","kind":"quit","visibility":"friends","skin":"oak","plantedOn":"2026-10-20","checkins":["2026-10-20","2026-10-21","2026-10-23","2026-10-24"],"frozen":["2026-10-22"],"chancesLeft":2,"refilledMonth":"2026-10","settledThrough":"2026-10-24","diedOn":null,"completedOn":null,"generation":1,"parentId":null,"nickname":"Дубок","namedOn":"2026-10-21","nameAsks":1,"nameAskedOn":"2026-10-21","nameLaterOn":null},
{"id":"mh4d5e6f","lineageId":"mh4d5e6f","name":"Бег","kind":"do","visibility":"private","skin":"birch","plantedOn":"2026-10-22","checkins":["2026-10-22","2026-10-23","2026-10-24"],"frozen":[],"chancesLeft":3,"refilledMonth":"2026-10","settledThrough":"2026-10-24","diedOn":null,"completedOn":null,"generation":1,"parentId":null,"nickname":null,"namedOn":null,"nameAsks":0,"nameAskedOn":null,"nameLaterOn":null},
{"id":"mh7g8h9i","lineageId":"mh7g8h9i","name":"Без сладкого","kind":"quit","visibility":"private","skin":"sakura","plantedOn":"2026-10-01","checkins":["2026-10-01"],"frozen":["2026-10-02","2026-10-03","2026-10-04"],"chancesLeft":0,"refilledMonth":"2026-10","settledThrough":"2026-10-05","diedOn":"2026-10-05","completedOn":null,"generation":1,"parentId":null,"nickname":null,"namedOn":null,"nameAsks":0,"nameAskedOn":null,"nameLaterOn":null}],
"settings":{"theme":"auto","animations":true,"vibration":true,"sounds":true,"menuHintSeen":true,"language":"auto","dayOffset":0},
"plot":{"size":4,"places":{"mh1a2b3c":{"c":1,"r":1},"mh4d5e6f":{"c":2,"r":1},"mh7g8h9i":{"c":1,"r":2}},"seen":["mh1a2b3c","mh4d5e6f","mh7g8h9i"],"shownSize":4},
"wallet":{"acorns":135,"earned":85,"paidOn":"2026-10-24","paidToday":2,"sharedPaid":[]},
"shop":{"owned":["tree:birch"],"meadow":"summer","seenAffordable":["tree:birch"]},
"quests":{"day":"2026-10-24","ids":["waterAll","visitForest","moveTree"],"done":["waterAll"],"claimed":["waterAll"],"bonus":false,"streak":0,"streakDay":null,"best":0},
"achievements":{"firstWater":"2026-10-20"},"announced":["firstWater"],
"profile":{"name":null,"avatar":"fox","color":2}}`;

describe('a 1.0 save in the version with the watering time', () => {
  const saved = JSON.parse(V1_0);
  const old = saved.trees as Tree[];
  const trees = migrateTrees(saved.trees);

  it('keeps every tree as it was, with "any time" added', () => {
    expect(trees).toHaveLength(3);
    trees.forEach((t, i) => {
      const { openHours, ...rest } = t;
      expect(rest).toEqual(old[i]);
      expect(openHours).toEqual([{ from: old[i].plantedOn, hour: 0 }]);
    });
  });

  it('old trees still water in the morning, "Quit" included', () => {
    const [noSmoking, run] = trees.map((t) => settle(t, '2026-10-25'));
    expect(checkIn(noSmoking, '2026-10-25', { hour: 8, minute: 0 }).result).toBe('grown');
    expect(checkIn(run, '2026-10-25', { hour: 8, minute: 0 }).result).toBe('grown');
    expect(growthDays(trees[0])).toBe(4);
    expect(trees[0].chancesLeft).toBe(2);
    expect(trees[0].frozen).toEqual(['2026-10-22']);
  });

  it('the evening offer waits for those with a growing "Quit" tree, once', () => {
    expect(migrateEveningOffer(saved, trees)).toBe('pending');
    expect(migrateEveningOffer({ ...saved, version: 5, eveningOffer: 'done' }, trees)).toBe('done');
    // Only "Do" trees, or the "Quit" one is dead: nothing to offer.
    expect(migrateEveningOffer(saved, [trees[1], trees[2]])).toBe('done');
    // A new player (version 5 from the start) never gets it.
    expect(migrateEveningOffer({ version: 5 }, trees)).toBe('done');
  });

  it('the rest of the save is untouched', () => {
    expect(migratePlot(saved.plot, groupHabits(trees).map((h) => ({ lineageId: h.lineageId, days: growthDays(h.current) }))).places).toEqual(saved.plot.places);
    expect(balanceOf(migrateWallet(saved.wallet, ['tree:birch'], 'd1'), ['tree:birch'])).toBe(135);
    expect(migrateShop(saved.shop).owned).toEqual(["tree:birch"]);
    expect(migrateQuests(saved.quests).claimed).toEqual(['waterAll']);
    expect(migrateClaimed(saved.achievements)).toEqual(saved.achievements);
    expect(migrateSharedHours(saved.sharedHours)).toEqual({});
  });

  it('my hours of shared trees are read back, damaged ones dropped', () => {
    expect(migrateSharedHours({ s1: [{ from: '2026-10-20', hour: 18 }], s2: 'x', s3: [{ from: 'bad', hour: 1 }] })).toEqual({ s1: [{ from: '2026-10-20', hour: 18 }] });
  });
});
