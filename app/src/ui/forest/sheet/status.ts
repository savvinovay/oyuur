// One tree's state in words for the forest's card and list rows (spec 3.2, 6), and the
// list's sections and their order. Pure, apart from the dictionary.
// OYUUR-34 (design/oyuur-33/спец.md 5.3): with the time of the game day a growing tree not
// watered yet is 'waiting' until its watering hour — "Ждёт вечера · 24 дня", not "needs water".
import { matchesQuery } from '@/game/naming';
import type { DayKey, GameClock } from '@/game/dates';
import { canWaterAt, checkedInToday, growthDays, Habit, isCompleted, isDead, wateringOpensAt } from '@/game/tree';
import { pluralForm, T } from '@/i18n';
import type { GlyphName } from '@/ui/ds';
import { waitWord } from '@/ui/watering/format';

export type TreeState = 'thirsty' | 'waiting' | 'watered' | 'locked' | 'dead';
/** A glyph of the design system, or the watering time's gold clock (ui/watering/art). */
export type StatusGlyph = GlyphName | 'clock';
export type Section = 'growing' | 'locked' | 'memory';

export const daysText = (t: T, n: number) => `${n} ${t.dict.dayWords[pluralForm(t.lang, n)]}`;

/** `clock` — the time of the game day now; without it a tree is never 'waiting'. */
export function treeState(habit: Habit, today: DayKey, clock?: GameClock): TreeState {
  const tree = habit.current;
  if (isDead(tree)) return 'dead';
  if (isCompleted(tree)) return 'locked';
  if (checkedInToday(tree, today)) return 'watered';
  return clock && !canWaterAt(tree, today, clock) ? 'waiting' : 'thirsty';
}

export const sectionOf = (state: TreeState): Section =>
  state === 'dead' ? 'memory' : state === 'locked' ? 'locked' : 'growing';

/** The status line under a tree's name: a glyph and a short line. */
export function statusLine(habit: Habit, today: DayKey, t: T, clock?: GameClock): { glyph: StatusGlyph; line: string; state: TreeState } {
  const tree = habit.current;
  const state = treeState(habit, today, clock);
  const days = daysText(t, growthDays(tree));
  switch (state) {
    case 'dead': return { state, glyph: 'tombstone', line: t('diedLine', { days }) };
    case 'locked': return { state, glyph: 'plaque', line: t(tree.completedOn === today ? 'lockedTodayLine' : 'lockedLine', { days }) };
    case 'watered': return { state, glyph: 'check', line: t('wateredToday', { days }) };
    // The hour itself is on the card's chip: here only what it waits for (спец 5.3).
    case 'waiting': return { state, glyph: 'clock', line: t('wtWaitLine', { wait: waitWord(wateringOpensAt(tree, today), t), days }) };
    default: return { state, glyph: 'drop', line: t('needsWater', { days }) };
  }
}

/** What the card's main button does: water and plant are today's deeds, the rest is a look. */
export type CardAction = 'water' | 'view' | 'plant';

/**
 * The card's main button (table 3.2, as changed after the wave 3 review): green only for
 * what can be done today — water a thirsty tree, plant a dead one's seed. Everything else
 * is "View" on the beige secondary button; gold only for the tree just locked in (5.4).
 */
export function cardMain(state: TreeState, o: { seedUsed: boolean; golden: boolean }): { action: CardAction; variant: 'primary' | 'secondary' | 'gold' | 'waiting' } {
  if (state === 'thirsty') return { action: 'water', variant: 'primary' };
  // Before its hour: still "Water", only muted; a tap tells how long to wait (спец 5.3).
  if (state === 'waiting') return { action: 'water', variant: 'waiting' };
  if (state === 'dead' && !o.seedUsed) return { action: 'plant', variant: 'primary' };
  return { action: 'view', variant: state === 'locked' && o.golden ? 'gold' : 'secondary' };
}

/** Days of growth of every generation of a habit. */
export const totalDays = (habit: Habit) => habit.generations.reduce((sum, x) => sum + growthDays(x), 0);

/**
 * The list's sections in order (spec 6): growing — thirsty first, then by days, more on
 * top; locked in — newest lock-in on top; memory — newest death on top.
 */
export function sortSections(habits: Habit[], today: DayKey, clock?: GameClock): Record<Section, Habit[]> {
  const out: Record<Section, Habit[]> = { growing: [], locked: [], memory: [] };
  for (const h of habits) out[sectionOf(treeState(h, today))].push(h);
  const thirst = (h: Habit) => (treeState(h, today, clock) === 'thirsty' ? 0 : 1);
  out.growing.sort((a, b) => thirst(a) - thirst(b) || growthDays(b.current) - growthDays(a.current));
  const desc = (a: string | null, b: string | null) => (b ?? '').localeCompare(a ?? '');
  out.locked.sort((a, b) => desc(a.current.completedOn, b.current.completedOn));
  out.memory.sort((a, b) => desc(a.current.diedOn, b.current.diedOn));
  return out;
}

/** Habits whose name or tree's name has the query in it, any case, "ё" = "е". */
export function matchName(habits: Habit[], query: string): Habit[] {
  if (!query.trim()) return habits;
  return habits.filter((h) => matchesQuery(h.current, query));
}
