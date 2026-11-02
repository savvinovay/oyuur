// A tree shared by two friends (wave 5, design/волна-5/спец-друзья.md, 8.7). Pure functions.
// - It grows on a day only if both watered it that day, each by their own calendar.
// - Chances are shared, the same rules as any tree (settle in tree.ts): a missed day uses a
//   chance, none left — it dies; +1 on the 1st of the month.
// - A day is judged one day late: yesterday may still get the friend's watering (time zones,
//   no network). So "today" for the rules is yesterday.
// - It ends when one of them leaves, unfriends or blocks: it stays as a memory for both.
import { addDays, DayKey, GameClock } from './dates';
import { canWaterAt, defaultOpenHour, HabitKind, isGrowing, migrateOpenHours, OpenHour, OpenHourEntry, plantTree, setOpenHour, settle, Skin, SKINS, Tree, WithHours } from './tree';

export type SharedStatus = 'proposed' | 'active' | 'declined' | 'ended';

/** A person as the server shows them. */
export interface Person {
  nick: string;
  name: string | null;
  avatar: string;
  color: number;
}

/** A shared tree as the server keeps it. */
export interface SharedTree {
  id: string;
  name: string;
  kind: HabitKind;
  skin: Skin;
  status: SharedStatus;
  /** The day it was accepted (planted for both); null while only offered. */
  plantedOn: DayKey | null;
  createdAt: number;
  endedAt: number | null;
  proposer: Person | null;
  partner: Person | null;
  /** Each side's watering days, by nick. */
  waterings: Record<string, DayKey[]>;
}

/** The other person of a shared tree. */
export const partnerOf = (s: SharedTree, me: string): Person | null => (s.proposer?.nick === me ? s.partner : s.proposer);

/** Days both watered, in order. */
export function bothWatered(s: SharedTree): DayKey[] {
  const [a, b] = [s.proposer?.nick, s.partner?.nick].map((n) => new Set(n ? (s.waterings[n] ?? []) : []));
  return [...a].filter((d) => b.has(d)).sort();
}

export const wateredBy = (s: SharedTree, nick: string, day: DayKey) => (s.waterings[nick] ?? []).includes(day);

/**
 * The shared tree as a game tree (for drawing, stages, chances, death): check-ins are the
 * days both watered. `today` — mine; days are judged up to the day before yesterday.
 * An ended tree is a memory: locked in on the day it ended (if it wasn't dead already).
 */
export function sharedAsTree(s: SharedTree, now: DayKey, endedOn: DayKey | null = null): Tree {
  // An ended tree stops on its last day: later days are never judged (a memory doesn't die).
  const today = s.status === 'ended' && endedOn !== null && endedOn < now ? endedOn : now;
  const plantedOn = s.plantedOn ?? today;
  const base = plantTree({ id: `shared:${s.id}`, name: s.name, kind: s.kind, visibility: 'friends', today: plantedOn, skin: SKINS.includes(s.skin) ? s.skin : 'oak' });
  const checkins = bothWatered(s).filter((d) => d >= plantedOn && d <= today);
  const judgedTo = addDays(today, -1);
  let tree = settle({ ...base, checkins }, judgedTo < plantedOn ? plantedOn : judgedTo);
  // Settling against yesterday leaves today's both-watering counted already (it's in checkins).
  if (s.status === 'ended' && isGrowing(tree)) tree = { ...tree, completedOn: endedOn ?? today };
  return tree;
}

/** Today for the shared tree: who has watered. */
export function todayOf(s: SharedTree, me: string, today: DayKey) {
  const friend = partnerOf(s, me);
  return { mine: wateredBy(s, me, today), theirs: friend ? wateredBy(s, friend.nick, today) : false };
}

// ---- Watering time (OYUUR-34): each of the two has their own, kept on their own phone ----

/**
 * My half of a shared tree for the watering-time rules; `saved` — my hours kept on the phone.
 * `oldUntil` — the day this phone got the watering time: trees planted by then stay "any time"
 * (as old trees of one's own, nothing closes suddenly); later ones go by the kind.
 */
export function myHalf(s: SharedTree, saved: OpenHourEntry[] | undefined, today: DayKey, oldUntil: DayKey | null = null): WithHours {
  const plantedOn = s.plantedOn ?? today;
  const hour = oldUntil !== null && plantedOn <= oldUntil ? 0 : defaultOpenHour(s.kind);
  return { plantedOn, openHours: saved ? migrateOpenHours(saved, plantedOn) : [{ from: plantedOn, hour }] };
}

/** My half can be watered at this time of the game day (never before its planting day). */
export const canWaterHalf = (half: WithHours, day: DayKey, clock: GameClock) => day >= half.plantedOn && canWaterAt(half, day, clock);

/** A new hour for my half, from tomorrow (as setOpenHour). */
export function setMyHour(half: WithHours, hour: OpenHour, today: DayKey): OpenHourEntry[] {
  const tree = { ...plantTree({ id: 'half', name: '', kind: 'do', visibility: 'private', today: half.plantedOn }), openHours: half.openHours };
  return setOpenHour(tree, hour, today).openHours;
}
