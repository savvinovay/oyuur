// What the map knows about each tree: where it stands, how big its crown is, what the
// screen reader says about it, and the shared values that move its picture. The pictures,
// the ground marks and the markers all read the same per-tree values, so a tree in flight
// carries its shadow and its drop along on the UI thread.
import { makeMutable, SharedValue } from 'react-native-reanimated';
import type { DayKey } from '@/game/dates';
import { titleOf } from '@/game/naming';
import { Cell, Plot } from '@/game/plot';
import { checkedInToday, growthDays, Habit, isCompleted, isDead, isGrowing, wateringOpensAt } from '@/game/tree';
import { pluralForm, T } from '@/i18n';
import { waitWord } from '@/ui/watering/format';
import { BASE_Y, CANVAS_H, CANVAS_W, fillZoom, lookOf, SIZES, treeZoom } from '@/ui/trees/layout';
import { cellCenter, depth } from './iso';
import { MAP_FILL, MAP_THUMB } from './thumbs';

/** World px per drawing unit of a map picture. */
const K = MAP_THUMB / CANVAS_W;
/** The map picture: 120×128 world px, the feet 97.5 % down (1.5). */
export const THUMB_W = MAP_THUMB;
export const THUMB_H = CANVAS_H * K;
export const FEET_Y = BASE_Y * K;

/** The drawn crown of a tree on the map, world px: width and height above the feet. */
export function treeExtent(habit: Habit): { w: number; h: number } {
  const tree = habit.current;
  const days = growthDays(tree);
  const dead = isDead(tree);
  const size = SIZES[tree.skin][lookOf(days, dead)];
  const zoom = treeZoom(tree.skin, days, dead) * fillZoom(tree.skin, days, dead, MAP_FILL) * K;
  return { w: Math.min(THUMB_W, size.w * zoom), h: Math.min(FEET_Y, size.h * zoom) };
}

export interface MapItem {
  id: string;
  habit: Habit;
  cell: Cell;
  /** Feet in world px. */
  x: number;
  y: number;
  /** Crown, world px. */
  w: number;
  h: number;
  depth: number;
  /** Growing, not watered today and its watering hour has come: a drop above it. */
  thirsty: boolean;
  /** Earlier generations: stumps beside it. */
  past: number;
  /** The tree's own name, or the habit's. */
  name: string;
}

/**
 * Placed habits, back to front. A habit planted a moment ago may have no place yet: skipped.
 * `waiting` — lineages whose watering hour hasn't come (OYUUR-34, спец 5.3): no drop until then.
 */
export function mapItems(habits: Habit[], plot: Plot, today: DayKey, waiting?: readonly string[]): MapItem[] {
  const items: MapItem[] = [];
  for (const habit of habits) {
    const cell = plot.places[habit.lineageId];
    if (!cell) continue;
    const { x, y } = cellCenter(cell);
    const tree = habit.current;
    items.push({
      id: habit.lineageId,
      habit,
      cell,
      x,
      y,
      ...treeExtent(habit),
      depth: depth(cell),
      thirsty: isGrowing(tree) && !checkedInToday(tree, today) && !waiting?.includes(habit.lineageId),
      past: habit.generations.length - 1,
      name: titleOf(tree),
    });
  }
  return items.sort((a, b) => a.depth - b.depth || a.cell.c - b.cell.c);
}

const daysText = (t: T, n: number) => `${n} ${t.dict.dayWords[pluralForm(t.lang, n)]}`;

/** "Oak, needs water · 5 days. Row 2, spot 3" for the screen reader (spec 9); a named tree is "Дубок, No sugar, …" (wave 4, 5.2). */
export function treeLabel(item: MapItem, t: T, today: DayKey): string {
  const tree = item.habit.current;
  const days = daysText(t, growthDays(tree));
  const status = isDead(tree)
    ? t('diedLine', { days })
    : isCompleted(tree)
      ? t(tree.completedOn === today ? 'lockedTodayLine' : 'lockedLine', { days })
      : checkedInToday(tree, today)
        ? t('wateredToday', { days })
        : item.thirsty
          ? t('needsWater', { days })
          : t('wtWaitLine', { wait: waitWord(wateringOpensAt(tree, today), t), days });
  const name = tree.nickname !== null ? t('treeNameA11y', { name: tree.nickname, habit: tree.name }) : tree.name;
  return t('treeA11y', { name, status, r: item.cell.r + 1, c: item.cell.c + 1 });
}

/** Everything that moves one tree's picture. */
export interface TreeMotion {
  /** Feet, world px: the cell centre at rest, the finger or a flight while moving. */
  px: SharedValue<number>;
  py: SharedValue<number>;
  /** Raised above the feet, world px (lifted 16, the arc of a flight). */
  lift: SharedValue<number>;
  sx: SharedValue<number>;
  sy: SharedValue<number>;
  /** Lean while dragged, degrees. */
  rot: SharedValue<number>;
  alpha: SharedValue<number>;
  /** Selected: a little bigger. */
  press: SharedValue<number>;
  /** "New" badge: 0 hidden, 1 shown. */
  badge: SharedValue<number>;
  /** 1 once the tree's picture is on the map: its drop and badge wait for it. */
  ready: SharedValue<number>;
}

/** Shared values per tree, made once and kept while the map lives. */
export class Motions {
  private map = new Map<string, TreeMotion>();

  /** `hidden`: a new tree waits for its sprout — squashed into the ground, or (no animations) transparent. */
  get(id: string, at?: { x: number; y: number }, hidden?: 'sprout' | 'fade'): TreeMotion {
    let m = this.map.get(id);
    if (!m) {
      m = {
        px: makeMutable(at?.x ?? 0),
        py: makeMutable(at?.y ?? 0),
        lift: makeMutable(0),
        sx: makeMutable(hidden === 'sprout' ? 0.9 : 1),
        sy: makeMutable(hidden === 'sprout' ? 0 : 1),
        rot: makeMutable(0),
        alpha: makeMutable(hidden === 'fade' ? 0 : 1),
        press: makeMutable(1),
        badge: makeMutable(0),
        ready: makeMutable(0),
      };
      this.map.set(id, m);
    }
    return m;
  }

  has(id: string): boolean {
    return this.map.has(id);
  }
}
