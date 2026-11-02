// The leaderboard among friends (wave 5, design/волна-5/спец-друзья.md, 9.4). Pure functions.
// - "Week": on how many of the last 7 days (today and 6 before) any open tree was watered
//   (any generation; my half of a shared tree counts too).
// - "Best streak": the most days of growth of a growing open tree (shared trees don't count).
// - Sports places: 1 + how many are strictly ahead (7, 6, 6, 6, 5 → 1, 2, 2, 2, 5).
//   Among equals I come first, then by name.
// Only trees friends can see count — mine too, so the board is fair.
import { addDays, DayKey } from './dates';
import { growthDays, isGrowing, Tree } from './tree';

export type Board = 'week' | 'streak';

/** Days of the last 7 (up to today) with at least one watering. */
export function weekDays(trees: Tree[], today: DayKey, extra: DayKey[] = []): number {
  const from = addDays(today, -6);
  const days = new Set<DayKey>();
  for (const day of [...trees.flatMap((t) => t.checkins), ...extra]) if (day >= from && day <= today) days.add(day);
  return days.size;
}

export function bestStreak(trees: Tree[]): number {
  return trees.filter(isGrowing).reduce((m, t) => Math.max(m, growthDays(t)), 0);
}

export interface Entry {
  nick: string;
  name: string;
  me: boolean;
  value: number;
}

export interface Ranked extends Entry {
  place: number;
}

export function rank(entries: Entry[]): Ranked[] {
  const sorted = [...entries].sort((a, b) => b.value - a.value || Number(b.me) - Number(a.me) || a.name.localeCompare(b.name));
  return sorted.map((e) => ({ ...e, place: 1 + entries.filter((x) => x.value > e.value).length }));
}
