// What the leaderboard shows (спец-друзья 9), from the store and the friends' data. Pure.
// The counting itself is the game's (game/leaders.ts); here it is only laid out for the screen:
// who takes part, places with ties, the week's dots, the best tree's line.
import { addDays, DayKey } from '@/game/dates';
import { Board, bestStreak, rank, weekDays } from '@/game/leaders';
import type { Person, SharedTree } from '@/game/shared';
import { growthDays, isGrowing, Skin, Tree } from '@/game/tree';
import { friendTree, PublicTree } from '@/net/api';

export interface Player {
  nick: string;
  /** The shown name: "You" for me, a friend's name or @nick. */
  name: string;
  me: boolean;
  avatar: string;
  color: number;
  /** Only trees friends can see. */
  trees: Tree[];
  /** Watering days of this person's half of shared trees (count in "This week"). */
  extra: DayKey[];
}

/** A day of the week row: watered, not watered, today and not yet. */
export type Dot = 'on' | 'off' | 'wait';

export interface BoardRow {
  player: Player;
  /** null — not taking part (no open trees). */
  value: number | null;
  place: number | null;
  /** Names of the others on the same place, for screen readers. */
  tiedWith: string[];
  dots: Dot[];
  /** The tree behind "Best streak". */
  best: { habit: string; skin: Skin } | null;
}

export interface BoardView {
  /** Taking part, by place: the first three stand on the podium. */
  ranked: BoardRow[];
  /** Not taking part: me first, then by name. */
  out: BoardRow[];
}

/** The place as shown: "=2" when shared with others (a tie must not look like a mistake), "" — not taking part. */
export function placeLabel(row: Pick<BoardRow, 'place' | 'tiedWith'>): string {
  if (row.place === null) return '';
  return row.tiedWith.length > 0 ? `=${row.place}` : `${row.place}`;
}

/** The last 7 days, oldest first. */
export function weekDots(trees: Tree[], today: DayKey, extra: DayKey[] = []): Dot[] {
  const days = new Set([...trees.flatMap((t) => t.checkins), ...extra]);
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i - 6);
    if (days.has(day)) return 'on';
    return day === today ? 'wait' : 'off';
  });
}

/** The growing tree with the most days of growth (the first of equals). */
export function bestTree(trees: Tree[]): Tree | null {
  return trees.filter(isGrowing).reduce<Tree | null>((best, t) => (!best || growthDays(t) > growthDays(best) ? t : best), null);
}

export function takesPart(p: Player, board: Board): boolean {
  return p.trees.length > 0 || (board === 'week' && p.extra.length > 0);
}

export function buildBoard(players: Player[], board: Board, today: DayKey): BoardView {
  const row = (p: Player, value: number | null, place: number | null): BoardRow => {
    const best = bestTree(p.trees);
    return {
      player: p,
      value,
      place,
      tiedWith: [],
      dots: weekDots(p.trees, today, p.extra),
      best: best ? { habit: best.name, skin: best.skin } : null,
    };
  };
  const taking = players.filter((p) => takesPart(p, board));
  const byNick = new Map(taking.map((p) => [p.nick, p]));
  const places = rank(
    taking.map((p) => ({ nick: p.nick, name: p.name, me: p.me, value: board === 'week' ? weekDays(p.trees, today, p.extra) : bestStreak(p.trees) })),
  );
  const ranked = places.map((e) => row(byNick.get(e.nick)!, e.value, e.place));
  for (const r of ranked) r.tiedWith = ranked.filter((x) => x !== r && x.place === r.place).map((x) => x.player.name);
  const out = players
    .filter((p) => !takesPart(p, board))
    .sort((a, b) => Number(b.me) - Number(a.me) || a.name.localeCompare(b.name))
    .map((p) => row(p, null, null));
  return { ranked, out };
}

/** The friends' data as players: their open trees and their halves of our shared trees. */
export function playersOf(p: {
  me: Person;
  youName: string;
  myTrees: Tree[];
  friends: (Person & { forest: { trees: PublicTree[] } })[];
  shared: SharedTree[];
}): Player[] {
  const halves = (nick: string) =>
    p.shared.filter((s) => s.status === 'active' || s.status === 'ended').flatMap((s) => s.waterings[nick] ?? []);
  const me: Player = {
    nick: p.me.nick,
    name: p.youName,
    me: true,
    avatar: p.me.avatar,
    color: p.me.color,
    trees: p.myTrees.filter((t) => t.visibility === 'friends'),
    extra: halves(p.me.nick),
  };
  const friends = p.friends.map<Player>((f) => ({
    nick: f.nick,
    name: f.name || `@${f.nick}`,
    me: false,
    avatar: f.avatar,
    color: f.color,
    trees: f.forest.trees.map(friendTree),
    // Only shared trees with me are known: those halves count for them too.
    extra: halves(f.nick),
  }));
  return [me, ...friends];
}

/** Friends who watered at least one open tree today. */
export function friendsWateredToday(friends: { forest: { trees: PublicTree[] } }[], today: DayKey): number {
  return friends.filter((f) => f.forest.trees.some((t) => t.checkins.includes(today))).length;
}
