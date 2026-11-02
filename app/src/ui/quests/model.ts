// What the quest sheet and the menu tile show (wave 5 spec, sections 4.2–4.3 and 5), read
// from today's quests. Pure: the rules themselves are in game/quests.ts.
import { DAY_START_HOUR, DayKey, GameClock } from '@/game/dates';
import { QuestId, Quests, unclaimed } from '@/game/quests';
import { canWaterAt, checkedInToday, isGrowing, OpenHour, Tree, wateringOpensAt, WithHours } from '@/game/tree';

export type RowState = 'open' | 'done' | 'claimed';

export interface QuestRow {
  id: QuestId;
  state: RowState;
  /** Quests with a count ("Water all your trees": watered today / growing); null — none. */
  progress: { n: number; total: number } | null;
}

const isToday = (q: Quests, today: DayKey) => q.day === today;

export function questRows(q: Quests, today: DayKey, trees: Tree[]): QuestRow[] {
  if (!isToday(q, today)) return [];
  return q.ids.map((id) => {
    const state: RowState = q.claimed.includes(id) ? 'claimed' : q.done.includes(id) ? 'done' : 'open';
    let progress: QuestRow['progress'] = null;
    if (id === 'waterAll') {
      // Trees watered today stay counted even if one was locked in since.
      const growing = trees.filter((t) => isGrowing(t) || (checkedInToday(t, today) && t.completedOn === today));
      const total = Math.max(1, growing.length);
      const n = state === 'open' ? Math.min(total, growing.filter((t) => checkedInToday(t, today)).length) : total;
      progress = { n, total };
    }
    return { id, state, progress };
  });
}

/** The basket for all of today's quests: a dot per quest (done or not). */
export function basketOf(q: Quests, today: DayKey): { state: 'waiting' | 'ready' | 'claimed'; dots: boolean[] } {
  const ids = isToday(q, today) ? q.ids : [];
  const dots = ids.map((id) => q.done.includes(id));
  const state = isToday(q, today) && q.bonus ? 'claimed' : dots.length > 0 && dots.every(Boolean) ? 'ready' : 'waiting';
  return { state, dots };
}

export type QuestCaption = { kind: 'of'; n: number; total: number } | { kind: 'claim' } | { kind: 'done' };

/** The "Quests" tile: the red number (done, not claimed) and the line under its name. */
export function menuQuests(q: Quests, today: DayKey): { count: number; caption: QuestCaption | null } {
  if (!isToday(q, today) || q.ids.length === 0) return { count: 0, caption: null };
  const count = unclaimed(q, today);
  const done = q.ids.filter((id) => q.done.includes(id)).length;
  if (q.ids.every((id) => q.claimed.includes(id))) return { count, caption: { kind: 'done' } };
  if (done === q.ids.length) return { count, caption: { kind: 'claim' } };
  return { count, caption: { kind: 'of', n: done, total: q.ids.length } };
}

/** Time to the new game day (3:00 at night, OYUUR-33 3), rounded up to a minute; under a minute — { 0, 0 }. */
export function untilNewDay(now: Date): { h: number; m: number } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), DAY_START_HOUR);
  const next = now.getTime() < start.getTime() ? start : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, DAY_START_HOUR);
  const secs = Math.ceil((next.getTime() - now.getTime()) / 1000);
  if (secs < 60) return { h: 0, m: 0 };
  const mins = Math.ceil(secs / 60);
  return { h: Math.floor(mins / 60), m: mins % 60 };
}

// ---- Watering time (OYUUR-33 9) ----

/**
 * "Can be watered from 18:00" under "Water all your trees" / "Water the shared tree": the soonest
 * hour, while every tree (or half) still to water waits for its hour. Null — one can be watered now,
 * or none is left.
 */
export function waitFrom(left: WithHours[], today: DayKey, clock: GameClock): OpenHour | null {
  if (left.length === 0 || left.some((x) => canWaterAt(x, today, clock))) return null;
  return Math.min(...left.map((x) => wateringOpensAt(x, today)));
}

/** "Go" of a watering quest: a habit that can be watered now, else the one that opens soonest (`waits`). */
export function waterTarget(list: { index: number; minutes: number }[]): { index: number; waits: boolean } | null {
  let best: { index: number; minutes: number } | null = null;
  for (const x of list) if (!best || x.minutes < best.minutes) best = x;
  return best ? { index: best.index, waits: best.minutes > 0 } : null;
}
