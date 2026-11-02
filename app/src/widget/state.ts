// What each widget shows now (OYUUR-39, design/oyuur-37/спец.md, 3, 5.4, 5.5). Pure: the snapshot and a
// time in, the state out — by the rules of tree.ts and the game day until 3:00 (dates.ts).
import { DAY_START_HOUR, DayKey, gameClock, gameDay } from '@/game/dates';
import { canWaterAt, isDead, settle, wateringOpensAt } from '@/game/tree';
import { toRuleTree, WidgetSnapshot, WidgetTree } from './snapshot';

/**
 * - water: watering is open and not watered yet;
 * - done: watered today (or today can't be watered any more — calm, as watered);
 * - wait: the watering time has not come ("from 18:00");
 * - last: no chances left — a miss kills the tree;
 * - burn: chances left, not watered, after 22:00 — a chance burns at 3:00;
 * - dead: died, until a tree grows from its seed;
 * - locked: locked in for good (only in "My forest").
 */
export type WState = 'water' | 'done' | 'wait' | 'last' | 'burn' | 'dead' | 'locked';

/** From this hour a chance is "at risk" (owner's choice, спец 9.5). */
export const BURN_HOUR = 22;

export interface TreeView {
  tree: WidgetTree;
  state: WState;
  /** The streak; for a dead tree its record. */
  days: number;
  /** Chances now (after missed days are judged). */
  hearts: number;
  /** The hour watering opens today (for "wait"). */
  opensAt: number;
}

export const isThirsty = (s: WState) => s === 'water' || s === 'last' || s === 'burn';
export const isWarm = (s: WState) => s === 'last' || s === 'burn';

/** The phone's clock with the developer time travel, as the app has it. */
export const widgetNow = (snap: Pick<WidgetSnapshot, 'minuteOffset'>, now: Date) => new Date(now.getTime() + snap.minuteOffset * 60_000);

/** The game day of the snapshot at that moment. */
export const widgetDay = (snap: Pick<WidgetSnapshot, 'minuteOffset' | 'dayOffset'>, now: Date): DayKey =>
  gameDay(widgetNow(snap, now), snap.dayOffset);

/** The scene by the time, like the app (ui/theme isNightHour: 20:00–6:00); a theme chosen in the app wins. */
export function isNight(snap: Pick<WidgetSnapshot, 'theme' | 'minuteOffset'>, now: Date): boolean {
  if (snap.theme === 'dark') return true;
  if (snap.theme === 'light') return false;
  const h = widgetNow(snap, now).getHours();
  return h >= 20 || h < 6;
}

export function viewOf(w: WidgetTree, snap: Pick<WidgetSnapshot, 'minuteOffset' | 'dayOffset'>, now: Date): TreeView {
  const at = widgetNow(snap, now);
  const day = gameDay(at, snap.dayOffset);
  const clock = gameClock(at);
  const base = { tree: w, days: w.days, opensAt: 0 };
  if (w.completedOn) return { ...base, state: 'locked', hearts: w.chancesLeft };
  const t = settle(toRuleTree(w), day);
  if (isDead(t)) return { ...base, state: 'dead', hearts: 0 };
  const hearts = t.chancesLeft;
  const opensAt = wateringOpensAt(t, day);
  // Watered — or the day is already judged / not begun (the clock went back): calm, nothing to ask.
  if (t.checkins.includes(day) || day < t.plantedOn || t.frozen.includes(day) || day < t.settledThrough) {
    return { ...base, state: 'done', hearts, opensAt };
  }
  if (!canWaterAt(t, day, clock)) return { ...base, state: 'wait', hearts, opensAt };
  if (hearts === 0) return { ...base, state: 'last', hearts, opensAt };
  const late = clock.hour >= BURN_HOUR; // 22:00 … 2:59 (hours 24..26 of the game day)
  return { ...base, state: late ? 'burn' : 'water', hearts, opensAt };
}

export const viewsOf = (snap: WidgetSnapshot, now: Date): TreeView[] => snap.trees.map((t) => viewOf(t, snap, now));

const RANK: Record<WState, number> = { last: 0, burn: 0, water: 1, wait: 2, done: 3, dead: 9, locked: 9 };

/**
 * "Most urgent" (спец 5.4): last chance / a chance at risk → can be watered (the longest streak first) →
 * waiting (whatever opens sooner) → watered (the longest streak). Growing trees only.
 */
export function urgentOrder(views: TreeView[]): TreeView[] {
  return views
    .filter((v) => v.state !== 'dead' && v.state !== 'locked')
    .map((v, i) => ({ v, i }))
    .sort((a, b) => {
      const r = RANK[a.v.state] - RANK[b.v.state];
      if (r) return r;
      if (a.v.state === 'wait' && a.v.opensAt !== b.v.opensAt) return a.v.opensAt - b.v.opensAt;
      return b.v.days - a.v.days || a.i - b.i;
    })
    .map((x) => x.v);
}

/** The choice of a "Tree" or "Row" widget: the most urgent, or one habit (by lineage: the next generation follows). */
export type TreeChoice = 'urgent' | { lineageId: string };

/**
 * The tree the 2×2 / 4×1 shows; null — nothing growing ("plant a tree").
 * A chosen tree that died stays "dead" until its seed grows; locked in or deleted — back to "most urgent" (спец 5.4).
 */
export function pickTree(views: TreeView[], choice: TreeChoice): TreeView | null {
  if (choice !== 'urgent') {
    const mine = views.find((v) => v.tree.lineageId === choice.lineageId);
    if (mine && mine.state !== 'locked') return mine;
  }
  return urgentOrder(views)[0] ?? null;
}

/** "Today" (4×2): the growing trees, the most urgent first, at most `slots` places; more — the last place is "+N". */
export function todayPlaces(views: TreeView[], slots: number): { shown: TreeView[]; more: TreeView[]; growing: TreeView[] } {
  const growing = urgentOrder(views);
  if (growing.length <= slots) return { shown: growing, more: [], growing };
  return { shown: growing.slice(0, slots - 1), more: growing.slice(slots - 1), growing };
}

/**
 * "My forest" (4×4, спец 5.5): up to 9 trees — growing by streak, then locked in, then dead by record.
 * The number in the header is the days of every tree of the forest; "N trees" — every tree.
 */
export function forestTrees(views: TreeView[]): { placed: TreeView[]; total: number; days: number } {
  const group = (s: WState) => (s === 'locked' ? 1 : s === 'dead' ? 2 : 0);
  const sorted = views.map((v, i) => ({ v, i })).sort((a, b) => group(a.v.state) - group(b.v.state) || b.v.days - a.v.days || a.i - b.i);
  return { placed: sorted.slice(0, 9).map((x) => x.v), total: views.length, days: views.reduce((s, v) => s + v.days, 0) };
}

/** The habit's name on the home screen: a hidden tree shows its own name (or "My tree"), unless names are on (спец 6). */
export function shownName(w: WidgetTree, showHidden: boolean, myTree: string): string {
  if (w.hidden && (!showHidden || w.name === null)) return w.nick ?? myTree;
  return w.name ?? w.nick ?? myTree;
}

/** The hour the game day ends ("3:00"), for "a chance burns at 3:00". */
export const DAY_END_HOUR = DAY_START_HOUR;
