// When to remind about watering (OYUUR-23, design/oyuur-33/спец.md 8). Pure: trees, the time and the
// settings in, the planned notifications out — the phone schedules them (notify.android.ts).
// - The first reminder comes at the watering time: the tree's own hour ("Quit" — 18:00), or, for a
//   tree open all day ("Do"), the hour from the settings (20:00 by default). Trees with one time — one
//   notification ("3 trees can be watered").
// - "Last chance" — at 1:00, two hours before the game day ends at 3:00, only for a tree still not
//   watered whose miss would burn a chance or kill it (the planting day never counts as missed).
// - No more than 2 notifications a game day from trees: when there are more times, an earlier time
//   joins the next one (a later time is still open for every tree of the earlier one).
// - At night (23:00–8:00 by the phone's clock) nothing wakes the person but "last chance": a tree
//   opening at 1..7 is reminded at 8:00, one opening at 23:00 gets only "last chance".
// - A hidden tree ("Only me") is named by its own name, never by the habit (the lock screen is seen
//   by others, like the widgets: спец oyuur-37 6).
// The plan covers 7 game days. Days after today are planned as if nobody waters: if the person
// waters, the app is open and plans again; if not, the plan was right (chances burn, the tree dies).
import { addDays, DayKey, gameDay } from '@/game/dates';
import { groupHabits, isGrowing, openHourOn, settle, Tree } from '@/game/tree';

export interface RemindPrefs {
  /** Reminders at all. */
  on: boolean;
  /** The second one, "last chance". */
  lastChance: boolean;
  /** The hour for trees open all day ("Do"), 8..22. */
  doHour: number;
}

export const DEFAULT_PREFS: RemindPrefs = { on: true, lastChance: true, doHour: 20 };

/** Quiet hours by the phone's clock: from 23:00 to 8:00 only "last chance". */
export const QUIET_FROM = 23;
export const QUIET_UNTIL = 8;
/** "Last chance" at 1:00 at night — hour 25 of the game day, two hours before it ends at 3:00. */
export const LAST_CHANCE_HOUR = 1;
/** How many game days ahead are planned, today included. */
export const HORIZON_DAYS = 7;
/** At most this many notifications a game day from trees (спец 8). */
export const MAX_A_DAY = 2;

/** Hours the settings offer for "Do" trees: the day outside the quiet hours. */
export const DO_HOURS: number[] = Array.from({ length: QUIET_FROM - QUIET_UNTIL }, (_, i) => QUIET_UNTIL + i);

export const clampDoHour = (hour: unknown): number =>
  typeof hour === 'number' && Number.isInteger(hour) ? Math.min(QUIET_FROM - 1, Math.max(QUIET_UNTIL, hour)) : DEFAULT_PREFS.doHour;

/** One tree in a notification. */
export interface RemindTree {
  id: string;
  /** What the notification calls it: the habit, or for a hidden tree its own name (null — none yet: "My tree"). */
  label: string | null;
  /** Growth days (the streak) now. */
  days: number;
  /** "Last chance": no chances left — a miss kills the tree. */
  dies: boolean;
  /** Open all day ("Do"): reminded at the settings' hour — "time to water", not "can be watered". */
  anytime?: boolean;
}

export interface Reminder {
  /** Unique within a plan: the kind, the game day and the hour. */
  key: string;
  kind: 'open' | 'last';
  /** The game day it is about. */
  day: DayKey;
  /** When to show it, on the phone's real clock (the developer time travel taken off). */
  at: Date;
  /** The hour shown, as the person sees it (with the time travel). */
  hour: number;
  /** Most urgent first: the trees that would die, then the longest streaks. */
  trees: RemindTree[];
}

export interface PlanInput {
  trees: Tree[];
  prefs: RemindPrefs;
  /** The phone's real clock. */
  now: Date;
  /** Developer time travel (zero in a release build), as in the store. */
  dayOffset?: number;
  minuteOffset?: number;
}

const labelOf = (t: Tree): string | null => (t.visibility === 'private' ? t.nickname : t.name);

/** A local time of the calendar day `day` (the hour may be 24+ — the next day). Wall clock, so a daylight-saving night keeps the hour. */
function localAt(day: DayKey, hour: number): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d + Math.floor(hour / 24), hour % 24, 0, 0, 0);
}

const urgent = (a: RemindTree, b: RemindTree) => Number(b.dies) - Number(a.dies) || b.days - a.days;

interface Slot {
  hour: number;
  trees: RemindTree[];
}

export function planReminders(input: PlanInput): Reminder[] {
  const { prefs } = input;
  if (!prefs.on) return [];
  const dayOffset = input.dayOffset ?? 0;
  const minuteOffset = input.minuteOffset ?? 0;
  const shift = minuteOffset * 60_000;
  // The app's clock: what "now" and "today" are for the trees.
  const appNow = new Date(input.now.getTime() + shift);
  const today = gameDay(appNow, dayOffset);
  const doHour = clampDoHour(prefs.doHour);
  const habits = groupHabits(input.trees).map((h) => h.current).filter(isGrowing);
  const out: Reminder[] = [];

  for (let k = 0; k < HORIZON_DAYS; k++) {
    const day = addDays(today, k);
    // The calendar day the game day `day` begins on, by the app's clock.
    const wall = addDays(day, -dayOffset);
    const slots = new Map<number, Slot>();
    const last: RemindTree[] = [];

    for (const tree of habits) {
      if (day < tree.plantedOn) continue;
      // As if nobody waters from now on (see the top).
      const s = settle(tree, day);
      if (!isGrowing(s) || s.checkins.includes(day)) continue;
      // A day already judged (the clock went back) can't be watered: nothing to remind.
      if (s.frozen.includes(day) || day < s.settledThrough) continue;
      const own = openHourOn(s, day);
      const item: RemindTree = { id: s.id, label: labelOf(s), days: s.checkins.length, dies: s.chancesLeft === 0, anytime: own === 0 };
      // Opening in the quiet hours: in the morning at 8:00 (still open); at 23:00 — none.
      const hour = own === 0 ? doHour : own < QUIET_UNTIL ? QUIET_UNTIL : own;
      if (hour < QUIET_FROM) {
        const slot = slots.get(hour) ?? { hour, trees: [] };
        slot.trees.push(item);
        slots.set(hour, slot);
      }
      if (prefs.lastChance && day !== s.plantedOn) last.push(item);
    }

    const ordered = [...slots.values()].sort((a, b) => a.hour - b.hour);
    const room = MAX_A_DAY - (last.length ? 1 : 0);
    while (ordered.length > room) {
      const [first, next] = ordered;
      next.trees = [...first.trees, ...next.trees];
      ordered.shift();
    }
    const add = (kind: Reminder['kind'], hour: number, trees: RemindTree[]) => {
      const at = new Date(localAt(wall, hour).getTime() - shift);
      if (at.getTime() <= input.now.getTime()) return;
      out.push({ key: `${kind}:${day}:${hour}`, kind, day, at, hour: hour % 24, trees: [...trees].sort(urgent) });
    };
    for (const slot of ordered) add('open', slot.hour, slot.trees);
    if (last.length) add('last', 24 + LAST_CHANCE_HOUR, last);
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** The tree a tap on the notification opens: the most urgent one. */
export const tapTarget = (r: Pick<Reminder, 'trees'>): string | null => r.trees[0]?.id ?? null;
