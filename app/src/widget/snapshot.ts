// What the app hands to the Android widgets (OYUUR-39, design/oyuur-37/спец.md, Т3): a small snapshot of
// the forest under its own key. The widget never reads or writes the main save (`elevate/v1`).
// Pure: no storage, no clock. The state on the widget is worked out again at every drawing from the
// snapshot and the time then (state.ts), so a late redraw never lies.
import type { DayKey } from '@/game/dates';
import { groupHabits, growthDays, HabitKind, OpenHourEntry, Skin, Tree } from '@/game/tree';
import type { Lang } from '@/i18n';

export const SNAPSHOT_KEY = 'oyuur/widget/v1';

/** One habit as the widget needs it: its newest generation. */
export interface WidgetTree {
  id: string;
  lineageId: string;
  skin: Skin;
  kind: HabitKind;
  /** "Only me": the home screen shows the tree's name, not the habit (спец 6). */
  hidden: boolean;
  /** The habit; null for a hidden tree while "Names of hidden trees" is off — then it is not in the snapshot at all. */
  name: string | null;
  /** The tree's own name ("Дубочек"). */
  nick: string | null;
  plantedOn: DayKey;
  settledThrough: DayKey;
  refilledMonth: string;
  chancesLeft: number;
  /** Check-ins and frozen days from `settledThrough` on: all the rules still need (earlier days are judged). */
  checkins: DayKey[];
  frozen: DayKey[];
  /** Days of growth (the streak, or the record of a dead tree). */
  days: number;
  diedOn: DayKey | null;
  completedOn: DayKey | null;
  openHours: OpenHourEntry[];
  generation: number;
}

export interface WidgetSnapshot {
  v: 1;
  lang: Lang;
  /** The app's own theme choice: a forced theme also forces the scene's day or night (спец 4). */
  theme: 'auto' | 'light' | 'dark';
  /** The phone's 24-hour clock ("18:00" or "6 PM"). */
  h24: boolean;
  /** "Names of hidden trees" (спец 6), off by default. */
  showHidden: boolean;
  /** Developer time travel (zero in a release build). */
  dayOffset: number;
  minuteOffset: number;
  /** Habits in the order they were planted. */
  trees: WidgetTree[];
}

export interface SnapshotInput {
  trees: Tree[];
  lang: Lang;
  theme: WidgetSnapshot['theme'];
  h24: boolean;
  showHidden: boolean;
  dayOffset: number;
  minuteOffset: number;
}

export function buildSnapshot(input: SnapshotInput): WidgetSnapshot {
  const trees = groupHabits(input.trees).map(({ current: t }): WidgetTree => {
    const hidden = t.visibility === 'private';
    return {
      id: t.id,
      lineageId: t.lineageId,
      skin: t.skin,
      kind: t.kind,
      hidden,
      name: hidden && !input.showHidden ? null : t.name,
      nick: t.nickname,
      plantedOn: t.plantedOn,
      settledThrough: t.settledThrough,
      refilledMonth: t.refilledMonth,
      chancesLeft: t.chancesLeft,
      checkins: t.checkins.filter((d) => d >= t.settledThrough),
      frozen: t.frozen.filter((d) => d >= t.settledThrough),
      days: growthDays(t),
      diedOn: t.diedOn,
      completedOn: t.completedOn,
      openHours: t.openHours,
      generation: t.generation,
    };
  });
  return {
    v: 1,
    lang: input.lang,
    theme: input.theme,
    h24: input.h24,
    showHidden: input.showHidden,
    dayOffset: input.dayOffset,
    minuteOffset: input.minuteOffset,
    trees,
  };
}

/** A snapshot read back from storage; anything damaged or from an unknown version — null (the widget shows "plant a tree"). */
export function parseSnapshot(raw: string | null): WidgetSnapshot | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as WidgetSnapshot;
    if (!s || s.v !== 1 || !Array.isArray(s.trees)) return null;
    return { ...s, trees: s.trees.filter((t) => t && typeof t.id === 'string' && typeof t.plantedOn === 'string' && Array.isArray(t.checkins)) };
  } catch {
    return null;
  }
}

/** The tree again, for the game rules (tree.ts). The days before `settledThrough` are not needed: they are judged. */
export function toRuleTree(w: WidgetTree): Tree {
  return {
    id: w.id,
    lineageId: w.lineageId,
    name: w.name ?? '',
    kind: w.kind,
    visibility: w.hidden ? 'private' : 'friends',
    skin: w.skin,
    plantedOn: w.plantedOn,
    checkins: w.checkins,
    frozen: w.frozen,
    chancesLeft: w.chancesLeft,
    refilledMonth: w.refilledMonth,
    settledThrough: w.settledThrough,
    diedOn: w.diedOn,
    completedOn: w.completedOn,
    generation: w.generation,
    parentId: null,
    nickname: w.nick,
    namedOn: null,
    nameAsks: 0,
    nameAskedOn: null,
    nameLaterOn: null,
    openHours: w.openHours,
  };
}
