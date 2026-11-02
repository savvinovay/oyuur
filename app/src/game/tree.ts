// Game rules for one habit tree. Pure functions: no storage, no UI, no clock.
// Rules (decided with the owner, see ПРОДУКТ.md):
// - One check-in per day grows the tree by one day.
// - Each tree holds up to 3 chances. A missed day uses a chance: the streak freezes
//   and the tree does not grow that day. On the 1st of every month the tree gets
//   one chance back, never more than 3.
// - A missed day with no chances left kills the tree. The dead tree stays in
//   the forest as a memory with its record, and one new tree can grow from its seed.
//   All trees grown this way are generations of one habit.
// - The user can "lock in" a tree when the habit is done for good: the tree stays in the
//   forest exactly as it is, can't be tapped again and can't die. There is no undo.
// - The planting day never counts as missed. Today is never judged until it's over.
// - Watering time (OYUUR-33): each tree can be watered from its own hour of the game day
//   ("Quit" — from 18:00, "Do" — any time). The planting day is open at once. A new hour
//   applies from tomorrow, so it can't be moved to the morning and used at once.
import { addDays, DAY_START_HOUR, DayKey, daysBetween, GameClock } from './dates';
import { finalName } from './nameText';

export const MAX_CHANCES = 3;

export type HabitKind = 'do' | 'quit';
export type Visibility = 'private' | 'friends';
/** What the tree looks like. Chosen when planting; a seed grows the same kind. */
export type Skin = 'oak' | 'sakura' | 'spruce' | 'birch' | 'maple' | 'apple' | 'palm';
/** Every kind there is. Oak, sakura and spruce are free; the rest are bought with acorns (economy.ts). */
export const SKINS: Skin[] = ['oak', 'sakura', 'spruce', 'birch', 'maple', 'apple', 'palm'];

/** From which hour of the game day the tree can be watered: 0 = any time, 1..23. */
export type OpenHour = number;
/** The latest opening hour: at least 4 hours stay before the day ends at 3:00. */
export const MAX_OPEN_HOUR = 24 + DAY_START_HOUR - 4;
/** An opening hour and the game day it applies from. */
export interface OpenHourEntry {
  from: DayKey;
  hour: OpenHour;
}

export const isOpenHour = (hour: unknown): hour is OpenHour =>
  typeof hour === 'number' && Number.isInteger(hour) && hour >= 0 && hour <= MAX_OPEN_HOUR;

export const defaultOpenHour = (kind: HabitKind): OpenHour => (kind === 'quit' ? 18 : 0);

export interface Tree {
  id: string;
  /** Same for every generation of one habit: the id of its first tree. */
  lineageId: string;
  name: string;
  kind: HabitKind;
  visibility: Visibility;
  skin: Skin;
  plantedOn: DayKey;
  /** Days the user tapped the tree, ascending. */
  checkins: DayKey[];
  /** Missed days covered by a chance, ascending. */
  frozen: DayKey[];
  chancesLeft: number;
  /** Month ('YYYY-MM') of the last monthly chance refill. */
  refilledMonth: string;
  /** Last day already checked for misses. */
  settledThrough: DayKey;
  diedOn: DayKey | null;
  /** The day the result was locked in for good. */
  completedOn: DayKey | null;
  /** 1 for a first tree, +1 for each tree grown from a seed. */
  generation: number;
  parentId: string | null;
  /** The tree's own name ("Дубок"), given by the user; null — no name. 1–20 characters (naming.ts). */
  nickname: string | null;
  /** The day the tree first got a name (kept on renames). */
  namedOn: DayKey | null;
  /** How many times the app has offered to name it, 0..3. */
  nameAsks: number;
  /** The day of the last offer. */
  nameAskedOn: DayKey | null;
  /** The day the user answered "Later": no bubble for the rest of that day. */
  nameLaterOn: DayKey | null;
  /** Watering hours, ascending by `from`; the first applies from the planting day. */
  openHours: OpenHourEntry[];
  /**
   * When the person last changed these on any phone (HLC strings, merge.ts): on a merge the later
   * change wins, field by field. Missing — never changed since planting (loses to any change).
   */
  stamps?: TreeStamps;
}

/** Times of the last change of the fields that merge as "the latest change wins" (OYUUR-30, Т3.2). */
export interface TreeStamps {
  nickname?: string;
  skin?: string;
  visibility?: string;
  /** The watering hour (setOpenHour): whose change for the coming days counts (merge.ts). */
  openHours?: string;
}

export interface PlantInput {
  id: string;
  name: string;
  kind: HabitKind;
  visibility: Visibility;
  today: DayKey;
  skin?: Skin;
  /** From which hour it can be watered; by default — by the kind of habit. */
  openHour?: OpenHour;
}

const monthOf = (day: DayKey) => day.slice(0, 7);

export function plantTree(input: PlantInput): Tree {
  return {
    id: input.id,
    lineageId: input.id,
    name: input.name.trim(),
    kind: input.kind,
    visibility: input.visibility,
    skin: input.skin ?? 'oak',
    plantedOn: input.today,
    checkins: [],
    frozen: [],
    chancesLeft: MAX_CHANCES,
    refilledMonth: monthOf(input.today),
    settledThrough: input.today,
    diedOn: null,
    completedOn: null,
    generation: 1,
    parentId: null,
    nickname: null,
    namedOn: null,
    nameAsks: 0,
    nameAskedOn: null,
    nameLaterOn: null,
    openHours: [{ from: input.today, hour: isOpenHour(input.openHour) ? input.openHour : defaultOpenHour(input.kind) }],
  };
}

/** Plant a fresh tree from a dead tree's seed: same habit, next generation. */
export function plantFromSeed(dead: Tree, id: string, today: DayKey): Tree {
  const openHour = dead.openHours?.length ? dead.openHours[dead.openHours.length - 1].hour : undefined;
  return {
    ...plantTree({ id, name: dead.name, kind: dead.kind, visibility: dead.visibility, today, skin: dead.skin, openHour }),
    lineageId: dead.lineageId,
    generation: dead.generation + 1,
    parentId: dead.id,
    // All generations of a habit share who sees them: the new one keeps the time of that choice.
    ...(dead.stamps?.visibility ? { stamps: { visibility: dead.stamps.visibility } } : {}),
  };
}

export const isDead = (tree: Tree) => tree.diedOn !== null;
export const isCompleted = (tree: Tree) => tree.completedOn !== null;
/** Still asking for daily taps. */
export const isGrowing = (tree: Tree) => !isDead(tree) && !isCompleted(tree);

/**
 * Bring the tree up to `today`: give back a chance on the 1st of each month,
 * and judge every fully finished day — a day without a check-in spends a chance,
 * or kills the tree when none are left. Safe to call any number of times.
 */
export function settle(tree: Tree, today: DayKey): Tree {
  if (!isGrowing(tree)) return tree;
  const lastFinished = addDays(today, -1);
  if (tree.settledThrough >= lastFinished && tree.refilledMonth >= monthOf(today)) return tree;

  const checked = new Set(tree.checkins);
  let { chancesLeft, refilledMonth } = tree;
  const frozen = [...tree.frozen];
  let diedOn: DayKey | null = null;
  let settledThrough = tree.settledThrough;

  for (let day = addDays(tree.settledThrough, 1); day <= today; day = addDays(day, 1)) {
    // The refill comes first, so a missed 1st of the month can use the new chance.
    if (day.endsWith('-01') && monthOf(day) > refilledMonth) {
      chancesLeft = Math.min(MAX_CHANCES, chancesLeft + 1);
      refilledMonth = monthOf(day);
    }
    if (day === today) break;
    settledThrough = day;
    if (checked.has(day)) continue;
    if (chancesLeft > 0) {
      chancesLeft -= 1;
      frozen.push(day);
    } else {
      diedOn = day;
      break;
    }
  }

  return { ...tree, chancesLeft, refilledMonth, frozen, diedOn, settledThrough };
}

// ---- Watering time ----

/** What the watering time needs: a tree, or my half of a shared tree (shared.ts). */
export type WithHours = Pick<Tree, 'plantedOn' | 'openHours'>;

/** The hour set for that day (the last change made before it). */
export function openHourOn(tree: WithHours, day: DayKey): OpenHour {
  let hour: OpenHour = 0;
  for (const e of tree.openHours ?? []) if (e.from <= day) hour = e.hour;
  return hour;
}

/** The hour of the game day from which the tree can be watered that day; the planting day is open at once. */
export const wateringOpensAt = (tree: WithHours, day: DayKey): OpenHour =>
  day === tree.plantedOn ? 0 : openHourOn(tree, day);

/** `clock` — the time of the game day (24..26 after midnight). */
export const canWaterAt = (tree: WithHours, day: DayKey, clock: GameClock): boolean =>
  clock.hour * 60 + clock.minute >= wateringOpensAt(tree, day) * 60;

/** Minutes left until watering opens that day (0 — open). */
export const minutesUntilOpen = (tree: WithHours, day: DayKey, clock: GameClock): number =>
  Math.max(0, wateringOpensAt(tree, day) * 60 - (clock.hour * 60 + clock.minute));

/** A change waiting for tomorrow: the hour it will be. Null — none. */
export function nextOpenHour(tree: WithHours, today: DayKey): OpenHour | null {
  const tomorrow = addDays(today, 1);
  const last = tree.openHours?.[tree.openHours.length - 1];
  return last && last.from > today && last.from <= tomorrow && last.hour !== openHourOn(tree, today) ? last.hour : null;
}

/**
 * A new watering hour, from tomorrow's game day: today the tree keeps the old one.
 * A second change the same day replaces the first; going back to today's hour drops it.
 */
export function setOpenHour(tree: Tree, hour: OpenHour, today: DayKey): Tree {
  if (!isGrowing(tree) || !isOpenHour(hour)) return tree;
  // Planted later than today (time travel): its first day simply gets the new hour.
  if (tree.plantedOn > today) return { ...tree, openHours: [{ from: tree.plantedOn, hour }] };
  const tomorrow = addDays(today, 1);
  const kept = (tree.openHours ?? []).filter((e) => e.from <= today);
  const pending = (tree.openHours ?? []).some((e) => e.from > today);
  if (hour === openHourOn(tree, today)) return pending ? { ...tree, openHours: kept } : tree;
  return { ...tree, openHours: [...kept, { from: tomorrow, hour }] };
}

export type CheckInResult = 'grown' | 'already' | 'closed' | 'early' | 'dead' | 'completed' | 'notPlanted';

/** `clock` — the time of the game day now; without it the watering time isn't checked. */
export function checkIn(tree: Tree, today: DayKey, clock?: GameClock): { tree: Tree; result: CheckInResult } {
  const settled = settle(tree, today);
  if (isDead(settled)) return { tree: settled, result: 'dead' };
  if (isCompleted(settled)) return { tree: settled, result: 'completed' };
  if (today < settled.plantedOn) return { tree: settled, result: 'notPlanted' };
  if (settled.checkins.includes(today)) return { tree: settled, result: 'already' };
  // A day that was already judged (the clock went back: travel west, manual date change,
  // dev time travel) can't be checked in afterwards. The planting day is settled from the
  // start but stays open.
  if (settled.frozen.includes(today) || today < settled.settledThrough) {
    return { tree: settled, result: 'closed' };
  }
  if (clock && !canWaterAt(settled, today, clock)) return { tree: settled, result: 'early' };
  const checkins = [...settled.checkins, today].sort();
  return { tree: { ...settled, checkins }, result: 'grown' };
}

/**
 * Lock in the result for good: the habit is over, the tree stays in the forest
 * exactly as it is and can't be tapped again.
 */
export function complete(tree: Tree, today: DayKey): Tree {
  const settled = settle(tree, today);
  if (!isGrowing(settled)) return settled;
  return { ...settled, completedOn: today };
}

/**
 * A dead tree gives one seed: once a tree has grown from it — or any later generation
 * of the same habit exists — it is used up.
 */
export const seedUsed = (dead: Tree, all: Tree[]) =>
  all.some((x) => x.parentId === dead.id || (x.lineageId === dead.lineageId && x.generation > dead.generation));

/** Days of growth — the number next to the tree rings. Frozen days keep it, they don't add to it. */
export const growthDays = (tree: Tree) => tree.checkins.length;

export const checkedInToday = (tree: Tree, today: DayKey) => tree.checkins.includes(today);

export type Stage = 'sprout' | 'seedling' | 'bush' | 'young' | 'tree' | 'grand';

// First growth day of each stage.
export const STAGES: { stage: Stage; from: number }[] = [
  { stage: 'sprout', from: 0 },
  { stage: 'seedling', from: 3 },
  { stage: 'bush', from: 7 },
  { stage: 'young', from: 21 },
  { stage: 'tree', from: 50 },
  { stage: 'grand', from: 100 },
];

/** Current stage and how far (0..1) the tree is through it. */
export function stageOf(days: number): { stage: Stage; progress: number; index: number } {
  let index = 0;
  for (let i = 0; i < STAGES.length; i++) if (days >= STAGES[i].from) index = i;
  const next = STAGES[index + 1];
  const progress = next ? (days - STAGES[index].from) / (next.from - STAGES[index].from) : 1;
  return { stage: STAGES[index].stage, progress, index };
}

/**
 * When the tree reaches its next stage if the user taps every day from now on:
 * how many more taps it needs and on which day the last one falls.
 */
export function nextStage(tree: Tree, today: DayKey): { stage: Stage; taps: number; on: DayKey } | null {
  if (!isGrowing(tree)) return null;
  const days = growthDays(tree);
  const next = STAGES[stageOf(days).index + 1];
  if (!next) return null;
  const taps = next.from - days;
  const firstTapDay = checkedInToday(tree, today) ? addDays(today, 1) : today;
  return { stage: next.stage, taps, on: addDays(firstTapDay, taps - 1) };
}

export type DayStatus =
  | 'done' | 'frozen' | 'died' | 'missed' | 'today' | 'future' | 'afterEnd' | 'beforePlanting';

/** What a day card shows for a given day. */
export function dayStatus(tree: Tree, day: DayKey, today: DayKey): DayStatus {
  if (day < tree.plantedOn) return 'beforePlanting';
  if (tree.checkins.includes(day)) return 'done';
  if (tree.frozen.includes(day)) return 'frozen';
  if (tree.diedOn === day) return 'died';
  if (tree.diedOn && day > tree.diedOn) return 'afterEnd';
  if (tree.completedOn && day >= tree.completedOn) return 'afterEnd';
  if (day === today) return 'today';
  if (day > today) return 'future';
  // A past day that is not settled yet (settle() runs before display, so this is rare).
  return 'missed';
}

/** Day number of `day` in the tree's life, starting at 1 on the planting day. */
export const lifeDay = (tree: Tree, day: DayKey) => daysBetween(tree.plantedOn, day) + 1;

/** One habit: all generations of its tree, oldest first. */
export interface Habit {
  lineageId: string;
  generations: Tree[];
  /** The newest generation — the one that grows now (or the last memory). */
  current: Tree;
}

/** Group trees into habits, in the order the habits were first planted. */
export function groupHabits(trees: Tree[]): Habit[] {
  const byLineage = new Map<string, Tree[]>();
  for (const tree of trees) {
    const list = byLineage.get(tree.lineageId) ?? [];
    list.push(tree);
    byLineage.set(tree.lineageId, list);
  }
  return [...byLineage.entries()].map(([lineageId, list]) => {
    const generations = [...list].sort((a, b) => a.generation - b.generation);
    return { lineageId, generations, current: generations[generations.length - 1] };
  });
}

/**
 * Fill in fields added after version 1 of saved data. Version 1 could delete a single
 * generation, so a tree whose parent is gone joins the older tree of the same habit
 * (same name and kind) instead of becoming a separate habit.
 */
export function migrateTrees(saved: Partial<Tree>[]): Tree[] {
  const byId = new Map(saved.map((t) => [t.id!, t]));
  const parentOf = (t: Partial<Tree>): Partial<Tree> | undefined => {
    if (!t.parentId) return undefined;
    return (
      byId.get(t.parentId) ??
      saved
        .filter((o) => o.name === t.name && o.kind === t.kind && (o.generation ?? 1) < (t.generation ?? 1))
        .sort((a, b) => (b.generation ?? 1) - (a.generation ?? 1))[0]
    );
  };
  const rootOf = (t: Partial<Tree>): string => {
    let cur = t;
    for (let guard = 0, p = parentOf(cur); p && guard < 1000; guard++, p = parentOf(cur)) cur = p;
    return cur.id!;
  };
  return saved.map((t) => ({
    ...(t as Tree),
    lineageId: t.lineageId ?? rootOf(t),
    refilledMonth: t.refilledMonth ?? monthOf(t.plantedOn!),
    completedOn: t.completedOn ?? null,
    // Unknown kinds (damaged data, a newer version) fall back to the oak.
    skin: t.skin && SKINS.includes(t.skin) ? t.skin : 'oak',
    // Fields of wave 4 (the tree's own name); a damaged name is cleaned or dropped.
    nickname: typeof t.nickname === 'string' ? finalName(t.nickname) : null,
    namedOn: t.namedOn ?? null,
    nameAsks: typeof t.nameAsks === 'number' ? t.nameAsks : 0,
    nameAskedOn: t.nameAskedOn ?? null,
    nameLaterOn: t.nameLaterOn ?? null,
    // OYUUR-34: trees from before the watering time stay open all day.
    openHours: migrateOpenHours(t.openHours, t.plantedOn!),
    // OYUUR-30: times of changes; only strings are kept (missing — never changed).
    ...(t.stamps !== undefined ? { stamps: migrateStamps(t.stamps) } : {}),
  }));
}

export function migrateStamps(saved: unknown): TreeStamps {
  const out: TreeStamps = {};
  if (!saved || typeof saved !== 'object') return out;
  const raw = saved as Record<string, unknown>;
  for (const k of ['nickname', 'skin', 'visibility', 'openHours'] as const) if (typeof raw[k] === 'string') out[k] = raw[k] as string;
  return out;
}

/** Watering hours from saved data: damaged entries go, the rest in order; nothing left — any time. */
export function migrateOpenHours(saved: unknown, plantedOn: DayKey): OpenHourEntry[] {
  const valid = (Array.isArray(saved) ? saved : [])
    .filter((e): e is OpenHourEntry => !!e && typeof e === 'object' && typeof e.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.from) && isOpenHour(e.hour))
    .map((e) => ({ from: e.from < plantedOn ? plantedOn : e.from, hour: e.hour }))
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  // One entry per day: the later one wins.
  const out: OpenHourEntry[] = [];
  for (const e of valid) {
    if (out.length && out[out.length - 1].from === e.from) out[out.length - 1] = e;
    else out.push(e);
  }
  if (!out.length || out[0].from > plantedOn) out.unshift({ from: plantedOn, hour: 0 });
  return out;
}
