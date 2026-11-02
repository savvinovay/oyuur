// Acorns: the game currency (wave 5, design/волна-5/решения.md). Pure functions: no storage, no UI.
// - A new player gets 50 acorns.
// - Each tree's first watering of the day gives 5; at most 3 trees a day are paid.
// - A tree reaching a new stage gives 10 / 20 / 40 / 80 / 150 (stages 1..5); at most 3 such rewards
//   a day are paid, the rest wait for the next days (OYUUR-43: many trees planted to farm stages).
// - Quests and achievements pay too (quests.ts, achievements.ts).
// - Acorns buy kinds of trees and meadows. No real money anywhere.
import { addDays, DayKey } from './dates';
import { Skin, STAGES, stageOf } from './tree';

export const START_ACORNS = 50;
export const WATER_REWARD = 5;
export const WATER_PAID_PER_DAY = 3;
/** By stage index (stageOf().index): nothing for the sprout, then 10..150. */
export const STAGE_REWARDS = [0, 10, 20, 40, 80, 150];
/** Stage rewards paid a day, all trees together (OYUUR-43); the rest are paid on the next days. */
export const STAGE_PAID_PER_DAY = 3;

// Acorns are a journal of rewards (OYUUR-30, design/oyuur-29/спец.md Т3.5): every reward has its own
// key, so two phones that both paid for the same watering offline count it once after a merge.
// The balance is worked out from the journal: 50 + the rewards − the prices of what was bought.
//   w:<treeId>:<day>       5    a tree's watering (at most 3 a day count: the first 3 keys of the day, sorted)
//   st:<treeId>:<stage>    10..150
//   sh:<sharedId>:<day>    5    my half of a shared tree (the same daily limit of 3)
//   q:<day>:<questId>      10
//   qb:<day>               15   all three quests of the day
//   a:<achievementId>      the achievement's reward
//   legacy:<deviceId>      the balance before the journal (version 5 and older), so it stays to the acorn
//   m:<YYYY-MM>            a month of sh/q/qb that ended over 60 days ago, folded into one sum
//   mt:<treeId>:<YYYY-MM>  that month's waterings of one tree, folded into its own sum: told by its
//                          tree like the waterings, so it goes to the account or into the chest of
//                          hidden trees by who sees the tree (records.ts) — never into both
//   mh:<YYYY-MM>           (OYUUR-30 only) the part of a month earned by hidden trees, folded apart

/** Reward key → acorns. */
export type Ledger = Record<string, number>;

/** What the screens show: the balance and everything ever earned. */
export interface Wallet {
  acorns: number;
  earned: number;
}

/** The wallet of saved data version 5 and older: one number. */
export interface OldWallet {
  acorns: number;
  earned: number;
  paidOn: DayKey | null;
  paidToday: number;
  sharedPaid: string[];
}

export const waterKey = (treeId: string, day: DayKey) => `w:${treeId}:${day}`;
export const stageKey = (treeId: string, stage: number) => `st:${treeId}:${stage}`;
export const sharedKey = (sharedId: string, day: DayKey) => `sh:${sharedId}:${day}`;
export const questKey = (day: DayKey, id: string) => `q:${day}:${id}`;
export const bonusKey = (day: DayKey) => `qb:${day}`;
export const achievementKey = (id: string) => `a:${id}`;
export const legacyKey = (deviceId: string) => `legacy:${deviceId}`;
export const monthKey = (month: string) => `m:${month}`;
export const treeMonthKey = (treeId: string, month: string) => `mt:${treeId}:${month}`;
export const hiddenMonthKey = (month: string) => `mh:${month}`;
export const isHiddenMonthKey = (key: string) => key.startsWith('mh:');
const foldedMonth = (key: string) => (key.startsWith('m:') ? key.slice(2) : key.startsWith('mh:') ? key.slice(3) : null);

/** Journal keys of months that ended over this many days ago are folded. */
export const LEDGER_KEEP_DAYS = 60;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The day of a reward that has one (w, sh, q, qb), else null. */
export function dayOfKey(key: string): DayKey | null {
  const parts = key.split(':');
  const kind = parts[0];
  const day = kind === 'w' || kind === 'sh' ? parts[parts.length - 1] : kind === 'q' || kind === 'qb' ? parts[1] : null;
  return parts.length >= 2 && day && DAY_RE.test(day) ? day : null;
}

/** The tree of a watering, stage or folded month key (w, st, mt), else null. */
export function treeOfKey(key: string): string | null {
  const parts = key.split(':');
  return (parts[0] === 'w' || parts[0] === 'st' || parts[0] === 'mt') && parts.length >= 3 ? parts.slice(1, -1).join(':') : null;
}

/** A tree's folded month (mt): "<treeId>|<YYYY-MM>", else null. */
const foldedTreeMonth = (key: string) => (key.startsWith('mt:') ? `${treeOfKey(key)}|${key.slice(key.lastIndexOf(':') + 1)}` : null);

const isDailyPaid = (key: string) => key.startsWith('w:') || key.startsWith('sh:');

/**
 * What the journal counts: every reward once; waterings (w, sh) — the first 3 keys of each day
 * in sorted order; a month already folded (m:) — its sum instead of the month's own keys, and a
 * tree's folded month (mt:) — its sum instead of that tree's keys of the month.
 */
export function earnedOf(ledger: Ledger): number {
  const keys = Object.keys(ledger);
  const folded = new Set(keys.map(foldedMonth).filter((m): m is string => m !== null));
  const foldedTrees = new Set(keys.map(foldedTreeMonth).filter((m): m is string => m !== null));
  const byDay = new Map<DayKey, string[]>();
  let sum = 0;
  for (const [key, amount] of Object.entries(ledger)) {
    if (typeof amount !== 'number' || !Number.isFinite(amount)) continue;
    const day = dayOfKey(key);
    if (day && folded.has(day.slice(0, 7))) continue;
    if (day && foldedTrees.size && foldedTrees.has(`${treeOfKey(key)}|${day.slice(0, 7)}`)) continue;
    if (day && isDailyPaid(key)) {
      const list = byDay.get(day);
      if (list) list.push(key);
      else byDay.set(day, [key]);
    } else sum += amount;
  }
  for (const keys of byDay.values()) for (const key of keys.sort().slice(0, WATER_PAID_PER_DAY)) sum += ledger[key];
  return sum;
}

/** Acorns to spend: 50 + rewards − the price of every item bought (each item once). */
export const balanceOf = (ledger: Ledger, owned: ItemId[]) =>
  START_ACORNS + earnedOf(ledger) - [...new Set(owned)].reduce((n, id) => n + (itemOf(id)?.price ?? 0), 0);

export const walletOf = (ledger: Ledger, shop: Shop): Wallet => ({ acorns: balanceOf(ledger, shop.owned), earned: Math.max(0, earnedOf(ledger)) });

/** Adds a reward once: a key already there changes nothing. */
export const addReward = (ledger: Ledger, key: string, amount: number): Ledger =>
  key in ledger || amount === 0 ? ledger : { ...ledger, [key]: amount };

/** Waterings (w, sh) already in the journal for the day. */
const paidOn = (ledger: Ledger, day: DayKey) =>
  Object.keys(ledger).filter((k) => isDailyPaid(k) && dayOfKey(k) === day).length;

/** My half of a shared tree watered: paid like a watering (within the daily limit), once per tree and day. */
export function sharedWateringReward(ledger: Ledger, sharedId: string, today: DayKey): { ledger: Ledger; water: number } {
  const key = sharedKey(sharedId, today);
  if (key in ledger) return { ledger, water: 0 };
  const water = paidOn(ledger, today) < WATER_PAID_PER_DAY ? WATER_REWARD : 0;
  return { ledger: { ...ledger, [key]: WATER_REWARD }, water };
}

/**
 * This phone's count of stage rewards paid today (OYUUR-43). Not in the journal and not in the
 * account: each phone keeps its own (two phones could pay 3 each — a small thing, no farm).
 * `since` — the day the count began: stages reached before it were paid the old way (or folded into
 * `legacy:` before the journal) and are never paid again.
 */
export interface StageCount {
  since: DayKey;
  day: DayKey | null;
  paid: number;
}

export const newStageCount = (today: DayKey): StageCount => ({ since: today, day: null, paid: 0 });

// A count of a later day (the phone's date was moved back): today has no room, or moving the date
// back and forth would give 3 more each time.
const paidToday = (count: StageCount, today: DayKey) =>
  count.day === today ? count.paid : count.day !== null && count.day > today ? STAGE_PAID_PER_DAY : 0;
const counted = (count: StageCount, today: DayKey, more: number): StageCount =>
  more === 0 ? count : { ...count, day: today, paid: paidToday(count, today) + more };

/**
 * What one successful watering pays: the watering itself (within the daily limit) and a new stage
 * (within its own daily limit: past it the stage waits, `owedStageRewards` pays it on a later day).
 * The watering's key is written even past the limit: after a merge the first 3 of the day count.
 */
export function wateringReward(
  ledger: Ledger,
  treeId: string,
  today: DayKey,
  daysAfter: number,
  count: StageCount = newStageCount(today),
): { ledger: Ledger; water: number; stage: number; count: StageCount } {
  let next = ledger;
  let water = 0;
  const key = waterKey(treeId, today);
  if (!(key in next)) {
    water = paidOn(next, today) < WATER_PAID_PER_DAY ? WATER_REWARD : 0;
    next = { ...next, [key]: WATER_REWARD };
  }
  const before = stageOf(daysAfter - 1).index;
  const after = stageOf(daysAfter).index;
  let stage = 0;
  if (after > before && !(stageKey(treeId, after) in next) && paidToday(count, today) < STAGE_PAID_PER_DAY) {
    stage = STAGE_REWARDS[after];
    next = { ...next, [stageKey(treeId, after)]: stage };
  }
  return { ledger: next, water, stage, count: counted(count, today, stage > 0 ? 1 : 0) };
}

/**
 * Stages reached on or after `count.since` and not in the journal yet (they came on a day past the
 * limit), paid within today's limit: the trees in the order given, each tree's stages from the first.
 * A tree deleted before its turn takes its waiting rewards with it.
 */
export function owedStageRewards(
  ledger: Ledger,
  trees: readonly { id: string; checkins: readonly DayKey[] }[],
  today: DayKey,
  count: StageCount,
): { ledger: Ledger; paid: { treeId: string; amount: number }[]; count: StageCount } {
  let next = ledger;
  const paid: { treeId: string; amount: number }[] = [];
  let room = STAGE_PAID_PER_DAY - paidToday(count, today);
  for (const tree of trees) {
    if (room <= 0) break;
    const days = [...tree.checkins].sort();
    for (let s = 1; s < STAGES.length && room > 0; s++) {
      const reached = days[STAGES[s].from - 1];
      if (!reached || reached < count.since || reached > today || stageKey(tree.id, s) in next) continue;
      next = { ...next, [stageKey(tree.id, s)]: STAGE_REWARDS[s] };
      paid.push({ treeId: tree.id, amount: STAGE_REWARDS[s] });
      room--;
    }
  }
  return { ledger: next, paid, count: counted(count, today, paid.length) };
}

/** A saved count, or a new one from today (a phone that never had one: what it reached was paid). */
export function migrateStageCount(saved: unknown, today: DayKey): StageCount {
  const raw = (saved && typeof saved === 'object' ? saved : {}) as Partial<StageCount>;
  if (typeof raw.since !== 'string' || !DAY_RE.test(raw.since)) return newStageCount(today);
  const day = typeof raw.day === 'string' && DAY_RE.test(raw.day) ? raw.day : null;
  const paid = isNum(raw.paid) ? Math.floor(raw.paid) : 0;
  return { since: raw.since, day, paid: day ? paid : 0 };
}

/** The 1st of the month after 'YYYY-MM'. */
const nextMonthStart = (month: string) => addDays(`${month}-28`, 4).slice(0, 7) + '-01';

/** What each key of one month counts: waterings (w, sh) only the first 3 of each day, sorted. */
function countedOf(ledger: Ledger, keys: string[]): Map<string, number> {
  const out = new Map<string, number>();
  const byDay = new Map<DayKey, string[]>();
  for (const key of keys) {
    const amount = ledger[key];
    if (typeof amount !== 'number' || !Number.isFinite(amount)) continue;
    const day = dayOfKey(key);
    if (day && isDailyPaid(key)) {
      const list = byDay.get(day);
      if (list) list.push(key);
      else byDay.set(day, [key]);
    } else out.set(key, amount);
  }
  for (const list of byDay.values()) for (const key of list.sort().slice(0, WATER_PAID_PER_DAY)) out.set(key, ledger[key]);
  return out;
}

/**
 * Keeps the journal small: months that ended over 60 days ago are folded, the balance stays the
 * same. Each tree's waterings of the month become its own sum `mt:<treeId>:<YYYY-MM>`, the rest
 * (shared halves, quests) one sum `m:<YYYY-MM>` — so a reward is in one sum only, whatever each
 * phone thinks of who sees the tree: two phones that fold the same month write the same keys, and
 * merging keeps one of each (OYUUR-31: a month folded with a tree hidden on one phone and open on
 * the other used to count that tree twice). A month already folded (m:, here or from the account)
 * drops its late keys; a tree whose part only this phone has (none of its mt: came) keeps it as
 * its own sum. `hiddenTrees`: a month folded by OYUUR-30 (mh:) gives them their own sum only.
 */
export function pruneLedger(ledger: Ledger, today: DayKey, hiddenTrees: ReadonlySet<string> = new Set()): Ledger {
  const cutoff = addDays(today, -LEDGER_KEEP_DAYS);
  const months = new Map<string, string[]>();
  for (const key of Object.keys(ledger)) {
    const day = dayOfKey(key);
    if (!day) continue;
    const month = day.slice(0, 7);
    if (nextMonthStart(month) > cutoff) continue;
    const list = months.get(month);
    if (list) list.push(key);
    else months.set(month, [key]);
  }
  if (months.size === 0) return ledger;
  const next = { ...ledger };
  for (const [month, keys] of months) {
    const mk = monthKey(month);
    const counted = countedOf(ledger, keys);
    const byTree = new Map<string, number>();
    let rest = 0;
    for (const key of keys) {
      const amount = counted.get(key) ?? 0;
      const tree = treeOfKey(key);
      if (tree === null) rest += amount;
      else byTree.set(tree, (byTree.get(tree) ?? 0) + amount);
    }
    const elsewhere = mk in next;
    // Folded by OYUUR-30 (one m: for every open tree): only the hidden trees' part may be missing.
    const old = elsewhere && (hiddenMonthKey(month) in next || !Object.keys(next).some((k) => k.startsWith('mt:') && k.endsWith(`:${month}`)));
    if (!elsewhere) next[mk] = rest;
    for (const [tree, sum] of byTree) {
      const tk = treeMonthKey(tree, month);
      if (sum <= 0 || tk in next) continue;
      if (old && (hiddenMonthKey(month) in next || !hiddenTrees.has(tree))) continue;
      next[tk] = sum;
    }
    for (const k of keys) delete next[k];
  }
  return next;
}

/** Two journals as one: every key once (the same key has the same amount; the larger is kept for safety). */
export function mergeLedger(a: Ledger, b: Ledger): Ledger {
  const out: Ledger = { ...a };
  for (const [key, amount] of Object.entries(b)) out[key] = key in out ? Math.max(out[key], amount) : amount;
  return out;
}

// ---- The shop ----

export type MeadowId = 'summer' | 'autumn' | 'winter' | 'bloom';
export const MEADOWS: MeadowId[] = ['summer', 'autumn', 'winter', 'bloom'];

export type ItemId = `tree:${Skin}` | `meadow:${MeadowId}`;

export interface Item {
  id: ItemId;
  kind: 'tree' | 'meadow';
  /** 0 — free, owned from the start. */
  price: number;
}

const tree = (skin: Skin, price: number): Item => ({ id: `tree:${skin}`, kind: 'tree', price });
const meadow = (id: MeadowId, price: number): Item => ({ id: `meadow:${id}`, kind: 'meadow', price });

/** Everything the shop shows, in its order. */
export const CATALOG: Item[] = [
  tree('oak', 0),
  tree('sakura', 0),
  tree('spruce', 0),
  tree('birch', 250),
  tree('maple', 400),
  tree('apple', 600),
  tree('palm', 900),
  meadow('summer', 0),
  meadow('autumn', 500),
  meadow('winter', 800),
  meadow('bloom', 1200),
];

export const itemOf = (id: ItemId) => CATALOG.find((i) => i.id === id);
export const skinOfItem = (id: ItemId): Skin | null => (id.startsWith('tree:') ? (id.slice(5) as Skin) : null);
export const meadowOfItem = (id: ItemId): MeadowId | null => (id.startsWith('meadow:') ? (id.slice(7) as MeadowId) : null);

export interface Shop {
  /** Bought items, in the order bought (free ones are never listed: they are always owned). */
  owned: ItemId[];
  /** The meadow on the main screen and in the forest. */
  meadow: MeadowId;
  /** Items the player already knows they can afford (seen in the shop): no dot for them. */
  seenAffordable: ItemId[];
  /** When the meadow was put on (HLC, merge.ts): the later choice wins on another phone. */
  meadowAt?: string;
}

export const newShop = (): Shop => ({ owned: [], meadow: 'summer', seenAffordable: [] });

/** The shop's dot: something not owned is affordable now, and the player hasn't seen it yet. */
export const shopNews = (shop: Shop, wallet: Wallet) =>
  CATALOG.some((i) => !owns(shop, i.id) && i.price <= wallet.acorns && !shop.seenAffordable.includes(i.id));

/** The shop was opened: everything affordable now is seen. */
export function seeAffordable(shop: Shop, wallet: Wallet): Shop {
  const fresh = CATALOG.filter((i) => !owns(shop, i.id) && i.price <= wallet.acorns && !shop.seenAffordable.includes(i.id)).map((i) => i.id);
  return fresh.length ? { ...shop, seenAffordable: [...shop.seenAffordable, ...fresh] } : shop;
}

export const owns = (shop: Shop, id: ItemId) => itemOf(id)?.price === 0 || shop.owned.includes(id);

/** Kinds of trees the player can plant or switch to. */
export const ownedSkins = (shop: Shop): Skin[] =>
  CATALOG.filter((i) => i.kind === 'tree' && owns(shop, i.id)).map((i) => skinOfItem(i.id)!);

export type BuyResult = 'ok' | 'owned' | 'poor' | 'unknown';

/** A purchase only adds the item: the balance takes its price off by itself (balanceOf). */
export function buy(shop: Shop, ledger: Ledger, id: ItemId): { shop: Shop; result: BuyResult } {
  const item = itemOf(id);
  if (!item) return { shop, result: 'unknown' };
  if (owns(shop, id)) return { shop, result: 'owned' };
  if (balanceOf(ledger, shop.owned) < item.price) return { shop, result: 'poor' };
  return { shop: { ...shop, owned: [...shop.owned, id] }, result: 'ok' };
}

/** Puts an owned meadow on; an unowned one is ignored. */
export const chooseMeadow = (shop: Shop, id: MeadowId): Shop =>
  owns(shop, `meadow:${id}`) && shop.meadow !== id ? { ...shop, meadow: id } : shop;

/** How many acorns are still missing for an item (0 — enough). */
export const missing = (wallet: Wallet, id: ItemId) => Math.max(0, (itemOf(id)?.price ?? 0) - wallet.acorns);

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

/**
 * The journal from saved data. Version 6 keeps the journal (damaged amounts go). Older versions
 * kept one number: it becomes one key `legacy:<deviceId>` that keeps the balance to the acorn
 * (acorns - 50 + the price of what was bought). `owned` - the shop as migrated.
 */
export function migrateWallet(saved: unknown, owned: ItemId[], deviceId: string): Ledger {
  if (!saved || typeof saved !== 'object') return {};
  const raw = saved as Partial<OldWallet> & { ledger?: unknown };
  if (raw.ledger && typeof raw.ledger === 'object' && !Array.isArray(raw.ledger)) {
    const out: Ledger = {};
    for (const [key, amount] of Object.entries(raw.ledger as Record<string, unknown>)) {
      if (typeof amount === 'number' && Number.isFinite(amount) && key.length <= 200) out[key] = amount;
    }
    return out;
  }
  const acorns = isNum(raw.acorns) ? Math.floor(raw.acorns) : START_ACORNS;
  const spent = [...new Set(owned)].reduce((n, id) => n + (itemOf(id)?.price ?? 0), 0);
  const legacy = acorns - START_ACORNS + spent;
  return legacy === 0 ? {} : { [legacyKey(deviceId)]: legacy };
}

export function migrateShop(saved: Partial<Shop> | undefined): Shop {
  if (!saved) return newShop();
  const known = (list: unknown, paidOnly: boolean): ItemId[] =>
    Array.isArray(list)
      ? [...new Set(list.filter((id): id is ItemId => !!itemOf(id as ItemId) && (!paidOnly || itemOf(id as ItemId)!.price > 0)))]
      : [];
  const shop: Shop = { owned: known(saved.owned, true), meadow: 'summer', seenAffordable: known(saved.seenAffordable, false) };
  if (typeof saved.meadowAt === 'string') shop.meadowAt = saved.meadowAt;
  return MEADOWS.includes(saved.meadow as MeadowId) && owns(shop, `meadow:${saved.meadow as MeadowId}`)
    ? { ...shop, meadow: saved.meadow as MeadowId }
    : shop;
}
