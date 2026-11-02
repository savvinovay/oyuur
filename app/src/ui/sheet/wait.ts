// A tree that can't be watered yet today (OYUUR-33, design/oyuur-33/спец.md 5.1–5.2, 7):
// what the sheet's status line, the habit dots and today's day card say, the "too early"
// taps in a row, and the old "Quit" trees the one-time evening offer lists. Pure, tested
// in __tests__/wait.test.ts. The rules themselves are in game/tree.ts.
import { DayKey, GameClock } from '@/game/dates';
import {
  canWaterAt,
  isGrowing,
  minutesUntilOpen,
  nextOpenHour,
  OpenHour,
  openHourOn,
  Tree,
  wateringOpensAt,
  WithHours,
} from '@/game/tree';
import { treeMood } from '@/ui/live/mood';

/** Under an hour to go the status line counts the minutes down (frame 06b). */
export const COUNTDOWN = 60;

/**
 * - from: "Can be watered from 18:00" (`tomorrow` — a change waiting for tomorrow, frame 05);
 * - in: "Can be watered in 42 min";
 * - late: open, past midnight: "Can be watered until 3:00 at night" (the day ends at 3:00).
 */
export type WaitLine =
  | { kind: 'from'; hour: OpenHour; tomorrow: OpenHour | null }
  | { kind: 'in'; minutes: number }
  | { kind: 'late' };

/**
 * The status line of a tree (or my half of a shared tree) by the time of the game day.
 * `thirsty` — it isn't watered today and today can still be watered (treeMood's 'thirsty').
 * Null — nothing about the time to say: the usual lines.
 */
export function waitLine(hours: WithHours, today: DayKey, clock: GameClock, thirsty: boolean): WaitLine | null {
  if (!thirsty) return null;
  const minutes = minutesUntilOpen(hours, today, clock);
  if (minutes > 0) {
    return minutes < COUNTDOWN ? { kind: 'in', minutes } : { kind: 'from', hour: wateringOpensAt(hours, today), tomorrow: nextOpenHour(hours, today) };
  }
  return clock.hour >= 24 ? { kind: 'late' } : null;
}

/** Not watered today and its hour hasn't come: it waits calmly, it doesn't ask for water. */
export const isWaiting = (hours: WithHours, today: DayKey, clock: GameClock, thirsty: boolean) =>
  thirsty && !canWaterAt(hours, today, clock);

/** One of my own trees waits for its hour today. */
export const treeWaits = (tree: Tree, today: DayKey, clock: GameClock) => isWaiting(tree, today, clock, treeMood(tree, today) === 'thirsty');

/** A third "too early" tap within this long pulses the status line's arrow (frame 07b). */
export const EARLY_WINDOW = 10_000;

/** "Too early" taps in a row: the times kept, and whether this tap is the third within 10 s (then it starts over). */
export function earlyStreak(taps: number[], now: number): { taps: number[]; third: boolean } {
  const recent = [...taps.filter((x) => now - x <= EARLY_WINDOW && x <= now), now];
  return recent.length >= 3 ? { taps: [], third: true } : { taps: recent, third: false };
}

/** The evening offer's hour (спец 7): "Quit" habits are easier to mark from 18:00. */
export const EVENING_HOUR: OpenHour = 18;

/** The trees the one-time "Mark it in the evening?" lists: growing "Quit" trees open all day, no change waiting. */
export const eveningTrees = (trees: Tree[], today: DayKey): Tree[] =>
  trees.filter((x) => x.kind === 'quit' && isGrowing(x) && openHourOn(x, today) === 0 && nextOpenHour(x, today) === null);

/** After the watering-time sheet: "Done: from tomorrow, water from 12:00" — or, back to today's hour, "stays". */
export function changeNote(after: WithHours, today: DayKey): { kind: 'saved' | 'kept'; hour: OpenHour } {
  const next = nextOpenHour(after, today);
  return next === null ? { kind: 'kept', hour: openHourOn(after, today) } : { kind: 'saved', hour: next };
}

/**
 * What the watering-time sheet opens with: the hour from tomorrow (a change waiting, or the hour set),
 * and the one that holds today — on the planting day "any time", whatever is set.
 */
export function sheetHours(hours: WithHours, today: DayKey): { hour: OpenHour; todayHour: OpenHour } {
  return { hour: nextOpenHour(hours, today) ?? openHourOn(hours, today), todayHour: wateringOpensAt(hours, today) };
}

/** The game's time as the phone shows it: "9:05" or "9:05 AM" (24..26 are 0..2 at night). */
export function clockText(clock: GameClock, h24: boolean): string {
  const h = clock.hour % 24;
  const mm = String(clock.minute).padStart(2, '0');
  return h24 ? `${h}:${mm}` : `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
}
