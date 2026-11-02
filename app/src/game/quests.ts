// Daily quests (wave 5, design/волна-5/решения.md). Pure functions: no storage, no UI, no clock.
// - Each day has 3 quests. "Water all your trees" is always the first while any tree grows;
//   the rest come from the pool in an order of their own for the date, only ones that can be
//   done today, and not yesterday's when there are others.
// - A quest counts by itself once done; its 10 acorns are taken with "Claim". Claiming all
//   three gives 15 more. Days with all three claimed in a row make a streak (an achievement).
import { addDays, DayKey } from './dates';

export type QuestId =
  | 'waterAll'
  | 'visitForest'
  | 'nameTree'
  | 'moveTree'
  | 'visitFriend'
  | 'cheerFriend'
  | 'plantHabit'
  | 'waterShared';

export const QUESTS_PER_DAY = 3;
export const QUEST_REWARD = 10;
export const ALL_QUESTS_BONUS = 15;

/** What today's quests can ask for. */
export interface QuestContext {
  /** Trees still growing. */
  growing: number;
  /** Habits (places in the forest). */
  habits: number;
  /** Some tree has no name yet. */
  unnamed: boolean;
  /** Friends shown (sample friends count). */
  friends: number;
  /** A shared tree with a friend exists. */
  shared: boolean;
}

const POOL: { id: QuestId; can: (c: QuestContext) => boolean }[] = [
  { id: 'visitForest', can: (c) => c.habits > 0 },
  { id: 'nameTree', can: (c) => c.unnamed },
  { id: 'moveTree', can: (c) => c.habits >= 2 },
  { id: 'visitFriend', can: (c) => c.friends > 0 },
  { id: 'cheerFriend', can: (c) => c.friends > 0 },
  { id: 'plantHabit', can: (c) => c.habits < 3 },
  { id: 'waterShared', can: (c) => c.shared },
];

export interface Quests {
  /** The day the quests below are for; null — never rolled. */
  day: DayKey | null;
  ids: QuestId[];
  done: QuestId[];
  claimed: QuestId[];
  /** The bonus for all three was paid. */
  bonus: boolean;
  /** Days in a row with all quests claimed, up to `streakDay`. */
  streak: number;
  streakDay: DayKey | null;
  best: number;
  /** When the day's quests were picked (HLC, merge.ts): on a merge of the same day the earlier pick stays. */
  rolledAt?: string;
}

export const newQuests = (): Quests => ({ day: null, ids: [], done: [], claimed: [], bonus: false, streak: 0, streakDay: null, best: 0 });

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Today's quests, picked once a day; the same day keeps its quests whatever happens — except
 * a day picked before the first tree (only "plant a habit" then): once a tree grows and
 * nothing is claimed yet, the day gets its full three (what is done stays done).
 */
export function rollQuests(q: Quests, today: DayKey, ctx: QuestContext): Quests {
  // Quests of a later day (saved after midnight by a version without the 3:00 day) stay until it comes.
  if (q.day !== null && q.day > today) return q;
  const bare = q.day === today && ctx.growing > 0 && !q.ids.includes('waterAll') && q.claimed.length === 0;
  if (q.day === today && !bare) return q;
  const first: QuestId[] = ctx.growing > 0 ? ['waterAll'] : [];
  const yesterday = q.day === addDays(today, -1) ? q.ids : [];
  // A re-roll of a bare day keeps the streak as it was.
  const base = bare ? { ...q, day: null } : q;
  const open = POOL.filter((p) => p.can(ctx)).map((p) => p.id);
  const order = (id: QuestId) => hash(`${today}:${id}`);
  const fresh = open.filter((id) => !yesterday.includes(id)).sort((a, b) => order(a) - order(b));
  const again = open.filter((id) => yesterday.includes(id)).sort((a, b) => order(a) - order(b));
  const ids = [...first, ...fresh, ...again].slice(0, QUESTS_PER_DAY);
  return { ...base, day: today, ids, done: bare ? q.done.filter((id) => ids.includes(id)) : [], claimed: [], bonus: false };
}

/** Something happened that a quest asks for: counts only if it is one of today's. */
export function questDone(q: Quests, id: QuestId, today: DayKey): Quests {
  if (q.day !== today || !q.ids.includes(id) || q.done.includes(id)) return q;
  return { ...q, done: [...q.done, id] };
}

/** Days in a row with all quests claimed, as of today (a missed day breaks it). */
export const questStreak = (q: Quests, today: DayKey) =>
  q.streakDay === today || q.streakDay === addDays(today, -1) ? q.streak : 0;

/** "Claim": the quest's reward, plus the bonus when it was the last one. */
export function claimQuest(q: Quests, id: QuestId, today: DayKey): { quests: Quests; reward: number } {
  if (q.day !== today || !q.done.includes(id) || q.claimed.includes(id)) return { quests: q, reward: 0 };
  const claimed = [...q.claimed, id];
  const all = q.ids.length > 0 && q.ids.every((x) => claimed.includes(x));
  let next: Quests = { ...q, claimed };
  let reward = QUEST_REWARD;
  if (all && !q.bonus) {
    reward += ALL_QUESTS_BONUS;
    const streak = questStreak(q, today) + 1;
    next = { ...next, bonus: true, streak, streakDay: today, best: Math.max(q.best, streak) };
  }
  return { quests: next, reward };
}

/** Quests done but not claimed yet (the dot on the menu tile). */
export const unclaimed = (q: Quests, today: DayKey) =>
  q.day === today ? q.done.filter((id) => !q.claimed.includes(id)).length : 0;

const QUEST_IDS: QuestId[] = ['waterAll', ...POOL.map((p) => p.id)];
const ids = (list: unknown): QuestId[] =>
  Array.isArray(list) ? [...new Set(list.filter((x): x is QuestId => QUEST_IDS.includes(x as QuestId)))] : [];
const count = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0);

export function migrateQuests(saved: Partial<Quests> | undefined): Quests {
  if (!saved) return newQuests();
  return {
    day: typeof saved.day === 'string' ? saved.day : null,
    ids: ids(saved.ids),
    done: ids(saved.done),
    claimed: ids(saved.claimed),
    bonus: saved.bonus === true,
    streak: count(saved.streak),
    streakDay: typeof saved.streakDay === 'string' ? saved.streakDay : null,
    best: count(saved.best),
    ...(typeof saved.rolledAt === 'string' ? { rolledAt: saved.rolledAt } : {}),
  };
}
