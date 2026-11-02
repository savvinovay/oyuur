// OYUUR-43: plant many trees, water them, delete them — and acorns without end. These tests play
// the farm the way the store does (store.tsx: tapTree, the daily pass) and count what it pays.
import { describe, expect, it } from '@jest/globals';
import { ACHIEVEMENTS, claimAchievement, Claimed } from '../achievements';
import { addDays, DayKey } from '../dates';
import {
  earnedOf,
  Ledger,
  mergeLedger,
  migrateStageCount,
  newStageCount,
  owedStageRewards,
  sharedWateringReward,
  STAGE_PAID_PER_DAY,
  STAGE_REWARDS,
  StageCount,
  stageKey,
  wateringReward,
} from '../economy';
import { claimQuest, newQuests, questDone, rollQuests } from '../quests';
import { checkIn, growthDays, plantFromSeed, plantTree, Tree } from '../tree';

const D0 = '2026-11-02';
const day = (n: number) => addDays(D0, n);

/** One phone: its trees, the journal and the stage count, run as store.tsx runs them. */
class Phone {
  trees: Tree[] = [];
  ledger: Ledger = {};
  count: StageCount;
  private n = 0;
  constructor(start: DayKey = D0) {
    this.count = newStageCount(start);
  }
  plant(today: DayKey, n = 1) {
    for (let i = 0; i < n; i++) this.trees.push(plantTree({ id: `t${this.n++}`, name: 'x', kind: 'do', visibility: 'friends', today }));
  }
  /** tapTree: the watering, its stage, then stages waiting from other days. */
  water(id: string, today: DayKey) {
    const tree = this.trees.find((t) => t.id === id)!;
    const out = checkIn(tree, today);
    if (out.result !== 'grown') return;
    this.trees = this.trees.map((t) => (t.id === id ? out.tree : t));
    const r = wateringReward(this.ledger, id, today, growthDays(out.tree), this.count);
    const owed = owedStageRewards(r.ledger, [out.tree, ...this.trees.filter((t) => t.id !== id)], today, r.count);
    this.ledger = owed.ledger;
    this.count = owed.count;
  }
  waterAll(today: DayKey) {
    for (const t of [...this.trees]) this.water(t.id, today);
  }
  /** The pass when the day changes (the app opened on a new day). */
  newDay(today: DayKey) {
    const owed = owedStageRewards(this.ledger, this.trees, today, this.count);
    this.ledger = owed.ledger;
    this.count = owed.count;
  }
  deleteAll() {
    this.trees = [];
  }
  stagesPaid() {
    return Object.entries(this.ledger).filter(([k]) => k.startsWith('st:'));
  }
}

/** What the stages paid on one phone, by day: the farm can't make more than the limit. */
function farm(cycles: number, trees: number) {
  const phone = new Phone();
  const byDay: number[] = [];
  let d = 0;
  for (let c = 0; c < cycles; c++) {
    phone.plant(day(d), trees);
    for (let i = 0; i < 3; i++, d++) {
      const before = phone.stagesPaid().length;
      phone.newDay(day(d));
      phone.waterAll(day(d));
      byDay.push(phone.stagesPaid().length - before);
    }
    phone.deleteAll();
  }
  return { phone, byDay };
}

describe('OYUUR-43: the stage farm', () => {
  it('20 trees, 3 days of watering, delete, again: at most 3 stage rewards a day', () => {
    const { phone, byDay } = farm(4, 20);
    expect(Math.max(...byDay)).toBe(STAGE_PAID_PER_DAY);
    // Before the fix: 20 × 10 every third day = 800 for 12 days; now 3 × 10 on each third day.
    expect(phone.stagesPaid().reduce((n, [, a]) => n + a, 0)).toBe(4 * STAGE_PAID_PER_DAY * 10);
  });

  it('100 trees kept for 7 days: still 3 stage rewards a day, the rest wait', () => {
    const phone = new Phone();
    phone.plant(D0, 100);
    for (let d = 0; d < 7; d++) {
      const before = phone.stagesPaid().length;
      phone.newDay(day(d));
      phone.waterAll(day(d));
      expect(phone.stagesPaid().length - before).toBeLessThanOrEqual(STAGE_PAID_PER_DAY);
    }
  });

  it('trees from seeds count in the same limit', () => {
    const phone = new Phone();
    phone.plant(D0, 10);
    // Ten dead trees, ten new generations planted the same day.
    phone.trees = phone.trees.map((t) => ({ ...t, diedOn: D0 }));
    phone.trees = phone.trees.map((t, i) => plantFromSeed(t, `s${i}`, day(1)));
    for (let d = 1; d <= 3; d++) phone.waterAll(day(d));
    expect(phone.stagesPaid().length).toBe(STAGE_PAID_PER_DAY);
  });

  it('a tree deleted before its turn takes its waiting reward with it', () => {
    const phone = new Phone();
    phone.plant(D0, 5);
    for (let d = 0; d < 3; d++) phone.waterAll(day(d));
    phone.deleteAll();
    phone.plant(day(3), 1);
    phone.newDay(day(3));
    expect(phone.stagesPaid().length).toBe(STAGE_PAID_PER_DAY);
  });

  it('moving the date of the phone back and forth gives no more room', () => {
    const phone = new Phone();
    phone.plant(D0, 20);
    for (let d = 0; d < 3; d++) phone.waterAll(day(d));
    expect(phone.stagesPaid().length).toBe(STAGE_PAID_PER_DAY);
    for (let i = 0; i < 5; i++) {
      phone.newDay(day(1));
      phone.newDay(day(2));
    }
    expect(phone.stagesPaid().length).toBe(STAGE_PAID_PER_DAY);
  });

  it('the plant quest pays once a day, whatever is planted', () => {
    let q = rollQuests(newQuests(), D0, { growing: 0, habits: 0, unnamed: false, friends: 0, shared: false });
    expect(q.ids).toContain('plantHabit');
    let paid = 0;
    for (let i = 0; i < 20; i++) {
      q = questDone(q, 'plantHabit', D0);
      const r = claimQuest(q, 'plantHabit', D0);
      q = r.quests;
      paid += r.reward;
    }
    expect(paid).toBeLessThanOrEqual(10 + 15);
  });

  it('achievements pay once, deleting and planting again changes nothing', () => {
    const trees = Array.from({ length: 10 }, (_, i) => checkIn(plantTree({ id: `a${i}`, name: 'x', kind: 'do', visibility: 'friends', today: D0 }), D0).tree);
    let claimed: Claimed = {};
    let paid = 0;
    for (let round = 0; round < 3; round++) {
      for (const a of ACHIEVEMENTS) {
        const r = claimAchievement(claimed, a.id, { trees, bought: 0, questBest: 0, friends: 0 }, day(round));
        claimed = r.claimed;
        paid += r.reward;
      }
    }
    expect(paid).toBe(20 + 30 + 100); // firstWater, trees3, trees10 — once
  });

  it('shared trees stay within the daily watering limit', () => {
    let l: Ledger = {};
    for (let i = 0; i < 20; i++) l = sharedWateringReward(l, `s${i}`, D0).ledger;
    expect(earnedOf(l)).toBe(15);
  });
});

describe('OYUUR-43: an honest player loses nothing', () => {
  it('5 habits planted together get every stage reward, a day or two later at most', () => {
    const phone = new Phone();
    phone.plant(D0, 5);
    for (let d = 0; d < 110; d++) {
      phone.newDay(day(d));
      phone.waterAll(day(d));
    }
    const all = STAGE_REWARDS.reduce((n, a) => n + a, 0);
    expect(phone.stagesPaid().reduce((n, [, a]) => n + a, 0)).toBe(5 * all);
    // Day 3 (index 2): 3 paid, the other 2 the next day.
    expect(phone.ledger[stageKey('t3', 1)]).toBe(10);
  });

  it('a tree past the limit gets its stage the next day even if it is not watered then', () => {
    const phone = new Phone();
    phone.plant(D0, 4);
    for (let d = 0; d < 3; d++) phone.waterAll(day(d));
    expect(phone.stagesPaid().length).toBe(3);
    phone.trees = phone.trees.map((t) => ({ ...t, completedOn: day(2) })); // locked in
    phone.newDay(day(3));
    expect(phone.stagesPaid().length).toBe(4);
  });

  it('three habits — all paid on the day, as before', () => {
    const phone = new Phone();
    phone.plant(D0, 3);
    for (let d = 0; d < 3; d++) phone.waterAll(day(d));
    expect(phone.stagesPaid().length).toBe(3);
  });

  it('stages reached before the count began are not paid twice (an old player)', () => {
    let tree = plantTree({ id: 'old', name: 'x', kind: 'do', visibility: 'friends', today: D0 });
    for (let d = 0; d < 30; d++) tree = checkIn(tree, day(d)).tree;
    // Paid back then and folded into legacy: — no st: keys in the journal.
    const ledger: Ledger = { 'legacy:dev': 300 };
    const count = migrateStageCount(undefined, day(30));
    const r = owedStageRewards(ledger, [tree], day(30), count);
    expect(r.paid).toEqual([]);
    expect(r.ledger).toBe(ledger);
  });

  it('a stage paid on the other phone is not paid again after a merge', () => {
    const a = new Phone();
    a.plant(D0, 1);
    for (let d = 0; d < 3; d++) a.waterAll(day(d));
    const b = new Phone();
    b.trees = a.trees;
    b.ledger = mergeLedger(b.ledger, a.ledger);
    b.newDay(day(3));
    expect(earnedOf(b.ledger)).toBe(earnedOf(a.ledger));
  });

  it('the saved count comes back, damaged — a new one', () => {
    expect(migrateStageCount({ since: D0, day: day(2), paid: 2 }, day(5))).toEqual({ since: D0, day: day(2), paid: 2 });
    expect(migrateStageCount({ since: 'x', paid: -1 }, day(5))).toEqual(newStageCount(day(5)));
    expect(migrateStageCount({ since: D0, day: 7, paid: 2 }, day(5))).toEqual({ since: D0, day: null, paid: 0 });
  });
});
