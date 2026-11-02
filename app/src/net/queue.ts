// Actions done without network wait here and go out when it comes back (spec 11.1).
// Pure functions; the friends state keeps the queue in storage.
import type { DayKey } from '@/game/dates';

export type Queued =
  | { kind: 'cheer'; nick: string; day: DayKey }
  | { kind: 'water'; treeId: string; day: DayKey };

export interface QueueItem {
  action: Queued;
  tries: number;
  at: number;
  /** The account (@nick) it was done by: it goes out only from that account. */
  owner: string;
}

/** After this many failed tries (not counting "no network") an action is dropped. */
export const MAX_TRIES = 5;

const keyOf = (a: Queued) => (a.kind === 'cheer' ? `cheer:${a.nick}:${a.day}` : `water:${a.treeId}:${a.day}`);

/** Adds an action unless the same one is already waiting. */
export function enqueue(queue: QueueItem[], action: Queued, now: number, owner: string): QueueItem[] {
  return queue.some((q) => q.owner === owner && keyOf(q.action) === keyOf(action)) ? queue : [...queue, { action, tries: 0, at: now, owner }];
}

/** What waits for this account (older items without an owner count as anyone's). */
export const ownedBy = (queue: QueueItem[], owner: string) => queue.filter((q) => !q.owner || q.owner === owner);

/** The action went through (or the server said it can never go): off the queue. */
export const settled = (queue: QueueItem[], action: Queued) => queue.filter((q) => keyOf(q.action) !== keyOf(action));

/** The server refused for now: one more try, dropped after MAX_TRIES. */
export const failed = (queue: QueueItem[], action: Queued) =>
  queue
    .map((q) => (keyOf(q.action) === keyOf(action) ? { ...q, tries: q.tries + 1 } : q))
    .filter((q) => q.tries < MAX_TRIES);

/** Is this action waiting (shown as done, with a "will be sent" mark)? */
export const waiting = (queue: QueueItem[], action: Queued) => queue.some((q) => keyOf(q.action) === keyOf(action));
