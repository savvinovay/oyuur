// What the friends screens show, worked out from the server's data (design/волна-5/спец-друзья.md,
// 4.2, 6.3, 6.5, 6.8). Pure functions, tested; the screens only draw.
import { DayKey, gameDay, GameClock } from '@/game/dates';
import { bestStreak, weekDays } from '@/game/leaders';
import type { Person } from '@/game/shared';
import { canWaterAt, checkedInToday, groupHabits, growthDays, Habit, isCompleted, isDead, isGrowing, Tree, wateringOpensAt } from '@/game/tree';
import { pluralForm, T } from '@/i18n';
import { friendTree, PublicForest } from '@/net/api';

/** A friend's open trees as game trees. */
export const treesOf = (forest: PublicForest | null | undefined): Tree[] => (forest?.trees ?? []).map(friendTree);

/** The name to show: the profile's name, or the @nick. */
export const displayName = (p: Person) => p.name?.trim() || `@${p.nick}`;

/**
 * The name inside a sentence that needs another case ("Подбодрить …", "Деревья …"). The server
 * has no cases of a name, so Russian takes the @nick (спец-друзья 14); English the name.
 */
export const nameInCase = (t: T, p: Person) => (t.lang === 'ru' ? `@${p.nick}` : displayName(p));

export type TodayState =
  | { kind: 'all' }
  | { kind: 'some'; watered: number; total: number }
  | { kind: 'none' }
  /** The friend's phone sent nothing today: we don't know (not "hasn't watered" — 6.8). */
  | { kind: 'noData' }
  /** No growing open trees: nothing to say about today. */
  | { kind: 'noTrees' }
  /** Nothing watered yet, but every unwatered tree waits for its hour (OYUUR-34): "from 18:00", not a miss. */
  | { kind: 'waiting'; hour: number };

/** Did the friend water today, as far as we know (by my calendar). */
export function todayState(trees: Tree[], forestAt: number | null, today: DayKey, clock?: GameClock): TodayState {
  const growing = trees.filter(isGrowing);
  if (growing.length === 0) return { kind: 'noTrees' };
  const watered = growing.filter((x) => checkedInToday(x, today)).length;
  if (watered === growing.length) return { kind: 'all' };
  if (forestAt === null || gameDay(new Date(forestAt)) < today) return watered > 0 ? { kind: 'some', watered, total: growing.length } : { kind: 'noData' };
  if (watered === 0 && clock && growing.every((x) => waitingNow(x, today, clock))) {
    return { kind: 'waiting', hour: Math.min(...growing.map((x) => wateringOpensAt(x, today))) };
  }
  return watered > 0 ? { kind: 'some', watered, total: growing.length } : { kind: 'none' };
}

/**
 * A friend's tree still waits for its watering hour (OYUUR-34, спец 5.4): growing, not watered
 * today, and by my clock its hour hasn't come — "from 18:00", not "hasn't watered". Their hour
 * comes from their data; the clock is mine (we don't know their time zone — a simplification).
 */
export const waitingNow = (tree: Tree, today: DayKey, clock: GameClock): boolean =>
  isGrowing(tree) && !checkedInToday(tree, today) && !canWaterAt(tree, today, clock);

export interface FriendStats {
  /** Growing open trees. */
  growing: number;
  best: number;
  /** Days with watering of the last 7. */
  week: number;
}

export function statsOf(trees: Tree[], today: DayKey): FriendStats {
  return { growing: trees.filter(isGrowing).length, best: bestStreak(trees), week: weekDays(trees, today) };
}

/** By best streak, then by name (4.2). */
export function sortFriends<F extends Person & { forest: PublicForest }>(friends: F[]): F[] {
  const best = new Map(friends.map((f) => [f.nick, bestStreak(treesOf(f.forest))]));
  return [...friends].sort((a, b) => best.get(b.nick)! - best.get(a.nick)! || displayName(a).localeCompare(displayName(b)));
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** How old a friend's data is (6.8): over 3 h — "updated 6 h ago", over 2 days — "last seen 3 days ago". */
export type Freshness = { kind: 'fresh' } | { kind: 'updated'; ms: number } | { kind: 'away'; ms: number };

export function freshness(forestAt: number | null, now: number): Freshness {
  if (forestAt === null) return { kind: 'fresh' };
  const ms = Math.max(0, now - forestAt);
  if (ms > 2 * DAY) return { kind: 'away', ms };
  if (ms > 3 * HOUR) return { kind: 'updated', ms };
  return { kind: 'fresh' };
}

/** "5 мин назад", "6 ч назад", "3 дня назад". */
export function agoText(t: T, ms: number): string {
  if (ms < 60_000) return t('frAgoNow');
  if (ms < HOUR) return t('frAgoMin', { n: Math.floor(ms / 60_000) });
  if (ms < DAY) return t('frAgoHours', { n: Math.floor(ms / HOUR) });
  const n = Math.floor(ms / DAY);
  return t('frAgoDays', { n, word: t.dict.frDayWords[pluralForm(t.lang, n)] });
}

/** "14:05". */
export function clock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "22 окт" / "Oct 22". */
export function shortDate(t: T, ms: number): string {
  const d = new Date(ms);
  const m = t.dict.months[d.getMonth()];
  return t.lang === 'ru' ? `${d.getDate()} ${m}` : `${m} ${d.getDate()}`;
}

/** "3 дерева". */
export const treesText = (t: T, n: number) => t('frCount', { n, word: t.dict.frTreeWords[pluralForm(t.lang, n)] });

/** "1 новая · 1 ждёт ответа" (4.1): new incoming, the rest of incoming, mine waiting. */
export function requestsSummary(t: T, fresh: number, incoming: number, outgoing: number): string {
  const part = (n: number, words: readonly string[]) => t('frCount', { n, word: words[pluralForm(t.lang, n)] });
  const parts: string[] = [];
  if (fresh > 0) parts.push(part(fresh, t.dict.frNewWords));
  if (incoming - fresh > 0) parts.push(part(incoming - fresh, t.dict.frIncomingWords));
  if (outgoing > 0) parts.push(part(outgoing, t.dict.frWaitingWords));
  return parts.join(' · ');
}

/**
 * The requests row's two lines. Only friend requests — "Friend requests" and the summary above;
 * with a shared tree offered to me — "Requests" and what is in them, so the offer isn't taken
 * for a friend request. `fresh` counts both (the badge); `incoming` — friend requests only.
 */
export function requestsRow(
  t: T,
  { fresh, incoming, outgoing, offers }: { fresh: number; incoming: number; outgoing: number; offers: number },
): { title: string; summary: string } {
  if (offers === 0) return { title: t('frRequestsRow'), summary: requestsSummary(t, fresh, incoming, outgoing) };
  if (offers === 1 && incoming === 0 && outgoing === 0) return { title: t('frRequestsAll'), summary: t('frOfferOne') };
  const part = (n: number, words: readonly string[]) => t('frCount', { n, word: words[pluralForm(t.lang, n)] });
  const parts: string[] = [];
  if (incoming > 0) parts.push(part(incoming, t.dict.frFriendRequestWords));
  parts.push(part(offers, t.dict.frSharedTreeWords));
  if (outgoing > 0) parts.push(part(outgoing, t.dict.frWaitingWords));
  return { title: t('frRequestsAll'), summary: parts.join(' · ') };
}

/** A friend's tree rows (6.5): one per habit, growing (most days first), locked in, memory. */
export function treeRows(trees: Tree[]): Habit[] {
  const rank = (h: Habit) => (isGrowing(h.current) ? 0 : isCompleted(h.current) ? 1 : 2);
  return groupHabits(trees).sort((a, b) => rank(a) - rank(b) || growthDays(b.current) - growthDays(a.current));
}

/** The generation before the current one, when it died (for "Previous try of …: 28 days"). */
export function previousTry(h: Habit): Tree | null {
  const prev = h.generations[h.generations.length - 2];
  return prev && isDead(prev) ? prev : null;
}

/** The hero's trees (6.2): up to 4 growing open ones, most days first. */
export function heroTrees(trees: Tree[]): Tree[] {
  return trees.filter(isGrowing).sort((a, b) => growthDays(b) - growthDays(a)).slice(0, 4);
}

/** A cheer I got today, remembered so the card stays until the day ends (4.3). */
export interface CheerIn {
  nick: string;
  /** When (ms); null — known only from the friends list, without the time. */
  at: number | null;
}

/**
 * Today's cheers, newest first: the ones remembered, those in the inbox, and friends whose
 * row says they cheered me today (the inbox forgets a cheer once seen).
 */
export function cheersToday(
  remembered: CheerIn[],
  inbox: { from: Person; day: DayKey; at: number }[],
  cheeredMe: string[],
  today: DayKey,
): CheerIn[] {
  const byNick = new Map<string, CheerIn>();
  const add = (c: CheerIn) => {
    const had = byNick.get(c.nick);
    if (!had || (had.at ?? 0) < (c.at ?? 0)) byNick.set(c.nick, c);
  };
  remembered.forEach(add);
  inbox.filter((c) => c.day === today || gameDay(new Date(c.at)) === today).forEach((c) => add({ nick: c.from.nick, at: c.at }));
  cheeredMe.forEach((nick) => add({ nick, at: null }));
  return [...byNick.values()].sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}

/** Nicks in `a` that are not in `b`, keeping order. */
export const without = <X extends { nick: string }>(a: X[], b: { nick: string }[]) => a.filter((x) => !b.some((y) => y.nick === x.nick));
