// What the shared-tree screens show (спец-друзья 8): pure functions over the server's
// SharedTree and the rules in game/shared.ts. Tested in __tests__/model.test.ts.
import { addDays, DayKey, gameDay } from '@/game/dates';
import { atNick } from '@/game/nick';
import { partnerOf, Person, SharedTree, sharedAsTree, todayOf, wateredBy } from '@/game/shared';
import { Habit, isDead, Tree } from '@/game/tree';

/**
 * Where a shared tree stands for me:
 * - invited: I offered it, waiting for the friend; invitedMe: the friend offered it to me;
 * - none / mine / theirs / both: growing, who has watered today;
 * - dead: no chances were left; ended: someone left (a memory).
 */
export type SharedPhase = 'invited' | 'invitedMe' | 'none' | 'mine' | 'theirs' | 'both' | 'dead' | 'ended';

export function sharedPhase(s: SharedTree, me: string, today: DayKey): SharedPhase {
  if (s.status === 'proposed') return s.proposer?.nick === me ? 'invited' : 'invitedMe';
  if (s.status !== 'active') return 'ended';
  if (isDead(sharedAsTree(s, today))) return 'dead';
  const { mine, theirs } = todayOf(s, me, today);
  return mine && theirs ? 'both' : mine ? 'mine' : theirs ? 'theirs' : 'none';
}

/** The open shared tree (offered or growing) with a friend; null — none. One per pair (server rule). */
export function openWith(list: SharedTree[], me: string, friend: string): SharedTree | null {
  return list.find((s) => (s.status === 'proposed' || s.status === 'active') && partnerOf(s, me)?.nick === friend) ?? null;
}

/** Shared trees that stand on my main screen: the growing ones (and dead ones until someone leaves). */
export const homeShared = (list: SharedTree[]) => list.filter((s) => s.status === 'active' && s.plantedOn !== null);

/** The main screen's id of a shared tree: the same as sharedAsTree's tree id. */
export const sharedTreeId = (id: string) => `shared:${id}`;
export const isSharedId = (treeId: string) => treeId.startsWith('shared:');
export const sharedIdOf = (treeId: string) => treeId.slice('shared:'.length);

/** A shared tree as a one-generation habit for the main screen's meadow. */
export function sharedHabit(s: SharedTree, today: DayKey): Habit {
  const tree = sharedAsTree(s, today);
  return { lineageId: tree.lineageId, generations: [tree], current: tree };
}

/** The day a stopped shared tree ended, by my calendar; null — it has not. */
export const endedOn = (s: SharedTree): DayKey | null => (s.endedAt ? gameDay(new Date(s.endedAt)) : null);

/**
 * Shared trees in my forest's list (спец 8.4, 8.7): every one that was planted — growing (or dead)
 * first, then the memories, the latest to end on top. Offers and declined ones never grew.
 */
export function forestShared(list: SharedTree[]): SharedTree[] {
  const planted = list.filter((s) => s.plantedOn !== null && (s.status === 'active' || s.status === 'ended'));
  const growing = planted.filter((s) => s.status === 'active');
  const ended = planted.filter((s) => s.status === 'ended').sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
  return [...growing, ...ended];
}

/**
 * A shared tree as a habit of one tree, a stopped one as it was on the day it ended (a memory).
 * The memory is judged on that day: the days after it, with nobody watering, must not kill it.
 */
export function memoryHabit(s: SharedTree, today: DayKey): Habit {
  const end = endedOn(s);
  const tree = sharedAsTree(s, today, end);
  return { lineageId: tree.lineageId, generations: [tree], current: tree };
}

/** A shared tree in my forest's list: its picture as a habit, the friend, and which line it gets. */
export interface SharedRow {
  id: string;
  habit: Habit;
  friend: Person | null;
  /** growing — still on the main screen; dead — no chances were left; memory — someone left. */
  state: 'growing' | 'dead' | 'memory';
}

export function sharedRow(s: SharedTree, me: string, today: DayKey): SharedRow {
  const habit = memoryHabit(s, today);
  const state = isDead(habit.current) ? 'dead' : s.status === 'ended' ? 'memory' : 'growing';
  return { id: s.id, habit, friend: partnerOf(s, me), state };
}

/**
 * My half can be watered now: signed in, the tree growing (not stopped, not dead) and not watered
 * by me today. Otherwise `waterShared` would do nothing, and nothing must play.
 */
export function canWaterShared(s: SharedTree | null | undefined, me: string | null, today: DayKey): boolean {
  if (!s || !me || s.status !== 'active' || s.plantedOn === null) return false;
  if (wateredBy(s, me, today)) return false;
  return !isDead(sharedAsTree(s, today));
}

export interface Halves {
  mine: boolean;
  theirs: boolean;
}

/**
 * What changed between the halves on screen and the data: a half watered just now plays its
 * show; anything else (a new day took the halves away) is shown at once (`reset`).
 */
export function wateringChange(was: Halves, now: Halves) {
  const iDid = !was.mine && now.mine;
  const theyDid = !was.theirs && now.theirs;
  return { iDid, theyDid, both: now.mine && now.theirs, reset: !iDid && !theyDid };
}

/**
 * How thirsty the tree looks (спец 8.5): nobody watered — 1, one of us — 0.5, both — 0.
 * `waits` — my half waits for my watering hour (OYUUR-34): the tree is calm, as on the main screen.
 */
export const thirstOf = (mine: boolean, theirs: boolean, waits = false) => (waits ? 0 : mine && theirs ? 0 : mine || theirs ? 0.5 : 1);

/** One day of the shared tree for the day columns (спец 8.4, 8.5). */
export interface PairDay {
  day: DayKey;
  mine: boolean;
  theirs: boolean;
  /** Both watered: the day counted. */
  counted: boolean;
  /** A shared chance covered the day. */
  frozen: boolean;
  /** Yesterday without the friend's watering: the server may still hear of it (8.7). */
  counting: boolean;
  today: boolean;
  future: boolean;
  /** Before the tree was planted. */
  before: boolean;
  /** After it died (or stopped): nothing to show. */
  after: boolean;
  /** The day it died. */
  died: boolean;
}

export function pairDays(s: SharedTree, me: string, today: DayKey, from: DayKey, count: number): PairDay[] {
  const friend = partnerOf(s, me)?.nick ?? '';
  // A memory as it was when it stopped: the days after it are just not there.
  const tree: Tree = memoryHabit(s, today).current;
  const planted = s.plantedOn ?? today;
  const days: PairDay[] = [];
  for (let i = 0; i < count; i++) {
    const day = addDays(from, i);
    const mine = wateredBy(s, me, day);
    const theirs = friend !== '' && wateredBy(s, friend, day);
    const counted = tree.checkins.includes(day);
    days.push({
      day,
      mine,
      theirs,
      counted,
      frozen: tree.frozen.includes(day),
      counting: day === addDays(today, -1) && !counted && !tree.frozen.includes(day) && day >= planted,
      today: day === today,
      future: day > today,
      before: day < planted,
      after: (tree.diedOn !== null && day > tree.diedOn) || (tree.completedOn !== null && day >= tree.completedOn),
      died: tree.diedOn === day,
    });
  }
  return days;
}

/** A person's name as it stands alone ("Аиша", or "@aisha" without a name). */
export const nameOf = (p: Person | null | undefined) => (p ? p.name?.trim() || atNick(p.nick) : '');

/**
 * A person's name where Russian needs a case ("с Аишей", "ждём Аишу"): the app has no case
 * forms of names yet, so it is the @nick, which reads right in any case (спец-друзья 14).
 */
export const nameIn = (p: Person | null | undefined, lang: string) => (!p ? '' : lang === 'ru' ? atNick(p.nick) : nameOf(p));

/** "Taken" errors of an offer, for their messages. */
export type ProposeError = 'shared_exists' | 'too_many_shared' | 'friend_too_many_shared' | 'offline' | 'other';
export function proposeError(code: string, status: number): ProposeError {
  if (status === 0) return 'offline';
  return code === 'shared_exists' || code === 'too_many_shared' || code === 'friend_too_many_shared' ? code : 'other';
}
