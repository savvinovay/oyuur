// The watering time in words (OYUUR-34, design/oyuur-33/спец.md, 1.3, 2, 5): the hour as the
// phone shows time ("18:00" / "6:00 PM"), the wait ("3 ч 20 мин"), the choice with its part of
// the day ("вечером, с 18:00"). Pure, apart from reading the phone's 12/24-hour setting once.
import { getCalendars } from 'expo-localization';
import type { OpenHour } from '@/game/tree';
import type { Lang, T } from '@/i18n';

/** The ready choices of the sheet (спец 1.3), in order; 0 — any time. */
export const PRESET_HOURS: OpenHour[] = [0, 6, 12, 18, 21];

/** The phone's own 12/24-hour setting; null — the phone doesn't say. */
let systemClock: boolean | null | undefined;
function phoneUses24(): boolean | null {
  if (systemClock === undefined) {
    try {
      systemClock = getCalendars()[0]?.uses24hourClock ?? null;
    } catch {
      systemClock = null;
    }
  }
  return systemClock;
}

/** 24-hour clock: as the phone has it; if it doesn't say — by the language (ru 24, en 12). */
export const uses24 = (lang: Lang = 'ru', system: boolean | null = phoneUses24()): boolean => system ?? lang === 'ru';

/** "18:00" or "6 PM" (whole hours, as Apple Calendar writes them). Hours 24..26 of the game day are 0..2 at night. */
export function formatHour(hour: number, h24: boolean): string {
  const h = ((hour % 24) + 24) % 24;
  if (h24) return `${h}:00`;
  // A no-break space: "6" and "PM" never part.
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;
}

/** The hour as the phone shows time (спец 2: "18:00 in RU, 6:00 PM in EN"). */
export const hourText = (hour: number, lang?: Lang): string => formatHour(hour, uses24(lang));

/** "42 мин", "3 ч", "3 ч 20 мин" (EN "42 min", "3 h 20 min"); at least a minute. */
export function untilText(minutes: number, t: T): string {
  const total = Math.max(1, Math.ceil(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return t('wtMin', { m });
  return m === 0 ? t('wtHours', { h }) : t('wtHoursMin', { h, m });
}

/** "с 18:00" or "в любое время". */
export const fromText = (hour: OpenHour, t: T): string => (hour === 0 ? t('wtAnyTime') : t('wtFrom', { time: hourText(hour, t.lang) }));

/** "в любое время", "вечером, с 18:00", "с 15:00" (the ready choices name their part of the day). */
export function openHourLabel(hour: OpenHour, t: T): string {
  const time = hourText(hour, t.lang);
  switch (hour) {
    case 0: return t('wtAnyTime');
    case 6: return t('wtLabelMorning', { time });
    case 12: return t('wtLabelDay', { time });
    case 18: return t('wtLabelEvening', { time });
    case 21: return t('wtLabelLate', { time });
    default: return t('wtFrom', { time });
  }
}

/**
 * What a tree waits for until its hour (the forest card, спец 5.3): the ready choices by their
 * part of the day ("Ждёт утра / обеда / вечера / ночи"), an hour from the wheel by itself ("Ждёт 15:00").
 */
export function waitWord(hour: OpenHour, t: T): string {
  switch (hour) {
    case 6: return t('wtWaitMorning');
    case 12: return t('wtWaitDay');
    case 18: return t('wtWaitEvening');
    case 21: return t('wtWaitNight');
    default: return t('wtWaitHour', { time: hourText(hour, t.lang) });
  }
}

/** The gray hint under the choices: a "Quit" habit with an hour before noon, "any time" too (спец 2, 4.2). */
export const showQuitHint = (kind: 'do' | 'quit', hour: OpenHour): boolean => kind === 'quit' && hour < 12;
