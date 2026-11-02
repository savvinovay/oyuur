// The tree's own name ("Дубок"), apart from the habit's ("No sugar"). Pure functions:
// no storage, no UI. Rules (wave 4 spec, sections 1, 3.5, 7; decided with the owner):
// - The app offers a name after a watering, from the 3rd day of growth: a bubble by the
//   tree, never a window on its own. One offer a day for the whole app, at most 3 per tree;
//   after "Later" — again only at the next stage and 3+ days later. Dead and locked-in trees
//   are never offered one (they can be named from the forest).
// - A name is 1–20 letters, numbers, spaces, hyphens, apostrophes or dots. No emoji.
// - A tree from a seed has no name; the previous generation's name is offered as "… II".
import { DayKey, daysBetween } from './dates';
import { NAME_MAX } from './nameText';
import { checkedInToday, growthDays, isGrowing, stageOf, Tree } from './tree';

// What a name may hold lives apart (nameText.ts): tree.ts needs it too, without a cycle.
export { cleanTyping, finalName, NAME_MAX } from './nameText';

export const NAME_FROM_DAY = 3;
export const MAX_NAME_ASKS = 3;
/** Days between two offers for the same tree. */
export const NAME_ASK_GAP = 3;

/** Right after a watering finished: should the tree ask for a name now? (table 1.1) */
export function shouldAskName(tree: Tree, today: DayKey, all: Tree[]): boolean {
  if (!isGrowing(tree) || tree.nickname !== null) return false;
  if (!checkedInToday(tree, today)) return false;
  const days = growthDays(tree);
  if (days < NAME_FROM_DAY || tree.nameAsks >= MAX_NAME_ASKS) return false;
  if (tree.nameAskedOn === today) return false;
  if (all.some((t) => t.id !== tree.id && t.nameAskedOn === today)) return false;
  if (tree.nameAsks === 0) return true;
  const newStage = stageOf(days - 1).index < stageOf(days).index;
  return newStage && tree.nameAskedOn !== null && daysBetween(tree.nameAskedOn, today) >= NAME_ASK_GAP;
}

/** Is the "What's my name?" bubble up today? (1.2) */
export function nameAskOpen(tree: Tree, today: DayKey): boolean {
  return isGrowing(tree) && tree.nickname === null && tree.nameAskedOn === today && tree.nameLaterOn !== today;
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];

/** "Тихон" → "Тихон II", "Тихон II" → "Тихон III", …, "… XX" → "… II"; fits 20. */
export function heirName(prev: string): string {
  const parts = prev.trim().split(' ');
  const n = parts.length > 1 ? ROMAN.indexOf(parts[parts.length - 1]) : -1;
  const counted = n >= 2;
  const base = counted ? parts.slice(0, -1).join(' ') : prev.trim();
  const next = counted && n < 20 ? n + 1 : 2;
  const suffix = ` ${ROMAN[next]}`;
  const room = NAME_MAX - suffix.length;
  let cut = Array.from(base);
  if (cut.length > room) {
    cut = cut.slice(0, room);
    // By a word when there is one.
    const space = cut.lastIndexOf(' ');
    if (space > 0) cut = cut.slice(0, space);
  }
  return cut.join('').trimEnd() + suffix;
}

/** A stable number for a text. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The pool in an order of its own for this seed. */
function shuffled<T>(list: T[], seed: string): T[] {
  const out = [...list];
  let s = hash(seed) || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = Math.imul(s ^ (s >>> 15), 2246822507) >>> 0;
    s = Math.imul(s ^ (s >>> 13), 3266489909) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const fold = (s: string) => s.toLocaleLowerCase().replace(/ё/g, 'е');

/**
 * Ideas for the chips: the heir first (if any), then the pool in a stable shuffle by `seed`,
 * `count` per `round` (round after round, then round again), without names other trees have (any case).
 */
export function nameIdeas(pool: string[], o: { seed: string; round: number; count: number; taken: string[]; heir?: string | null }): string[] {
  const taken = new Set(o.taken.map(fold));
  const heir = o.heir && !taken.has(fold(o.heir)) ? o.heir : null;
  if (heir) taken.add(fold(heir));
  const free = shuffled(pool, o.seed).filter((n) => !taken.has(fold(n)));
  const want = o.count - (heir ? 1 : 0);
  const out = heir ? [heir] : [];
  if (free.length === 0 || want <= 0) return out;
  const start = (o.round * want) % free.length;
  for (let i = 0; i < Math.min(want, free.length); i++) out.push(free[(start + i) % free.length]);
  return out;
}

/** The name to show first: the nickname or the habit. */
export const titleOf = (tree: Tree) => tree.nickname ?? tree.name;

/** Search: by nickname or habit, any case, "ё" = "е". */
export function matchesQuery(tree: Tree, query: string): boolean {
  const q = fold(query.trim());
  if (!q) return true;
  return fold(tree.name).includes(q) || (tree.nickname !== null && fold(tree.nickname).includes(q));
}

/** Gives, changes or (null) removes the name; the day of the first name stays. Removing counts as "Later" for today. */
export function withName(tree: Tree, nickname: string | null, today: DayKey): Tree {
  // Removed by the user: no bubble asking again the same day.
  if (nickname === null) return { ...tree, nickname: null, nameLaterOn: today };
  return { ...tree, nickname, namedOn: tree.namedOn ?? today };
}

/** The tree asked for a name today. */
export function withAsk(tree: Tree, today: DayKey): Tree {
  return { ...tree, nameAsks: tree.nameAsks + 1, nameAskedOn: today };
}

/** "Later": no bubble for the rest of today. */
export function withLater(tree: Tree, today: DayKey): Tree {
  return { ...tree, nameLaterOn: today };
}
