// A calendar day in the user's local time, written as 'YYYY-MM-DD'.
// Day keys compare correctly as plain strings.
export type DayKey = string;

const pad = (n: number) => String(n).padStart(2, '0');

export function toDayKey(date: Date): DayKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Day arithmetic goes through UTC so daylight-saving shifts never skip or repeat a day.
function toUtcMs(key: DayKey): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): DayKey {
  const date = new Date(ms);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(key: DayKey, n: number): DayKey {
  return fromUtcMs(toUtcMs(key) + n * DAY_MS);
}

/** How many days `to` is after `from` (negative if before). */
export function daysBetween(from: DayKey, to: DayKey): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

/** "Today" for the app: the real date, shifted by the developer time-travel offset. */
export function todayKey(now: Date, dayOffset = 0): DayKey {
  return addDays(toDayKey(now), dayOffset);
}

// ---- The game day (OYUUR-33, design/oyuur-33/спец.md, 3) ----
// For the game a day runs from 3:00 to 3:00: at 1:30 at night it is still "yesterday".
// Everything goes by the local wall clock (hours and minutes), never by hours since midnight,
// so daylight-saving nights (the hour lost or repeated between 2 and 3) don't skip or repeat a day.

/** The hour a new game day begins. */
export const DAY_START_HOUR = 3;

/** The time of the game day: 0:00–2:59 at night are hours 24..26 of the day before. */
export interface GameClock {
  hour: number;
  minute: number;
}

/** "Today" for the game: the calendar day of the wall clock, until 3:00 at night — the day before. */
export function gameDay(now: Date, dayOffset = 0): DayKey {
  return addDays(toDayKey(now), dayOffset - (now.getHours() < DAY_START_HOUR ? 1 : 0));
}

export function gameClock(now: Date): GameClock {
  const h = now.getHours();
  return { hour: h < DAY_START_HOUR ? h + 24 : h, minute: now.getMinutes() };
}
