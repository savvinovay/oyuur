// What the live tree shows before anyone touches it. Pure functions, tested.
import { DayKey } from '@/game/dates';
import { checkedInToday, isCompleted, isDead, Stage, stageOf, Tree } from '@/game/tree';

/**
 * - thirsty: growing and not watered today — faded, drooping, dry soil, a bubble asks for water;
 * - watered: watered today — fresh colors, wet soil;
 * - dead: a dry trunk on plain soil;
 * - resting: can't be watered now (locked in, or today is already judged) — as it is, plain soil.
 */
export type TreeMood = 'thirsty' | 'watered' | 'dead' | 'resting';

export function treeMood(tree: Tree, today: DayKey): TreeMood {
  if (isDead(tree)) return 'dead';
  if (isCompleted(tree)) return 'resting';
  if (checkedInToday(tree, today)) return 'watered';
  // Same rules as checkIn(): a day before planting, or one already judged, can't be watered.
  if (today < tree.plantedOn || tree.frozen.includes(today) || today < tree.settledThrough) return 'resting';
  return 'thirsty';
}

/** The stage reached by growing from `daysBefore` to `daysAfter`, or null if it is the same stage. */
export function stageUp(daysBefore: number, daysAfter: number): Stage | null {
  const before = stageOf(daysBefore);
  const after = stageOf(daysAfter);
  return after.index > before.index ? after.stage : null;
}
