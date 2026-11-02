// Watering time (OYUUR-33/34): the cases of design/oyuur-33/спец.md, 11.2 (numbers in the names).
import { describe, expect, it } from '@jest/globals';
import { addDays, gameClock, gameDay } from '../dates';
import { wateringReward } from '../economy';
import { newQuests, rollQuests } from '../quests';
import { bothWatered, canWaterHalf, myHalf, setMyHour, SharedTree, sharedAsTree } from '../shared';
import {
  canWaterAt,
  checkIn,
  complete,
  defaultOpenHour,
  isDead,
  migrateOpenHours,
  migrateTrees,
  minutesUntilOpen,
  nextOpenHour,
  openHourOn,
  plantFromSeed,
  plantTree,
  setOpenHour,
  settle,
  Tree,
  wateringOpensAt,
} from '../tree';

const D0 = '2026-10-05';
const D1 = addDays(D0, 1);
const D2 = addDays(D0, 2);
const at = (hour: number, minute = 0) => ({ hour, minute });
const quit = (today = D0, openHour?: number) => plantTree({ id: 'q', name: 'No smoking', kind: 'quit', visibility: 'private', today, openHour });
const doer = (today = D0) => plantTree({ id: 'd', name: 'Run', kind: 'do', visibility: 'private', today });

/** A tree planted `n` days before `day`, watered every day up to the day before. */
function older(tree: Tree, n = 3, day = D0): Tree {
  for (let i = n; i >= 1; i--) tree = checkIn(tree, addDays(day, -i)).tree;
  return tree;
}

/** A fake local clock: only what gameDay/gameClock read. */
const wall = (y: number, mo: number, d: number, h: number, mi = 0) =>
  ({ getFullYear: () => y, getMonth: () => mo - 1, getDate: () => d, getHours: () => h, getMinutes: () => mi }) as unknown as Date;

describe('default hour and planting', () => {
  it('1–2: by the kind of habit', () => {
    expect(quit().openHours).toEqual([{ from: D0, hour: 18 }]);
    expect(doer().openHours).toEqual([{ from: D0, hour: 0 }]);
    expect(defaultOpenHour('quit')).toBe(18);
    expect(defaultOpenHour('do')).toBe(0);
  });

  it('3: an explicit hour for any kind', () => {
    expect(quit(D0, 12).openHours[0].hour).toBe(12);
    expect(plantTree({ id: 'x', name: 'Read', kind: 'do', visibility: 'private', today: D0, openHour: 12 }).openHours[0].hour).toBe(12);
  });

  it("4: a seed takes the parent's current hour from its own planting day", () => {
    let parent = setOpenHour(quit(), 21, D0);
    parent = { ...parent, diedOn: D2 };
    const child = plantFromSeed(parent, 'c', addDays(D0, 5));
    expect(child.openHours).toEqual([{ from: addDays(D0, 5), hour: 21 }]);
  });

  it('5: a bad hour is refused (planting — the default; a change — no change); migration — any time', () => {
    for (const bad of [-1, 24, 12.5, NaN]) {
      expect(quit(D0, bad).openHours[0].hour).toBe(18);
      const t = quit();
      expect(setOpenHour(t, bad, D0)).toBe(t);
    }
    expect(quit(D0, 23).openHours[0].hour).toBe(23);
    expect(migrateOpenHours([{ from: D0, hour: 30 }], D0)).toEqual([{ from: D0, hour: 0 }]);
  });
});

describe('watering before and after the hour', () => {
  const t = older(quit(addDays(D0, -3))); // not the planting day

  it('6: 17:59 — early, nothing changes', () => {
    const r = checkIn(t, D0, at(17, 59));
    expect(r.result).toBe('early');
    expect(r.tree.checkins).toEqual(t.checkins);
  });

  it('7–8: 18:00 and 23:59 — grown', () => {
    expect(checkIn(t, D0, at(18)).result).toBe('grown');
    expect(checkIn(t, D0, at(23, 59)).result).toBe('grown');
  });

  it('9: any time at 0:00', () => {
    expect(checkIn(doer(addDays(D0, -3)), D0, at(0)).result).toBe('grown');
  });

  it('10: the planting day is open at once', () => {
    expect(wateringOpensAt(quit(), D0)).toBe(0);
    expect(checkIn(quit(), D0, at(9)).result).toBe('grown');
  });

  it('11: the day after planting, 9:00 — early', () => {
    expect(checkIn(quit(), D1, at(9)).result).toBe('early');
  });

  it('12: already watered beats early', () => {
    const watered = checkIn(quit(), D0, at(9)).tree;
    expect(checkIn(watered, D0, at(10)).result).toBe('already');
  });

  it('13: a judged day (clock went back) is closed, not early', () => {
    const settled = settle(t, D2);
    expect(checkIn(settled, D0, at(9)).result).toBe('closed');
  });

  it('14: dead and locked-in trees', () => {
    expect(checkIn({ ...t, diedOn: D0 }, D1, at(9)).result).toBe('dead');
    expect(checkIn(complete(t, D0), D0, at(9)).result).toBe('completed');
  });

  it('15: without a clock — as before', () => {
    expect(checkIn(t, D0).result).toBe('grown');
  });

  it('minutes left for the countdown', () => {
    expect(minutesUntilOpen(t, D0, at(17, 18))).toBe(42);
    expect(minutesUntilOpen(t, D0, at(18, 5))).toBe(0);
    expect(canWaterAt(t, D0, at(17, 59))).toBe(false);
  });
});

describe('judging and chances', () => {
  const t = older(quit(addDays(D0, -3)));

  it('16: early spends nothing; watered in the evening — the day counts', () => {
    const early = checkIn(t, D0, at(9)).tree;
    expect(early.chancesLeft).toBe(3);
    expect(early.frozen).toEqual([]);
    const evening = checkIn(early, D0, at(19));
    expect(evening.result).toBe('grown');
    expect(evening.tree.checkins).toEqual([...t.checkins, D0]);
  });

  it('17: only early all day — a chance goes when the day is over', () => {
    let x = settle(t, D0);
    x = checkIn(x, D0, at(9)).tree;
    x = checkIn(x, D0, at(17)).tree;
    const next = settle(x, D1);
    expect(next.frozen).toContain(D0);
  });

  it('18: no chances, only early — the tree dies', () => {
    let x = { ...settle(t, D0), chancesLeft: 0 };
    x = checkIn(x, D0, at(9)).tree;
    const next = settle(x, D1);
    expect(isDead(next)).toBe(true);
    expect(next.diedOn).toBe(D0);
  });

  it('19: settle does not depend on the hour', () => {
    const a = settle(quit(addDays(D0, -3)), D2);
    const b = settle(plantTree({ id: 'q', name: 'No smoking', kind: 'quit', visibility: 'private', today: addDays(D0, -3), openHour: 0 }), D2);
    expect({ ...a, openHours: [] }).toEqual({ ...b, openHours: [] });
  });
});

describe('changing the hour', () => {
  const t = quit(addDays(D0, -3));

  it('20–21: to 6 — today still 18, tomorrow 6', () => {
    const x = setOpenHour(t, 6, D0);
    expect(checkIn(x, D0, at(9)).result).toBe('early');
    expect(checkIn(x, D1, at(9)).result).toBe('grown');
    expect(nextOpenHour(x, D0)).toBe(6);
  });

  it('22: 6 → 18 — today still 6, tomorrow 18', () => {
    const six = quit(addDays(D0, -3), 6);
    const x = setOpenHour(six, 18, D0);
    expect(checkIn(x, D0, at(9)).result).toBe('grown');
    expect(checkIn(x, D1, at(9)).result).toBe('early');
  });

  it('23: two changes a day — one entry for tomorrow', () => {
    const x = setOpenHour(setOpenHour(t, 12, D0), 21, D0);
    expect(x.openHours).toEqual([...t.openHours, { from: D1, hour: 21 }]);
  });

  it("24: back to today's hour — the change is dropped", () => {
    const x = setOpenHour(setOpenHour(t, 12, D0), 18, D0);
    expect(x.openHours).toEqual(t.openHours);
    expect(nextOpenHour(x, D0)).toBeNull();
    expect(setOpenHour(t, 18, D0)).toBe(t);
  });

  it('25: the hour of any day, for friends and history', () => {
    const x = setOpenHour(t, 6, D0);
    expect(openHourOn(x, D0)).toBe(18);
    expect(openHourOn(x, D2)).toBe(6);
  });

  it('26: dead and locked-in trees stay as they are', () => {
    const dead = { ...t, diedOn: D0 };
    expect(setOpenHour(dead, 6, D0)).toBe(dead);
    const done = complete(t, D0);
    expect(setOpenHour(done, 6, D0)).toBe(done);
  });
});

describe('saved data', () => {
  it('27: an old tree has any time and is watered at 9:00', () => {
    const { openHours: _, ...old } = quit(addDays(D0, -3));
    const [x] = migrateTrees([old]);
    expect(x.openHours).toEqual([{ from: addDays(D0, -3), hour: 0 }]);
    expect(checkIn(x, D0, at(9)).result).toBe('grown');
  });

  it('28: damaged hours are cleaned', () => {
    expect(migrateOpenHours('18', D0)).toEqual([{ from: D0, hour: 0 }]);
    expect(migrateOpenHours([{ from: D2, hour: 6 }, null, { from: 'x', hour: 3 }, { from: D0, hour: 18 }, { from: D1, hour: 2.5 }], D0)).toEqual([
      { from: D0, hour: 18 },
      { from: D2, hour: 6 },
    ]);
    // Starts after planting — the days before are any time.
    expect(migrateOpenHours([{ from: D1, hour: 18 }], D0)).toEqual([{ from: D0, hour: 0 }, { from: D1, hour: 18 }]);
  });

  it('29: migration keeps check-ins, frozen days and chances', () => {
    const tree: Partial<Tree> = { ...quit(addDays(D0, -9)), checkins: [addDays(D0, -9), addDays(D0, -8)], frozen: [addDays(D0, -7)], chancesLeft: 2 };
    delete tree.openHours;
    const [x] = migrateTrees([tree]);
    expect(x.checkins).toEqual(tree.checkins);
    expect(x.frozen).toEqual(tree.frozen);
    expect(x.chancesLeft).toBe(2);
  });
});

describe('the day until 3:00 at night', () => {
  it('30: 2:59 is yesterday, 3:00 is today', () => {
    expect(gameDay(wall(2026, 10, 15, 2, 59))).toBe('2026-10-14');
    expect(gameDay(wall(2026, 10, 15, 3, 0))).toBe('2026-10-15');
    expect(gameDay(wall(2026, 10, 15, 3, 0), 2)).toBe('2026-10-17');
    expect(gameClock(wall(2026, 10, 15, 1, 30))).toEqual({ hour: 25, minute: 30 });
    expect(gameClock(wall(2026, 10, 15, 18, 5))).toEqual({ hour: 18, minute: 5 });
  });

  it('31–33: watering at 1:30 counts for the day before', () => {
    const now = wall(2026, 10, 15, 1, 30);
    const t = quit('2026-10-10');
    const r = checkIn(t, gameDay(now), gameClock(now));
    expect(r.result).toBe('grown');
    expect(r.tree.checkins).toEqual(['2026-10-14']);
    expect(checkIn(r.tree, gameDay(now), gameClock(now)).result).toBe('already');
  });

  it('34: the 14th is judged only from 3:00 on the 15th', () => {
    const t = settle(older(quit('2026-10-10'), 4, '2026-10-14'), '2026-10-14');
    const before = settle(t, gameDay(wall(2026, 10, 15, 2, 0)));
    expect(before.frozen).not.toContain('2026-10-14');
    const after = settle(t, gameDay(wall(2026, 10, 15, 3, 0)));
    expect(after.frozen).toContain('2026-10-14');
  });

  it('35: the chance of the 1st comes at 3:00 on the 1st', () => {
    const t = { ...checkIn(settle(older(quit('2026-10-25'), 6, '2026-10-31'), '2026-10-31'), '2026-10-31').tree, chancesLeft: 1 };
    expect(t.frozen).toEqual([]);
    expect(settle(t, gameDay(wall(2026, 11, 1, 2, 59))).chancesLeft).toBe(1);
    expect(settle(t, gameDay(wall(2026, 11, 1, 3, 0))).chancesLeft).toBe(2);
  });

  it('36: daylight-saving nights neither skip nor repeat a day (Europe/Berlin wall clock)', () => {
    // Spring: 1:59 CET → 3:00 CEST. Autumn: 2:59 CEST → 2:00 CET (the 2 o'clock hour twice).
    const spring = [wall(2027, 3, 28, 1, 59), wall(2027, 3, 28, 3, 0)].map((d) => gameDay(d));
    expect(spring).toEqual(['2027-03-27', '2027-03-28']);
    const autumn = [wall(2026, 10, 25, 2, 30), wall(2026, 10, 25, 2, 59), wall(2026, 10, 25, 2, 0), wall(2026, 10, 25, 2, 59), wall(2026, 10, 25, 3, 0)].map((d) => gameDay(d));
    expect(autumn).toEqual(['2026-10-24', '2026-10-24', '2026-10-24', '2026-10-24', '2026-10-25']);
    expect(gameClock(wall(2027, 3, 28, 3, 0))).toEqual({ hour: 3, minute: 0 });
  });

  it('36: and with the real clock of the machine the day still turns at 3:00 local time', () => {
    const d = new Date(2026, 9, 15, 2, 59);
    expect(gameDay(d)).toBe('2026-10-14');
    expect(gameDay(new Date(2026, 9, 15, 3, 0))).toBe('2026-10-15');
  });

  it('37: quests and acorns by the game day — new quests at 3:00', () => {
    const ctx = { growing: 1, habits: 1, unnamed: false, friends: 0, shared: false };
    const q = rollQuests(newQuests(), gameDay(wall(2026, 10, 14, 20)), ctx);
    expect(rollQuests(q, gameDay(wall(2026, 10, 15, 2, 30)), ctx)).toBe(q);
    expect(rollQuests(q, gameDay(wall(2026, 10, 15, 3, 0)), ctx).day).toBe('2026-10-15');
    const l = wateringReward({}, 'a', gameDay(wall(2026, 10, 14, 20)), 1).ledger;
    expect(Object.keys(l)).toEqual(['w:a:2026-10-14']);
    // 1:00 at night is still the 14th: the same tree is not paid twice.
    expect(wateringReward(l, 'a', gameDay(wall(2026, 10, 15, 1)), 2).ledger).toBe(l);
  });
});

describe('shared tree', () => {
  const person = (nick: string) => ({ nick, name: null, avatar: 'a', color: 0 });
  const s = (kind: 'do' | 'quit', plantedOn = D0): SharedTree => ({
    id: 's1', name: 'Together', kind, skin: 'oak', status: 'active', plantedOn, createdAt: 0, endedAt: null,
    proposer: person('me'), partner: person('mei'), waterings: { me: [D0], mei: [D0] },
  });

  it('38: each has their own hours; the tree still grows by days both watered', () => {
    const mine = setMyHour(myHalf(s('quit'), undefined, D0), 6, D0);
    expect(mine).toEqual([{ from: D0, hour: 18 }, { from: D1, hour: 6 }]);
    expect(myHalf(s('do'), undefined, D0).openHours).toEqual([{ from: D0, hour: 0 }]);
    expect(bothWatered(s('quit'))).toEqual([D0]);
    expect(sharedAsTree(s('quit'), D0).checkins).toEqual([D0]);
  });

  it('39: my half before my hour — not open', () => {
    const half = myHalf(s('quit', addDays(D0, -3)), undefined, D0);
    expect(canWaterAt(half, D0, at(9))).toBe(false);
    expect(canWaterAt(half, D0, at(18))).toBe(true);
  });

  it('40: the planting day is open for both', () => {
    expect(canWaterAt(myHalf(s('quit'), undefined, D0), D0, at(0))).toBe(true);
  });
});

describe('review fixes', () => {
  const person = (nick: string) => ({ nick, name: null, avatar: 'a', color: 0 });
  const s = (plantedOn: string): SharedTree => ({
    id: 's1', name: 'Together', kind: 'quit', skin: 'oak', status: 'active', plantedOn, createdAt: 0, endedAt: null,
    proposer: person('me'), partner: person('mei'), waterings: {},
  });

  it('a shared tree from before the update stays any time; one planted later goes by its kind', () => {
    expect(myHalf(s('2026-10-01'), undefined, D0, D0).openHours).toEqual([{ from: '2026-10-01', hour: 0 }]);
    expect(myHalf(s(D1), undefined, D2, D0).openHours).toEqual([{ from: D1, hour: 18 }]);
  });

  it('my half is never open before its planting day (the 3:00 day can be behind the friend)', () => {
    const half = myHalf(s(D1), undefined, D0);
    expect(canWaterHalf(half, D0, at(25))).toBe(false);
    expect(canWaterHalf(half, D1, at(9))).toBe(true);
  });

  it('a tree planted in the future (time travel) gets the hour on its first day', () => {
    const x = setOpenHour(quit(D2), 0, D0);
    expect(x.openHours).toEqual([{ from: D2, hour: 0 }]);
  });

  it('quests and acorns saved a day ahead (after midnight by 1.0) are not rolled or paid again', () => {
    const ctx = { growing: 1, habits: 1, unnamed: false, friends: 0, shared: false };
    const ahead = rollQuests(newQuests(), D1, ctx);
    expect(rollQuests(ahead, D0, ctx)).toBe(ahead);
    const l = { [`w:a:${D0}`]: 5, [`w:b:${D0}`]: 5, [`w:c:${D0}`]: 5 };
    expect(wateringReward(l, 'd', D0, 2).water).toBe(0);
  });
});
