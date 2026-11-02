// Achievements and the profile's numbers (wave 5, design/волна-5/решения.md). Pure functions.
// - An achievement is reached by itself (measured from the trees and the rest of the saved
//   data); its acorns are taken with "Claim", once.
// - Nothing is taken back: a deleted tree doesn't undo a claimed achievement.
import { DayKey, addDays } from './dates';
import { growthDays, isCompleted, isDead, isGrowing, Tree } from './tree';

export type AchievementId =
  | 'firstWater'
  | 'days7'
  | 'days30'
  | 'days100'
  | 'days365'
  | 'trees3'
  | 'trees10'
  | 'firstName'
  | 'firstLockIn'
  | 'seedTree'
  | 'noMiss30'
  | 'firstBuy'
  | 'quests7'
  | 'firstFriend';

/** What the achievements are measured from. */
export interface Facts {
  trees: Tree[];
  /** Items bought in the shop. */
  bought: number;
  /** Best run of days with all quests claimed. */
  questBest: number;
  /** Friends (sample friends count). */
  friends: number;
}

export interface AchievementDef {
  id: AchievementId;
  goal: number;
  reward: number;
  measure: (f: Facts) => number;
}

const habitsOf = (trees: Tree[]) => new Set(trees.map((t) => t.lineageId)).size;
const bestDays = (trees: Tree[]) => trees.reduce((m, t) => Math.max(m, growthDays(t)), 0);

/** Longest run of watered days in a row, with no day missed or frozen. */
export function longestRun(tree: Tree): number {
  let best = 0;
  let run = 0;
  let prev: DayKey | null = null;
  for (const day of tree.checkins) {
    run = prev !== null && addDays(prev, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    prev = day;
  }
  return best;
}

/** In the order the profile shows them. */
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'firstWater', goal: 1, reward: 20, measure: (f) => Math.min(1, f.trees.reduce((n, t) => n + t.checkins.length, 0)) },
  { id: 'days7', goal: 7, reward: 30, measure: (f) => bestDays(f.trees) },
  { id: 'days30', goal: 30, reward: 80, measure: (f) => bestDays(f.trees) },
  { id: 'days100', goal: 100, reward: 150, measure: (f) => bestDays(f.trees) },
  { id: 'days365', goal: 365, reward: 200, measure: (f) => bestDays(f.trees) },
  { id: 'trees3', goal: 3, reward: 30, measure: (f) => habitsOf(f.trees) },
  { id: 'trees10', goal: 10, reward: 100, measure: (f) => habitsOf(f.trees) },
  { id: 'firstName', goal: 1, reward: 20, measure: (f) => (f.trees.some((t) => t.namedOn !== null) ? 1 : 0) },
  { id: 'firstLockIn', goal: 1, reward: 50, measure: (f) => (f.trees.some(isCompleted) ? 1 : 0) },
  { id: 'seedTree', goal: 1, reward: 30, measure: (f) => (f.trees.some((t) => t.generation > 1) ? 1 : 0) },
  { id: 'noMiss30', goal: 30, reward: 100, measure: (f) => f.trees.reduce((m, t) => Math.max(m, longestRun(t)), 0) },
  { id: 'firstBuy', goal: 1, reward: 20, measure: (f) => Math.min(1, f.bought) },
  { id: 'quests7', goal: 7, reward: 80, measure: (f) => f.questBest },
  { id: 'firstFriend', goal: 1, reward: 20, measure: (f) => Math.min(1, f.friends) },
];

export const ACHIEVEMENT_IDS = ACHIEVEMENTS.map((a) => a.id);

/** Achievements claimed, with the day. */
export type Claimed = Partial<Record<AchievementId, DayKey>>;

export type AchievementState = 'claimed' | 'ready' | 'locked';

export interface AchievementView {
  id: AchievementId;
  /** Progress, capped at the goal (a claimed one shows full). */
  value: number;
  goal: number;
  reward: number;
  state: AchievementState;
  claimedOn: DayKey | null;
}

export function achievementViews(f: Facts, claimed: Claimed): AchievementView[] {
  return ACHIEVEMENTS.map((a) => {
    const on = claimed[a.id] ?? null;
    const value = on ? a.goal : Math.min(a.goal, a.measure(f));
    const state: AchievementState = on ? 'claimed' : value >= a.goal ? 'ready' : 'locked';
    return { id: a.id, value, goal: a.goal, reward: a.reward, state, claimedOn: on };
  });
}

/** "Claim": the reward once, if reached. */
export function claimAchievement(claimed: Claimed, id: AchievementId, f: Facts, today: DayKey): { claimed: Claimed; reward: number } {
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a || claimed[id] || a.measure(f) < a.goal) return { claimed, reward: 0 };
  return { claimed: { ...claimed, [id]: today }, reward: a.reward };
}

export const readyCount = (f: Facts, claimed: Claimed) => achievementViews(f, claimed).filter((v) => v.state === 'ready').length;

export function migrateClaimed(saved: unknown): Claimed {
  if (!saved || typeof saved !== 'object') return {};
  const out: Claimed = {};
  for (const [id, day] of Object.entries(saved as Record<string, unknown>)) {
    if (ACHIEVEMENT_IDS.includes(id as AchievementId) && typeof day === 'string') out[id as AchievementId] = day;
  }
  return out;
}

// ---- The profile's numbers ----

export interface Stats {
  /** Every watering ever, all trees. */
  waterings: number;
  growing: number;
  lockedIn: number;
  memories: number;
  /** The most days of growth of any tree. */
  bestDays: number;
}

export function statsOf(trees: Tree[]): Stats {
  return {
    waterings: trees.reduce((n, t) => n + t.checkins.length, 0),
    growing: trees.filter(isGrowing).length,
    lockedIn: trees.filter(isCompleted).length,
    memories: trees.filter(isDead).length,
    bestDays: bestDays(trees),
  };
}
